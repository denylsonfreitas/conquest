import { describe, expect, it } from 'vitest';

import {
  alternarMateria,
  aplicarFiltros,
  FILTROS_VAZIOS,
  ItemComNomes,
  ItemFiltravel,
  opcoesDeFiltro,
  temFiltro,
  trocarBanca,
  trocarConcurso,
} from './filtros-acervo';

const q = (id: string, over: Partial<ItemFiltravel> = {}): ItemFiltravel => ({
  id,
  materia_id: 'port',
  banca_id: 'fcc',
  concurso_id: 'trt15',
  ...over,
});

const comNomes = (
  id: string,
  banca_id: string,
  banca_nome: string,
  concurso_id: string,
  concurso_nome: string,
  materia_id: string,
  materia: string,
): ItemComNomes => ({ id, banca_id, banca_nome, concurso_id, concurso_nome, materia_id, materia });

describe('aplicarFiltros', () => {
  const acervo = [
    q('a', { banca_id: 'fcc', concurso_id: 'trt15', materia_id: 'port' }),
    q('b', { banca_id: 'fcc', concurso_id: 'tre', materia_id: 'rlm' }),
    q('c', { banca_id: 'cespe', concurso_id: 'pf', materia_id: 'port' }),
  ];

  it('sem filtro nenhum, o acervo inteiro', () => {
    expect(aplicarFiltros(acervo, FILTROS_VAZIOS)).toHaveLength(3);
  });

  it('banca reúne todos os concursos dela — é o caso de uso central', () => {
    const r = aplicarFiltros(acervo, { ...FILTROS_VAZIOS, bancaId: 'fcc' });
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('combina banca e matéria, ignorando o concurso', () => {
    const r = aplicarFiltros(acervo, { bancaId: 'fcc', concursoId: null, materiaIds: ['port'] });
    expect(r.map((x) => x.id)).toEqual(['a']);
  });

  it('matéria aceita várias', () => {
    expect(aplicarFiltros(acervo, { ...FILTROS_VAZIOS, materiaIds: ['port', 'rlm'] })).toHaveLength(
      3,
    );
  });

  it('questão sem matéria some quando há filtro de matéria', () => {
    const r = aplicarFiltros([q('x', { materia_id: null })], {
      ...FILTROS_VAZIOS,
      materiaIds: ['port'],
    });
    expect(r).toEqual([]);
  });
});

describe('opcoesDeFiltro', () => {
  const acervo = [
    comNomes('a', 'fcc', 'FCC', 'trt15', 'TRT 15', 'port', 'Português'),
    comNomes('b', 'fcc', 'FCC', 'tre', 'TRE', 'rlm', 'RLM'),
    comNomes('c', 'cespe', 'Cespe', 'pf', 'PF', 'info', 'Informática'),
  ];

  it('oferece só o que existe no conjunto — nenhuma opção leva a zero sozinha', () => {
    const o = opcoesDeFiltro(acervo, FILTROS_VAZIOS);
    expect(o.bancas.map((b) => b.nome)).toEqual(['Cespe', 'FCC']);
    expect(o.materias).toHaveLength(3);
  });

  it('encolhe os concursos e as matérias conforme a banca escolhida', () => {
    const o = opcoesDeFiltro(acervo, { ...FILTROS_VAZIOS, bancaId: 'fcc' });
    expect(o.concursos.map((c) => c.nome)).toEqual(['TRE', 'TRT 15']);
    expect(o.materias.map((m) => m.nome)).toEqual(['Português', 'RLM']);
    expect(o.bancas).toHaveLength(2);
  });

  it('ignora item sem banca — não há id para filtrar', () => {
    const semBanca = [{ ...acervo[0], banca_id: null, banca_nome: null }];
    expect(opcoesDeFiltro(semBanca, FILTROS_VAZIOS).bancas).toEqual([]);
  });
});

describe('trocar e alternar', () => {
  const cheio = { bancaId: 'fcc', concursoId: 'trt15', materiaIds: ['port'] };

  it('trocar a banca zera concurso e matéria', () => {
    expect(trocarBanca('cespe')).toEqual({
      bancaId: 'cespe',
      concursoId: null,
      materiaIds: [],
    });
  });

  it('trocar o concurso zera a matéria, mas mantém a banca', () => {
    expect(trocarConcurso(cheio, 'tre')).toEqual({
      bancaId: 'fcc',
      concursoId: 'tre',
      materiaIds: [],
    });
  });

  it('alternar matéria adiciona e remove', () => {
    const comDuas = alternarMateria(cheio, 'rlm');
    expect(comDuas.materiaIds).toEqual(['port', 'rlm']);
    expect(alternarMateria(comDuas, 'port').materiaIds).toEqual(['rlm']);
  });

  it('temFiltro reconhece cada eixo isolado', () => {
    expect(temFiltro(FILTROS_VAZIOS)).toBe(false);
    expect(temFiltro({ ...FILTROS_VAZIOS, bancaId: 'fcc' })).toBe(true);
    expect(temFiltro({ ...FILTROS_VAZIOS, concursoId: 'trt15' })).toBe(true);
    expect(temFiltro({ ...FILTROS_VAZIOS, materiaIds: ['port'] })).toBe(true);
  });
});
