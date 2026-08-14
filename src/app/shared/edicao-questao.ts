import { Alternativa, Letra } from './models';

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
  readonly tem_texto_base: boolean;
  readonly texto_base_id: string | null;
}

export type EdicaoQuestao = Partial<
  Pick<
    QuestaoEditavel,
    | 'materia_id'
    | 'gabarito'
    | 'comentario'
    | 'tem_imagem'
    | 'imagem_path'
    | 'anulada'
    | 'incerto'
    | 'tem_texto_base'
    | 'texto_base_id'
  >
>;

export const LETRAS: readonly Letra[] = ['A', 'B', 'C', 'D', 'E'];

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

export function valorEmVigor<K extends keyof QuestaoEditavel>(
  rascunho: EdicaoQuestao,
  original: QuestaoEditavel,
  campo: K,
): QuestaoEditavel[K] {
  const r = rascunho as Partial<QuestaoEditavel>;
  return campo in r ? (r[campo] as QuestaoEditavel[K]) : original[campo];
}

export function respostasQueMudam(
  respostas: readonly { letra_marcada: string; acertou: boolean }[],
  novoGabarito: Letra | null,
): number {
  if (novoGabarito === null) return 0;
  return respostas.filter((r) => r.acertou !== (r.letra_marcada === novoGabarito)).length;
}
