-- =============================================================================
-- Acesso restrito ao dono
--
-- As policies antigas liberavam para "auth.uid() is not null", ou seja: para
-- QUALQUER usuário autenticado. Num projeto hospedado com cadastro aberto,
-- isso significa que um estranho cria conta e passa a ler e escrever o acervo
-- inteiro. Desligar o cadastro fecha a porta, mas é configuração — some num
-- restore, num projeto novo, num clique errado no painel.
--
-- Aqui a regra vira dado: só o uid que estiver na tabela `dono` passa. Se a
-- tabela estiver vazia, ninguém acessa nada — o padrão falha fechado.
-- =============================================================================

create table if not exists public.dono (
  id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.dono enable row level security;

-- Nenhuma policy permissiva: a tabela é invisível pelo PostgREST. Ela é lida
-- só por eh_dono(), que roda como security definer.
drop policy if exists "dono_invisivel_na_api" on public.dono;
create policy "dono_invisivel_na_api" on public.dono for select to authenticated using (false);

create or replace function public.eh_dono()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.dono d where d.id = (select auth.uid()));
$$;

revoke all on function public.eh_dono() from public;
grant execute on function public.eh_dono() to authenticated;

-- -----------------------------------------------------------------------------
-- Tabelas. O select externo em volta de eh_dono() faz o Postgres avaliar a
-- função uma vez por query em vez de uma vez por linha.
-- -----------------------------------------------------------------------------

drop policy if exists "bancas_acesso_autenticado" on public.bancas;
drop policy if exists "bancas_so_o_dono" on public.bancas;
create policy "bancas_so_o_dono" on public.bancas
  for all to authenticated
  using ((select public.eh_dono()))
  with check ((select public.eh_dono()));

drop policy if exists "materias_acesso_autenticado" on public.materias;
drop policy if exists "materias_so_o_dono" on public.materias;
create policy "materias_so_o_dono" on public.materias
  for all to authenticated
  using ((select public.eh_dono()))
  with check ((select public.eh_dono()));

drop policy if exists "concursos_acesso_autenticado" on public.concursos;
drop policy if exists "concursos_so_o_dono" on public.concursos;
create policy "concursos_so_o_dono" on public.concursos
  for all to authenticated
  using ((select public.eh_dono()))
  with check ((select public.eh_dono()));

drop policy if exists "provas_acesso_autenticado" on public.provas;
drop policy if exists "provas_so_o_dono" on public.provas;
create policy "provas_so_o_dono" on public.provas
  for all to authenticated
  using ((select public.eh_dono()))
  with check ((select public.eh_dono()));

drop policy if exists "questoes_acesso_autenticado" on public.questoes;
drop policy if exists "questoes_so_o_dono" on public.questoes;
create policy "questoes_so_o_dono" on public.questoes
  for all to authenticated
  using ((select public.eh_dono()))
  with check ((select public.eh_dono()));

drop policy if exists "respostas_acesso_autenticado" on public.respostas;
drop policy if exists "respostas_so_o_dono" on public.respostas;
create policy "respostas_so_o_dono" on public.respostas
  for all to authenticated
  using ((select public.eh_dono()))
  with check ((select public.eh_dono()));

-- -----------------------------------------------------------------------------
-- Storage. Os PDFs carregam marca d'água com IP e data do download, então o
-- bucket ser privado não basta: quem chega ao objeto precisa ser o dono.
-- -----------------------------------------------------------------------------

drop policy if exists "provas_pdf_acesso_autenticado" on storage.objects;
drop policy if exists "provas_pdf_so_o_dono" on storage.objects;
create policy "provas_pdf_so_o_dono" on storage.objects
  for all to authenticated
  using (bucket_id = 'provas-pdf' and (select public.eh_dono()))
  with check (bucket_id = 'provas-pdf' and (select public.eh_dono()));

drop policy if exists "questao_imagens_acesso_autenticado" on storage.objects;
drop policy if exists "questao_imagens_so_o_dono" on storage.objects;
create policy "questao_imagens_so_o_dono" on storage.objects
  for all to authenticated
  using (bucket_id = 'questao-imagens' and (select public.eh_dono()))
  with check (bucket_id = 'questao-imagens' and (select public.eh_dono()));
