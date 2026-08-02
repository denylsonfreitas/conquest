-- =============================================================================
-- `acertou` é conta, não fato
-- =============================================================================
-- `respostas.letra_marcada` é o FATO: o que você marcou naquele dia. Não se
-- toca nele nunca.
--
-- `respostas.acertou` é DERIVADO: a comparação entre a letra marcada e o
-- gabarito. E era derivado uma vez só, no instante da resposta — o que deixava
-- a coluna mentir assim que o gabarito fosse corrigido.
--
-- O cenário é concreto e provável: você percebe respondendo que o gabarito da
-- questão está errado (é exatamente o caso que o atalho de edição a partir do
-- resultado existe para atender), corrige, e o histórico continua registrando
-- que você errou uma questão que acertou. Isso contamina a fila de "revisão de
-- erros" e as estatísticas globais.
--
-- Recalcular NÃO apaga história: nenhuma linha some, `letra_marcada` fica
-- intacta, e só a comparação é refeita contra o gabarito certo. Continua
-- coerente com o docs/03 ("editar não apaga o histórico de respostas").
--
-- Por que trigger e não código de aplicação: qualquer caminho que corrija um
-- gabarito precisa disto — a revisão, a listagem do acervo, o atalho do
-- resultado, um UPDATE manual no psql. Deixar a cargo da UI seria repetir o
-- erro que o trigger de status da prova já evitou uma vez.
-- =============================================================================

create or replace function public.recalcular_acertos()
returns trigger
language plpgsql
as $$
begin
  -- Recalcula TODAS as respostas daquela questão, não só a mais recente: o
  -- histórico inteiro foi computado contra o gabarito errado.
  update public.respostas r
     set acertou = (r.letra_marcada = new.gabarito)
   where r.questao_id = new.id
     and r.acertou is distinct from (r.letra_marcada = new.gabarito);

  return null;
end;
$$;

-- `of gabarito` + a cláusula `when`: dispara na correção do gabarito
-- especificamente. Mudar matéria, comentário ou anexar imagem não mexe em
-- `acertou` — não têm nada a ver com a comparação.
create trigger questoes_recalcula_acertos
  after update of gabarito on public.questoes
  for each row
  when (new.gabarito is distinct from old.gabarito and new.gabarito is not null)
  execute function public.recalcular_acertos();
