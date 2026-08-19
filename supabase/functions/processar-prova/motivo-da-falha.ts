// O corpo de erro do Gemini é JSON de API, não recado para quem está revisando
// uma prova. Cada falha vira uma frase que diz o que fazer; o status fica no
// fim, para depurar sem poluir.
export function motivoDaFalha(status: number, corpo: string): string {
  const detalhe = `(HTTP ${status})`;

  if (status === 502 || status === 503) {
    return `O Gemini está sobrecarregado agora. Tente processar de novo em alguns minutos. ${detalhe}`;
  }
  if (status === 429) {
    return `A cota do Gemini se esgotou. Espere a renovação ou revise o limite da chave. ${detalhe}`;
  }
  if (status === 401 || status === 403) {
    return `A chave do Gemini foi recusada. Confira o segredo GEMINI_API_KEY da Edge Function. ${detalhe}`;
  }
  if (status === 400) {
    return `O Gemini recusou o pedido — normalmente é prova longa demais para uma chamada só. ${detalhe}`;
  }

  // Status inesperado: aí o corpo ajuda mais do que atrapalha, mas curto.
  return `O Gemini falhou ${detalhe}: ${corpo.replace(/\s+/g, ' ').slice(0, 160)}`;
}
