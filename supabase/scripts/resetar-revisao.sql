-- Devolve uma prova ao estado logo APÓS a extração e ANTES da revisão.
--
-- Serve para exercitar a tela de revisão de novo sem gastar uma rodada do LLM
-- (~1,5 min e uma chamada paga) e sem apagar a prova e o PDF.
--
--   npm run db:revisao-reset
--   npm run db:revisao-reset -- -v prova='ATI - Desenvolvimento de Software'
--
-- Quase tudo aqui é DERIVADO, não adivinhado — é por isso que o reset é fiel:
--
--   * `materia_id` volta a ser nulo exatamente onde `assunto` está preenchido.
--     A extração só grava `assunto` quando o palpite do LLM NÃO casou com a
--     lista canônica (index.ts), então essas linhas são, por construção, as
--     mesmas que a fase de mapeamento tinha para resolver.
--   * `provas.status` NÃO é escrito aqui. O trigger `questoes_sincroniza_status`
--     o recalcula sozinho quando `revisada` volta a false — e ver a prova sair
--     de 'pronta' por conta própria é meia demonstração do trigger de graça.
--
-- A exceção é `incerto`: é o julgamento do LLM naquela rodada, a revisão o
-- consome, e nenhuma outra coluna o reconstrói. Só o reprocessamento traria de
-- volta a verdade; aqui ele é reposto a partir da lista abaixo.

\if :{?prova}
\else
\set prova 'ATI - Desenvolvimento de Software'
\endif

\if :{?incertas}
\else
-- Números que a última extração real marcou como duvidosos nesta prova.
\set incertas '{49}'
\endif

\set ON_ERROR_STOP on

begin;

create temporary table alvo on commit drop as
select id from public.provas
 where nome = :'prova' or id::text = :'prova';

do $$
begin
  if (select count(*) from alvo) <> 1 then
    raise exception 'Esperava exatamente uma prova, achei %', (select count(*) from alvo);
  end if;
end $$;

-- 1. Desfaz a curadoria. O trigger devolve a prova a 'aguardando_revisao'.
update public.questoes q
   set revisada = false,
       materia_id = case when q.assunto is not null then null else q.materia_id end,
       -- O objeto continua no bucket; o caminho é determinístico e o próximo
       -- upload sobrescreve. Zerar só o ponteiro é o bastante para a pendência
       -- "precisa de imagem" reaparecer.
       imagem_path = null,
       comentario = null,
       anulada = false,
       incerto = false
  from alvo
 where q.prova_id = alvo.id;

-- 2. Repõe a dúvida do LLM (ver o cabeçalho: esta parte não é derivável).
update public.questoes q
   set incerto = true
  from alvo
 where q.prova_id = alvo.id
   and q.numero = any(:'incertas'::int[]);

-- 3. Apaga as matérias criadas à mão durante a revisão, para a fase de
--    mapeamento voltar a exigir a criação inline.
--
--    A regra é derivada, não uma lista de nomes: o seed inseriu todas as suas
--    matérias numa transação só, então todas compartilham o mesmo created_at
--    mínimo. Qualquer coisa mais nova foi criada por mim. O `not exists`
--    protege matérias que outra prova ainda usa — e o FK RESTRICT é a rede.
delete from public.materias m
 where m.created_at > (select min(created_at) from public.materias)
   and not exists (select 1 from public.questoes q where q.materia_id = m.id);

commit;

select p.nome,
       p.status,
       count(q.*)                                        as questoes,
       count(*) filter (where q.materia_id is null)      as sem_materia,
       count(*) filter (where q.gabarito is null)        as sem_gabarito,
       count(*) filter (where q.tem_imagem
                          and q.imagem_path is null)     as precisa_imagem,
       count(*) filter (where q.incerto)                 as incertas,
       count(*) filter (where q.revisada)                as aprovadas
  from public.provas p
  join public.questoes q on q.prova_id = p.id
 where p.nome = :'prova' or p.id::text = :'prova'
 group by p.nome, p.status;
