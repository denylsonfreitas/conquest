import { describe, expect, it } from 'vitest';

import {
  cabeOutraTentativa,
  esperaAntesDeRepetir,
  MAX_TENTATIVAS_POR_MODELO,
  valeRepetirMesmoModelo,
  valeTentarOutroElo,
} from './modelos.ts';

describe('valeTentarOutroElo', () => {
  it('cota estourada PASSA para outro provedor — chave diferente, cota diferente', () => {
    // O caso real: cota do Gemini no fim, Mistral configurado, e a cadeia
    // parava sem sequer tentar. A cota de um não diz nada sobre a do outro.
    expect(valeTentarOutroElo(429, true)).toBe(true);
    expect(valeTentarOutroElo(401, true)).toBe(true);
    expect(valeTentarOutroElo(403, true)).toBe(true);
  });

  it('mas NÃO insiste em outro modelo do mesmo provedor: a chave é a mesma', () => {
    expect(valeTentarOutroElo(429, false)).toBe(false);
    expect(valeTentarOutroElo(401, false)).toBe(false);
    expect(valeTentarOutroElo(403, false)).toBe(false);
  });

  it('carga e modelo inexistente valem o seguinte, seja ele quem for', () => {
    for (const status of [500, 502, 503, 504, 404]) {
      expect(valeTentarOutroElo(status, false)).toBe(true);
      expect(valeTentarOutroElo(status, true)).toBe(true);
    }
  });
});
describe('cabeOutraTentativa', () => {
  it('deixa tentar quando o 503 veio rápido — que é o caso comum', () => {
    expect(cabeOutraTentativa(1_000, 120_000, 1_000)).toBe(true);
  });

  it('não começa outra tentativa que estouraria o tempo da função', () => {
    expect(cabeOutraTentativa(100_000, 120_000, 90_000)).toBe(false);
  });

  it('no limite exato, ainda cabe', () => {
    expect(cabeOutraTentativa(60_000, 120_000, 60_000)).toBe(true);
  });
});

describe('valeRepetirMesmoModelo', () => {
  it('insiste quando a culpa é de congestão passageira', () => {
    expect(valeRepetirMesmoModelo(503)).toBe(true);
    expect(valeRepetirMesmoModelo(500)).toBe(true);
    expect(valeRepetirMesmoModelo(502)).toBe(true);
    expect(valeRepetirMesmoModelo(504)).toBe(true);
  });

  it('NÃO insiste no 404 — esperar não faz o modelo voltar a existir', () => {
    expect(valeRepetirMesmoModelo(404)).toBe(false);
    // ...mas ainda vale trocar de modelo, que é outra decisão.
    expect(valeTentarOutroElo(404, false)).toBe(true);
  });

  it('não insiste em erro que a repetição não conserta', () => {
    expect(valeRepetirMesmoModelo(400)).toBe(false);
    expect(valeRepetirMesmoModelo(401)).toBe(false);
    expect(valeRepetirMesmoModelo(429)).toBe(false);
  });
});

describe('esperaAntesDeRepetir', () => {
  it('recua cada vez mais, em vez de repetir no mesmo ritmo', () => {
    const escala = [1, 2, 3].map(esperaAntesDeRepetir);
    expect(escala).toEqual([...escala].sort((a, b) => a - b));
    expect(new Set(escala).size).toBe(escala.length);
  });

  it('a soma das esperas cabe no orçamento da função', () => {
    // Se as esperas sozinhas passassem dos 110s, a última tentativa nunca
    // aconteceria — o recuo teria comido o tempo da chamada.
    let total = 0;
    for (let t = 1; t < MAX_TENTATIVAS_POR_MODELO; t++) total += esperaAntesDeRepetir(t);
    expect(total).toBeLessThan(30_000);
  });
});
