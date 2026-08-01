/**
 * SHA-256 de um arquivo, calculado no cliente antes do upload (docs/02).
 *
 * É a identidade da prova: é este hash que a constraint
 * UNIQUE (concurso_id, arquivo_hash) usa para impedir o mesmo PDF de entrar
 * duas vezes no mesmo concurso.
 *
 * Calcular aqui — e não no servidor — é o que permite barrar a duplicata
 * ANTES de gastar upload.
 */

/** Formato que o schema Zod e o banco esperam: 64 caracteres hex minúsculos. */
export function bytesParaHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * `crypto.subtle` só existe em contexto seguro — HTTPS ou localhost. Ambos os
 * casos deste app atendem, mas a checagem dá um erro legível em vez de um
 * "cannot read property digest of undefined".
 */
export async function calcularSha256(arquivo: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Cálculo de hash indisponível: a página precisa estar em HTTPS ou localhost.');
  }

  const conteudo = await arquivo.arrayBuffer();
  return bytesParaHex(await globalThis.crypto.subtle.digest('SHA-256', conteudo));
}
