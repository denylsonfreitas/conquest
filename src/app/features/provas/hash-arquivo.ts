
export function bytesParaHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function calcularSha256(arquivo: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Cálculo de hash indisponível: a página precisa estar em HTTPS ou localhost.');
  }

  const conteudo = await arquivo.arrayBuffer();
  return bytesParaHex(await globalThis.crypto.subtle.digest('SHA-256', conteudo));
}
