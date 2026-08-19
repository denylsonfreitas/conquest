import { garantirSemMarcaDagua } from './marca-dagua.ts';
import { motivoDaFalha } from './motivo-da-falha.ts';
import { cabeOutraTentativa, modelosConfigurados, valeTentarOutroModelo } from './modelos.ts';
import { ExtracaoBruta, QuestaoBruta, TextoBaseBruto } from './questao-bruta.ts';

export type { ExtracaoBruta, QuestaoBruta, TextoBaseBruto };

export class LlmError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'LlmError';
  }
}

// Teto conservador: a Edge Function tem limite de tempo e a extração de uma
// prova inteira já come boa parte dele. Uma segunda tentativa só começa se
// couber — senão troca um erro explicável por um estouro de tempo.
const ORCAMENTO_MS = 110_000;

// A resposta deixou de ser um array de questões e virou um objeto com dois:
// o texto-base sai UMA vez e as questões apontam para ele. Repeti-lo dentro de
// cada questão custaria alguns milhares de tokens por prova e abriria espaço
// para o modelo transcrevê-lo diferente a cada repetição.
const SCHEMA_RESPOSTA = {
  type: 'OBJECT',
  properties: {
    textos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id_local: { type: 'STRING' },
          titulo: { type: 'STRING', nullable: true },
          conteudo: { type: 'STRING' },
          fonte: { type: 'STRING', nullable: true },
        },
        required: ['id_local', 'conteudo'],
      },
    },
    questoes: {
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
          tem_texto_base: { type: 'BOOLEAN' },
          texto_base: { type: 'STRING', nullable: true },
        },
        required: [
          'numero',
          'enunciado',
          'alternativas',
          'tipo',
          'tem_imagem',
          'incerto',
          'tem_texto_base',
        ],
      },
    },
  },
  required: ['textos', 'questoes'],
} as const;

const INSTRUCOES = `
Você extrai questões de provas de concurso público brasileiras a partir do texto
bruto de um PDF. Devolva SOMENTE o objeto JSON no schema fornecido, com as duas
listas: "textos" e "questoes".

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
   - Quando a alternativa é uma FIGURA (aparece só "(A)", "(B)"... sem texto,
     porque a opção é um desenho, gráfico ou diagrama), devolva a letra com
     "texto": "" e marque "tem_imagem": true. Nunca descreva a figura nem
     invente um texto para ela — a revisão anexa a imagem depois.

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

8b. TEXTO-BASE. Prova costuma trazer um texto longo que serve a VÁRIAS questões
    — um em português, outro em inglês, às vezes mais. Coloque cada um em
    "textos", com um "id_local" que você escolhe ("t1", "t2"...), o título
    quando houver, o conteúdo transcrito e a fonte (a linha de "Disponível em",
    "Adaptado", ou a assinatura do autor).

    Nas questões que dependem dele, marque "tem_texto_base": true e ponha o
    id_local em "texto_base".

    - O texto NÃO vem rotulado. Não espere "TEXTO I" nem "Leia o texto": ele
      costuma começar por um título e terminar na fonte.
    - A ORDEM ENGANA. Por causa do layout em colunas, o texto pode aparecer
      DEPOIS das questões que o usam, e não antes. Decida pelo conteúdo — se a
      questão fala em "o texto", "o autor", "(parágrafo 2)", ela depende de um.
    - Se você tem certeza de que a questão depende de um texto mas NÃO consegue
      dizer qual, marque "tem_texto_base": true e deixe "texto_base": null. É
      melhor do que apontar para o texto errado: quem revisa corrige o vínculo,
      mas não descobre um vínculo que você não sinalizou.
    - Não invente texto que não está no PDF, e não transforme o enunciado de uma
      questão em texto-base.
    - Questão que se resolve sozinha NÃO tem texto-base. Não marque por via das
      dúvidas.

9. QUEBRAS DE LINHA SÃO CONTEÚDO. Preserve com "\\n" as quebras que carregam
   sentido: cada linha de um trecho de código, cada item de uma lista, cada
   verso. Nunca junte tudo num parágrafo só — em código, a quebra é sintaxe.

9b. CÓDIGO VEM CERCADO. Todo trecho de código, comando SQL ou saída de console
    dentro do enunciado vai entre linhas com três crases, com a linguagem na
    cerca de abertura quando der para saber:

      A seguir, um fragmento em Java.
      \`\`\`java
      public class Main {
            public static void main(String[] args) {
            }
      }
      \`\`\`
      O que será exibido?

    A cerca fica sozinha na linha, sem texto ao lado. É ela que faz o app
    exibir o trecho em fonte monoespaçada, separado da prosa.

    O recuo que chegar no texto é o do PDF, reconstruído das coordenadas do
    arquivo. COPIE-O como está, espaço por espaço. Não reindente, não alinhe e
    não normalize: em Python o recuo é semântica, e mexer nele muda o que o
    código faz. Linha que chegar sem recuo não tinha recuo.

10. TABELAS. Reproduza uma linha por linha da tabela, separando as células com
    " | ", inclusive a linha de cabeçalho. Célula vazia vira "-". Assim:

      nome | menorIdade | maiorIdade
      Jovens | - | 19
      Adultos | 20 | 59

    Sem o separador, "Jovens 19" e "Adultos 20 59" ficam impossíveis de ler.
    Se a tabela for uma IMAGEM (não há texto algum para transcrever), aí sim
    marque "tem_imagem": true e siga a regra 6.
`.trim();

// Uma sobrecarga é do MODELO, não da conta: o próprio Gemini responde "this
// model is currently experiencing high demand". A saída mais barata é o modelo
// seguinte da cadeia — mesma chave, mesma API, mesmo responseSchema.
async function chamarComCadeiaDeModelos(chave: string, texto: string): Promise<Response> {
  const modelos = modelosConfigurados(
    Deno.env.get('GEMINI_MODELOS') ?? Deno.env.get('GEMINI_MODELO'),
  );
  const comecou = Date.now();
  let ultimaFalha: { status: number; corpo: string } | null = null;

  for (let i = 0; i < modelos.length; i++) {
    const inicioDaTentativa = Date.now();
    const resposta = await chamarModelo(modelos[i], chave, texto);
    if (resposta.ok) return resposta;

    const duracao = Date.now() - inicioDaTentativa;
    ultimaFalha = { status: resposta.status, corpo: await resposta.text() };

    if (i === modelos.length - 1) break;
    if (!valeTentarOutroModelo(resposta.status)) break;
    if (!cabeOutraTentativa(Date.now() - comecou, ORCAMENTO_MS, duracao)) break;
  }

  const falha = ultimaFalha as { status: number; corpo: string };
  throw new LlmError(motivoDaFalha(falha.status, falha.corpo));
}

function chamarModelo(modelo: string, chave: string, texto: string): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

  return fetch(url, {
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
}

export async function extrairQuestoes(texto: string): Promise<ExtracaoBruta> {
  garantirSemMarcaDagua(texto);

  const chave = Deno.env.get('GEMINI_API_KEY');
  if (!chave) throw new LlmError('GEMINI_API_KEY não configurada na Edge Function.');

  const resposta = await chamarComCadeiaDeModelos(chave, texto);

  const json = await resposta.json();
  const candidato = json?.candidates?.[0];

  if (candidato?.finishReason === 'MAX_TOKENS') {
    throw new LlmError(
      'A resposta do modelo foi truncada por limite de tokens. A prova pode precisar ser processada em partes.',
    );
  }

  const conteudo = candidato?.content?.parts?.[0]?.text;
  if (!conteudo) {
    throw new LlmError(
      `O modelo não retornou conteúdo (finishReason: ${candidato?.finishReason}).`,
    );
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(conteudo);
  } catch {
    throw new LlmError('A extração não retornou JSON válido.');
  }

  return lerExtracao(corpo);
}

// Aceita o formato antigo (array de questões) além do novo, para que uma
// resposta sem textos continue valendo — o modelo às vezes devolve só a lista.
export function lerExtracao(corpo: unknown): ExtracaoBruta {
  if (Array.isArray(corpo)) return { textos: [], questoes: corpo as QuestaoBruta[] };

  const objeto = corpo as { textos?: unknown; questoes?: unknown } | null;
  if (!objeto || !Array.isArray(objeto.questoes)) {
    throw new LlmError('A extração não retornou uma lista de questões.');
  }

  return {
    textos: Array.isArray(objeto.textos) ? (objeto.textos as TextoBaseBruto[]) : [],
    questoes: objeto.questoes as QuestaoBruta[],
  };
}
