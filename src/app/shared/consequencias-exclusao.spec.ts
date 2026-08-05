import { describe, expect, it } from 'vitest';

import { apagaHistorico, consequenciasDaExclusao } from './consequencias-exclusao';

describe('consequenciasDaExclusao', () => {
  it('lista o que existe, na ordem da cadeia', () => {
    expect(consequenciasDaExclusao({ provas: 1, questoes: 70, respostas: 31 })).toEqual([
      '1 prova',
      '70 questões',
      '31 respostas do seu histórico',
    ]);
  });

  it('omite o que é zero — "0 respostas" assusta sem informar', () => {
    expect(consequenciasDaExclusao({ provas: 2, questoes: 0, respostas: 0 })).toEqual(['2 provas']);
  });

  it('concurso vazio não arrasta nada, e a lista fica vazia', () => {
    expect(consequenciasDaExclusao({ provas: 0, questoes: 0, respostas: 0 })).toEqual([]);
    expect(consequenciasDaExclusao({})).toEqual([]);
  });

  it('acerta o singular', () => {
    expect(consequenciasDaExclusao({ questoes: 1, respostas: 1 })).toEqual([
      '1 questão',
      '1 resposta do seu histórico',
    ]);
  });
});

describe('apagaHistorico', () => {
  it('é o alerta extra: o acervo se reconstrói, o histórico não', () => {
    expect(apagaHistorico({ questoes: 70, respostas: 31 })).toBe(true);
    expect(apagaHistorico({ questoes: 70, respostas: 0 })).toBe(false);
  });
});
