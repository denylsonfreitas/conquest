import { describe, expect, it } from 'vitest';

import { resumirFalhas } from './resumir-falhas.ts';

const MODELO_INEXISTENTE =
  'O modelo "openrouter:x/y:free" não existe ou não está disponível para esta chave.';

describe('resumirFalhas', () => {
  it('mesma causa em todos os lotes vira UM aviso com as faixas', () => {
    // Foi o que apareceu na tela: quatro lotes falhando por configuração
    // errada, cada um repetindo a frase inteira. A informação nova era só a
    // faixa.
    const avisos = resumirFalhas([
      { primeira: 1, ultima: 20, motivo: MODELO_INEXISTENTE },
      { primeira: 21, ultima: 42, motivo: MODELO_INEXISTENTE },
      { primeira: 43, ultima: 62, motivo: MODELO_INEXISTENTE },
      { primeira: 63, ultima: 70, motivo: MODELO_INEXISTENTE },
    ]);

    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('1 a 20, 21 a 42, 43 a 62, 63 a 70');

    // A causa aparece uma vez só, não quatro.
    expect(avisos[0].split('não existe')).toHaveLength(2);
  });

  it('causas diferentes continuam separadas — são problemas diferentes', () => {
    const avisos = resumirFalhas([
      { primeira: 1, ultima: 20, motivo: 'cota esgotada' },
      { primeira: 21, ultima: 40, motivo: 'não respondeu dentro do tempo' },
    ]);

    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toContain('1 a 20');
    expect(avisos[1]).toContain('21 a 40');
  });

  it('um lote só não ganha formatação de lista', () => {
    const avisos = resumirFalhas([{ primeira: 21, ultima: 40, motivo: 'cota esgotada' }]);

    expect(avisos).toEqual(['Questões 21 a 40 não foram extraídas: cota esgotada']);
  });

  it('sem falhas, sem avisos', () => {
    expect(resumirFalhas([])).toEqual([]);
  });
});
