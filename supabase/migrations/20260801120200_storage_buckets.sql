-- =============================================================================
-- Storage — dois buckets PRIVADOS
-- Referência: docs/01-banco-de-dados.md → "Storage"
--
--   provas-pdf      → PDFs originais importados (permitem reprocessar sem reupload)
--   questao-imagens → figuras anexadas a questões com tem_imagem = true
--
-- public = false: nada acessível por URL direta. O acesso se dá por sessão
-- autenticada ou por signed URL gerada pelo backend.
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('provas-pdf',      'provas-pdf',      false),
  ('questao-imagens', 'questao-imagens', false)
on conflict (id) do nothing;

-- storage.objects já tem RLS habilitado pelo Supabase; só faltam as policies.
-- Mesma regra das tabelas: autenticado acessa, anônimo não.

drop policy if exists "provas_pdf_acesso_autenticado" on storage.objects;
create policy "provas_pdf_acesso_autenticado" on storage.objects
  for all to authenticated
  using (bucket_id = 'provas-pdf' and auth.uid() is not null)
  with check (bucket_id = 'provas-pdf' and auth.uid() is not null);

drop policy if exists "questao_imagens_acesso_autenticado" on storage.objects;
create policy "questao_imagens_acesso_autenticado" on storage.objects
  for all to authenticated
  using (bucket_id = 'questao-imagens' and auth.uid() is not null)
  with check (bucket_id = 'questao-imagens' and auth.uid() is not null);
