export async function extrairTextoPdf(arquivo: Blob): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');

  const documento = await getDocumentProxy(new Uint8Array(await arquivo.arrayBuffer()));
  const { text } = await extractText(documento, { mergePages: false });

  return (Array.isArray(text) ? text : [text]).join('\n');
}
