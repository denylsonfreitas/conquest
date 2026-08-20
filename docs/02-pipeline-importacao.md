# Pipeline de Importação

O subsistema write-side. Transforma um PDF numa lista de questões aprovadas.
É a parte mais delicada do projeto — trate com o cuidado descrito aqui.

## Visão geral do fluxo

```
[1] Registro da prova (nome, ano, cargo) — status: pendente, sem arquivo
      │
      ▼
[2] Anexar PDF: calcula hash → reivindica → sobe → vincula
      │  (status continua pendente)
      ▼
[3] Você clica "Processar"
      │  o NAVEGADOR extrai o texto do PDF (ver nota de CPU)
      │  Edge Function recebe o texto (status: processando)
      ▼
[4] LLM estrutura → JSON de questões
      │  casa com gabarito
      ▼
[5] Valida contra schema Zod
      │  grava questoes (revisada: false)
      │  status: aguardando_revisao
      ▼
[6] Você revisa na UI, corrige, aprova
      │  questoes.revisada = true
      ▼
[7] status: pronta → questões entram nos quizzes
```

## Etapa por etapa

### 1–2. Registro e anexo do PDF

São **dois momentos distintos, um fluxo só**. Primeiro você registra a prova
com seus metadados (nome, ano, cargo) dentro do concurso; ela nasce `pendente`,
sem arquivo. Depois, anexa o PDF a essa prova existente — o upload **nunca cria
uma prova nova**, sempre preenche a linha que já está lá.

**Ordem do anexo (importa, e não é a óbvia):**

1. o front lê o arquivo e calcula o **SHA-256** no cliente;
2. consulta se **outra** prova do mesmo concurso já tem esse hash;
3. **reivindica** o hash gravando `arquivo_hash` na prova — antes de qualquer
   upload;
4. sobe o PDF ao bucket;
5. grava `arquivo_path`, vinculando o arquivo à prova.

O passo 2 é **advisório**: entre consultar e gravar, a linha pode mudar. Quem
garante a unicidade é a constraint `UNIQUE (concurso_id, arquivo_hash)`, no
passo 3 — e é por isso que ele vem **antes** do upload. Assim uma duplicata
falha cedo, sem gastar banda e sem deixar arquivo órfão no bucket.

Esse fluxo só é possível porque `arquivo_hash` é nulável e o CHECK
`provas_arquivo_exige_hash` exige hash apenas quando há `arquivo_path`: existe
um estado válido "hash sem arquivo", que é precisamente "reservei, estou
subindo" (ver `01-banco-de-dados.md`).

**Detalhes que só aparecem em retentativa:**

- A consulta do passo 2 exclui a própria prova. Sem isso, reenviar depois de um
  upload interrompido bateria no hash que ela mesma reservou, e o app se
  auto-bloquearia.
- O caminho no bucket é determinístico (`{concurso_id}/{prova_id}.pdf`) e o
  upload usa `upsert`. Retentar sobrescreve o mesmo objeto em vez de acumular
  lixo.
- Se algo falhar entre o passo 3 e o 5, a reserva é **liberada** (hash e paths
  voltam a nulo). A prova retorna a "só metadados" e pode receber o arquivo de
  novo.

**Estados da prova nesta etapa:**

| `arquivo_hash` | `arquivo_path` | significa                              |
| -------------- | -------------- | -------------------------------------- |
| ∅              | ∅              | só metadados                           |
| ✓              | ∅              | reservado, upload em voo (transitório) |
| ✓              | ✓              | PDF anexado, aguardando processamento  |

O `status` permanece `pendente` durante todo o anexo. Ele só muda quando a Edge
Function assume (etapa 3).

**Substituir o PDF:** permitido enquanto o status for `pendente` ou `erro`.
A partir de `processando` é bloqueado — existem questões extraídas penduradas
naquele arquivo, e trocá-lo as deixaria descrevendo um documento inexistente.

**Prova e gabarito separados:** o formulário de anexo aceita dois arquivos — a
prova (obrigatório) e o gabarito (opcional). Muitas provas trazem o gabarito num
PDF à parte. Se vier junto no mesmo PDF, o segundo campo fica vazio e o LLM
extrai ambos do único arquivo. O gabarito **não entra na deduplicação**: a
identidade da prova é só o `arquivo_hash` do PDF principal.

### 3. Extração de texto bruto — **no navegador**

O texto é extraído com `unpdf` (que embute o pdf.js) **no cliente**, não na Edge
Function. Saída: texto por página. Não tente parsear a estrutura aqui — só
obtenha o texto. A inteligência fica no LLM.

> **Por que não na Edge Function** (medido, não suposto): extrair as 16 páginas
> da prova da DATAPREV custa **2.390 ms de CPU**; o gabarito, mais 1.235 ms. O
> Edge Runtime corta bem antes — a primeira execução real morreu com
> `CPU time hard limit reached` / `WORKER_LIMIT`. É limite estrutural da
> plataforma, não do ambiente local.
>
> O navegador não tem esse teto e **já lê o arquivo** para calcular o hash no
> anexo, então extrair ali reaproveita trabalho. A alternativa seria fatiar em
> ~16 invocações, multiplicando complexidade e estado para contornar um limite
> que a extração no cliente simplesmente elimina.

**A privacidade não se move para o cliente.** O navegador manda o texto **cru**;
é o servidor que remove a marca d'água e verifica, nesta ordem, antes de
qualquer chamada externa:

```
texto recebido → removerMarcaDagua → checa se sobrou conteúdo
              → garantirSemMarcaDagua → só então o LLM
```

Uma única guarda, no processo que fala com a API. Texto vindo do cliente é
entrada não confiável por princípio, mesmo num app de um usuário só.

**Caso PDF escaneado (imagem):** se depois da limpeza sobrar menos que um mínimo
plausível de texto, o PDF é imagem. `status = 'erro'` com mensagem clara ("PDF
parece escaneado, precisa de OCR"). A checagem vem **depois** da limpeza porque
um PDF escaneado só tem a marca d'água como texto, e antes de limpar ele
pareceria ter conteúdo. OCR fica fora do MVP.

**Retentativa:** o botão "Tentar de novo" refaz o mesmo caminho — o cliente
**baixa o PDF do bucket**, extrai de novo e reenvia. Sem reupload. O texto não é
guardado no banco de propósito: o PDF é o artefato durável, o texto é valor
derivado e descartável, e uma cópia precisaria ser invalidada toda vez que o PDF
fosse substituído.

**Prova travada:** se a função morrer por timeout, OOM ou deploy, o `catch` não
roda e ninguém reescreve o status. A coluna `provas.processando_desde` permite
detectar isso, e a UI oferece **"Destravar"** após o limite, devolvendo a prova
a `erro` com o PDF preservado.

### 4. Estruturação via LLM

Mande o texto ao LLM com instrução para devolver **estritamente JSON** no schema
canônico. Pontos críticos do prompt:

- Peça o formato exato: array de objetos com `numero`, `enunciado`,
  `alternativas` (array de `{letra, texto}`), `tipo`.
- Instrua a **não inventar** questões nem alternativas; se algo estiver ilegível,
  marcar com um campo `incerto: true` para a revisão pegar (gravado na coluna
  `questoes.incerto`).
- **A matéria vem do cabeçalho de seção, não de palpite.** O texto da prova traz
  "Língua Portuguesa", "Raciocínio Lógico Matemático", "Conhecimentos
  Específicos" etc.; toda questão pertence ao último cabeçalho antes dela.
  Instrua a copiar esse cabeçalho, remontando-o se vier quebrado em duas linhas,
  e a só chutar quando não houver cabeçalho nenhum — marcando `incerto`. Na
  prova real isso casou 29 de 70 matérias direto com a lista canônica; as demais
  ficaram sinalizadas por a seção não existir no seed, não por erro do modelo.
- Use `responseSchema` da API em vez de pedir JSON no texto do prompt: elimina a
  classe inteira de falhas de "o modelo devolveu markdown em volta do JSON".
  Temperatura **zero** — extração é transcrição, não criação.
- Detectar tipo: múltipla escolha (A–E) vs certo/errado (estilo Cebraspe).
- **Detectar dependência de imagem:** instrua o LLM a marcar `tem_imagem: true`
  quando o enunciado referencia um elemento visual ausente do texto ("observe a
  figura", "com base no gráfico", "a imagem acima", mapa, tabela-imagem). Como a
  extração é só de texto, essas questões chegam incompletas — a flag garante que a
  revisão as pegue.

  > Aprendido na prova real: a flag cobre uma categoria **mais ampla** que
  > figuras. Uma das duas questões marcadas dizia "foi implementado o seguinte
  > código em Java:" — o bloco de código se perdeu na extração de texto. Ou
  > seja: `tem_imagem` significa na prática _"depende de conteúdo que o texto
  > extraído não captura"_. Um grep por "figura|gráfico|imagem" não teria
  > encontrado esse caso; o LLM encontrou.

- Não incluir o gabarito ainda se ele está em texto separado — casa no passo
  seguinte.

**Casamento com gabarito:** na prática o PDF de gabarito de um concurso cobre
**todos os cargos e tipos de caderno** — o da DATAPREV tem 35 blocos, sendo 4 só
do cargo em questão, cada um com 70 respostas. Escolher o bloco errado
produziria 70 gabaritos errados **em silêncio**, que é o pior defeito possível
num app de estudo: você estuda errado por semanas sem aviso.

Por isso o casamento tem duas etapas e uma trava:

1. `identificarProva` lê cargo, tipo e cor do próprio texto da prova (a capa
   traz "TIPO 1 – BRANCA"; o cabeçalho se repete em toda página);
2. `casarGabarito` seleciona o bloco por cargo + tipo e zipa os pares de linhas
   (números / letras) da grade.

**Trava inegociável:** só aplica se a seleção for **inequívoca** — um único
bloco casando E a contagem de respostas batendo com a de questões extraídas.
Essa segunda checagem é validação cruzada: dois caminhos independentes chegando
ao mesmo número; se discordam, um está errado e não há como saber qual.
Qualquer ambiguidade → grava sem gabarito, com `incerto = true`.

Gabarito ausente é visível e recuperável na revisão; gabarito errado é
invisível. Trocar o segundo pelo primeiro é sempre a decisão certa.

Se o gabarito veio junto no mesmo PDF, o LLM já devolve por questão. Falha no
gabarito **não interrompe** a extração: o texto das questões é o trabalho caro e
não depende dele.

**Volume:** provas grandes podem estourar o contexto do modelo. Se necessário,
divida o texto em blocos (por página ou por faixa de questões) e junte os
resultados. Mantenha o `numero` como chave de reconciliação.

### 5. Validação

Antes de gravar, cada questão passa pelo schema Zod canônico (o mesmo do front).
Rejeita: alternativas vazias, gabarito que não corresponde a nenhuma letra
existente, enunciado vazio. Questões que falham não são descartadas
silenciosamente — são gravadas com flag de problema pra você resolver na revisão,
ou logadas no `erro_msg`. Nunca perca dado sem avisar.

Grava as questões com `revisada = false`. Prova vai para `aguardando_revisao`.

### 6. Revisão humana

Tela que lista as questões extraídas daquela prova, mostrando enunciado,
alternativas e **gabarito destacado**. Você pode:

- Editar qualquer campo (enunciado, alternativa, matéria, gabarito).
- Atribuir/corrigir a **matéria** (o LLM chuta, você confirma — ver normalização
  em `03`).
- Confirmar/ajustar a flag **`tem_imagem`** e, se aplicável, **anexar a imagem**
  (vai para o bucket `questao-imagens`, preenche `imagem_path`). Enquanto uma
  questão com imagem não tiver a figura anexada, ela fica inelegível para quizzes.
- Escrever um **comentário/justificativa** (opcional) — anotação de estudo.
- Marcar como **anulada**.
- Aprovar individualmente ou "aprovar todas".

Questões marcadas `incerto`, `tem_imagem` sem anexo, ou sem gabarito aparecem no
topo, destacadas — são as que exigem tua atenção antes de aprovar.

### 7. Conclusão

Ao aprovar, `revisada = true`. Quando todas as questões da prova estão revisadas
(ou você clica "concluir revisão"), a prova vira `pronta`. A partir daí as
questões são elegíveis para quizzes.

## Tratamento de erros

Cada etapa que pode falhar atualiza `provas.status = 'erro'` e preenche
`erro_msg` com algo acionável. A UI mostra o erro e oferece "tentar novamente"
(reprocessa a partir do PDF já no storage — não precisa reupload). Nunca deixe
uma prova presa em `processando` sem timeout/fallback.

## Decisão de LLM

**Decidido: Google Gemini Flash** — camada grátis, bom custo-benefício e sólido
em extração estruturada. É o ponto de partida.

Ainda assim, o pipeline **não deve depender de um provedor específico**: isole a
chamada do LLM atrás de uma função `extrairQuestoes(texto): QuestaoRaw[]`. Se um
dia quiser trocar (ex.: Claude Haiku, que é pago mas muito forte em seguir
schema), troca-se a implementação sem tocar no resto. A chave da API do Gemini
vive **apenas** como segredo da Edge Function, nunca no front.

### Cadeia de provedores (implementado)

A promessa acima virou código: `provedores.ts` isola o fornecedor, e a extração
percorre uma **cadeia** configurada por segredo da Edge Function.

```
EXTRACAO_CADEIA = "gemini:gemini-flash-latest,mistral:mistral-large-latest"
```

Cada elo é `provedor:modelo`, na ordem de preferência. Provedores conhecidos e a
chave que cada um espera:

| Provedor     | Segredo              | Dialeto |
| ------------ | -------------------- | ------- |
| `gemini`     | `GEMINI_API_KEY`     | Gemini  |
| `mistral`    | `MISTRAL_API_KEY`    | OpenAI  |
| `groq`       | `GROQ_API_KEY`       | OpenAI  |
| `openrouter` | `OPENROUTER_API_KEY` | OpenAI  |
| `deepseek`   | `DEEPSEEK_API_KEY`   | OpenAI  |
| `cerebras`   | `CEREBRAS_API_KEY`   | OpenAI  |

Só o Gemini tem API própria; os demais falam `/chat/completions` da OpenAI, então
**um adaptador cobre todos** — acrescentar provedor é configurar um segredo, não
escrever código. A URL de cada um pode ser sobrescrita com `<PROVEDOR>_URL` sem
precisar de deploy.

Regras que a cadeia segue:

- **Elo sem chave é pulado em silêncio.** Ter dois configurados e só uma chave é
  o caso normal de quem está experimentando o segundo — não deve virar erro.
- **Repetir antes de trocar.** Sobrecarga (500/502/503/504) é transitória: até 3
  tentativas no mesmo elo, com recuo de 2s e 5s, e só então o elo seguinte.
- **404 troca sem repetir.** Modelo que não existe não passa a existir por
  esperarmos.
- **Cota e chave recusada dependem de QUEM é o próximo.** São falhas do
  provedor, não do modelo: só encerram a cadeia quando o elo seguinte usaria a
  mesma chave. A cota do Gemini não diz nada sobre a do Mistral — era
  justamente esse o caso em que a alternativa existe para servir.
- Nada disso pode passar do orçamento de ~110s da função; a espera entra na conta.

O formato JSON é garantido de dois jeitos diferentes: `responseSchema` estrito no
Gemini, `response_format: json_object` nos compatíveis (schema estrito ainda não é
universal). A garantia mais fraca é coberta por `lerExtracao` + Zod, que validam
o que volta em qualquer caso.

Quando a cadeia se esgota, a mensagem de erro **nomeia os elos que existiam**.
Configurar `MISTRAL_API_KEY` sem acrescentar o elo em `EXTRACAO_CADEIA` não faz
nada — e sem isso no recado a falha seria calada: diria "cota esgotada" sem
deixar ver que a alternativa nunca chegou a ser tentada.

**Compatibilidade:** `GEMINI_MODELOS` continua sendo lido, e entrada sem prefixo
segue valendo como Gemini.

### Elo que responde 200 sem entregar

Responder com sucesso não é o mesmo que responder o combinado. Um modelo
pequeno — os gratuitos do OpenRouter em especial — ignora `response_format` e
devolve prosa com status 200, ou corta a resposta no limite de tokens.

A cadeia trata esses casos como falha **daquele elo**, não da extração: o
seguinte assume. Antes o primeiro 200 encerrava a cadeia e o erro só aparecia
depois, quando já não havia para quem recorrer.

Os códigos são nossos, fora da faixa que os provedores usam:

| Código | Significado                             |
| ------ | --------------------------------------- |
| 597    | resposta cortada no limite de tokens    |
| 598    | respondeu fora do JSON combinado        |
| 599    | não respondeu dentro do tempo da função |

Nenhum deles vale repetição no mesmo elo: com `temperature: 0` a resposta seria
a mesma, e o prazo estourado já consumiu o orçamento. Todos valem o elo seguinte.

### Sobre os modelos gratuitos do OpenRouter

Funcionam sem mudança de código: `openrouter` já é um provedor conhecido, e o id
com barra e dois-pontos (`deepseek/deepseek-chat-v3:free`) atravessa o parser da
cadeia inteiro, porque o corte é no **primeiro** dois-pontos.

```
EXTRACAO_CADEIA = "gemini:gemini-flash-latest,openrouter:deepseek/deepseek-chat-v3:free"
```

O que eles **não** resolvem é tempo: a chamada única de uma prova inteira pede
~20k tokens de saída, e modelo gratuito costuma ser mais lento, não mais rápido.
Enquanto a prova for uma requisição só, o limite continua sendo o orçamento de
~110s da função — é o fatiamento que muda isso.
