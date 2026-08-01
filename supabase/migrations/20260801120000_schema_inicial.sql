-- =============================================================================
-- Schema inicial — bancas, materias, concursos, provas, questoes, respostas
-- Referência: docs/01-banco-de-dados.md
--
-- Regras de deleção (docs/01):
--   - Cascata DESCENDENTE na árvore de conteúdo: apagar um concurso apaga suas
--     provas, questões e respostas. Isso torna "reprocessar uma prova" =
--     apagar e reimportar, sem sujeira residual.
--   - As duas dimensões NORMALIZADAS (bancas, materias) são exceção: RESTRICT.
--     Apagar uma banca/matéria não pode arrastar concursos/questões junto.
-- =============================================================================

-- gen_random_uuid() é nativo do Postgres 13+ (Supabase roda 15+), não precisa
-- de extensão.

-- -----------------------------------------------------------------------------
-- bancas — dimensão transversal. Existir como tabela (e não texto no concurso)
-- é o que permite reunir todas as questões de uma banca atravessando concursos.
-- -----------------------------------------------------------------------------
create table if not exists public.bancas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.bancas is
  'Lista canônica de bancas organizadoras. Escolhida de select na UI, nunca texto livre.';

-- -----------------------------------------------------------------------------
-- materias — segunda dimensão normalizada, mesma lógica de bancas.
-- Sem ela, "Dir. Const." e "Direito Constitucional" fragmentariam o acervo e o
-- filtro por matéria no quiz deixaria de ser confiável.
-- -----------------------------------------------------------------------------
create table if not exists public.materias (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.materias is
  'Lista canônica de matérias. O LLM sugere na extração; a revisão confirma escolhendo daqui.';

-- -----------------------------------------------------------------------------
-- concursos — contêiner de conteúdo de nível mais alto, aberto (recebe provas
-- indefinidamente). Pertence a uma banca.
-- -----------------------------------------------------------------------------
create table if not exists public.concursos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  -- nullable de propósito (docs/01): dá pra importar algo sem banca conhecida,
  -- mas o normal é sempre ter. RESTRICT protege contra apagar banca em uso.
  banca_id   uuid references public.bancas(id) on delete restrict,
  orgao      text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- provas — cada PDF importado. Núcleo da rastreabilidade e da idempotência.
-- -----------------------------------------------------------------------------
create table if not exists public.provas (
  id             uuid primary key default gen_random_uuid(),
  concurso_id    uuid not null references public.concursos(id) on delete cascade,
  nome           text not null,
  ano            int,
  cargo          text,
  arquivo_path   text,
  arquivo_hash   text not null,
  gabarito_path  text,
  -- Estado explícito do processamento assíncrono (docs/00, princípio 5).
  -- CHECK em vez de tipo enum: adicionar/renomear estado depois é um ALTER
  -- simples, sem a rigidez de um enum do Postgres.
  status         text not null default 'pendente'
                 check (status in ('pendente', 'processando', 'aguardando_revisao', 'pronta', 'erro')),
  erro_msg       text,
  total_questoes int,
  created_at     timestamptz not null default now(),

  -- IDEMPOTÊNCIA: o mesmo arquivo não entra duas vezes no mesmo concurso.
  -- O app checa o hash antes de subir e avisa "já importada".
  constraint provas_concurso_id_arquivo_hash_key unique (concurso_id, arquivo_hash)
);

-- -----------------------------------------------------------------------------
-- questoes — a unidade de estudo. Formato canônico validado por Zod antes de
-- inserir (src/app/shared/schema.ts).
-- -----------------------------------------------------------------------------
create table if not exists public.questoes (
  id          uuid primary key default gen_random_uuid(),
  prova_id    uuid not null references public.provas(id) on delete cascade,
  numero      int,
  -- Matéria normalizada (FK), não texto. RESTRICT pela mesma razão da banca.
  -- Nullable porque a extração cria a questão em rascunho antes de você casar
  -- a sugestão do LLM com a matéria canônica na revisão.
  materia_id  uuid references public.materias(id) on delete restrict,
  -- assunto continua texto livre: granular demais para normalizar e não é
  -- usado como filtro rígido.
  assunto     text,
  enunciado   text not null,
  -- jsonb: número variável de alternativas, a ordem importa, e é sempre lido em
  -- bloco junto com a questão. Não compensa tabela separada.
  alternativas jsonb not null,
  gabarito    text not null,
  tipo        text not null check (tipo in ('multipla_escolha', 'certo_errado')),
  tem_imagem  boolean not null default false,
  imagem_path text,
  comentario  text,
  anulada     boolean not null default false,
  revisada    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Revisão humana obrigatória implica escolher a matéria canônica: uma questão
  -- não pode ser aprovada sem matéria, senão entraria no acervo invisível a
  -- todos os filtros. (Constraint minha, não explícita no docs/01 — ver resumo.)
  constraint questoes_revisada_exige_materia
    check (revisada = false or materia_id is not null)
);

-- -----------------------------------------------------------------------------
-- respostas — seu histórico. Habilita estatísticas e revisão de erros.
-- -----------------------------------------------------------------------------
create table if not exists public.respostas (
  id             uuid primary key default gen_random_uuid(),
  questao_id     uuid not null references public.questoes(id) on delete cascade,
  letra_marcada  text not null,
  acertou        boolean not null,
  respondido_em  timestamptz not null default now(),
  -- Agrupa respostas de um mesmo quiz. Sem tabela `quizzes` no MVP: um quiz é
  -- efêmero (montado, respondido, descartado); guardar o id de sessão já
  -- permite reconstruir "como foi o quiz de ontem" depois.
  quiz_sessao_id uuid
);

-- =============================================================================
-- Índices (docs/01 → "Índices recomendados")
-- Postgres NÃO cria índice automático para FK — só para PK e UNIQUE. Por isso
-- os índices de prova_id/materia_id/questao_id/banca_id são explícitos.
-- =============================================================================
create index if not exists concursos_banca_id_idx  on public.concursos (banca_id);
create index if not exists provas_concurso_id_idx  on public.provas (concurso_id);
create index if not exists questoes_prova_id_idx   on public.questoes (prova_id);
create index if not exists questoes_materia_id_idx on public.questoes (materia_id);
-- Filtro de elegibilidade do quiz (docs/03).
create index if not exists questoes_elegibilidade_idx
  on public.questoes (revisada, anulada, tem_imagem);
create index if not exists respostas_questao_id_idx    on public.respostas (questao_id);
create index if not exists respostas_respondido_em_idx on public.respostas (respondido_em);

-- =============================================================================
-- Trigger de updated_at em questoes
-- Questões aprovadas continuam editáveis (corrigir matéria/gabarito, anexar
-- imagem); este carimbo diz o que foi tocado e quando.
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists questoes_set_updated_at on public.questoes;
create trigger questoes_set_updated_at
  before update on public.questoes
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- View questoes_completas
-- Encapsula o join que sobe a árvore (questoes → provas → concursos → bancas)
-- e resolve o nome da matéria. É o que o read-side consome para montar quiz e
-- calcular estatísticas, sem repetir joins em toda query.
--
-- security_invoker = true é ESSENCIAL: sem isso a view roda com os privilégios
-- do dono (postgres) e passaria por cima do RLS das tabelas de baixo,
-- expondo o acervo. Com invoker, o RLS de quem consulta continua valendo.
-- =============================================================================
create or replace view public.questoes_completas
with (security_invoker = true)
as
select
  q.id,
  q.prova_id,
  q.numero,
  q.materia_id,
  m.nome  as materia,
  q.assunto,
  q.enunciado,
  q.alternativas,
  q.gabarito,
  q.tipo,
  q.tem_imagem,
  q.imagem_path,
  q.comentario,
  q.anulada,
  q.revisada,
  q.created_at,
  q.updated_at,
  p.concurso_id,
  p.nome  as prova_nome,
  p.ano   as prova_ano,
  c.nome  as concurso_nome,
  c.banca_id,
  b.nome  as banca_nome,
  -- Regra de elegibilidade do docs/03, materializada aqui para o quiz filtrar
  -- por uma coluna só em vez de repetir a expressão em cada query.
  (q.revisada and not q.anulada and (not q.tem_imagem or q.imagem_path is not null))
          as elegivel
from public.questoes q
  join public.provas    p on p.id = q.prova_id
  join public.concursos c on c.id = p.concurso_id
  -- LEFT: banca e matéria podem estar ausentes (concurso sem banca, questão em
  -- rascunho). INNER aqui sumiria com essas linhas silenciosamente.
  left join public.bancas   b on b.id = c.banca_id
  left join public.materias m on m.id = q.materia_id;

comment on view public.questoes_completas is
  'Questão + prova + concurso + banca + nome da matéria, com flag de elegibilidade. Read-side.';
