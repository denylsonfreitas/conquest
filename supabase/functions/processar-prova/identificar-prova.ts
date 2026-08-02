/**
 * Identifica de qual caderno esta prova é: cargo, número do tipo e cor.
 *
 * Necessário porque o gabarito de um concurso costuma vir num PDF único
 * cobrindo TODOS os cargos e tipos — na prova da DATAPREV/FGV são 35 blocos.
 * Escolher o bloco errado produziria 70 gabaritos errados em silêncio, que é o
 * pior defeito possível num app de estudo.
 *
 * As três coordenadas aparecem no texto assim:
 *
 *   página 1 : "ATI - DESENVOLVIMENTO DE SOFTWARE"
 *              "NÍVEL SUPERIOR TIPO 1 – BRANCA"
 *   cabeçalho: "ATI - Desenvolvimento de Software – TARDE TIPO BRANCA – PÁGINA 3"
 *
 * O cabeçalho se repete em toda página, o que o torna a fonte mais confiável
 * para o cargo; o número do tipo só existe na capa.
 */

export interface IdentificacaoProva {
  /** "ATI - Desenvolvimento de Software" */
  readonly cargo: string | null;
  /** 1, 2, 3... — o que aparece como "PROVA TIPO N" no gabarito. */
  readonly tipo: number | null;
  /** "BRANCA", "AMARELA"... usada como conferência de coerência. */
  readonly cor: string | null;
}

/** "<cargo> – <turno> TIPO <COR> – PÁGINA <n>", repetido em toda página. */
const CABECALHO = /^(.+?)\s+[–-]\s+\S+\s+TIPO\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ]+)\s+[–-]\s+P[ÁA]GINA\s+\d+/gim;

/** "NÍVEL SUPERIOR TIPO 1 – BRANCA" na capa. */
const CAPA_TIPO_COR = /TIPO\s+(\d+)\s*[–-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ]+)/i;

export function identificarProva(texto: string): IdentificacaoProva {
  let cargo: string | null = null;
  let cor: string | null = null;

  // O cabeçalho de página é a fonte mais confiável do cargo: repete em todas.
  for (const m of texto.matchAll(CABECALHO)) {
    cargo ??= m[1].trim();
    cor ??= m[2].trim().toUpperCase();
    break;
  }

  const capa = CAPA_TIPO_COR.exec(texto);
  const tipo = capa ? Number(capa[1]) : null;
  cor ??= capa ? capa[2].toUpperCase() : null;

  // Coerência: se a capa e o cabeçalho discordam da cor, algo está errado na
  // identificação e é melhor não afirmar nada do que afirmar errado.
  if (capa && cor && capa[2].toUpperCase() !== cor) {
    return { cargo, tipo: null, cor: null };
  }

  return { cargo, tipo, cor };
}

/**
 * Normaliza para comparar títulos: maiúsculas, sem acento, traços e espaços
 * uniformizados. "ATI - Desenvolvimento de Software" e
 * "ATI - DESENVOLVIMENTO DE SOFTWARE" precisam bater.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
