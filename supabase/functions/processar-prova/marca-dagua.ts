/**
 * Remoção de marca d'água do texto extraído.
 *
 * NÃO é limpeza cosmética. PDFs baixados do pciconcursos carregam, em cada
 * página, uma linha como:
 *
 *   pcimarkpci MjgwNDoyOWI4OjUwOGM6...:U2F0LCAwMSBBdWcgMjAyNiAxMzoxNDozMCAtMDMwMA==
 *   www.pciconcursos.com.br
 *
 * Os dois blocos base64 decodificam para o **endereço IP de quem baixou** e a
 * **data/hora do download**. Mandar isso para a API do LLM seria vazar dado
 * pessoal para fora, além de gastar tokens com ruído repetido em toda página.
 *
 * Por isso a remoção acontece ANTES de qualquer envio, e há teste garantindo
 * que nenhum resquício de `pcimark` sobrevive.
 */

/** `pcimarkpci <base64>:<base64>` — o par que carrega IP e timestamp. */
const MARCA_PCI = /pcimarkpci\s*[A-Za-z0-9+/=]*:?[A-Za-z0-9+/=]*/gi;

/**
 * O domínio aparece COLADO no conteúdo seguinte na extração
 * ("www.pciconcursos.com.brEMPRESA DE TECNOLOGIA..."), então precisa ser
 * removido como substring, não como linha inteira — apagar a linha levaria
 * junto o começo do texto útil.
 */
const DOMINIO_PCI = /www\.pciconcursos\.com\.br/gi;

/** Blob base64 longo e solto, resto de marca d'água que escapou do padrão. */
const BASE64_SOLTO = /^[A-Za-z0-9+/]{32,}={0,2}$/;

export function removerMarcaDagua(texto: string): string {
  const semMarca = texto.replace(MARCA_PCI, '').replace(DOMINIO_PCI, '');

  return semMarca
    .split('\n')
    .filter((linha) => !BASE64_SOLTO.test(linha.trim()))
    .join('\n')
    // Colapsa os buracos deixados pela remoção, sem juntar parágrafos
    // distintos: o LLM usa a quebra de linha para separar enunciado de
    // alternativa.
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Rede de segurança para usar imediatamente antes de qualquer chamada externa.
 * Prefere falhar a vazar: se algo escapou, o processamento para com erro
 * acionável em vez de mandar o dado para fora.
 */
export function garantirSemMarcaDagua(texto: string): void {
  if (/pcimark/i.test(texto)) {
    throw new Error(
      'Marca d’água não foi removida do texto. Envio ao LLM abortado para não vazar dado pessoal.',
    );
  }
}
