import { describe, expect, it } from 'vitest';

import {
  cabeOutraTentativa,
  esperaAntesDeRepetir,
  MAX_TENTATIVAS_POR_MODELO,
  MODELOS_PADRAO,
  modelosConfigurados,
  valeRepetirMesmoModelo,
  valeTentarOutroModelo,
} from './modelos.ts';

describe('modelosConfigurados', () => {
  it('aceita lista separada por vírgula, aparando espaço', () => {
    expect(modelosConfigurados(' a , b ,c ')).toEqual(['a', 'b', 'c']);
  });

  it('sem configuração, usa a cadeia padrão', () => {
    expect(modelosConfigurados(undefined)).toEqual(MODELOS_PADRAO);
    expect(modelosConfigurados('  ')).toEqual(MODELOS_PADRAO);
  });

  it('o padrão não fixa versão de modelo — versão fixa apodrece e volta 404', () => {
    for (const modelo of MODELOS_PADRAO) {
      expect(modelo).toMatch(/-latest$/);
    }
  });

  it('um modelo só continua valendo — quem quer fixar, fixa', () => {
    expect(modelosConfigurados('gemini-2.5-pro')).toEqual(['gemini-2.5-pro']);
  });
});

describe('valeTentarOutroModelo', () => {
  it('troca quando o modelo não existe — é justo o caso em que o seguinte salva', () => {
    expect(valeTentarOutroModelo(404)).toBe(true);
  });

  it('troca quando a culpa é da carga do outro lado', () => {
    expect(valeTentarOutroModelo(503)).toBe(true);
    expect(valeTentarOutroModelo(502)).toBe(true);
    expect(valeTentarOutroModelo(504)).toBe(true);
  });

  it('NÃO troca quando o próximo modelo daria o mesmo erro', () => {
    expect(valeTentarOutroModelo(400)).toBe(false); // pedido malformado
    expect(valeTentarOutroModelo(401)).toBe(false); // chave recusada
    expect(valeTentarOutroModelo(403)).toBe(false);
    expect(valeTentarOutroModelo(429)).toBe(false); // cota é da chave, não do modelo
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
    expect(valeTentarOutroModelo(404)).toBe(true);
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
