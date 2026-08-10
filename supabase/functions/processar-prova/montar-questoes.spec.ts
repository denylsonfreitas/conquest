import { describe, expect, it } from 'vitest';

import { QuestaoBruta } from './questao-bruta.ts';
import { montarQuestoes } from './montar-questoes.ts';

const PROVA_ID = '11111111-1111-4111-8111-111111111111';
const MATERIA_TI = '22222222-2222-4222-8222-222222222222';
const MATERIAS = new Map([['TECNOLOGIA DA INFORMACAO', MATERIA_TI]]);

const bruta = (over: Partial<QuestaoBruta> = {}): QuestaoBruta => ({
  numero: 1,
  materia: 'Tecnologia da Informação',
  enunciado: 'Enunciado da questão',
  alternativas: [
    { letra: 'A', texto: 'um' },
    { letra: 'B', texto: 'dois' },
  ],
  gabarito: null,
  tipo: 'multipla_escolha',
  tem_imagem: false,
  incerto: false,
  ...over,
});

describe('montarQuestoes', () => {
  it('casa a matéria pelo nome normalizado e aplica o gabarito do PDF separado', () => {
    const { validas, descartadas } = montarQuestoes(
      [bruta({ numero: 67 })],
      PROVA_ID,
      new Map([[67, 'A']]),
      MATERIAS,
    );

    expect(descartadas).toEqual([]);
    expect(validas[0]).toMatchObject({ numero: 67, materia_id: MATERIA_TI, gabarito: 'A' });
  });

  it('a questão cujas alternativas são figuras entra, em vez de sumir', () => {
    const soFiguras = bruta({
      numero: 67,
      tem_imagem: true,
      alternativas: ['A', 'B', 'C', 'D', 'E'].map((letra) => ({ letra, texto: '' })),
    });

    const { validas, descartadas } = montarQuestoes(
      [soFiguras],
      PROVA_ID,
      new Map([[67, 'A']]),
      MATERIAS,
    );

    expect(descartadas).toEqual([]);
    expect(validas).toHaveLength(1);
    expect(validas[0]).toMatchObject({ numero: 67, tem_imagem: true, gabarito: 'A' });
  });

  it('quem é descartado sai com o motivo, não só com o número', () => {
    const semAlternativas = bruta({ numero: 12, alternativas: [] });

    const { descartadas } = montarQuestoes([semAlternativas], PROVA_ID, null, MATERIAS);

    expect(descartadas).toHaveLength(1);
    expect(descartadas[0].numero).toBe(12);
    expect(descartadas[0].motivo).toContain('alternativas');
    expect(descartadas[0].motivo.length).toBeGreaterThan(10);
  });

  it('alternativa vazia sem marca de imagem continua sendo descarte, com motivo claro', () => {
    const suspeita = bruta({
      numero: 5,
      tem_imagem: false,
      alternativas: [
        { letra: 'A', texto: '' },
        { letra: 'B', texto: 'dois' },
      ],
    });

    const { descartadas } = montarQuestoes([suspeita], PROVA_ID, null, MATERIAS);

    expect(descartadas[0].motivo).toContain('dependente de imagem');
  });

  it('descarta só o problemático e grava o resto da prova', () => {
    const { validas, descartadas } = montarQuestoes(
      [bruta({ numero: 1 }), bruta({ numero: 2, enunciado: '' }), bruta({ numero: 3 })],
      PROVA_ID,
      null,
      MATERIAS,
    );

    expect(validas).toHaveLength(2);
    expect(descartadas.map((d) => d.numero)).toEqual([2]);
  });

  it('guarda o nome da matéria em assunto quando ela ainda não existe no banco', () => {
    const { validas } = montarQuestoes(
      [bruta({ materia: 'Matéria Inexistente' })],
      PROVA_ID,
      null,
      MATERIAS,
    );

    expect(validas[0]).toMatchObject({ materia_id: null, assunto: 'Matéria Inexistente' });
  });
});
