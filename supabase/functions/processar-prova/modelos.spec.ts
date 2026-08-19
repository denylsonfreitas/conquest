import { describe, expect, it } from 'vitest';

import {
  cabeOutraTentativa,
  MODELOS_PADRAO,
  modelosConfigurados,
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
