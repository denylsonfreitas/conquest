import { Alternativa, Letra } from './models';

/**
 * O que uma questão precisa expor para ser editada, e o que a edição pode
 * mudar.
 *
 * Vive em `shared/` porque três telas editam questão: a revisão (antes de
 * aprovar), a listagem do acervo (depois de aprovada) e o resultado do quiz
 * (quando você percebe o erro respondendo).
 */
export interface QuestaoEditavel {
  readonly id: string;
  readonly numero: number | null;
  readonly enunciado: string;
  readonly alternativas: Alternativa[];
  readonly materia_id: string | null;
  readonly gabarito: Letra | null;
  readonly comentario: string | null;
  readonly tem_imagem: boolean;
  readonly imagem_path: string | null;
  readonly anulada: boolean;
  readonly incerto: boolean;
}

/** Campos que a edição pode alterar. `enunciado` e `alternativas` não entram. */
export type EdicaoQuestao = Partial<
  Pick<
    QuestaoEditavel,
    'materia_id' | 'gabarito' | 'comentario' | 'tem_imagem' | 'imagem_path' | 'anulada' | 'incerto'
  >
>;

export const LETRAS: readonly Letra[] = ['A', 'B', 'C', 'D', 'E'];

/**
 * Registra a mudança de um campo — e a REMOVE se o valor voltar ao original.
 *
 * Sem isso, editar e desfazer deixaria a questão eternamente "não salva".
 */
export function anotarMudanca<K extends keyof EdicaoQuestao>(
  rascunho: EdicaoQuestao,
  original: QuestaoEditavel,
  campo: K,
  valor: QuestaoEditavel[K],
): EdicaoQuestao {
  const proximo: Record<string, unknown> = { ...rascunho };
  if (Object.is(valor, original[campo])) delete proximo[campo];
  else proximo[campo] = valor;
  return proximo as EdicaoQuestao;
}

export function temMudanca(rascunho: EdicaoQuestao): boolean {
  return Object.keys(rascunho).length > 0;
}

/** O valor em vigor no formulário: o do rascunho se houver, senão o gravado. */
export function valorEmVigor<K extends keyof QuestaoEditavel>(
  rascunho: EdicaoQuestao,
  original: QuestaoEditavel,
  campo: K,
): QuestaoEditavel[K] {
  const r = rascunho as Partial<QuestaoEditavel>;
  return campo in r ? (r[campo] as QuestaoEditavel[K]) : original[campo];
}

/**
 * Corrigir o gabarito recontabiliza as respostas passadas daquela questão.
 *
 * Quem faz a conta é o trigger do banco (`recalcular_acertos`) — este número é
 * só para a tela poder dizer o que aconteceu. `acertou` é conta, não fato:
 * `letra_marcada` não é tocada.
 */
export function respostasQueMudam(
  respostas: readonly { letra_marcada: string; acertou: boolean }[],
  novoGabarito: Letra | null,
): number {
  if (novoGabarito === null) return 0;
  return respostas.filter((r) => r.acertou !== (r.letra_marcada === novoGabarito)).length;
}
