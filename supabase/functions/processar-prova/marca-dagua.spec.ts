import { describe, expect, it } from 'vitest';

import { garantirSemMarcaDagua, removerMarcaDagua } from './marca-dagua.ts';

const PAGINA_REAL = [
  'pcimarkpci MjgwNDoyOWI4OjUwOGM6MDExOTowMDdhOjIwYzY6ZDU3NjpmY2Ew:U2F0LCAwMSBBdWcgMjAyNiAxMzoxNDozMCAtMDMwMA==',
  'www.pciconcursos.com.brEMPRESA DE TECNOLOGIA E INFORMAÇÕES DA',
  'PREVIDÊNCIA - DATAPREV',
  '1',
  'É preciso estar atento e forte.',
  '(A) Existe uma oração subordinada.',
].join('\n');

describe('removerMarcaDagua', () => {
  it('elimina qualquer resquício de pcimark', () => {
    expect(removerMarcaDagua(PAGINA_REAL)).not.toMatch(/pcimark/i);
  });

  it('elimina o base64 que carrega IP e data do download', () => {
    const limpo = removerMarcaDagua(PAGINA_REAL);
    expect(limpo).not.toContain('MjgwNDoyOWI4');
    expect(limpo).not.toContain('U2F0LCAwMSBBdWcg');
  });

  it('elimina o domínio mesmo colado ao conteúdo, sem levar o texto junto', () => {
    const limpo = removerMarcaDagua(PAGINA_REAL);
    expect(limpo).not.toContain('pciconcursos');
    expect(limpo).toContain('EMPRESA DE TECNOLOGIA E INFORMAÇÕES DA');
  });

  it('preserva o conteúdo da prova', () => {
    const limpo = removerMarcaDagua(PAGINA_REAL);
    expect(limpo).toContain('É preciso estar atento e forte.');
    expect(limpo).toContain('(A) Existe uma oração subordinada.');
    expect(limpo).toMatch(/1\n/);
  });

  it('não altera texto que nunca teve marca d’água', () => {
    const limpo = 'Questão 1\n(A) alternativa';
    expect(removerMarcaDagua(limpo)).toBe(limpo);
  });
});

describe('garantirSemMarcaDagua', () => {
  it('deixa passar texto limpo', () => {
    expect(() => garantirSemMarcaDagua(removerMarcaDagua(PAGINA_REAL))).not.toThrow();
  });

  it('aborta em vez de deixar o dado pessoal sair para a API', () => {
    expect(() => garantirSemMarcaDagua(PAGINA_REAL)).toThrow(/Envio ao LLM abortado/);
  });
});
