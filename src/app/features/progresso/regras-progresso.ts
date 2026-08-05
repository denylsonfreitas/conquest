/**
 * Regras do progresso como funções PURAS (docs/04): sem Angular, sem banco.
 *
 * Tudo aqui é DERIVADO de `respostas` subindo a árvore — não existe tabela de
 * estatística, e não deve existir (docs/03). O que a tela mostra é uma leitura
 * do histórico, não um segundo registro dele.
 *
 * Vale notar o que o passo 8 comprou para cá: como o trigger recalcula
 * `acertou` quando um gabarito é corrigido, estes números podem confiar na
 * coluna. Antes dele, uma correção de gabarito deixaria a estatística mentindo
 * para sempre.
 */

export interface RespostaAnalisavel {
  readonly questaoId: string;
  readonly acertou: boolean;
  readonly respondidoEm: string;
  readonly materia: string | null;
  readonly bancaNome: string | null;
  readonly anulada: boolean;
}

/** Quantas respostas recentes formam a janela de evolução de cada matéria. */
export const JANELA_EVOLUCAO = 20;

/**
 * Mínimo de respostas para uma matéria entrar no ranking das mais fracas.
 *
 * Sem piso, 2 de 2 erradas viram "0%, sua pior matéria" — isso é acaso, não
 * sinal. As abaixo do piso não somem: vão para um grupo à parte, porque
 * escondê-las faria parecer que a matéria não existe.
 */
export const PISO_RANQUEAMENTO = 10;

const SEM_MATERIA = 'Sem matéria';
const SEM_BANCA = 'Sem banca';

/**
 * Respostas que CONTAM.
 *
 * Questão anulada foi invalidada pela banca: registrar como seu erro algo que
 * não valia seria contar contra você uma questão que nem deveria ter existido.
 * Nada é apagado — só deixa de contar, do mesmo jeito que `elegivel` já a
 * mantém fora dos quizzes.
 */
export function contaveis(respostas: readonly RespostaAnalisavel[]): RespostaAnalisavel[] {
  return respostas.filter((r) => !r.anulada);
}

export interface TotalPraticado {
  readonly respostas: number;
  /** Questões distintas: responder a mesma três vezes não são três questões. */
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

/**
 * Agrupa por um eixo qualquer — matéria ou banca.
 *
 * Uma função para os dois porque a pergunta é a mesma: "quanto eu acerto
 * quando o assunto é X". Duplicar por eixo seria duas cópias divergindo na
 * primeira mudança.
 */
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
  /** Nulo quando ainda não há histórico anterior à janela para comparar. */
  readonly anteriores: Desempenho | null;
  /** Diferença em pontos percentuais. Positivo é melhora. */
  readonly delta: number | null;
}

/**
 * Evolução por ÚLTIMAS N respostas, não por janela de calendário.
 *
 * Estudo acontece em rajada: três dias seguidos e depois duas semanas sem
 * abrir o app. Uma janela de 30 dias ficaria vazia ou cheia por acidente de
 * calendário, e diria mais sobre o seu ritmo do que sobre o seu aprendizado.
 * As últimas N respondem "estou melhorando?" independentemente de quando você
 * estudou.
 */
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

  // Quem mudou mais aparece primeiro; sem comparação ainda, por último.
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
  /** Ranqueadas da pior para a melhor — só as que têm amostra suficiente. */
  readonly ranqueadas: Desempenho[];
  /** Amostra pequena demais para ranquear, mas visíveis. */
  readonly poucaAmostra: Desempenho[];
}

/**
 * Separa o que dá para ranquear do que ainda é acaso.
 *
 * O piso é o que impede "errei as 2 únicas de Direito" de virar "Direito é sua
 * pior matéria". As de amostra pequena continuam na tela, num grupo próprio:
 * omiti-las faria parecer que a matéria não existe no acervo.
 */
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
