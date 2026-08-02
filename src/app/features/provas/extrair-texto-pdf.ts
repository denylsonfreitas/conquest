/**
 * Extração de texto do PDF, no navegador.
 *
 * POR QUE AQUI E NÃO NA EDGE FUNCTION: medido, extrair 16 páginas com pdf.js
 * custa ~2.400 ms de CPU, e o Edge Runtime corta bem antes ("CPU time hard
 * limit reached") — limite estrutural da plataforma, não do ambiente local. O
 * navegador não tem esse teto, e já lê o arquivo para calcular o hash no
 * anexo, então extrair aqui reaproveita trabalho em vez de criar.
 *
 * O texto sai CRU de propósito, com marca d'água e tudo. A limpeza e a
 * verificação acontecem no servidor, que é quem fala com a API do LLM — uma
 * única guarda, no lugar onde o vazamento poderia acontecer.
 */

/**
 * `unpdf` embute o pdf.js e pesa ~1 MB. O import dinâmico o mantém fora do
 * bundle inicial: só baixa quando você realmente manda processar uma prova.
 */
export async function extrairTextoPdf(arquivo: Blob): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');

  const documento = await getDocumentProxy(new Uint8Array(await arquivo.arrayBuffer()));
  const { text } = await extractText(documento, { mergePages: false });

  return (Array.isArray(text) ? text : [text]).join('\n');
}
