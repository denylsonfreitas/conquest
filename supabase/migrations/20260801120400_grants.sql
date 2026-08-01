-- =============================================================================
-- GRANTs para os papéis do PostgREST
--
-- Por que isto é necessário: RLS e GRANT são camadas DIFERENTES. O RLS decide
-- QUAIS LINHAS um papel enxerga; o GRANT decide se o papel pode tocar a tabela.
-- Sem o GRANT, o PostgREST devolve 42501 "permission denied" antes mesmo de o
-- RLS ser consultado — foi exatamente o que aconteceu ao subir a stack local.
--
-- Objetos criados por migration não herdam os default privileges que o Supabase
-- configura para objetos criados pelo painel, então o GRANT precisa ser
-- explícito aqui.
--
-- `anon` fica de fora de propósito: sendo um app single-user, ninguém
-- deslogado tem o que fazer nas tabelas. Assim a proteção é dupla — falta de
-- privilégio E ausência de policy.
-- =============================================================================

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant usage, select on all sequences in schema public
  to authenticated, service_role;

-- Vale para as tabelas criadas daqui pra frente (migrations futuras), evitando
-- ter que lembrar do GRANT a cada tabela nova.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

-- A view questoes_completas é read-only por natureza: o read-side consulta,
-- escrita acontece sempre na tabela questoes.
revoke insert, update, delete on public.questoes_completas
  from authenticated, service_role;
