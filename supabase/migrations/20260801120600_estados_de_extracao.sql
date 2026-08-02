-- =============================================================================
-- Estados intermediários da extração
--
-- Três colunas que o pipeline do docs/02 exige e que o schema original não
-- previa, porque foi desenhado pensando no estado FINAL da questão. A extração
-- vive nos intermediários.
-- =============================================================================

-- A) gabarito opcional no rascunho ------------------------------------------
--
-- Terceira vez do mesmo padrão (arquivo_hash, materia_id, agora gabarito):
-- opcional enquanto é rascunho, obrigatório para aprovar.
--
-- Sem isto, "questão sem gabarito casado vai para a revisão sinalizada" é
-- impossível de implementar — a linha simplesmente não entraria. E barrar a
-- prova inteira por causa de uma questão é pior: perde-se as outras 69.
alter table public.questoes
  alter column gabarito drop not null;

alter table public.questoes
  add constraint questoes_revisada_exige_gabarito
  check (revisada = false or gabarito is not null);

comment on column public.questoes.gabarito is
  'Letra correta. Nulo enquanto o gabarito não foi casado; obrigatório para aprovar (revisada = true).';

-- B) sinalização de questão duvidosa ----------------------------------------
--
-- O docs/02 já manda o LLM marcar `incerto: true` quando algo está ilegível ou
-- ambíguo, mas nunca existiu onde guardar. É o que faz a questão aparecer
-- destacada no topo da revisão em vez de passar despercebida no meio de 70.
alter table public.questoes
  add column incerto boolean not null default false;

comment on column public.questoes.incerto is
  'Extração marcou como duvidosa (texto ilegível, alternativa truncada, gabarito não casado). Aparece destacada na revisão.';

-- C) detecção de prova travada ----------------------------------------------
--
-- try/catch na Edge Function cobre exceções, mas NÃO cobre a função morrer por
-- timeout, OOM ou deploy no meio do processamento — nesses casos o catch nunca
-- roda e a prova fica em 'processando' para sempre. Como a regra do passo 4
-- bloqueia trocar o PDF a partir de 'processando', isso seria um beco sem
-- saída já no primeiro crash.
--
-- Com o carimbo, a UI sabe há quanto tempo a prova está processando e pode
-- oferecer "destravar". Nulo quando não está processando.
alter table public.provas
  add column processando_desde timestamptz;

comment on column public.provas.processando_desde is
  'Quando o processamento começou. Permite detectar prova travada e destravá-la pela UI. Nulo fora de processando.';

-- Coerência entre o status e o carimbo: só existe carimbo em 'processando'.
alter table public.provas
  add constraint provas_carimbo_so_em_processando
  check ((status = 'processando') = (processando_desde is not null));
