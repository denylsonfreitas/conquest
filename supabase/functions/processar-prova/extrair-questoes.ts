import { garantirSemMarcaDagua } from './marca-dagua.ts';

export interface QuestaoBruta {
  numero: number;
  materia: string | null;
  enunciado: string;
  alternativas: { letra: string; texto: string }[];
  gabarito: string | null;
  tipo: 'multipla_escolha' | 'certo_errado';
  tem_imagem: boolean;
  incerto: boolean;
}

export class LlmError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'LlmError';
  }
}

const MODELO_PADRAO = 'gemini-flash-latest';

const SCHEMA_RESPOSTA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      numero: { type: 'INTEGER' },
      materia: { type: 'STRING', nullable: true },
      enunciado: { type: 'STRING' },
      alternativas: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { letra: { type: 'STRING' }, texto: { type: 'STRING' } },
          required: ['letra', 'texto'],
        },
      },
      gabarito: { type: 'STRING', nullable: true },
      tipo: { type: 'STRING', enum: ['multipla_escolha', 'certo_errado'] },
      tem_imagem: { type: 'BOOLEAN' },
      incerto: { type: 'BOOLEAN' },
    },
    required: ['numero', 'enunciado', 'alternativas', 'tipo', 'tem_imagem', 'incerto'],
  },
} as const;

const INSTRUCOES = `
Você extrai questões de provas de concurso público brasileiras a partir do texto
bruto de um PDF. Devolva SOMENTE o array JSON no schema fornecido.

REGRAS INEGOCIÁVEIS

1. NÃO INVENTE. Transcreva o que está no texto. Se um enunciado ou alternativa
   estiver truncado ou ilegível, transcreva o que dá e marque "incerto": true.
   Nunca complete, reescreva ou "melhore" o conteúdo. Uma questão inventada é
   pior que uma questão faltando.

2. NUMERAÇÃO. O número da questão aparece sozinho numa linha, antes do
   enunciado. Use exatamente esse número em "numero" — ele é a chave que casa a
   questão com o gabarito.

3. MATÉRIA VEM DO CABEÇALHO DE SEÇÃO, NÃO DE PALPITE. O texto traz cabeçalhos
   como "Língua Portuguesa", "Raciocínio Lógico Matemático", "Atualidades",
   "Conhecimentos Específicos". Toda questão pertence ao último cabeçalho que
   apareceu antes dela. Copie esse cabeçalho em "materia", exatamente como
   está escrito.
   - O cabeçalho pode estar quebrado em duas linhas (ex.: "Legislação Acerca de
     Segurança da" / "Informação e Proteção de Dados"). Remonte antes de usar.
   - Só use palpite próprio se NÃO houver nenhum cabeçalho de seção no texto.
     Nesse caso, marque "incerto": true.

4. ALTERNATIVAS. Vêm como "(A) texto", "(B) texto"... Preserve a ordem e a
   letra. Se uma questão tiver menos de 2 alternativas, ainda assim devolva o
   que encontrou e marque "incerto": true.

5. TIPO. "multipla_escolha" quando há opções A–E. "certo_errado" no estilo
   Cebraspe, em que a questão é uma afirmação a julgar; nesse caso as
   alternativas são [{"letra":"C","texto":"Certo"},{"letra":"E","texto":"Errado"}].

6. DEPENDÊNCIA DE IMAGEM. Marque "tem_imagem": true quando o enunciado se apoia
   em algo visual que não está no texto: "observe a figura", "com base no
   gráfico", "a imagem acima", mapa, diagrama, tabela apresentada como imagem.
   A extração é só de texto, então essas questões chegam incompletas e a flag é
   o que faz a revisão pegá-las.

7. GABARITO. Só preencha "gabarito" se a resposta correta estiver EXPLÍCITA no
   próprio texto da prova. Se o gabarito vier em documento separado, deixe
   null — ele será casado depois. Nunca deduza a resposta.

8. IGNORE tudo que não é questão: capa, instruções ao candidato, cabeçalho e
   rodapé de página, numeração de página, avisos sobre cartão de respostas.
`.trim();

export async function extrairQuestoes(texto: string): Promise<QuestaoBruta[]> {
  garantirSemMarcaDagua(texto);

  const chave = Deno.env.get('GEMINI_API_KEY');
  if (!chave) throw new LlmError('GEMINI_API_KEY não configurada na Edge Function.');

  const modelo = Deno.env.get('GEMINI_MODELO') ?? MODELO_PADRAO;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCOES }] },
      contents: [{ role: 'user', parts: [{ text: texto }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_RESPOSTA,
        maxOutputTokens: 65536,
      },
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new LlmError(`Gemini respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
  }

  const json = await resposta.json();
  const candidato = json?.candidates?.[0];

  if (candidato?.finishReason === 'MAX_TOKENS') {
    throw new LlmError(
      'A resposta do modelo foi truncada por limite de tokens. A prova pode precisar ser processada em partes.',
    );
  }

  const conteudo = candidato?.content?.parts?.[0]?.text;
  if (!conteudo) {
    throw new LlmError(`O modelo não retornou conteúdo (finishReason: ${candidato?.finishReason}).`);
  }

  let questoes: unknown;
  try {
    questoes = JSON.parse(conteudo);
  } catch {
    throw new LlmError('A extração não retornou JSON válido.');
  }

  if (!Array.isArray(questoes)) throw new LlmError('A extração não retornou uma lista de questões.');
  return questoes as QuestaoBruta[];
}
