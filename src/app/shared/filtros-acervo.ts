
export interface ItemFiltravel {
  readonly id: string;
  readonly materia_id: string | null;
  readonly banca_id: string | null;
  readonly concurso_id: string;
}

export interface ItemComNomes extends ItemFiltravel {
  readonly materia: string | null;
  readonly banca_nome: string | null;
  readonly concurso_nome: string;
}

export interface FiltrosAcervo {
  readonly bancaId: string | null;
  readonly concursoId: string | null;
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
    if (id) mapa.set(id, nome ?? '—');
  }
  return [...mapa.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

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
