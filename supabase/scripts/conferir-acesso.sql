-- Prova que as policies barram quem não é dono, simulando exatamente o que o
-- PostgREST faz: assume a role `authenticated` e injeta o claim do JWT.
--
--   npm run db:conferir-acesso

\set QUIET on
\set ON_ERROR_STOP on

-- Dado de teste, criado como superusuário (RLS não se aplica ao owner).
insert into public.bancas (nome) values ('BANCA DE TESTE DE ACESSO')
on conflict (nome) do nothing;

\set QUIET off

\echo ''
\echo '=== 1. DONO: enxerga o acervo ==='
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
  select public.eh_dono() as eh_dono, count(*) as bancas_visiveis from public.bancas;
commit;

\echo ''
\echo '=== 2. ESTRANHO autenticado: nao enxerga nada ==='
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
  select public.eh_dono() as eh_dono,
         (select count(*) from public.bancas)   as bancas,
         (select count(*) from public.questoes) as questoes,
         (select count(*) from public.respostas) as respostas;
commit;

\echo ''
\echo '=== 3. ESTRANHO tentando escrever: deve falhar ==='
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
  savepoint tentativa;
  do $$
  begin
    insert into public.bancas (nome) values ('INVASAO');
    raise exception 'FALHA DE SEGURANCA: o estranho conseguiu inserir';
  exception
    when insufficient_privilege then
      raise notice 'OK: insert do estranho barrado pela RLS';
  end $$;
commit;

\echo ''
\echo '=== 4. ANONIMO (sem login): nao enxerga nada ==='
begin;
  set local role anon;
  do $$
  declare
    quantas int;
  begin
    select count(*) into quantas from public.bancas;
    raise exception 'FALHA DE SEGURANCA: o anonimo leu % bancas', quantas;
  exception
    when insufficient_privilege then
      raise notice 'OK: anonimo barrado antes mesmo da RLS, por falta de GRANT';
  end $$;
commit;

\echo ''
\echo '=== 5. Tabela dono e invisivel pela API ==='
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
  select count(*) as linhas_de_dono_visiveis from public.dono;
commit;

delete from public.bancas where nome = 'BANCA DE TESTE DE ACESSO';
