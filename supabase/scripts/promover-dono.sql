-- Marca quem é o dono do acervo. Sem isso, as policies barram tudo — o padrão
-- é falhar fechado, então este script é o passo obrigatório depois de criar a
-- conta, tanto no local quanto no projeto hospedado.
--
--   npm run db:dono
--
-- Se houver mais de uma conta, ele NÃO escolhe por você: lista e para. Promover
-- a conta errada é entregar o acervo inteiro.

do $$
declare
  quantas int;
  alvo uuid;
  email_alvo text;
  linha record;
begin
  select count(*) into quantas from auth.users;

  if quantas = 0 then
    raise exception 'Nenhuma conta existe ainda. Crie a sua no app e rode de novo.';
  end if;

  if quantas > 1 then
    raise warning 'Há % contas. Escolha uma e rode o insert à mão:', quantas;
    for linha in select id, email from auth.users order by created_at loop
      raise warning '  insert into public.dono (id) values (%);  -- %', quote_literal(linha.id), linha.email;
    end loop;
    raise exception 'Mais de uma conta — não vou adivinhar qual é a sua.';
  end if;

  select id, email into alvo, email_alvo from auth.users;

  insert into public.dono (id) values (alvo) on conflict (id) do nothing;

  raise notice 'Dono definido: % (%)', email_alvo, alvo;
end $$;

select u.email, d.id as uid, d.criado_em
from public.dono d
join auth.users u on u.id = d.id;
