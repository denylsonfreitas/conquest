/**
 * Só vale trocar de modelo quando a culpa é da carga do outro lado.
 *
 * Vale por carga (500, 502, 503, 504) e por modelo inexistente (404): um modelo
 * aposentado é justamente o caso em que o seguinte da cadeia salva.
 *
 * Chave recusada, pedido malformado ou cota estourada seguem iguais no próximo
 * modelo — insistir só gasta tempo do orçamento da função e atrasa o erro que a
 * pessoa precisa ler.
 */
export function valeTentarOutroModelo(status: number): boolean {
  return status === 404 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * A Edge Function tem um teto de tempo, e a extração de uma prova inteira já
 * consome boa parte dele. Uma segunda tentativa só começa se couber — senão
 * troca um erro explicável por um estouro de tempo, que é pior de diagnosticar.
 */
export function cabeOutraTentativa(
  decorridoMs: number,
  orcamentoMs: number,
  custoEstimadoMs: number,
): boolean {
  return decorridoMs + custoEstimadoMs <= orcamentoMs;
}

// Quantas vezes insistir no MESMO modelo antes de considerar a cadeia. Três é
// o que cabe no orçamento quando o 503 volta rápido, que é o caso comum.
export const MAX_TENTATIVAS_POR_MODELO = 3;

/**
 * Sobrecarga é transitória: o mesmo modelo costuma responder alguns segundos
 * depois. Trocar de modelo na primeira negativa desperdiça o preferido — e,
 * com um único modelo configurado, significa desistir sem tentar nada.
 *
 * O 404 fica de fora de propósito: modelo que não existe não passa a existir
 * porque esperamos. Esse é caso de trocar de modelo, não de repetir.
 */
export function valeRepetirMesmoModelo(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Recuo crescente, para não bater de novo no mesmo instante de congestão.
 * Em segundos e não minutos: o orçamento inteiro da função é de ~110s.
 */
export function esperaAntesDeRepetir(tentativa: number): number {
  const escala = [2_000, 5_000, 10_000];
  return escala[Math.min(tentativa, escala.length) - 1];
}
