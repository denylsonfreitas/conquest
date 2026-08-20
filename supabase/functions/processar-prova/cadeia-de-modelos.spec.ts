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
let corposEnviados: string[] = [];

// Cada modelo tem sua própria fila de respostas: é o que deixa distinguir
// "tentou de novo no primeiro" de "pulou para o segundo".
function dublarFetch(porModelo: Record<string, (() => Response)[]>): void {
  const usados: Record<string, number> = {};
  vi.stubGlobal('fetch', (url: string, init?: { body?: string }) => {
    const modelo = modeloDe(url);
    chamados.push(modelo);
    corposEnviados.push(init?.body ?? '');
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
  corposEnviados = [];
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

    await expect(extrairQuestoes('texto')).rejects.toThrow(/chave/);
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

describe('cota esgotada', () => {
  const comMistral = () =>
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
          { message: { content: JSON.stringify({ textos: [], questoes: [{ numero: 1 }] }) } },
        ],
      }),
      { status: 200 },
    );

  it('cota do Gemini no fim passa para o Mistral, que tem outra chave', async () => {
    // O caso relatado: a cadeia parava no 429 sem sequer tentar o segundo elo,
    // porque a regra vinha de quando a cadeia era só modelos de um fornecedor.
    comMistral();
    dublarFetch({ flash: [erro(429)], mistral: [respostaMistral] });

    const extracao = await extrairQuestoes('texto da prova');

    expect(chamados).toEqual(['flash', 'mistral']);
    expect(extracao.questoes).toHaveLength(1);
  });

  it('não repete o 429 no mesmo elo: cota não volta em segundos', async () => {
    comMistral();
    dublarFetch({ flash: [erro(429)], mistral: [respostaMistral] });

    await extrairQuestoes('texto');

    expect(chamados.filter((c) => c === 'flash')).toHaveLength(1);
    expect(esperas).toEqual([]);
  });

  it('cota estourada em TODOS os elos ainda explica a cadeia usada', async () => {
    comMistral();
    dublarFetch({ flash: [erro(429)], mistral: [erro(429)] });

    await expect(extrairQuestoes('texto')).rejects.toThrow(/gemini:flash, mistral:large/);
    expect(chamados).toEqual(['flash', 'mistral']);
  });

  it('com um elo só, o recado deixa isso explícito', async () => {
    // É o que revela "configurei a chave do Mistral mas não pus na cadeia":
    // sem isto, a mensagem falaria de cota sem deixar ver que a alternativa
    // nunca chegou a ser tentada.
    vi.stubGlobal('Deno', {
      env: {
        get: (nome: string) => ({ GEMINI_API_KEY: 'k', EXTRACAO_CADEIA: 'gemini:flash' })[nome],
      },
    });
    dublarFetch({ flash: [erro(429)] });

    await expect(extrairQuestoes('texto')).rejects.toThrow(/Único elo configurado: gemini:flash/);
  });
});

describe('elo que não responde', () => {
  // Fábrica que rejeita, como faz um fetch abortado por prazo ou uma rede que
  // cai no meio. Antes isso subia como exceção e derrubava a função: o catch
  // que grava o erro não rodava, e a prova ficava presa em "processando".
  const naoResponde = () => {
    throw new DOMException('The operation was aborted.', 'TimeoutError');
  };

  it('prazo estourado num elo passa para o seguinte em vez de estourar', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (nome: string) =>
          ({
            GEMINI_API_KEY: 'k1',
            MISTRAL_API_KEY: 'k2',
            EXTRACAO_CADEIA: 'gemini:flash,mistral:large',
          })[nome],
      },
    });

    const respostaMistral = () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ textos: [], questoes: [{ numero: 1 }] }) } },
          ],
        }),
        { status: 200 },
      );

    dublarFetch({ flash: [naoResponde], mistral: [respostaMistral] });

    const extracao = await extrairQuestoes('texto');

    expect(extracao.questoes).toHaveLength(1);
    expect(chamados.at(-1)).toBe('mistral');
  });

  it('nenhum elo respondendo vira erro legível, não exceção crua', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (nome: string) => ({ GEMINI_API_KEY: 'k', EXTRACAO_CADEIA: 'gemini:flash' })[nome],
      },
    });
    dublarFetch({ flash: [naoResponde] });

    // Precisa dizer que NÃO HOUVE resposta, e não que o serviço recusou por
    // carga: chamar timeout de "sobrecarregado" manda procurar o problema no
    // provedor quando ele está no tamanho do pedido.
    await expect(extrairQuestoes('texto')).rejects.toThrow(/não respondeu dentro do tempo/);
    await expect(extrairQuestoes('texto')).rejects.not.toThrow(/sobrecarregado/);
  });

  it('bug nosso sobe como bug, em vez de virar indisponibilidade do provedor', async () => {
    // Um catch cego reportava qualquer exceção como falha do elo — inclusive
    // erro de programação, que assim ficaria invisível para sempre.
    vi.stubGlobal('Deno', {
      env: {
        get: (nome: string) => ({ GEMINI_API_KEY: 'k', EXTRACAO_CADEIA: 'gemini:flash' })[nome],
      },
    });
    dublarFetch({
      flash: [
        () => {
          throw new TypeError('AbortSignal.timeout is not a function');
        },
      ],
    });

    await expect(extrairQuestoes('texto')).rejects.toThrow(/Falha inesperada/);
    await expect(extrairQuestoes('texto')).rejects.toThrow(/AbortSignal/);
  });
});

describe('elo que responde 200 mas não serve', () => {
  const comOpenRouter = () =>
    vi.stubGlobal('Deno', {
      env: {
        get: (nome: string) =>
          ({
            OPENROUTER_API_KEY: 'k1',
            GEMINI_API_KEY: 'k2',
            EXTRACAO_CADEIA: 'openrouter:deepseek/deepseek-chat-v3:free,gemini:flash',
          })[nome],
      },
    });

  const respostaOpenAi =
    (conteudo: string, finish = 'stop') =>
    () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: conteudo }, finish_reason: finish }] }),
        { status: 200 },
      );

  const extracaoValida = JSON.stringify({ textos: [], questoes: [{ numero: 1 }] });

  it('prosa em vez de JSON conta como falha do elo, e o seguinte assume', async () => {
    // O caso do modelo gratuito que ignora response_format: respondia 200, a
    // cadeia dava por encerrada e a extração morria sem tentar a alternativa.
    comOpenRouter();
    dublarFetch({
      openrouter: [respostaOpenAi('Claro! Aqui estão as questões da prova:')],
      flash: [ok],
    });

    const extracao = await extrairQuestoes('texto');

    expect(extracao.questoes).toHaveLength(1);
    expect(chamados).toEqual(['openrouter', 'flash']);
  });

  it('resposta cortada no limite também passa a bola em vez de encerrar', async () => {
    comOpenRouter();
    dublarFetch({
      openrouter: [respostaOpenAi('{"questoes":[', 'length')],
      flash: [ok],
    });

    await extrairQuestoes('texto');

    expect(chamados).toEqual(['openrouter', 'flash']);
  });

  it('o id do OpenRouter com barra e dois-pontos chega inteiro ao provedor', async () => {
    comOpenRouter();
    dublarFetch({ openrouter: [respostaOpenAi(extracaoValida)] });

    await extrairQuestoes('texto');

    const corpo = JSON.parse(corposEnviados[0]);
    expect(corpo.model).toBe('deepseek/deepseek-chat-v3:free');
  });

  it('nenhum elo entregando explica o formato, não uma sobrecarga inventada', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (nome: string) =>
          ({ OPENROUTER_API_KEY: 'k', EXTRACAO_CADEIA: 'openrouter:x/y:free' })[nome],
      },
    });
    dublarFetch({ openrouter: [respostaOpenAi('desculpe, não consigo')] });

    await expect(extrairQuestoes('texto')).rejects.toThrow(/fora do formato JSON/);
  });
});
