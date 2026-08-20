// Falhas que são da CHAVE, não do modelo: continuam iguais em qualquer modelo
// que use a mesma chave.
const CULPA_DA_CHAVE = [401, 403, 429];

/**
 * Vale tentar o próximo elo da cadeia?
 *
 * Depende de quem é o próximo. Enquanto a cadeia era só modelos do mesmo
 * fornecedor, cota estourada e chave recusada encerravam o assunto: todos
 * dividiam a mesma chave, então insistir só atrasaria o erro. Com elos de
 * provedores diferentes isso deixou de valer — a cota do Gemini não diz nada
 * sobre a do Mistral, que tem outra chave e outro limite. Era exatamente esse
 * o caso em que a alternativa existe para servir.
 *
 * Qualquer outra falha (carga, modelo inexistente, pedido recusado) vale tentar
 * no seguinte, seja ele quem for. O orçamento da função é que limita.
 */
export function valeTentarOutroElo(status: number, proximoEhOutroProvedor: boolean): boolean {
  if (CULPA_DA_CHAVE.includes(status)) return proximoEhOutroProvedor;
  return true;
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
 * Prazo estourado (599) também fica de fora: se o elo não respondeu no tempo,
 * repetir consome o pouco de orçamento que sobrou e falha igual. Nesse caso o
 * caminho é o elo seguinte, não a insistência.
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
