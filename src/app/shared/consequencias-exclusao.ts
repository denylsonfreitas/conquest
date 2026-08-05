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

export function apagaHistorico(contagem: ContagemExclusao): boolean {
  return (contagem.respostas ?? 0) > 0;
}
