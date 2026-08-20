import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extrairQuestoes } from './extrair-questoes.ts';

// Prova grande o bastante para ser fatiada, com o número sozinho na linha.
function provaFalsa(quantas: number): string {
  const partes: string[] = ['LÍNGUA PORTUGUESA', ''];
  for (let n = 1; n <= quantas; n++) {
    partes.push(String(n), `Enunciado da questão ${n}?`, '(A) um', '(B) dois', '');
  }
  return partes.join('\n');
}

/** Faixa que o cabeçalho do lote pediu, lida do corpo enviado ao provedor. */
function faixaPedida(corpo: string): [number, number] {
  const conteudo = JSON.parse(corpo).contents[0].parts[0].text as string;
  const m = conteudo.match(/questões de número (\d+) a (\d+)/);
  return [Number(m?.[1]), Number(m?.[2])];
}

const respostaCom = (numeros: number[]) => () =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  textos: [],
                  questoes: numeros.map((n) => ({ numero: n })),
                }),
              },
            ],
          },
        },
      ],
    }),
    { status: 200 },
  );

let corpos: string[] = [];

beforeEach(() => {
  corpos = [];

  // O recuo entre tentativas é real: sem dublar, um lote que falha faz o teste
  // dormir os segundos de verdade.
  vi.stubGlobal('setTimeout', (fn: () => void) => {
    fn();
    return 0;
  });

  vi.stubGlobal('Deno', {
    env: {
      get: (nome: string) => ({ GEMINI_API_KEY: 'k', EXTRACAO_CADEIA: 'gemini:flash' })[nome],
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('extração em lotes', () => {
  it('fatia a prova e pede uma faixa distinta a cada chamada', async () => {
    vi.stubGlobal('fetch', (_url: string, init: { body: string }) => {
      corpos.push(init.body);
      const [de, ate] = faixaPedida(init.body);
      const numeros: number[] = [];
      for (let n = de; n <= ate; n++) numeros.push(n);
      return Promise.resolve(respostaCom(numeros)());
    });

    const extracao = await extrairQuestoes(provaFalsa(70));

    expect(corpos).toHaveLength(4);
    expect(corpos.map(faixaPedida)).toEqual([
      [1, 20],
      [21, 40],
      [41, 60],
      [61, 70],
    ]);
    expect(extracao.questoes.map((q) => q.numero)).toEqual(
      Array.from({ length: 70 }, (_, i) => i + 1),
    );
  });

  it('prova pequena continua indo numa chamada só', async () => {
    // Fatiar o que já cabe só multiplicaria chamadas sem ganho nenhum.
    vi.stubGlobal('fetch', (_url: string, init: { body: string }) => {
      corpos.push(init.body);
      return Promise.resolve(respostaCom([1, 2, 3])());
    });

    await extrairQuestoes(provaFalsa(3));

    expect(corpos).toHaveLength(1);
    expect(corpos[0]).not.toContain('questões de número');
  });

  it('lote que falha custa só ele — o resto da prova entra, com aviso', async () => {
    // É o ganho central do fatiamento: perder 20 questões deixa de significar
    // perder as outras 50.
    vi.stubGlobal('fetch', (_url: string, init: { body: string }) => {
      const [de, ate] = faixaPedida(init.body);
      if (de === 21) return Promise.resolve(new Response('{}', { status: 503 }));
      const numeros: number[] = [];
      for (let n = de; n <= ate; n++) numeros.push(n);
      return Promise.resolve(respostaCom(numeros)());
    });

    const extracao = await extrairQuestoes(provaFalsa(70));

    expect(extracao.questoes).toHaveLength(50);
    expect(extracao.questoes.some((q) => q.numero === 21)).toBe(false);

    expect(extracao.avisos).toHaveLength(1);
    expect(extracao.avisos?.[0]).toContain('21 a 40');
  });

  it('todos os lotes falhando vira erro, não prova vazia salva em silêncio', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 503 })));

    await expect(extrairQuestoes(provaFalsa(70))).rejects.toThrow(/não foram extraídas/);
  });

  it('leva os cabeçalhos anteriores como candidatos de matéria', async () => {
    vi.stubGlobal('fetch', (_url: string, init: { body: string }) => {
      corpos.push(init.body);
      const [de, ate] = faixaPedida(init.body);
      const numeros: number[] = [];
      for (let n = de; n <= ate; n++) numeros.push(n);
      return Promise.resolve(respostaCom(numeros)());
    });

    await extrairQuestoes(provaFalsa(70));

    // O primeiro lote contém o cabeçalho no próprio texto; os seguintes não, e
    // é por isso que precisam recebê-lo como candidato.
    const segundo = JSON.parse(corpos[1]).contents[0].parts[0].text as string;
    expect(segundo).toContain('LÍNGUA PORTUGUESA');
    expect(segundo).toContain('incerto');
  });
});
