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

import { aplicarFiltros, FiltrosAcervo, ItemFiltravel } from '../../shared/filtros-acervo';

export type ModoQuiz = 'aleatorio' | 'menos_vistas' | 'revisao_erros';

/** Uma linha de `respostas`, como o histórico chega do banco. */
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

export interface UsoDaQuestao {
  readonly vezes: number;
  /** Carimbo da resposta mais recente. */
  readonly ultimaEm: string;
}

/** Quantas vezes cada questão foi respondida, e quando foi a última. */
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

/**
 * O filtro de histórico — quem o modo DEIXA entrar.
 *
 * Só "revisão de erros" exclui alguém. "Menos vistas" não filtra nada: ele se
 * distingue do aleatório pela ORDEM (ver `filaDoModo`), não pelo conjunto. É
 * essa separação que faz o modo nunca esgotar — não há o que acabar quando
 * nada é excluído.
 */
export function aplicarModo<T extends ItemFiltravel>(
  candidatas: readonly T[],
  historico: readonly RespostaHistorico[],
  modo: ModoQuiz,
): T[] {
  if (modo !== 'revisao_erros') return [...candidatas];

  // A ÚLTIMA resposta foi errada. Questão nunca respondida não entra — não há
  // erro a revisar. Este modo PODE esvaziar, e esvaziar aqui é sucesso: quer
  // dizer que não sobrou erro pendente.
  const ultima = ultimaRespostaPorQuestao(historico);
  return candidatas.filter((q) => ultima.get(q.id)?.acertou === false);
}

/**
 * A fila do modo: quem entra, e em que ordem.
 *
 * "Menos vistas" substituiu "só não respondidas" porque é o mesmo modo sem o
 * precipício. Enquanto houver questão nunca respondida, a sensação é idêntica
 * — elas vêm primeiro. Quando acabam, a fila continua em vez de zerar.
 *
 * As nunca respondidas são embaralhadas entre si (não há critério que as
 * distinga). As já respondidas seguem ordem DETERMINÍSTICA: menos vezes
 * primeiro, empate desfeito pela mais antiga. O determinismo é o mecanismo da
 * rotação — responder uma questão atualiza a contagem e a data dela, e isso
 * sozinho a joga para o fim da fila.
 */
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
 * Corta a fila em `quantidade`.
 *
 * O sorteio agora vive em `filaDoModo` — aqui só se tira do topo, porque a
 * ordem já significa alguma coisa e embaralhar de novo a destruiria.
 *
 * Pedir mais do que existe NÃO é erro: monta com o que houver (docs/03). Quem
 * avisa é a tela, com a contagem na mão antes de começar.
 */
export function primeiras<T>(fila: readonly T[], quantidade: number): T[] {
  if (quantidade <= 0) return [];
  return fila.slice(0, quantidade);
}

/** Limites da quantidade pedida. O teto existe para o quiz caber numa sessão. */
export const QUANTIDADE_MIN = 1;
export const QUANTIDADE_MAX = 200;

/**
 * O que o campo de quantidade aceita, e o que fazer com o resto.
 *
 * Um campo livre recebe vazio, zero, negativo, decimal e texto. Nenhum desses
 * é erro do usuário digitando — é o estado natural de um campo no meio da
 * edição. Por isso a entrada inválida NÃO zera o quiz nem trava o botão: cai
 * no último valor válido, e o campo se corrige ao sair dele.
 */
export function normalizarQuantidade(texto: string, anterior: number): number {
  const numero = Number(texto.trim());
  if (texto.trim() === '' || !Number.isFinite(numero)) return anterior;
  return Math.min(QUANTIDADE_MAX, Math.max(QUANTIDADE_MIN, Math.floor(numero)));
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

  // Nenhum eixo isolado resolve: ou é a combinação, ou é o próprio modo.
  // "Menos vistas" nunca chega aqui por conta própria — ele não exclui
  // ninguém, então só zera se os filtros já tiverem zerado.
  if (aplicarFiltros(acervo, filtros).length > 0) {
    return 'Nenhuma questão errada na última tentativa com esses filtros.';
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
