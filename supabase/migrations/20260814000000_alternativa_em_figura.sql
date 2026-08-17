-- =============================================================================
-- Alternativa em figura
--
-- Prova de TI traz questões em que as ALTERNATIVAS são desenhos: cinco árvores
-- binárias, cinco diagramas. O texto delas chega vazio, e até aqui existia uma
-- imagem só para a questão inteira — o que deixa os cinco botões do quiz em
-- branco, clicáveis e ilegíveis.
--
-- A imagem passa a ser por alternativa, dentro do próprio jsonb. Não vira
-- tabela porque a alternativa não existe fora da questão: é atributo dela, e
-- normalizar criaria uma junção para ler o que já vem junto.
--
-- Nenhuma coluna muda de forma. O que muda é a REGRA: questão com alternativa
-- sem texto e sem imagem não é respondível, então não é elegível. Continua
-- sendo o banco que decide, não o front.
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
  (
    q.revisada
    and not q.anulada
    and (not q.tem_imagem or q.imagem_path is not null)
    and (not q.tem_texto_base or q.texto_base_id is not null)
    and not exists (
      select 1
      from jsonb_array_elements(q.alternativas) a
      where coalesce(a ->> 'texto', '') = ''
        and coalesce(a ->> 'imagem_path', '') = ''
    )
  ) as elegivel,
  q.incerto,
  q.tem_texto_base,
  q.texto_base_id
from public.questoes q
  join public.provas    p on p.id = q.prova_id
  join public.concursos c on c.id = p.concurso_id
  left join public.bancas   b on b.id = c.banca_id
  left join public.materias m on m.id = q.materia_id;
