-- =============================================================================
-- provas.arquivo_hash passa a ser opcional
--
-- Motivo: o roadmap cria o REGISTRO da prova (nome, ano, cargo) antes de subir
-- o PDF — são passos separados de propósito. Com `arquivo_hash NOT NULL` esse
-- fluxo é impossível: não existe hash antes de existir arquivo, e preencher com
-- placeholder sujaria justamente a coluna que garante a idempotência.
--
-- A constraint UNIQUE (concurso_id, arquivo_hash) continua valendo e NÃO
-- precisa mudar. No Postgres, NULLs são distintos entre si para efeito de
-- UNIQUE: várias provas sem arquivo convivem no mesmo concurso, e a
-- idempotência passa a valer exatamente a partir do momento em que existe um
-- hash — que é quando ela faz sentido.
--
-- O CHECK abaixo mantém a invariante que realmente importa: se há arquivo,
-- há hash. Prova com PDF sem hash seria um registro impossível de deduplicar.
-- =============================================================================

alter table public.provas
  alter column arquivo_hash drop not null;

alter table public.provas
  add constraint provas_arquivo_exige_hash
  check (arquivo_path is null or arquivo_hash is not null);

comment on column public.provas.arquivo_hash is
  'SHA-256 do PDF. Nulo enquanto a prova é só um registro de metadados; obrigatório assim que arquivo_path é preenchido.';
