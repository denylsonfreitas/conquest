-- =============================================================================
-- A letra tem domínio, e o banco não sabia disso
-- =============================================================================
-- `LetraSchema` restringe a A–E desde o passo 1, mas só no Zod — no app e na
-- Edge Function. As duas colunas que guardam letra aceitavam qualquer texto.
--
-- Descoberto ao testar a entrega do simulado: um INSERT com
-- `letra_marcada = 'Z'` foi aceito sem reclamar.
--
-- Por que isso importa mais do que parece: `acertou` é a comparação entre
-- `letra_marcada` e `gabarito`. Uma letra fora do domínio não dá erro em lugar
-- nenhum — ela simplesmente nunca casa, e a questão fica eternamente "errada"
-- no histórico e na fila de revisão de erros. Lixo que não falha é pior que
-- lixo que falha.
--
-- Segue o padrão do projeto: Zod cuida das regras de negócio, o CHECK é a rede
-- de formato. As duas camadas se complementam — nenhuma substitui a outra
-- (CLAUDE.md). Este era o caso em que só existia uma delas.
--
-- Os dados atuais já satisfazem: os 70 gabaritos conferem com o PDF oficial da
-- banca e as respostas são todas A–E.
-- =============================================================================

alter table public.questoes
  add constraint questoes_gabarito_letra_valida
  check (gabarito is null or gabarito in ('A', 'B', 'C', 'D', 'E'));

alter table public.respostas
  add constraint respostas_letra_valida
  check (letra_marcada in ('A', 'B', 'C', 'D', 'E'));

comment on constraint respostas_letra_valida on public.respostas is
  'Domínio da letra. Sem isto, uma marcação inválida nunca casa com o gabarito e vira erro permanente e silencioso.';
