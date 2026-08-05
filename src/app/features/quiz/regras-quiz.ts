import { aplicarFiltros, FiltrosAcervo, ItemFiltravel } from '../../shared/filtros-acervo';

export type ModoQuiz = 'aleatorio' | 'menos_vistas' | 'revisao_erros';

export type ModoExecucao = 'estudo' | 'prova';

export const ROTULO_EXECUCAO: Record<ModoExecucao, string> = {
  estudo: 'Estudo',
  prova: 'Prova',
};

export const RESUMO_EXECUCAO: Record<ModoExecucao, string> = {
  estudo: 'Resposta certa a cada questão · grava no clique · sem remarcar',
  prova: 'Marca e remarca · resposta certa só na entrega · grava tudo na entrega',
};

export interface RespostaHistorico {
  readonly questao_id: string;
  readonly acertou: boolean;
  readonly respondido_em: string;
}

export const ROTULO_MODO: Record<ModoQuiz, string> = {
  aleatorio: 'Aleatório',
  menos_vistas: 'Menos vistas',
  revisao_erros: 'Revisão de erros',
};

export function ultimaRespostaPorQuestao(
  historico: readonly RespostaHistorico[],
): Map<string, RespostaHistorico> {
  const ultima = new Map<string, RespostaHistorico>();

  for (const r of historico) {
    const atual = ultima.get(r.questao_id);
    if (!atual || r.respondido_em > atual.respondido_em) ultima.set(r.questao_id, r);
  }

  return ultima;
}

export interface UsoDaQuestao {
  readonly vezes: number;
  readonly ultimaEm: string;
}

export function usoPorQuestao(historico: readonly RespostaHistorico[]): Map<string, UsoDaQuestao> {
  const uso = new Map<string, UsoDaQuestao>();

  for (const r of historico) {
    const atual = uso.get(r.questao_id);
    uso.set(r.questao_id, {
      vezes: (atual?.vezes ?? 0) + 1,
      ultimaEm: !atual || r.respondido_em > atual.ultimaEm ? r.respondido_em : atual.ultimaEm,
    });
  }

  return uso;
}

export function aplicarModo<T extends ItemFiltravel>(
  candidatas: readonly T[],
  historico: readonly RespostaHistorico[],
  modo: ModoQuiz,
): T[] {
  if (modo !== 'revisao_erros') return [...candidatas];

  const ultima = ultimaRespostaPorQuestao(historico);
  return candidatas.filter((q) => ultima.get(q.id)?.acertou === false);
}

export function filaDoModo<T extends ItemFiltravel>(
  candidatas: readonly T[],
  historico: readonly RespostaHistorico[],
  modo: ModoQuiz,
  rng: Rng = Math.random,
): T[] {
  const admitidas = aplicarModo(candidatas, historico, modo);
  if (modo !== 'menos_vistas') return embaralhar(admitidas, rng);

  const uso = usoPorQuestao(historico);
  const nunca = admitidas.filter((q) => !uso.has(q.id));
  const vistas = admitidas
    .filter((q) => uso.has(q.id))
    .sort((a, b) => {
      const ua = uso.get(a.id)!;
      const ub = uso.get(b.id)!;
      return ua.vezes - ub.vezes || ua.ultimaEm.localeCompare(ub.ultimaEm);
    });

  return [...embaralhar(nunca, rng), ...vistas];
}

export type Rng = () => number;

export function embaralhar<T>(itens: readonly T[], rng: Rng = Math.random): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function primeiras<T>(fila: readonly T[], quantidade: number): T[] {
  if (quantidade <= 0) return [];
  return fila.slice(0, quantidade);
}

export const QUANTIDADE_MIN = 1;
export const QUANTIDADE_MAX = 200;

export function normalizarQuantidade(texto: string, anterior: number): number {
  const numero = Number(texto.trim());
  if (texto.trim() === '' || !Number.isFinite(numero)) return anterior;
  return Math.min(QUANTIDADE_MAX, Math.max(QUANTIDADE_MIN, Math.floor(numero)));
}

export function motivoConjuntoVazio(
  acervo: readonly ItemFiltravel[],
  historico: readonly RespostaHistorico[],
  filtros: FiltrosAcervo,
  modo: ModoQuiz,
): string | null {
  if (aplicarModo(aplicarFiltros(acervo, filtros), historico, modo).length > 0) return null;
  if (acervo.length === 0) return 'Nenhuma questão aprovada ainda. Revise uma prova primeiro.';

  const eixos: { rotulo: string; sem: FiltrosAcervo }[] = [
    { rotulo: 'a banca', sem: { ...filtros, bancaId: null } },
    { rotulo: 'o concurso', sem: { ...filtros, concursoId: null } },
    { rotulo: 'a matéria', sem: { ...filtros, materiaIds: [] } },
  ];

  for (const eixo of eixos) {
    const mudou = JSON.stringify(eixo.sem) !== JSON.stringify(filtros);
    if (mudou && aplicarModo(aplicarFiltros(acervo, eixo.sem), historico, modo).length > 0) {
      return `Nenhuma questão com esses filtros. Tente sem ${eixo.rotulo}.`;
    }
  }

  if (aplicarFiltros(acervo, filtros).length > 0) {
    return 'Nenhuma questão errada na última tentativa com esses filtros.';
  }
  return 'Nenhuma questão com essa combinação de filtros.';
}

export interface RespostaDada {
  readonly questaoId: string;
  readonly letraMarcada: string;
  readonly acertou: boolean;
}

export interface DesempenhoMateria {
  readonly materia: string;
  readonly acertos: number;
  readonly total: number;
  readonly percentual: number;
}

export interface Placar {
  readonly acertos: number;
  readonly respondidas: number;
  readonly total: number;
  readonly brancos: number;
  readonly percentualRespondidas: number;
  readonly percentualProva: number;
}

export function placar(respostas: readonly RespostaDada[], totalDoQuiz?: number): Placar {
  const acertos = respostas.filter((r) => r.acertou).length;
  const respondidas = respostas.length;
  const total = totalDoQuiz ?? respondidas;

  return {
    acertos,
    respondidas,
    total,
    brancos: Math.max(0, total - respondidas),
    percentualRespondidas: percentual(acertos, respondidas),
    percentualProva: percentual(acertos, total),
  };
}

export function desempenhoPorMateria(
  respostas: readonly RespostaDada[],
  materiaPorQuestao: ReadonlyMap<string, string | null>,
): DesempenhoMateria[] {
  const grupos = new Map<string, { acertos: number; total: number }>();

  for (const r of respostas) {
    const materia = materiaPorQuestao.get(r.questaoId) ?? 'sem matéria';
    const grupo = grupos.get(materia) ?? { acertos: 0, total: 0 };
    grupos.set(materia, { acertos: grupo.acertos + (r.acertou ? 1 : 0), total: grupo.total + 1 });
  }

  return [...grupos.entries()]
    .map(([materia, g]) => ({
      materia,
      acertos: g.acertos,
      total: g.total,
      percentual: percentual(g.acertos, g.total),
    }))
    .sort((a, b) => a.percentual - b.percentual || a.materia.localeCompare(b.materia, 'pt-BR'));
}

function percentual(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 100);
}
