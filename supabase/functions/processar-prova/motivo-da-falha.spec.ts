import { describe, expect, it } from 'vitest';

import { motivoDaFalha } from './motivo-da-falha.ts';

const CORPO_503 = JSON.stringify({
  error: {
    code: 503,
    message:
      'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
    status: 'UNAVAILABLE',
  },
});

describe('motivoDaFalha', () => {
  it('não despeja o JSON da API na tela de quem está revisando', () => {
    const motivo = motivoDaFalha(503, CORPO_503);

    expect(motivo).not.toContain('UNAVAILABLE');
    expect(motivo).not.toContain('{');
    expect(motivo).toContain('sobrecarregado');
    expect(motivo).toContain('de novo em alguns minutos');
  });

  it('distingue as falhas que pedem ações diferentes', () => {
    expect(motivoDaFalha(429, '')).toContain('cota');
    expect(motivoDaFalha(401, '')).toContain('GEMINI_API_KEY');
    expect(motivoDaFalha(400, '')).toContain('longa demais');
  });

  it('mantém o status no fim, para depurar sem poluir', () => {
    expect(motivoDaFalha(503, CORPO_503)).toContain('(HTTP 503)');
  });

  it('status inesperado mostra o corpo, curto e numa linha só', () => {
    const motivo = motivoDaFalha(418, 'linha um\n   linha dois');

    expect(motivo).toContain('(HTTP 418)');
    expect(motivo).toContain('linha um linha dois');
    expect(motivo).not.toContain('\n');
  });

  it('não deixa corpo gigante virar parede de texto', () => {
    expect(motivoDaFalha(418, 'x'.repeat(5000)).length).toBeLessThan(240);
  });
});
