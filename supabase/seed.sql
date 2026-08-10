-- =============================================================================
-- Seed de DESENVOLVIMENTO — roda automaticamente a cada `npm run db:reset`.
--
-- Diferente das migrations: este arquivo NÃO é aplicado em produção. Serve só
-- para deixar a stack local utilizável logo após um reset.
--
-- Cria o usuário único do app. Sem ele não há como logar, e sem login as
-- policies de RLS barram todas as queries — o app abriria vazio.
--
--   e-mail: eu@local.test
--   senha : conquest
--
-- Credencial local de desenvolvimento, não é segredo. O usuário do projeto
-- Supabase real é criado à parte, com senha de verdade.
-- =============================================================================

-- ID fixo (em vez de gen_random_uuid()) para o usuário ser o mesmo depois de
-- cada reset: facilita depurar e torna o ON CONFLICT confiável.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  -- Estas quatro colunas são nullable no banco mas o GoTrue as lê como string
  -- não-nula. Deixá-las em NULL faz o login falhar com um 500 opaco
  -- ("Database error querying schema"). String vazia é o valor correto.
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'eu@local.test',
  -- bcrypt via pgcrypto; é o formato que o GoTrue espera em encrypted_password.
  extensions.crypt('conquest', extensions.gen_salt('bf')),
  -- Confirma o e-mail na hora: sem isto o login é recusado e você teria que
  -- abrir o Mailpit (http://127.0.0.1:54324) para clicar no link a cada reset.
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

-- O GoTrue exige uma identity correspondente para o provider 'email'. Sem esta
-- linha o usuário existe mas o login por senha falha.
insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '{"sub":"00000000-0000-4000-8000-000000000001","email":"eu@local.test"}',
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

-- As policies só liberam quem está em public.dono. Sem esta linha o reset
-- deixaria o app logando e mostrando tudo vazio, que é o oposto do propósito
-- deste arquivo. Vale só no local: seed não roda em produção.
insert into public.dono (id)
values ('00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
