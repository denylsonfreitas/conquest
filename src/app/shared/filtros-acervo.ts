/**
 * Filtrar o acervo por banca, concurso e matéria — funções PURAS.
 *
 * Nasceu dentro de `features/quiz/regras-quiz.ts` e saiu de lá na segunda
 * ocorrência (docs/04): a listagem do acervo faz a mesma pergunta. O nome
 * antigo também já estava errado — filtrar por banca nunca foi assunto do
 * quiz, é assunto do acervo.
 *
 * O que fica AQUI é a pergunta. O que NÃO fica é a aplicação dela: o quiz
 * filtra em memória, porque precisa do contador vivo a cada clique; a listagem
 * filtra em SQL, porque carrega enunciados e pagina. Mesma pergunta, cargas
 * diferentes — unificar faria uma das duas pagar o preço da outra.
 */

/** O mínimo para uma linha ser filtrável pelos três eixos. */
export interface ItemFiltravel {
  readonly id: string;
  readonly materia_id: string | null;
  readonly banca_id: string | null;
  readonly concurso_id: string;
}

/** O item com os nomes que a tela precisa exibir nas opções. */
export interface ItemComNomes extends ItemFiltravel {
  readonly materia: string | null;
  readonly banca_nome: string | null;
  readonly concurso_nome: string;
}

export interface FiltrosAcervo {
  readonly bancaId: string | null;
  readonly concursoId: string | null;
  /** Vazio significa "todas" — multi-seleção, ao contrário de banca/concurso. */
  readonly materiaIds: readonly string[];
}

export const FILTROS_VAZIOS: FiltrosAcervo = {
  bancaId: null,
  concursoId: null,
  materiaIds: [],
};

export function temFiltro(filtros: FiltrosAcervo): boolean {
  return filtros.bancaId !== null || filtros.concursoId !== null || filtros.materiaIds.length > 0;
}

/**
 * Banca e concurso são independentes e combináveis (docs/03): filtrar por banca
 * reúne questões de todos os concursos daquela banca. Matéria é multi-seleção.
 * Nulo/vazio significa "todas" em cada eixo.
 */
export function aplicarFiltros<T extends ItemFiltravel>(
  itens: readonly T[],
  filtros: FiltrosAcervo,
): T[] {
  const materias = new Set(filtros.materiaIds);
  return itens.filter(
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
 * As opções de cada filtro saem do PRÓPRIO conjunto, não das tabelas de
 * dimensão.
 *
 * Duas consequências que valem o desvio: nenhuma opção oferecida leva a zero
 * sozinha (uma banca sem questão no conjunto simplesmente não aparece), e a
 * lista encolhe conforme você escolhe — os concursos são os daquela banca, as
 * matérias são as daquele recorte. Filtro que oferece beco sem saída é o que
 * faz o "0 resultados" parecer defeito do app.
 */
export function opcoesDeFiltro(
  itens: readonly ItemComNomes[],
  filtros: FiltrosAcervo,
): OpcoesFiltro {
  const soBanca = { ...FILTROS_VAZIOS, bancaId: filtros.bancaId };
  const bancaEConcurso = { ...soBanca, concursoId: filtros.concursoId };

  return {
    bancas: distintas(itens, (q) => [q.banca_id, q.banca_nome]),
    concursos: distintas(aplicarFiltros(itens, soBanca), (q) => [q.concurso_id, q.concurso_nome]),
    materias: distintas(aplicarFiltros(itens, bancaEConcurso), (q) => [q.materia_id, q.materia]),
  };
}

function distintas(
  itens: readonly ItemComNomes[],
  extrair: (q: ItemComNomes) => [string | null, string | null],
): OpcaoFiltro[] {
  const mapa = new Map<string, string>();
  for (const q of itens) {
    const [id, nome] = extrair(q);
    // Sem id não há como filtrar por ele: questão sem banca não vira opção.
    if (id) mapa.set(id, nome ?? '—');
  }
  return [...mapa.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Trocar a banca zera concurso e matéria; trocar o concurso zera a matéria.
 *
 * Os escolhidos podem não existir dentro do novo recorte, e um filtro fantasma
 * zeraria o conjunto sem nada na tela explicando por quê.
 */
export function trocarBanca(bancaId: string | null): FiltrosAcervo {
  return { bancaId, concursoId: null, materiaIds: [] };
}

export function trocarConcurso(filtros: FiltrosAcervo, concursoId: string | null): FiltrosAcervo {
  return { ...filtros, concursoId, materiaIds: [] };
}

export function alternarMateria(filtros: FiltrosAcervo, materiaId: string): FiltrosAcervo {
  return {
    ...filtros,
    materiaIds: filtros.materiaIds.includes(materiaId)
      ? filtros.materiaIds.filter((m) => m !== materiaId)
      : [...filtros.materiaIds, materiaId],
  };
}
