
const MARCA_PCI = /pcimarkpci\s*[A-Za-z0-9+/=]*:?[A-Za-z0-9+/=]*/gi;

const DOMINIO_PCI = /www\.pciconcursos\.com\.br/gi;

const BASE64_SOLTO = /^[A-Za-z0-9+/]{32,}={0,2}$/;

export function removerMarcaDagua(texto: string): string {
  const semMarca = texto.replace(MARCA_PCI, '').replace(DOMINIO_PCI, '');

  return semMarca
    .split('\n')
    .filter((linha) => !BASE64_SOLTO.test(linha.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function garantirSemMarcaDagua(texto: string): void {
  if (/pcimark/i.test(texto)) {
    throw new Error(
      'Marca d’água não foi removida do texto. Envio ao LLM abortado para não vazar dado pessoal.',
    );
  }
}
