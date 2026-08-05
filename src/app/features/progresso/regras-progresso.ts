export interface RespostaAnalisavel {
  readonly questaoId: string;
  readonly acertou: boolean;
  readonly respondidoEm: string;
  readonly materia: string | null;
  readonly bancaNome: string | null;
  readonly anulada: boolean;
}

export const JANELA_EVOLUCAO = 20;

export const PISO_RANQUEAMENTO = 10;

const SEM_MATERIA = 'Sem matéria';
const SEM_BANCA = 'Sem banca';

export function contaveis(respostas: readonly RespostaAnalisavel[]): RespostaAnalisavel[] {
  return respostas.filter((r) => !r.anulada);
}

export interface TotalPraticado {
  readonly respostas: number;
  readonly questoes: number;
  readonly acertos: number;
  readonly percentual: number;
  readonly desconsideradas: number;
}

export function totalPraticado(todas: readonly RespostaAnalisavel[]): TotalPraticado {
  const validas = contaveis(todas);
  const acertos = validas.filter((r) => r.acertou).length;

  return {
    respostas: validas.length,
    questoes: new Set(validas.map((r) => r.questaoId)).size,
    acertos,
    percentual: percentual(acertos, validas.length),
    desconsideradas: todas.length - validas.length,
  };
}

export interface Desempenho {
  readonly chave: string;
  readonly acertos: number;
  readonly total: number;
  readonly percentual: number;
}

export function desempenhoPor(
  respostas: readonly RespostaAnalisavel[],
  eixo: (r: RespostaAnalisavel) => string | null,
  rotuloVazio: string,
): Desempenho[] {
  const grupos = new Map<string, { acertos: number; total: number }>();

  for (const r of contaveis(respostas)) {
    const chave = eixo(r) ?? rotuloVazio;
    const g = grupos.get(chave) ?? { acertos: 0, total: 0 };
    grupos.set(chave, { acertos: g.acertos + (r.acertou ? 1 : 0), total: g.total + 1 });
  }

  return [...grupos.entries()]
    .map(([chave, g]) => ({ ...g, chave, percentual: percentual(g.acertos, g.total) }))
    .sort((a, b) => b.total - a.total || a.chave.localeCompare(b.chave, 'pt-BR'));
}

export const porMateria = (r: readonly RespostaAnalisavel[]) =>
  desempenhoPor(r, (x) => x.materia, SEM_MATERIA);

export const porBanca = (r: readonly RespostaAnalisavel[]) =>
  desempenhoPor(r, (x) => x.bancaNome, SEM_BANCA);

export interface Evolucao {
  readonly materia: string;
  readonly recentes: Desempenho;
  readonly anteriores: Desempenho | null;
  readonly delta: number | null;
}

export function evolucaoPorMateria(
  respostas: readonly RespostaAnalisavel[],
  janela = JANELA_EVOLUCAO,
): Evolucao[] {
  const grupos = new Map<string, RespostaAnalisavel[]>();
  for (const r of contaveis(respostas)) {
    const chave = r.materia ?? SEM_MATERIA;
    grupos.set(chave, [...(grupos.get(chave) ?? []), r]);
  }

  const linhas: Evolucao[] = [];

  for (const [materia, lista] of grupos) {
    const ordenadas = [...lista].sort((a, b) => a.respondidoEm.localeCompare(b.respondidoEm));
    const recentes = ordenadas.slice(-janela);
    const anteriores = ordenadas.slice(0, -janela);

    const rec = resumir(materia, recentes);
    const ant = anteriores.length > 0 ? resumir(materia, anteriores) : null;

    linhas.push({
      materia,
      recentes: rec,
      anteriores: ant,
      delta: ant ? rec.percentual - ant.percentual : null,
    });
  }

  return linhas.sort((a, b) => {
    if (a.delta === null && b.delta === null) return b.recentes.total - a.recentes.total;
    if (a.delta === null) return 1;
    if (b.delta === null) return -1;
    return a.delta - b.delta;
  });
}

function resumir(chave: string, respostas: readonly RespostaAnalisavel[]): Desempenho {
  const acertos = respostas.filter((r) => r.acertou).length;
  return {
    chave,
    acertos,
    total: respostas.length,
    percentual: percentual(acertos, respostas.length),
  };
}

export interface Fracas {
  readonly ranqueadas: Desempenho[];
  readonly poucaAmostra: Desempenho[];
}

export function maisFracas(desempenhos: readonly Desempenho[], piso = PISO_RANQUEAMENTO): Fracas {
  return {
    ranqueadas: desempenhos
      .filter((d) => d.total >= piso)
      .sort((a, b) => a.percentual - b.percentual || b.total - a.total),
    poucaAmostra: desempenhos
      .filter((d) => d.total < piso)
      .sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR')),
  };
}

function percentual(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 100);
}
