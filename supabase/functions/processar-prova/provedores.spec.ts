import { describe, expect, it } from 'vitest';

import {
  cabecalhos,
  cadeiaUtilizavel,
  CADEIA_PADRAO,
  corpoDaChamada,
  lerCadeia,
  lerResposta,
  PRESETS,
  Provedor,
  urlDe,
} from './provedores.ts';

const GEMINI: Provedor = { nome: 'gemini', modelo: 'gemini-flash-latest' };
const MISTRAL: Provedor = { nome: 'mistral', modelo: 'mistral-large-latest' };

const env = (mapa: Record<string, string>) => (nome: string) => mapa[nome];

describe('lerCadeia', () => {
  it('lê provedor e modelo na ordem de preferência', () => {
    expect(lerCadeia('gemini:flash, mistral:large')).toEqual([
      { nome: 'gemini', modelo: 'flash' },
      { nome: 'mistral', modelo: 'large' },
    ]);
  });

  it('entrada sem prefixo continua sendo Gemini — é o formato antigo', () => {
    // Quem já tinha GEMINI_MODELOS configurado não deve precisar mexer em nada.
    expect(lerCadeia('gemini-flash-latest')).toEqual([
      { nome: 'gemini', modelo: 'gemini-flash-latest' },
    ]);
  });

  it('sem configuração, cai no padrão', () => {
    expect(lerCadeia(undefined)).toEqual(lerCadeia(CADEIA_PADRAO));
    expect(lerCadeia('   ')).toEqual(lerCadeia(CADEIA_PADRAO));
  });

  it('modelo com dois-pontos no nome não perde o resto', () => {
    expect(lerCadeia('openrouter:meta-llama/llama-3:free')).toEqual([
      { nome: 'openrouter', modelo: 'meta-llama/llama-3:free' },
    ]);
  });
});

describe('cadeiaUtilizavel', () => {
  it('elo sem chave sai da cadeia em silêncio, em vez de derrubar tudo', () => {
    // Ter "gemini,mistral" configurado com só uma chave é o caso normal de
    // quem está experimentando o segundo provedor.
    const util = cadeiaUtilizavel([GEMINI, MISTRAL], env({ GEMINI_API_KEY: 'k' }));
    expect(util).toEqual([GEMINI]);
  });

  it('provedor desconhecido não vira chamada para lugar nenhum', () => {
    const util = cadeiaUtilizavel([{ nome: 'inventado', modelo: 'x' }], env({ QUALQUER: 'k' }));
    expect(util).toEqual([]);
  });

  it('sem nenhuma chave, a cadeia fica vazia — quem chama decide o recado', () => {
    expect(cadeiaUtilizavel([GEMINI, MISTRAL], env({}))).toEqual([]);
  });
});

describe('urlDe', () => {
  it('Gemini monta o caminho do modelo; o compatível usa a URL direta', () => {
    expect(urlDe(GEMINI, env({}))).toContain('/models/gemini-flash-latest:generateContent');
    expect(urlDe(MISTRAL, env({}))).toBe(PRESETS['mistral'].url);
  });

  it('a URL pode ser sobrescrita por env, sem precisar de deploy', () => {
    const outra = 'https://exemplo.invalido/v1/chat/completions';
    expect(urlDe(MISTRAL, env({ MISTRAL_URL: outra }))).toBe(outra);
  });
});

describe('corpoDaChamada e cabeçalhos', () => {
  it('o compatível manda messages e o modelo no corpo, não no caminho', () => {
    const corpo = JSON.parse(corpoDaChamada(MISTRAL, 'INSTRUCOES', 'texto', {}, 1000));

    expect(corpo.model).toBe('mistral-large-latest');
    expect(corpo.messages).toEqual([
      { role: 'system', content: 'INSTRUCOES' },
      { role: 'user', content: 'texto' },
    ]);
    expect(corpo.response_format).toEqual({ type: 'json_object' });
    expect(corpo.temperature).toBe(0);
  });

  it('o Gemini mantém systemInstruction e o schema estrito', () => {
    const corpo = JSON.parse(corpoDaChamada(GEMINI, 'INSTRUCOES', 'texto', { a: 1 }, 1000));

    expect(corpo.systemInstruction.parts[0].text).toBe('INSTRUCOES');
    expect(corpo.generationConfig.responseSchema).toEqual({ a: 1 });
    expect(corpo.model).toBeUndefined();
  });

  it('cada família autentica do seu jeito', () => {
    expect(cabecalhos(GEMINI, 'k')['x-goog-api-key']).toBe('k');
    expect(cabecalhos(GEMINI, 'k')['authorization']).toBeUndefined();
    expect(cabecalhos(MISTRAL, 'k')['authorization']).toBe('Bearer k');
    expect(cabecalhos(MISTRAL, 'k')['x-goog-api-key']).toBeUndefined();
  });
});

describe('lerResposta', () => {
  it('desembrulha o Gemini', () => {
    const json = { candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] };
    expect(lerResposta(GEMINI, json).conteudo).toBe('{"ok":1}');
  });

  it('desembrulha o compatível', () => {
    const json = { choices: [{ message: { content: '{"ok":1}' } }] };
    expect(lerResposta(MISTRAL, json).conteudo).toBe('{"ok":1}');
  });

  it('reconhece truncamento nos dois dialetos, que têm nomes diferentes', () => {
    // Sem isto, uma prova cortada ao meio entraria como se estivesse completa.
    const gem = {
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }],
    };
    const oai = { choices: [{ finish_reason: 'length', message: { content: '{' } }] };

    expect(lerResposta(GEMINI, gem).truncou).toBe(true);
    expect(lerResposta(MISTRAL, oai).truncou).toBe(true);
  });

  it('resposta vazia vira conteúdo nulo, não string vazia disfarçada', () => {
    expect(lerResposta(GEMINI, {}).conteudo).toBeNull();
    expect(lerResposta(MISTRAL, {}).conteudo).toBeNull();
  });
});
