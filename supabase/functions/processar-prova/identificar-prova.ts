export interface IdentificacaoProva {
  readonly cargo: string | null;
  readonly tipo: number | null;
  readonly cor: string | null;
}

const CABECALHO = /^(.+?)\s+[–-]\s+\S+\s+TIPO\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ]+)\s+[–-]\s+P[ÁA]GINA\s+\d+/gim;

const CAPA_TIPO_COR = /TIPO\s+(\d+)\s*[–-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ]+)/i;

const RODAPE_GABARITO = /^(.+?)\s*\d*\s*GABARITO\s+(\d+)\s*$/i;

function porCabecalhoETipoCor(texto: string): IdentificacaoProva | null {
  let cargo: string | null = null;
  let cor: string | null = null;

  for (const m of texto.matchAll(CABECALHO)) {
    cargo = m[1].trim();
    cor = m[2].trim().toUpperCase();
    break;
  }

  const capa = CAPA_TIPO_COR.exec(texto);
  if (cargo === null && capa === null) return null;

  const tipo = capa ? Number(capa[1]) : null;
  cor ??= capa ? capa[2].toUpperCase() : null;

  if (capa && cor && capa[2].toUpperCase() !== cor) {
    return { cargo, tipo: null, cor: null };
  }

  return { cargo, tipo, cor };
}

function porRodapeRepetido(texto: string): IdentificacaoProva | null {
  const vezes = new Map<string, { cargo: string; tipo: number; total: number }>();

  for (const linha of texto.split('\n')) {
    const m = RODAPE_GABARITO.exec(linha.trim());
    if (!m) continue;

    const cargo = m[1].trim();
    const tipo = Number(m[2]);
    const chave = `${cargo} ${tipo}`;
    const anterior = vezes.get(chave);
    vezes.set(chave, { cargo, tipo, total: (anterior?.total ?? 0) + 1 });
  }

  const maisFrequente = [...vezes.values()].sort((a, b) => b.total - a.total)[0];
  if (!maisFrequente) return null;

  return { cargo: maisFrequente.cargo, tipo: maisFrequente.tipo, cor: null };
}

export function identificarProva(texto: string): IdentificacaoProva {
  return (
    porCabecalhoETipoCor(texto) ??
    porRodapeRepetido(texto) ?? { cargo: null, tipo: null, cor: null }
  );
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
