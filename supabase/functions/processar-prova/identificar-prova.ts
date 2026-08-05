
export interface IdentificacaoProva {
  readonly cargo: string | null;
  readonly tipo: number | null;
  readonly cor: string | null;
}

const CABECALHO = /^(.+?)\s+[–-]\s+\S+\s+TIPO\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ]+)\s+[–-]\s+P[ÁA]GINA\s+\d+/gim;

const CAPA_TIPO_COR = /TIPO\s+(\d+)\s*[–-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ]+)/i;

export function identificarProva(texto: string): IdentificacaoProva {
  let cargo: string | null = null;
  let cor: string | null = null;

  for (const m of texto.matchAll(CABECALHO)) {
    cargo ??= m[1].trim();
    cor ??= m[2].trim().toUpperCase();
    break;
  }

  const capa = CAPA_TIPO_COR.exec(texto);
  const tipo = capa ? Number(capa[1]) : null;
  cor ??= capa ? capa[2].toUpperCase() : null;

  if (capa && cor && capa[2].toUpperCase() !== cor) {
    return { cargo, tipo: null, cor: null };
  }

  return { cargo, tipo, cor };
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
