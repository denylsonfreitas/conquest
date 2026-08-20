import { describe, expect, it } from 'vitest';

import {
  caminhoGabarito,
  caminhoPdf,
  corStatusProva,
  estaTravada,
  ProvaEmProcessamento,
  valeReconsultar,
  MINUTOS_ATE_TRAVADA,
  minutosProcessando,
  motivoBloqueioAnexo,
  podeAnexarPdf,
  podeProcessar,
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

describe('podeProcessar', () => {
  it('exige PDF anexado', () => {
    expect(podeProcessar({ status: 'pendente', arquivo_path: null })).toBe(false);
    expect(podeProcessar({ status: 'pendente', arquivo_path: 'c/p.pdf' })).toBe(true);
  });

  it('permite tentar de novo depois de erro', () => {
    expect(podeProcessar({ status: 'erro', arquivo_path: 'c/p.pdf' })).toBe(true);
  });

  it('não redispara enquanto processa nem depois de pronta', () => {
    for (const status of ['processando', 'pronta'] as const) {
      expect(podeProcessar({ status, arquivo_path: 'c/p.pdf' })).toBe(false);
    }
  });

  it('permite reprocessar extração ruim enquanto nada foi aprovado', () => {
    const prova = { status: 'aguardando_revisao', arquivo_path: 'c/p.pdf' } as const;
    expect(podeProcessar(prova, false)).toBe(true);
    expect(podeProcessar(prova, true)).toBe(false);
  });
});

describe('estaTravada', () => {
  const agora = new Date('2026-08-01T12:00:00Z');
  const haMinutos = (m: number) => new Date(agora.getTime() - m * 60_000).toISOString();

  it('não acusa processamento saudável', () => {
    expect(estaTravada({ status: 'processando', processando_desde: haMinutos(2) }, agora)).toBe(
      false,
    );
  });

  it('acusa quando passa do limite — o caso do worker morto', () => {
    expect(
      estaTravada(
        { status: 'processando', processando_desde: haMinutos(MINUTOS_ATE_TRAVADA) },
        agora,
      ),
    ).toBe(true);
  });

  it('não acusa prova que não está processando', () => {
    expect(estaTravada({ status: 'erro', processando_desde: null }, agora)).toBe(false);
    expect(estaTravada({ status: 'pronta', processando_desde: haMinutos(999) }, agora)).toBe(false);
  });

  it('conta os minutos para a UI explicar a espera', () => {
    expect(
      minutosProcessando({ status: 'processando', processando_desde: haMinutos(7) }, agora),
    ).toBe(7);
    expect(minutosProcessando({ status: 'pendente', processando_desde: null }, agora)).toBeNull();
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

describe('valeReconsultar', () => {
  const agora = new Date('2026-08-01T12:00:00Z');
  const haMinutos = (m: number) => new Date(agora.getTime() - m * 60_000).toISOString();

  it('acompanha enquanto há prova processando', () => {
    const provas: ProvaEmProcessamento[] = [
      { status: 'pronta', processando_desde: null },
      { status: 'processando', processando_desde: haMinutos(1) },
    ];
    expect(valeReconsultar(provas, agora)).toBe(true);
  });

  it('para quando nada mais está processando', () => {
    const provas: ProvaEmProcessamento[] = [
      { status: 'pronta', processando_desde: null },
      { status: 'erro', processando_desde: null },
    ];
    expect(valeReconsultar(provas, agora)).toBe(false);
  });

  it('desiste da prova travada — a tela já oferece Destravar', () => {
    // Sem isto, uma prova cujo worker morreu seria consultada para sempre.
    const travada: ProvaEmProcessamento[] = [
      { status: 'processando', processando_desde: haMinutos(MINUTOS_ATE_TRAVADA) },
    ];
    expect(valeReconsultar(travada, agora)).toBe(false);
  });

  it('lista vazia não gera consulta', () => {
    expect(valeReconsultar([], agora)).toBe(false);
  });
});

describe('MINUTOS_ATE_TRAVADA', () => {
  it('não passa do que a Edge Function consegue viver', () => {
    // O orçamento da função é de ~110s. Um limite maior que isso com folga só
    // faz a pessoa esperar por um desfecho que já não pode chegar.
    expect(MINUTOS_ATE_TRAVADA).toBeLessThanOrEqual(3);
  });

  it('mas dá folga suficiente para não acusar processamento saudável', () => {
    expect(MINUTOS_ATE_TRAVADA).toBeGreaterThanOrEqual(2);
  });
});
