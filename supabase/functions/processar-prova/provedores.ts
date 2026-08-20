/**
 * A extração não depende mais de um fornecedor só.
 *
 * Groq, Cerebras, Mistral, OpenRouter e DeepSeek falam o mesmo dialeto (o
 * /chat/completions da OpenAI), então um adaptador cobre todos: adicionar
 * provedor vira configurar um segredo, não escrever código. O Gemini fica
 * sendo o único caso especial, porque a API dele é de outra família.
 */
export interface Provedor {
  readonly nome: string;
  readonly modelo: string;
}

interface Preset {
  readonly url: string;
  readonly chaveEnv: string;
  /** Gemini tem corpo, cabeçalho e envelope de resposta próprios. */
  readonly dialeto: 'gemini' | 'openai';
}

// As URLs ficam aqui e não espalhadas pelo código para que trocar uma seja uma
// linha. Todas podem ser sobrescritas por env (<NOME>_URL) quando o provedor
// mudar de endereço — é o que evita um deploy só para consertar uma string.
export const PRESETS: Readonly<Record<string, Preset>> = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta',
    chaveEnv: 'GEMINI_API_KEY',
    dialeto: 'gemini',
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/chat/completions',
    chaveEnv: 'MISTRAL_API_KEY',
    dialeto: 'openai',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    chaveEnv: 'GROQ_API_KEY',
    dialeto: 'openai',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    chaveEnv: 'OPENROUTER_API_KEY',
    dialeto: 'openai',
  },
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    chaveEnv: 'DEEPSEEK_API_KEY',
    dialeto: 'openai',
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/chat/completions',
    chaveEnv: 'CEREBRAS_API_KEY',
    dialeto: 'openai',
  },
};

// Um elo só, e no provedor que já está configurado: acrescentar o segundo é
// decisão de quem opera, não padrão embutido que ninguém pediu.
export const CADEIA_PADRAO = 'gemini:gemini-flash-latest';

/**
 * Lê "provedor:modelo, provedor:modelo" na ordem de preferência.
 *
 * Entrada sem prefixo continua valendo como Gemini — é o formato antigo de
 * GEMINI_MODELOS, e quebrar quem já tem isso configurado não traria nada.
 */
export function lerCadeia(bruto: string | undefined): Provedor[] {
  const itens = (bruto ?? '')
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0);

  const lista = itens.length > 0 ? itens : [CADEIA_PADRAO];

  return lista.map((item) => {
    const corte = item.indexOf(':');
    if (corte < 0) return { nome: 'gemini', modelo: item };
    return { nome: item.slice(0, corte).trim(), modelo: item.slice(corte + 1).trim() };
  });
}

export function presetDe(provedor: Provedor): Preset | undefined {
  return PRESETS[provedor.nome];
}

/**
 * Um elo sem chave não é erro de configuração: é elo que ainda não foi ligado.
 * Ele sai da cadeia em silêncio, para que ter "gemini,mistral" configurado com
 * só a chave do Gemini continue funcionando.
 */
export function cadeiaUtilizavel(
  cadeia: readonly Provedor[],
  lerEnv: (nome: string) => string | undefined,
): Provedor[] {
  return cadeia.filter((p) => {
    const preset = PRESETS[p.nome];
    if (!preset || p.modelo.length === 0) return false;
    return (lerEnv(preset.chaveEnv) ?? '').length > 0;
  });
}

export function urlDe(provedor: Provedor, lerEnv: (nome: string) => string | undefined): string {
  const preset = PRESETS[provedor.nome];
  const sobrescrita = lerEnv(`${provedor.nome.toUpperCase()}_URL`);
  const base = sobrescrita && sobrescrita.length > 0 ? sobrescrita : preset.url;

  if (preset.dialeto !== 'gemini') return base;
  return `${base}/models/${provedor.modelo}:generateContent`;
}

export function corpoDaChamada(
  provedor: Provedor,
  instrucoes: string,
  texto: string,
  schemaGemini: unknown,
  maxTokens: number,
): string {
  if (PRESETS[provedor.nome].dialeto === 'gemini') {
    return JSON.stringify({
      systemInstruction: { parts: [{ text: instrucoes }] },
      contents: [{ role: 'user', parts: [{ text: texto }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: schemaGemini,
        maxOutputTokens: maxTokens,
      },
    });
  }

  // json_object e não json_schema: o schema estrito ainda não é aceito por
  // todos os provedores compatíveis, e recusar a chamada por isso derrubaria
  // justamente a alternativa que existe para quando o Gemini está fora. O
  // formato exigido está descrito nas instruções, e lerExtracao valida o que
  // volta — a garantia mais fraca aqui é coberta lá.
  return JSON.stringify({
    model: provedor.modelo,
    temperature: 0,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: instrucoes },
      { role: 'user', content: texto },
    ],
  });
}

export function cabecalhos(provedor: Provedor, chave: string): Record<string, string> {
  const comum = { 'content-type': 'application/json' };
  if (PRESETS[provedor.nome].dialeto === 'gemini') {
    return { ...comum, 'x-goog-api-key': chave };
  }
  return { ...comum, authorization: `Bearer ${chave}` };
}

export interface RespostaLida {
  readonly conteudo: string | null;
  /** O modelo parou por limite de tokens, não porque terminou. */
  readonly truncou: boolean;
  readonly motivoDaParada: string;
}

/** Normaliza os dois envelopes num formato só, para o chamador não se importar. */
export function lerResposta(provedor: Provedor, json: unknown): RespostaLida {
  if (PRESETS[provedor.nome].dialeto === 'gemini') {
    const candidato = (
      json as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      }
    )?.candidates?.[0];
    return {
      conteudo: candidato?.content?.parts?.[0]?.text ?? null,
      truncou: candidato?.finishReason === 'MAX_TOKENS',
      motivoDaParada: candidato?.finishReason ?? 'desconhecido',
    };
  }

  const escolha = (
    json as { choices?: { message?: { content?: string }; finish_reason?: string }[] }
  )?.choices?.[0];
  return {
    conteudo: escolha?.message?.content ?? null,
    truncou: escolha?.finish_reason === 'length',
    motivoDaParada: escolha?.finish_reason ?? 'desconhecido',
  };
}
