-- =============================================================================
-- Row Level Security
-- Referência: docs/01-banco-de-dados.md → "Row Level Security (RLS)"
--
-- App single-user com Supabase Auth. A política é a mais simples que protege o
-- acervo: qualquer usuário AUTENTICADO tem acesso total; anônimo não vê nada.
-- Como só existe um usuário (você), não há necessidade de coluna user_id nem de
-- comparar auth.uid() com dono de linha.
--
-- Sem RLS habilitado, a anon key exposta no front daria leitura pública do
-- acervo inteiro — RLS é o que torna seguro publicar essa chave.
-- =============================================================================

alter table public.bancas    enable row level security;
alter table public.materias  enable row level security;
alter table public.concursos enable row level security;
alter table public.provas    enable row level security;
alter table public.questoes  enable row level security;
alter table public.respostas enable row level security;

-- `to authenticated` já restringe pelo papel; o `auth.uid() is not null`
-- explicita a regra do docs/01 e protege caso um token sem sub apareça.
-- USING filtra o que é lido/alterado; WITH CHECK valida o que é inserido.

drop policy if exists "bancas_acesso_autenticado" on public.bancas;
create policy "bancas_acesso_autenticado" on public.bancas
  for all to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "materias_acesso_autenticado" on public.materias;
create policy "materias_acesso_autenticado" on public.materias
  for all to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "concursos_acesso_autenticado" on public.concursos;
create policy "concursos_acesso_autenticado" on public.concursos
  for all to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "provas_acesso_autenticado" on public.provas;
create policy "provas_acesso_autenticado" on public.provas
  for all to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "questoes_acesso_autenticado" on public.questoes;
create policy "questoes_acesso_autenticado" on public.questoes
  for all to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "respostas_acesso_autenticado" on public.respostas;
create policy "respostas_acesso_autenticado" on public.respostas
  for all to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Nota sobre a Edge Function: ela usa a service_role key, que ignora RLS por
-- design. É intencional — o pipeline de importação grava rascunhos sem sessão
-- de usuário. Por isso a service_role NUNCA pode ir para o front (docs/04).
