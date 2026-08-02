/**
 * Regras do quiz como funções PURAS (docs/04): sem Angular, sem banco.
 *
 * A ideia estruturante: os três modos NÃO são três caminhos de código. São o
 * mesmo pipeline com um filtro a mais no meio.
 *
 *   acervo elegível → filtros (banca/concurso/matéria) → filtro de MODO → sorteio
 *
 * Modo é uma função `(candidatas, histórico) → candidatas`, e "aleatório" é a
 * identidade. É por isso que trazer o histórico para o cliente vale a pena:
 * os três modos viram funções testáveis sem banco. Empurrar isso para uma RPC
 * esconderia a regra dos testes.
 */

export type ModoQuiz = 'aleatorio' | 'nao_respondidas' | 'revisao_erros';

/** O mínimo que o sorteio precisa saber de uma questão. */
export interface CandidataQuiz {
  readonly id: string;
  readonly materia_id: string | null;
  readonly banca_id: string | null;
  readonly concurso_id: string;
}

/** A candidata com os nomes que a tela de montagem precisa exibir. */
export interface CandidataComNomes extends CandidataQuiz {
  readonly materia: string | null;
  readonly banca_nome: string | null;
  readonly concurso_nome: string;
}

/** Uma linha de `respostas`, como o histórico chega do banco. */
export interface RespostaHistorico {
  readonly questao_id: string;
  readonly acertou: boolean;
  readonly respondido_em: string;
}

export interface FiltrosQuiz {
  readonly bancaId: string | null;
  readonly concursoId: string | null;
  /** Vazio significa "todas" — multi-seleção, ao contrário de banca/concurso. */
  readonly materiaIds: readonly string[];
}

export const FILTROS_VAZIOS: FiltrosQuiz = { bancaId: null, concursoId: null, materiaIds: [] };

export const ROTULO_MODO: Record<ModoQuiz, string> = {
  aleatorio: 'Aleatório',
  nao_respondidas: 'Só não respondidas',
  revisao_erros: 'Revisão de erros',
};

// -----------------------------------------------------------------------------
// Histórico
// -----------------------------------------------------------------------------

/**
 * Reduz o histórico à resposta MAIS RECENTE de cada questão.
 *
 * É a peça que faz "revisão de erros" se auto-esvaziar conforme você domina o
 * acervo. A leitura ingênua — "existe alguma resposta errada" — devolveria para
 * sempre uma questão que você errou uma vez em março e acertou todas as vezes
 * desde então, transformando acerto consolidado em ruído permanente.
 */
export function ultimaRespostaPorQuestao(
  historico: readonly RespostaHistorico[],
): Map<string, RespostaHistorico> {
  const ultima = new Map<string, RespostaHistorico>();

  for (const r of historico) {
    const atual = ultima.get(r.questao_id);
    // `>` e não `>=`: com carimbos iguais, a primeira lida vence — determinismo
    // importa mais aqui do que qual das duas é "a certa".
    if (!atual || r.respondido_em > atual.respondido_em) ultima.set(r.questao_id, r);
  }

  return ultima;
}

// -----------------------------------------------------------------------------
// Filtros
// -----------------------------------------------------------------------------

/**
 * Banca e concurso são independentes e combináveis (docs/03): filtrar por banca
 * reúne questões de todos os concursos daquela banca. Matéria é multi-seleção.
 * Nulo/vazio significa "todas" em cada eixo.
 */
export function aplicarFiltros<T extends CandidataQuiz>(
  candidatas: readonly T[],
  filtros: FiltrosQuiz,
): T[] {
  const materias = new Set(filtros.materiaIds);
  return candidatas.filter(
    (q) =>
      (filtros.bancaId === null || q.banca_id === filtros.bancaId) &&
      (filtros.concursoId === null || q.concurso_id === filtros.concursoId) &&
      (materias.size === 0 || (q.materia_id !== null && materias.has(q.materia_id))),
  );
}

export interface OpcaoFiltro {
  readonly id: string;
  readonly nome: string;
}

export interface OpcoesFiltro {
  readonly bancas: OpcaoFiltro[];
  readonly concursos: OpcaoFiltro[];
  readonly materias: OpcaoFiltro[];
}

/**
 * As opções de cada filtro saem do PRÓPRIO acervo, não das tabelas de dimensão.
 *
 * Duas consequências que valem o desvio: nenhuma opção oferecida leva a zero
 * sozinha (uma banca sem questão aprovada simplesmente não aparece), e a lista
 * encolhe conforme você escolhe — os concursos são os daquela banca, as
 * matérias são as daquele recorte. Filtro que oferece beco sem saída é o que
 * faz o "0 questões" parecer defeito do app.
 */
export function opcoesDeFiltro(
  acervo: readonly CandidataComNomes[],
  filtros: FiltrosQuiz,
): OpcoesFiltro {
  const soBanca = { ...FILTROS_VAZIOS, bancaId: filtros.bancaId };
  const bancaEConcurso = { ...soBanca, concursoId: filtros.concursoId };

  return {
    bancas: distintas(acervo, (q) => [q.banca_id, q.banca_nome]),
    concursos: distintas(aplicarFiltros(acervo, soBanca), (q) => [q.concurso_id, q.concurso_nome]),
    materias: distintas(aplicarFiltros(acervo, bancaEConcurso), (q) => [q.materia_id, q.materia]),
  };
}

function distintas(
  acervo: readonly CandidataComNomes[],
  extrair: (q: CandidataComNomes) => [string | null, string | null],
): OpcaoFiltro[] {
  const mapa = new Map<string, string>();
  for (const q of acervo) {
    const [id, nome] = extrair(q);
    // Sem id não há como filtrar por ele: questão sem banca não vira opção.
    if (id) mapa.set(id, nome ?? '—');
  }
  return [...mapa.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** O filtro de histórico — é aqui que o modo mora. */
export function aplicarModo<T extends CandidataQuiz>(
  candidatas: readonly T[],
  historico: readonly RespostaHistorico[],
  modo: ModoQuiz,
): T[] {
  if (modo === 'aleatorio') return [...candidatas]; // a identidade

  const ultima = ultimaRespostaPorQuestao(historico);

  if (modo === 'nao_respondidas') return candidatas.filter((q) => !ultima.has(q.id));

  // revisao_erros: a ÚLTIMA resposta foi errada. Questão nunca respondida não
  // entra — não há erro a revisar.
  return candidatas.filter((q) => ultima.get(q.id)?.acertou === false);
}

// -----------------------------------------------------------------------------
// Sorteio
// -----------------------------------------------------------------------------

/** Fonte de aleatoriedade injetável, para o sorteio ser testável. */
export type Rng = () => number;

/**
 * Fisher-Yates com RNG injetável.
 *
 * Não usa `sort(() => Math.random() - 0.5)`, que é o embaralhamento errado mais
 * comum: o comparador inconsistente produz distribuição enviesada e depende do
 * algoritmo de ordenação do runtime.
 */
export function embaralhar<T>(itens: readonly T[], rng: Rng = Math.random): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Sorteia até `quantidade` questões, sem repetir.
 *
 * Pedir mais do que existe NÃO é erro: monta com o que houver (docs/03). Quem
 * avisa é a tela, com a contagem na mão antes de começar.
 */
export function sortear<T>(
  candidatas: readonly T[],
  quantidade: number,
  rng: Rng = Math.random,
): T[] {
  if (quantidade <= 0) return [];
  return embaralhar(candidatas, rng).slice(0, quantidade);
}

// -----------------------------------------------------------------------------
// Por que o conjunto ficou vazio
// -----------------------------------------------------------------------------

/**
 * Qual filtro esvaziou o conjunto.
 *
 * Com um acervo de uma prova só, "0 questões" é o caso comum — e um vazio sem
 * explicação faz parecer que o app está quebrado. Relaxa um eixo por vez e
 * aponta o primeiro que, sozinho, destrava o conjunto.
 */
export function motivoConjuntoVazio(
  acervo: readonly CandidataQuiz[],
  historico: readonly RespostaHistorico[],
  filtros: FiltrosQuiz,
  modo: ModoQuiz,
): string | null {
  if (aplicarModo(aplicarFiltros(acervo, filtros), historico, modo).length > 0) return null;
  if (acervo.length === 0) return 'Nenhuma questão aprovada ainda. Revise uma prova primeiro.';

  const eixos: { rotulo: string; sem: FiltrosQuiz }[] = [
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

  // Nenhum eixo isolado resolve: ou é a combinação, ou é o próprio modo.
  if (aplicarFiltros(acervo, filtros).length > 0) {
    return modo === 'nao_respondidas'
      ? 'Você já respondeu todas as questões desses filtros.'
      : 'Nenhuma questão errada na última tentativa com esses filtros.';
  }
  return 'Nenhuma questão com essa combinação de filtros.';
}

// -----------------------------------------------------------------------------
// Resultado
// -----------------------------------------------------------------------------

export interface RespostaDada {
  readonly questaoId: string;
  readonly letraMarcada: string;
  readonly acertou: boolean;
}

export interface DesempenhoMateria {
  readonly materia: string;
  readonly acertos: number;
  readonly total: number;
  /** 0–100, arredondado. */
  readonly percentual: number;
}

/** Placar geral: X de N e o percentual. */
export function placar(respostas: readonly RespostaDada[]): {
  acertos: number;
  total: number;
  percentual: number;
} {
  const acertos = respostas.filter((r) => r.acertou).length;
  return { acertos, total: respostas.length, percentual: percentual(acertos, respostas.length) };
}

/**
 * Desempenho por matéria — a informação mais útil do resultado (docs/03): é o
 * que diz onde focar.
 *
 * Ordena do pior para o melhor pelo mesmo motivo: a matéria que precisa de
 * atenção é a que deve aparecer primeiro, não a que já vai bem.
 */
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
