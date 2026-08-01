# Banco de Dados

Postgres via Supabase. Schema versionado por migrations (arquivos SQL), nunca
editado só pela interface. Toda tabela usa `uuid` como PK e carimba `created_at`.

## Diagrama de relações

```
bancas ──1:N──> concursos ──1:N──> provas ──1:N──> questoes ──1:N──> respostas
                                                       ^
materias ──────────────────1:N────────────────────────┘
```

Duas **dimensões normalizadas** alimentam a árvore de conteúdo: `bancas` (via
concurso) e `materias` (direto na questão). Ambas são tabelas de referência com
nome único, escolhidas de lista na UI — nunca texto livre.

`banca` é uma **dimensão transversal**, não um nível da hierarquia de conteúdo.
Cada prova mora em um único concurso (rastreabilidade intacta), mas como o
concurso aponta para uma banca, é possível subir a árvore e reunir **todas as
questões de uma mesma banca atravessando concursos diferentes**. Esse é o ganho
pedagógico central: treinar o estilo de uma banca (FCC, Cebraspe...) usando todo
o acervo dela, independente do concurso de origem.

Deleção em cascata descendente: apagar uma prova apaga suas questões e as
respostas delas. Apagar um concurso apaga tudo abaixo. Isso torna "reprocessar
uma prova" = apagar a prova e reimportar, sem sujeira residual. **Banca é
exceção:** apagar uma banca NÃO deve cascatear para concursos (ver regra de
deleção na tabela `bancas`).

## Tabelas

### `bancas`
Entidade transversal. Lista canônica de bancas organizadoras. Existir como tabela
(em vez de texto solto no concurso) é o que permite filtrar questões por banca
atravessando todos os concursos.

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| nome | text NOT NULL UNIQUE | "FCC", "Cebraspe", "FGV"... |
| created_at | timestamptz | default `now()` |

**Regra de deleção:** o FK de `concursos.banca_id` deve usar `ON DELETE RESTRICT`
(ou `SET NULL`), **nunca CASCADE**. Apagar uma banca não pode arrastar concursos
junto. Na prática você quase nunca apaga uma banca; a restrição evita acidente.

**Normalização:** assim como matérias (ver doc 03), o nome da banca vem de uma
lista/seleção, não de texto livre digitado a cada concurso. Evita "FCC" vs
"F.C.C." vs "Fundação Carlos Chagas" apontando para coisas diferentes. Semeie com
as bancas comuns e adicione conforme precisar.

### `materias`
Segunda entidade normalizada, mesma lógica de `bancas`. Lista canônica de matérias
(Direito Constitucional, Português, Raciocínio Lógico...). Existir como tabela é o
que garante que o filtro por matéria no quiz seja confiável — sem ela, texto livre
fragmentaria o acervo ("Dir. Const." ≠ "Direito Constitucional").

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| nome | text NOT NULL UNIQUE | "Direito Constitucional" |
| created_at | timestamptz | default `now()` |

**Regra de deleção:** o FK de `questoes.materia_id` usa `ON DELETE RESTRICT` —
apagar uma matéria não pode arrastar questões. Na prática você quase nunca apaga
uma matéria; a restrição evita acidente.

**Uso:** na revisão (e na edição), a matéria da questão é escolhida desta lista
(select/autocomplete), nunca digitada livre. O LLM sugere um nome durante a
extração; na revisão você confirma casando com a matéria canônica. Semeie com as
matérias comuns de concurso e adicione conforme necessário.

> Decisão (posterior ao desenho original deste doc): `questoes.materia` deixou de
> ser `text` e virou `questoes.materia_id` (FK). Banca e matéria são as duas
> dimensões normalizadas do sistema, tratadas de forma idêntica. O campo `assunto`
> (subtópico) permanece texto livre por ser granular e não usado como filtro rígido.

### `concursos`
O contêiner de conteúdo de nível mais alto. Aberto: recebe provas indefinidamente.
Pertence a uma banca.

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| nome | text NOT NULL | "TRT 15 Região" |
| banca_id | uuid FK → bancas(id) ON DELETE RESTRICT | a banca organizadora |
| orgao | text | opcional |
| created_at | timestamptz | default `now()` |

> Mudança em relação à versão anterior: o campo `banca` (texto) virou `banca_id`
> (FK para `bancas`). Ao criar um concurso, você seleciona a banca de uma lista
> em vez de digitar. A banca pode ser opcional (`banca_id` nullable) se você
> importar algo sem banca conhecida, mas o normal é sempre ter.

### `provas`
Cada PDF importado é uma prova. Núcleo da rastreabilidade e da idempotência.

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| concurso_id | uuid FK → concursos(id) ON DELETE CASCADE | |
| nome | text NOT NULL | "Analista Judiciário — Área Judiciária" |
| ano | int | |
| cargo | text | opcional |
| arquivo_path | text | caminho no Storage |
| arquivo_hash | text NOT NULL | SHA-256 do PDF; ver constraint abaixo |
| gabarito_path | text | se o gabarito vier em PDF separado |
| status | text NOT NULL | enum de processamento (ver abaixo) |
| erro_msg | text | preenchido se status = 'erro' |
| total_questoes | int | contagem após extração, pra UI |
| created_at | timestamptz | default `now()` |

**Constraint de idempotência:**
`UNIQUE (concurso_id, arquivo_hash)` — o mesmo arquivo não entra duas vezes no
mesmo concurso. O app checa o hash antes de subir e avisa "já importada".

**Enum de status** (como CHECK ou tipo enum):
`'pendente' | 'processando' | 'aguardando_revisao' | 'pronta' | 'erro'`

### `questoes`
A unidade de estudo. Formato canônico validado por Zod antes de inserir.

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| prova_id | uuid FK → provas(id) ON DELETE CASCADE | |
| numero | int | número da questão na prova original |
| materia_id | uuid FK → materias(id) ON DELETE RESTRICT | matéria normalizada; nome vem da tabela `materias` |
| assunto | text | subtópico, opcional e livre: "Controle de constitucionalidade" |
| enunciado | text NOT NULL | |
| alternativas | jsonb NOT NULL | `[{"letra":"A","texto":"..."}, ...]` |
| gabarito | text NOT NULL | letra correta: "C" |
| tipo | text NOT NULL | `'multipla_escolha' | 'certo_errado'` |
| tem_imagem | boolean | default false; questão depende de figura/gráfico (ver regra) |
| imagem_path | text | opcional; caminho no Storage se você anexar a imagem |
| comentario | text | opcional; sua justificativa/anotação de estudo |
| anulada | boolean | default false; questões anuladas ficam fora dos quizzes |
| revisada | boolean | default false; vira true quando você aprova |
| created_at | timestamptz | default `now()` |
| updated_at | timestamptz | default `now()`; atualiza a cada edição (ver abaixo) |

**Por que `alternativas` como jsonb:** número variável de alternativas, ordem
importa, e é sempre lido em bloco junto com a questão. Não compensa uma tabela
separada aqui.

**`tem_imagem` / `imagem_path` (questões com figura):** extração por texto perde
gráficos, mapas e figuras. Uma questão que diz "observe a figura acima" fica sem
sentido. Regra: o pipeline tenta detectar (ver doc `02`) e a revisão confirma. Se
`tem_imagem = true` e nenhuma imagem foi anexada (`imagem_path` vazio), a questão
**não entra em quizzes** — evita estudar questão quebrada. Você pode anexar a
imagem manualmente na revisão/edição para torná-la utilizável.

**`comentario`:** campo livre para você anotar por que errou ou o raciocínio
correto. Preenchível na revisão e na edição posterior. Alto valor de estudo,
custo zero de modelagem.

**`updated_at`:** questões aprovadas podem ser editadas depois (corrigir matéria,
gabarito, anexar imagem). Este carimbo permite saber o que foi tocado. Um trigger
simples no Postgres atualiza `updated_at = now()` a cada UPDATE.

**Regra de elegibilidade (atualizada):** só entram em quizzes questões com
`revisada = true AND anulada = false AND (tem_imagem = false OR imagem_path IS NOT NULL)`.

### `respostas`
Seu histórico. É o que habilita estatísticas e revisão de erros.

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| questao_id | uuid FK → questoes(id) ON DELETE CASCADE | |
| letra_marcada | text NOT NULL | o que você respondeu |
| acertou | boolean NOT NULL | calculado no momento do registro |
| respondido_em | timestamptz | default `now()` |
| quiz_sessao_id | uuid | agrupa respostas de um mesmo quiz (opcional, ver nota) |

**Nota sobre `quiz_sessao_id`:** não precisa de tabela `quizzes` própria no MVP.
Um quiz é efêmero (montado, respondido, descartado). Guardar só as respostas com
um id de sessão comum já permite reconstruir "como foi o quiz de ontem" se você
quiser depois. Comece assim; promova a tabela própria só se precisar.

## Índices recomendados

- `questoes (prova_id)` — já vem do FK, confirme.
- `questoes (materia_id)` — filtro mais usado ao montar quiz.
- `questoes (revisada, anulada, tem_imagem)` — filtro de elegibilidade.
- `respostas (questao_id)` — pra saber histórico de uma questão.
- `respostas (respondido_em)` — pra estatísticas por período.
- `concursos (banca_id)` — suporta o filtro transversal por banca.

## Filtrar questões por banca (query transversal)

Como banca vive em `concursos` e as questões estão dois níveis abaixo, reunir
"todas as questões da FCC" é um join subindo a árvore:

```
questoes → provas → concursos → bancas
```

Ou seja: `questoes JOIN provas ON questoes.prova_id = provas.id
JOIN concursos ON provas.concurso_id = concursos.id`, filtrando por
`concursos.banca_id`. Isso atravessa todos os concursos daquela banca. Vale
encapsular numa **view** (ex.: `questoes_completas`) que já traz `banca_id` +
nome da banca, `concurso_id` + nome do concurso, e `materia_id` + nome da matéria
junto com a questão (via joins com `bancas`, `concursos` e `materias`), para
simplificar as queries de montagem de quiz e as estatísticas. A view não muda nada
no armazenamento — só deixa o read-side mais limpo e evita repetir os joins.

## Row Level Security (RLS)

Sendo single-user, o mais simples e seguro: habilite RLS em todas as tabelas e
crie policies que exigem usuário autenticado (`auth.uid() is not null`). Assim o
acervo não fica exposto publicamente. **Decisão tomada: usar Supabase Auth**
(login por e-mail/senha, um único usuário — você). As policies de RLS se apoiam
nesse `auth.uid()`. O mesmo vale para o acesso aos buckets de Storage.

## Storage

Dois buckets privados:

- `provas-pdf` — os PDFs originais importados. Ficam guardados para permitir
  reprocessar sem reupload.
- `questao-imagens` — figuras anexadas manualmente a questões que dependem de
  imagem (`questoes.imagem_path` aponta aqui).

Ambos privados: acesso só via função/usuário autenticado, nunca público.

## Export / backup do acervo

Você investe horas importando e revisando; perder isso seria doloroso, e o plano
grátis do Supabase não garante backup robusto. Regra do MVP: exista uma função de
**exportar o acervo para JSON** — bancas, concursos, provas (metadados),
questões revisadas e, opcionalmente, o histórico de respostas. Um clique gera um
arquivo que você guarda onde quiser.

Detalhes e formato em `03-regras-de-negocio.md`. No banco não exige nada novo — é
uma leitura das tabelas existentes serializada para JSON. Import (restaurar de um
JSON) pode ser evolução futura; o export sozinho já cobre o risco principal, que
é perder o trabalho de curadoria.
