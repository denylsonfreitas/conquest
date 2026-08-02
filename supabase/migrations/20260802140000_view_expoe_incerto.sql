-- =============================================================================
-- A view não expunha `incerto`
-- =============================================================================
-- `questoes_completas` foi criada no passo 1; `incerto` só nasceu no passo 5
-- (estados intermediários da extração), e a view nunca foi atualizada. Ninguém
-- notou porque só a revisão lia essa coluna, e a revisão lê a tabela direto.
--
-- A listagem do acervo lê da VIEW — é ela que traz nomes de prova, concurso e
-- banca já resolvidos, além da elegibilidade calculada — e precisa de `incerto`
-- para editar a marca de dúvida como a revisão edita.
--
-- Quem apontou o furo foi o compilador, a partir dos tipos gerados do banco:
-- "column 'incerto' does not exist on 'questoes_completas'". É exatamente o que
-- o CLAUDE.md descreve como o valor de manter `database.types.ts` em dia.
--
-- `create or replace view` em vez de drop + create: preserva os GRANTs. A
-- contrapartida é que Postgres só permite ACRESCENTAR colunas no fim, então
-- `incerto` fica depois de `elegivel` em vez de perto dos outros campos da
-- questão. Posição feia vale menos que privilégio perdido.
-- =============================================================================

create or replace view public.questoes_completas
with (security_invoker = true)
as
select
  q.id,
  q.prova_id,
  q.numero,
  q.materia_id,
  m.nome  as materia,
  q.assunto,
  q.enunciado,
  q.alternativas,
  q.gabarito,
  q.tipo,
  q.tem_imagem,
  q.imagem_path,
  q.comentario,
  q.anulada,
  q.revisada,
  q.created_at,
  q.updated_at,
  p.concurso_id,
  p.nome  as prova_nome,
  p.ano   as prova_ano,
  c.nome  as concurso_nome,
  c.banca_id,
  b.nome  as banca_nome,
  (q.revisada and not q.anulada and (not q.tem_imagem or q.imagem_path is not null))
          as elegivel,
  -- Acrescentada no fim por imposição do `create or replace`.
  q.incerto
from public.questoes q
  join public.provas    p on p.id = q.prova_id
  join public.concursos c on c.id = p.concurso_id
  left join public.bancas   b on b.id = c.banca_id
  left join public.materias m on m.id = q.materia_id;
