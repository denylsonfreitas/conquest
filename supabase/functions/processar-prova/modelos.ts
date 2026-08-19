// A ordem importa: o primeiro é o preferido, os seguintes são saída de emergência
// quando ele está sobrecarregado. Todos falam a mesma API e aceitam o mesmo
// responseSchema, então trocar não muda o formato do que volta.
export const MODELOS_PADRAO = ['gemini-flash-latest', 'gemini-2.5-flash'];

export function modelosConfigurados(bruto: string | undefined): string[] {
  const lista = (bruto ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);

  return lista.length > 0 ? lista : MODELOS_PADRAO;
}

/**
 * Só vale trocar de modelo quando a culpa é da carga do outro lado.
 *
 * Chave recusada, pedido malformado ou cota estourada seguem iguais no próximo
 * modelo — insistir só gasta tempo do orçamento da função e atrasa o erro que a
 * pessoa precisa ler.
 */
export function valeTentarOutroModelo(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * A Edge Function tem um teto de tempo, e a extração de uma prova inteira já
 * consome boa parte dele. Uma segunda tentativa só começa se couber — senão
 * troca um erro explicável por um estouro de tempo, que é pior de diagnosticar.
 */
export function cabeOutraTentativa(
  decorridoMs: number,
  orcamentoMs: number,
  duracaoDaUltimaMs: number,
): boolean {
  return decorridoMs + duracaoDaUltimaMs <= orcamentoMs;
}
