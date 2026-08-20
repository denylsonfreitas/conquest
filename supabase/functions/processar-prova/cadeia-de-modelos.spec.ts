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

// Fábricas, e não instâncias: o corpo de uma Response só pode ser lido uma vez,
// e a repetição no mesmo modelo devolveria a mesma resposta duas vezes.
const ok = () => new Response(JSON.stringify(CORPO_OK), { status: 200 });
const erro = (status: number) => () =>
  new Response(JSON.stringify({ error: { code: status } }), { status });

// O Gemini traz o modelo no caminho; o compatível, no corpo. Para o teste
// basta saber QUEM foi chamado, e o host resolve os dois casos.
const modeloDe = (url: string) => {
  const noCaminho = url.split('/models/')[1];
  if (noCaminho) return noCaminho.split(':')[0];
  return new URL(url).hostname.split('.').at(-2) ?? '';
};

let chamados: string[] = [];
let esperas: number[] = [];

// Cada modelo tem sua própria fila de respostas: é o que deixa distinguir
// "tentou de novo no primeiro" de "pulou para o segundo".
function dublarFetch(porModelo: Record<string, (() => Response)[]>): void {
  const usados: Record<string, number> = {};
  vi.stubGlobal('fetch', (url: string) => {
    const modelo = modeloDe(url);
    chamados.push(modelo);
    const fila = porModelo[modelo] ?? [];
    const i = usados[modelo] ?? 0;
    usados[modelo] = i + 1;
    return Promise.resolve(fila[Math.min(i, fila.length - 1)]());
  });
}

function configurarModelos(lista: string): void {
  vi.stubGlobal('Deno', {
    env: {
      get: (nome: string) => ({ GEMINI_API_KEY: 'chave-de-teste', GEMINI_MODELOS: lista })[nome],
    },
  });
}

beforeEach(() => {
  chamados = [];
  esperas = [];
  configurarModelos('primeiro,segundo');

  // A espera é registrada e disparada na hora: o teste prova o recuo sem
  // gastar os segundos de verdade.
  vi.stubGlobal('setTimeout', (fn: () => void, ms: number) => {
    esperas.push(ms);
    fn();
    return 0;
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('repetição no mesmo modelo', () => {
  it('503 é reintentado no MESMO modelo antes de pular para o seguinte', async () => {
    dublarFetch({ primeiro: [erro(503), ok] });

    const extracao = await extrairQuestoes('texto da prova');

    expect(chamados).toEqual(['primeiro', 'primeiro']);
    expect(extracao.questoes).toHaveLength(1);
  });

  it('com um modelo só configurado, o 503 ainda é reintentado', async () => {
    // Este é o caso real: a cadeia padrão tem um elo, e antes disso o primeiro
    // 503 encerrava o processamento sem nenhuma tentativa.
    configurarModelos('unico');
    dublarFetch({ unico: [erro(503), erro(503), ok] });

    const extracao = await extrairQuestoes('texto da prova');

    expect(chamados).toEqual(['unico', 'unico', 'unico']);
    expect(extracao.questoes).toHaveLength(1);
  });

  it('espera mais a cada tentativa, em vez de martelar o modelo congestionado', async () => {
    configurarModelos('unico');
    dublarFetch({ unico: [erro(503), erro(503), ok] });

    await extrairQuestoes('texto');

    expect(esperas).toEqual([2_000, 5_000]);
  });

  it('esgotadas as tentativas do primeiro, aí sim cai para o segundo', async () => {
    dublarFetch({ primeiro: [erro(503)], segundo: [ok] });

    await extrairQuestoes('texto');

    expect(chamados).toEqual(['primeiro', 'primeiro', 'primeiro', 'segundo']);
  });

  it('404 troca de modelo sem repetir — esperar não faz o modelo existir', async () => {
    dublarFetch({ primeiro: [erro(404)], segundo: [ok] });

    await extrairQuestoes('texto');

    expect(chamados).toEqual(['primeiro', 'segundo']);
    expect(esperas).toEqual([]);
  });
});

describe('falhas que não valem insistir', () => {
  it('chave recusada não vira segunda chamada — o outro modelo diria o mesmo', async () => {
    dublarFetch({ primeiro: [erro(401)] });

    await expect(extrairQuestoes('texto')).rejects.toThrow(/GEMINI_API_KEY/);
    expect(chamados).toEqual(['primeiro']);
  });

  it('cota estourada também não insiste: a cota é da chave, não do modelo', async () => {
    dublarFetch({ primeiro: [erro(429)] });

    await expect(extrairQuestoes('texto')).rejects.toThrow(/cota/);
    expect(chamados).toEqual(['primeiro']);
  });

  it('com todos sobrecarregados, o erro que sobra é o do último', async () => {
    dublarFetch({ primeiro: [erro(503)], segundo: [erro(503)] });

    await expect(extrairQuestoes('texto')).rejects.toThrow(/sobrecarregado/);
    expect(chamados).toHaveLength(6);
    expect(chamados.at(-1)).toBe('segundo');
  });

  it('primeiro modelo respondendo bem não chama o segundo', async () => {
    dublarFetch({ primeiro: [ok] });

    await extrairQuestoes('texto');
    expect(chamados).toEqual(['primeiro']);
    expect(esperas).toEqual([]);
  });
});

describe('troca de provedor', () => {
  it('Gemini fora do ar cai para o compatível, e a prova entra', async () => {
    // É o desbloqueio inteiro em um teste: sobrecarga persistente de um
    // fornecedor deixa de ser motivo para não conseguir processar nada.
    vi.stubGlobal('Deno', {
      env: {
        get: (nome: string) =>
          ({
            GEMINI_API_KEY: 'chave-gemini',
            MISTRAL_API_KEY: 'chave-mistral',
            EXTRACAO_CADEIA: 'gemini:flash,mistral:large',
          })[nome],
      },
    });

    const respostaMistral = () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify({ textos: [], questoes: [{ numero: 1 }] }) },
            },
          ],
        }),
        { status: 200 },
      );

    dublarFetch({ flash: [erro(503)], mistral: [respostaMistral] });

    const extracao = await extrairQuestoes('texto da prova');

    expect(chamados).toEqual(['flash', 'flash', 'flash', 'mistral']);
    expect(extracao.questoes).toHaveLength(1);
  });

  it('elo sem chave é pulado em vez de derrubar a extração', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (nome: string) =>
          ({
            GEMINI_API_KEY: 'chave-gemini',
            EXTRACAO_CADEIA: 'mistral:large,gemini:flash',
          })[nome],
      },
    });

    dublarFetch({ flash: [ok] });

    await extrairQuestoes('texto');

    expect(chamados).toEqual(['flash']);
  });

  it('sem nenhuma chave, o recado diz o que falta em vez de estourar', async () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } });
    dublarFetch({});

    await expect(extrairQuestoes('texto')).rejects.toThrow(/Nenhum provedor/);
    expect(chamados).toEqual([]);
  });
});
