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

// Corpo real devolvido pela chave do projeto quando a cadeia padrão ainda
// trazia gemini-2.5-flash fixo. Era ele que aparecia cru no card da prova.
const CORPO_404 = JSON.stringify({
  error: {
    code: 404,
    message:
      'This model models/gemini-2.5-flash is no longer available to new users as of April 29, 2025.',
    status: 'NOT_FOUND',
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

  it('404 vira recado sobre o modelo, não o JSON cru que apareceu no card', () => {
    const motivo = motivoDaFalha(404, CORPO_404, 'gemini-2.5-flash');

    expect(motivo).not.toContain('{');
    expect(motivo).not.toContain('NOT_FOUND');
    expect(motivo).toContain('gemini-2.5-flash');
    expect(motivo).toContain('GEMINI_MODELOS');
  });

  it('sem saber o modelo, o 404 ainda diz o que fazer', () => {
    const motivo = motivoDaFalha(404, CORPO_404);

    expect(motivo).not.toContain('{');
    expect(motivo).toContain('GEMINI_MODELOS');
  });

  it('500 e 504 são carga como 502/503, e não caem no ramo genérico', () => {
    expect(motivoDaFalha(500, '')).toContain('sobrecarregado');
    expect(motivoDaFalha(504, '')).toContain('sobrecarregado');
  });
});
