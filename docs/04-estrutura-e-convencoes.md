# Estrutura de Código & Convenções (Angular)

Guia para desenvolver com boas práticas usando Angular. Feito para ser lido pelo
Claude Code como contexto do projeto.

> Este projeto usa **Angular standalone components** (sem NgModules), a abordagem
> recomendada nas versões atuais. Signals para estado reativo. Isso mantém o
> código mais enxuto e é onde o Angular está indo — bom para aprender o que é
> atual, não o legado.

## Estrutura de pastas sugerida

```
concurso-app/
├── docs/                      # esta documentação
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── supabase.service.ts    # cliente Supabase (injectable)
│   │   │   └── auth.service.ts        # sessão single-user
│   │   ├── shared/
│   │   │   ├── schema.ts              # schemas Zod canônicos
│   │   │   ├── models.ts              # tipos TS derivados dos schemas
│   │   │   └── ui/                    # componentes reutilizáveis (botão, card)
│   │   ├── features/
│   │   │   ├── concursos/
│   │   │   │   ├── concursos.service.ts   # data access (queries Supabase)
│   │   │   │   ├── lista-concursos.component.ts
│   │   │   │   └── detalhe-concurso.component.ts
│   │   │   ├── provas/
│   │   │   │   ├── provas.service.ts
│   │   │   │   ├── upload-prova.component.ts
│   │   │   │   └── lista-provas.component.ts
│   │   │   ├── importacao/
│   │   │   │   └── revisao-questoes.component.ts
│   │   │   ├── quiz/
│   │   │   │   ├── quiz.service.ts         # montagem/execução
│   │   │   │   ├── regras-quiz.ts          # funções PURAS (sorteio, etc.)
│   │   │   │   ├── montar-quiz.component.ts
│   │   │   │   ├── quiz-execucao.component.ts
│   │   │   │   └── resultado.component.ts
│   │   │   └── progresso/
│   │   │       ├── progresso.service.ts
│   │   │       └── progresso.component.ts
│   │   ├── app.routes.ts              # rotas standalone
│   │   ├── app.config.ts              # providers globais
│   │   └── app.component.ts
│   └── main.ts
├── supabase/
│   ├── migrations/                    # SQL versionado do schema
│   └── functions/
│       └── processar-prova/           # Edge Function (Deno/TS)
│           ├── index.ts
│           ├── extrair-texto.ts
│           ├── extrair-questoes.ts    # chamada ao LLM, isolada
│           └── casar-gabarito.ts
└── package.json
```

**Organização por feature, não por camada técnica.** Tudo de "quiz" mora junto
(componentes, service, regras, tipos locais). É a estrutura que o Angular moderno
recomenda e a que escala melhor. `core/` guarda serviços singleton de
infraestrutura; `shared/` o que é reutilizável entre features.

## Padrões Angular a seguir

### Standalone components, sem NgModules
Todo componente é `standalone: true` e declara seus próprios `imports`. Não crie
NgModules — é o modelo legado. Isso também torna o lazy-loading de rotas trivial.

### Signals para estado
Use `signal()`, `computed()` e `effect()` para estado reativo em vez de depender
de RxJS para tudo. Ex.: o estado do quiz em andamento (questão atual, respostas
dadas) vive bem em signals. Reserve RxJS/observables para o que é naturalmente
assíncrono e em stream — chamadas HTTP, realtime do Supabase.

### Injeção de dependência com `inject()`
Prefira a função `inject()` a injeção por construtor nos componentes standalone —
é o estilo atual e mais limpo:

```ts
private readonly concursosService = inject(ConcursosService);
```

### Services para lógica e dados, componentes para renderizar
Regra de ouro do Angular que também é boa prática geral:

- **Componentes** só renderizam e capturam interação. Sem regra de negócio, sem
  query direta.
- **Services** (`@Injectable`) concentram acesso a dados (Supabase) e orquestração.
- **Funções puras** (arquivos como `regras-quiz.ts`) contêm as regras testáveis:
  sorteio, elegibilidade, cálculo de resultado, casamento de gabarito. Não
  precisam ser injetáveis — são funções puras, importadas direto e fáceis de
  testar isoladamente.

### Roteamento
`app.routes.ts` com rotas standalone e `loadComponent` para lazy-loading das
features. Mapa de telas está no doc `03`.

### Novo control flow no template
Use a sintaxe atual `@if`, `@for`, `@switch` nos templates em vez de
`*ngIf`/`*ngFor`. É o padrão moderno e mais legível.

## O schema canônico é a fonte da verdade

Em `src/app/shared/schema.ts`, defina os schemas Zod uma vez e derive os tipos TS
deles (`z.infer`). O **mesmo** schema é usado pela Edge Function (validar antes de
gravar) e pelo app Angular (validar edições na revisão). Uma definição, um
formato, zero divergência.

> Nota: Angular tem seus próprios reactive forms com validação, mas o Zod aqui
> serve para validar o *dado da questão* (o contrato entre subsistemas), não só o
> formulário. Você pode usar os dois: Zod para o contrato de dados, reactive forms
> para a UX do formulário de revisão. Se preferir manter só um, Zod validando na
> borda + tipos derivados é suficiente.

Vive ali:
- `QuestaoSchema` — numero, materia, enunciado, alternativas[], gabarito, tipo,
  tem_imagem, imagem_path?, comentario?, anulada, revisada...
- `AlternativaSchema` — letra, texto.
- `BancaSchema`, `ConcursoSchema` (com banca_id), `ProvaSchema`.

## Convenções

- **TypeScript estrito.** `strict: true` (o Angular CLI já ativa). Sem `any` — se
  aparecer, é sinal de fronteira mal definida.
- **Nada de lógica de negócio em componentes.** Componentes renderizam; services e
  funções puras decidem.
- **Funções puras para as regras.** `montarQuiz(filtros, questoes)`,
  `calcularResultado(respostas)`, `elegivel(questao)`. Puras = testáveis sem
  Angular nem banco. Melhor retorno de esforço em testes.
- **Data access isolado nos services.** Queries Supabase só nos `*.service.ts` de
  cada feature, nunca nos componentes.
- **Estados de loading/erro/vazio sempre tratados.** Toda tela que busca dados
  trata os três, não só o caminho feliz. Signals ajudam: um `signal` de status
  (`'loading' | 'ok' | 'erro'`) por tela.

## Migrations

Todo o schema nasce em `supabase/migrations/` como SQL, com prefixo de ordem.
Banco reconstruível do zero e versionado junto com o código. Nunca altere
estrutura só pelo painel do Supabase.

## Variáveis de ambiente / segredos

- Chaves do LLM e `service_role` do Supabase: **só** na Edge Function (segredos do
  Supabase), nunca no front.
- No app Angular, só a `anon key` e a URL do projeto (públicas por design,
  protegidas por RLS). Use os `environments/` do Angular para isso.
- Segredos reais fora do repositório; documente o necessário num
  `environment.example.ts`.

## Roadmap de implementação (ordem sugerida)

Construir na ordem que dá feedback cedo e destrava o resto:

1. **Fundação** — projeto Angular (standalone), Tailwind, `SupabaseService`,
   migrations das tabelas (bancas, concursos, provas, questoes, respostas) +
   view `questoes_completas`, schema Zod. Seed inicial de bancas e matérias.
2. **Concursos & provas (CRUD básico)** — criar concurso (selecionando banca da
   lista), listar, criar registro de prova. Sem processamento ainda. Já dá pra
   navegar entre rotas. Inclua o CRUD leve de bancas/matérias aqui — é o primeiro
   exercício simples de standalone component + service + signals.
3. **Upload + storage** — subir PDF, calcular hash, dedupe, guardar no bucket.
4. **Edge Function de extração** — o coração. Texto → LLM (detectando tipo e
   `tem_imagem`) → validação → grava rascunho. Testar com uma prova real cedo,
   porque é onde estão as surpresas. (Roda em Deno no Supabase, independente do
   Angular.)
5. **Tela de revisão** — aprovar/editar questões, confirmar matéria, marcar/anexar
   imagem, comentar. Fecha o pipeline write-side.
6. **Questões: busca + edição pós-aprovação** — listar/filtrar o acervo e editar
   questão já aprovada (corrigir campos, anexar imagem, comentar). Garante que
   nada fica preso ao que a extração produziu.
7. **Montar e responder quiz** — filtros (banca, concurso, matéria), sorteio
   (funções puras, respeitando a regra de elegibilidade com imagem), execução com
   signals, registro de respostas.
8. **Resultado + estatísticas** — placar, desempenho por matéria e por banca,
   progresso global, atalho para editar/comentar questão a partir do resultado.
9. **Export do acervo** — botão que serializa bancas/concursos/provas/questões
   (e opcionalmente respostas) para JSON e baixa. Seguro barato contra perda.
10. **Polimento** — responsividade do tablet, estados de erro/vazio, modo revisão
    de erros.

Ataque o item 4 (extração) com uma prova de verdade assim que possível. Tudo
depois dele assume que ele funciona; validar cedo evita retrabalho. Note que a
Edge Function é Deno/TypeScript puro — bom exercício, mas separado do Angular.

## Nota sobre testes

O Angular CLI já configura o test runner. Priorize testes das **funções puras de
regra de negócio** (`regras-quiz.ts`: sorteio, elegibilidade, cálculo de
resultado, casamento de gabarito). São baratas de testar (sem TestBed, sem mock
de serviço) e é onde bugs sutis machucam o estudo — quiz que repete questão,
gabarito casado errado. Testes de componente com TestBed ficam em segundo plano.

## O que este projeto te ensina de Angular

Como o objetivo é melhorar no Angular, vale saber o que você vai exercitar:
standalone components e a nova arquitetura sem NgModules, signals e reatividade
moderna, `inject()`, lazy-loading de rotas, reactive forms na tela de revisão,
integração com um backend externo via service, e o novo control flow de template.
É um recorte atual e saudável do Angular — não o estilo legado.
