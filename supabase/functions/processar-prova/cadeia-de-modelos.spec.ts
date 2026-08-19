import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extrairQuestoes } from './extrair-questoes.ts';

const CORPO_OK = {
  candidates: [
    {
      content: {
        parts: [{ text: JSON.stringify({ textos: [], questoes: [{ numero: 1 }] }) }],
      },
    },
  ],
};

const respostaOk = () => new Response(JSON.stringify(CORPO_OK), { status: 200 });
const respostaErro = (status: number) =>
  new Response(JSON.stringify({ error: { code: status } }), { status });

const modeloDe = (url: string) => url.match(/models\/([^:]+):/)?.[1] ?? '';

let chamados: string[] = [];

function dublarFetch(respostas: Response[]): void {
  let i = 0;
  vi.stubGlobal('fetch', (url: string) => {
    chamados.push(modeloDe(url));
    return Promise.resolve(respostas[Math.min(i++, respostas.length - 1)]);
  });
}

beforeEach(() => {
  chamados = [];
  vi.stubGlobal('Deno', {
    env: {
      get: (nome: string) =>
        ({ GEMINI_API_KEY: 'chave-de-teste', GEMINI_MODELOS: 'primeiro,segundo' })[nome],
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('cadeia de modelos', () => {
  it('sobrecarga no primeiro cai para o segundo, e a prova entra', async () => {
    dublarFetch([respostaErro(503), respostaOk()]);

    const extracao = await extrairQuestoes('texto da prova');

    expect(chamados).toEqual(['primeiro', 'segundo']);
    expect(extracao.questoes).toHaveLength(1);
  });

  it('chave recusada não vira segunda chamada — o outro modelo diria o mesmo', async () => {
    dublarFetch([respostaErro(401)]);

    await expect(extrairQuestoes('texto')).rejects.toThrow(/GEMINI_API_KEY/);
    expect(chamados).toEqual(['primeiro']);
  });

  it('cota estourada também não insiste: a cota é da chave, não do modelo', async () => {
    dublarFetch([respostaErro(429)]);

    await expect(extrairQuestoes('texto')).rejects.toThrow(/cota/);
    expect(chamados).toEqual(['primeiro']);
  });

  it('com todos sobrecarregados, o erro que sobra é o do último', async () => {
    dublarFetch([respostaErro(503), respostaErro(503)]);

    await expect(extrairQuestoes('texto')).rejects.toThrow(/sobrecarregado/);
    expect(chamados).toEqual(['primeiro', 'segundo']);
  });

  it('primeiro modelo respondendo bem não chama o segundo', async () => {
    dublarFetch([respostaOk()]);

    await extrairQuestoes('texto');
    expect(chamados).toEqual(['primeiro']);
  });
});
