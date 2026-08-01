import { describe, expect, it } from 'vitest';

import {
  caminhoGabarito,
  caminhoPdf,
  corStatusProva,
  motivoBloqueioAnexo,
  podeAnexarPdf,
  rotuloStatusProva,
} from './regras-prova';

describe('podeAnexarPdf', () => {
  it('permite antes de existir extração', () => {
    expect(podeAnexarPdf('pendente')).toBe(true);
    expect(podeAnexarPdf('erro')).toBe(true);
  });

  it('bloqueia de processando em diante, onde há questões penduradas', () => {
    expect(podeAnexarPdf('processando')).toBe(false);
    expect(podeAnexarPdf('aguardando_revisao')).toBe(false);
    expect(podeAnexarPdf('pronta')).toBe(false);
  });

  it('explica o bloqueio em vez de só negar', () => {
    expect(motivoBloqueioAnexo('pendente')).toBeNull();
    expect(motivoBloqueioAnexo('processando')).toContain('sendo processada');
    expect(motivoBloqueioAnexo('pronta')).toContain('invalidaria as questões');
  });
});

describe('rotuloStatusProva', () => {
  it('distingue os dois significados de pendente pelo arquivo', () => {
    expect(rotuloStatusProva({ status: 'pendente', arquivo_path: null })).toBe('Sem PDF');
    expect(rotuloStatusProva({ status: 'pendente', arquivo_path: 'c/p.pdf' })).toBe(
      'Aguardando processamento',
    );
  });

  it('usa rótulo legível nos demais estados, não o enum cru', () => {
    expect(rotuloStatusProva({ status: 'aguardando_revisao', arquivo_path: 'x' })).toBe(
      'Aguardando revisão',
    );
    expect(rotuloStatusProva({ status: 'pronta', arquivo_path: 'x' })).toBe('Pronta');
  });

  it('dá cores diferentes aos dois pendentes', () => {
    const semPdf = corStatusProva({ status: 'pendente', arquivo_path: null });
    const comPdf = corStatusProva({ status: 'pendente', arquivo_path: 'x' });
    expect(semPdf).not.toBe(comPdf);
  });
});

describe('caminhos no bucket', () => {
  it('são determinísticos, para retentativa sobrescrever em vez de acumular', () => {
    expect(caminhoPdf('c1', 'p1')).toBe('c1/p1.pdf');
    expect(caminhoPdf('c1', 'p1')).toBe(caminhoPdf('c1', 'p1'));
    expect(caminhoGabarito('c1', 'p1')).toBe('c1/p1-gabarito.pdf');
  });

  it('não colidem entre prova e gabarito', () => {
    expect(caminhoPdf('c1', 'p1')).not.toBe(caminhoGabarito('c1', 'p1'));
  });
});
