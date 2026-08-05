/**
 * As frases que a confirmação de exclusão mostra.
 *
 * Função pura, e não texto solto no template, porque a regra é sutil: só
 * aparece o que de fato existe. "0 respostas" numa lista de consequências
 * assusta sem informar, e um concurso vazio não deveria pedir a mesma pausa
 * que um com 31 respostas dentro.
 */
export interface ContagemExclusao {
  readonly provas?: number;
  readonly questoes?: number;
  readonly respostas?: number;
}

const PLURAL: Record<keyof ContagemExclusao, [string, string]> = {
  provas: ['prova', 'provas'],
  questoes: ['questão', 'questões'],
  respostas: ['resposta do seu histórico', 'respostas do seu histórico'],
};

export function consequenciasDaExclusao(contagem: ContagemExclusao): string[] {
  const frases: string[] = [];

  for (const chave of ['provas', 'questoes', 'respostas'] as const) {
    const quantas = contagem[chave] ?? 0;
    if (quantas === 0) continue;
    const [singular, plural] = PLURAL[chave];
    frases.push(`${quantas} ${quantas === 1 ? singular : plural}`);
  }

  return frases;
}

/**
 * As respostas são o que o backup existe para proteger: o acervo se reconstrói
 * com PDF e pipeline, o histórico não. Vale um alerta a mais quando há
 * histórico em jogo.
 */
export function apagaHistorico(contagem: ContagemExclusao): boolean {
  return (contagem.respostas ?? 0) > 0;
}
