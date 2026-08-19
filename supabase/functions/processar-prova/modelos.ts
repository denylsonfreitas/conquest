// A ordem importa: o primeiro é o preferido, os seguintes são saída de emergência
// quando ele está sobrecarregado. Todos falam a mesma API e aceitam o mesmo
// responseSchema, então trocar não muda o formato do que volta.
//
// O padrão traz só o ALIAS, que o Google mantém apontando para o modelo atual.
// Fixar uma versão aqui apodrece sozinho: a primeira cadeia trazia
// gemini-2.5-flash e a chave respondia 404 — "no longer available to new
// users". Cadeia de verdade se configura em GEMINI_MODELOS, com modelos que a
// própria chave enxergue (`models.list` da API diz quais são).
export const MODELOS_PADRAO = ['gemini-flash-latest'];

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
  duracaoDaUltimaMs: number,
): boolean {
  return decorridoMs + duracaoDaUltimaMs <= orcamentoMs;
}
