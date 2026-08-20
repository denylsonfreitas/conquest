export interface FalhaDeLote {
  readonly primeira: number;
  readonly ultima: number;
  readonly motivo: string;
}

/**
 * Junta os lotes que falharam pelo mesmo motivo num aviso só.
 *
 * Quando a causa é de configuração — modelo que não existe, chave recusada —
 * TODOS os lotes falham igual, e repetir a mesma frase quatro vezes transforma
 * um recado de duas linhas numa parede de texto onde ninguém acha o que fazer.
 * A informação nova em cada repetição é só a faixa; então é só a faixa que
 * repete.
 */
export function resumirFalhas(falhas: readonly FalhaDeLote[]): string[] {
  const porMotivo = new Map<string, FalhaDeLote[]>();

  for (const falha of falhas) {
    const doMotivo = porMotivo.get(falha.motivo);
    if (doMotivo) doMotivo.push(falha);
    else porMotivo.set(falha.motivo, [falha]);
  }

  return [...porMotivo].map(([motivo, doMotivo]) => {
    const faixas = doMotivo.map((f) => `${f.primeira} a ${f.ultima}`).join(', ');
    return `Questões ${faixas} não foram extraídas: ${motivo}`;
  });
}
