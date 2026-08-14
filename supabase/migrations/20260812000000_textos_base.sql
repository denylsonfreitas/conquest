-- =============================================================================
-- Texto-base compartilhado
--
-- Prova de concurso costuma trazer um texto que serve a várias questões: um em
-- português, outro em inglês, às vezes mais. Hoje esse texto se perde na
-- extração e as questões que dependem dele chegam insolúveis.
--
-- Tabela, e não coluna em questoes, porque um texto serve dez questões:
-- duplicá-lo faria corrigir uma transcrição virar edição em dez lugares.
-- =============================================================================

create table if not exists public.textos_base (
  id uuid primary key default gen_random_uuid(),
  prova_id uuid not null references public.provas (id) on delete cascade,
  titulo text,
  conteudo text not null,
  fonte text,
  -- Ordem em que apareceram na prova. Só para exibir numa sequência estável;
  -- não carrega significado.
  ordem int,
  created_at timestamptz not null default now()
);

create index if not exists textos_base_prova_idx on public.textos_base (prova_id);

alter table public.textos_base enable row level security;

drop policy if exists "textos_base_so_o_dono" on public.textos_base;
create policy "textos_base_so_o_dono" on public.textos_base
  for all to authenticated
  using ((select public.eh_dono()))
  with check ((select public.eh_dono()));

grant select, insert, update, delete on public.textos_base to authenticated;

-- -----------------------------------------------------------------------------
-- O par tem_texto_base / texto_base_id espelha tem_imagem / imagem_path:
-- a flag diz que a questão depende de um texto, o id diz qual. Marcada sem id,
-- a questão fica pendente na revisão em vez de entrar quebrada no quiz.
--
-- set null no delete: apagar o texto devolve as questões para "precisa de
-- texto" em vez de levá-las junto.
-- -----------------------------------------------------------------------------

alter table public.questoes
  add column if not exists texto_base_id uuid
    references public.textos_base (id) on delete set null,
  add column if not exists tem_texto_base boolean not null default false;

create index if not exists questoes_texto_base_idx on public.questoes (texto_base_id);

-- -----------------------------------------------------------------------------
-- Elegibilidade continua sendo decidida no banco, não no front. Questão que
-- depende de texto e não tem um associado não entra em quiz — mesma regra já
-- aplicada à imagem.
--
-- create or replace preserva os GRANTs, e por isso as colunas novas vão no fim.
-- -----------------------------------------------------------------------------

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
  (
    q.revisada
    and not q.anulada
    and (not q.tem_imagem or q.imagem_path is not null)
    and (not q.tem_texto_base or q.texto_base_id is not null)
  ) as elegivel,
  q.incerto,
  q.tem_texto_base,
  q.texto_base_id
from public.questoes q
  join public.provas    p on p.id = q.prova_id
  join public.concursos c on c.id = p.concurso_id
  left join public.bancas   b on b.id = c.banca_id
  left join public.materias m on m.id = q.materia_id;
