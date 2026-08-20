import { fatiarProva, Lote } from './fatiar-prova.ts';
import { juntarLotes } from './juntar-lotes.ts';
import { garantirSemMarcaDagua } from './marca-dagua.ts';
import { motivoDaFalha } from './motivo-da-falha.ts';
import {
  cabeOutraTentativa,
  esperaAntesDeRepetir,
  MAX_TENTATIVAS_POR_MODELO,
  valeRepetirMesmoModelo,
  valeTentarOutroElo,
} from './modelos.ts';
import {
  cabecalhos,
  cadeiaUtilizavel,
  corpoDaChamada,
  lerCadeia,
  lerResposta,
  presetDe,
  Provedor,
  urlDe,
} from './provedores.ts';
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

// Uma prova de 70 questões devolve ~20k tokens: o JSON reescreve enunciado e
// alternativas inteiros. O teto fica bem acima disso porque estourá-lo perde a
// resposta toda, e o que não é gerado não é cobrado.
const MAX_TOKENS_SAIDA = 65_536;

// Código próprio, fora da faixa que os provedores usam: "não houve resposta"
// é diagnóstico diferente de "o serviço recusou". Antes isto virava 504 e a
// mensagem acusava sobrecarga — mandando procurar um problema que não existe.
const STATUS_SEM_RESPOSTA = 599;

// Responder 200 não é o mesmo que responder o combinado. Modelo gratuito que
// ignora response_format devolve prosa com status de sucesso; antes isso
// derrubava a extração inteira sem tentar o elo seguinte.
const STATUS_TRUNCADA = 597;
const STATUS_ILEGIVEL = 598;

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
const lerEnv = (nome: string): string | undefined => Deno.env.get(nome);

function chamarProvedor(provedor: Provedor, texto: string, prazoMs: number): Promise<Response> {
  const chave = lerEnv(presetDe(provedor)!.chaveEnv)!;

  return fetch(urlDe(provedor, lerEnv), {
    method: 'POST',
    headers: cabecalhos(provedor, chave),
    body: corpoDaChamada(provedor, INSTRUCOES, texto, SCHEMA_RESPOSTA, MAX_TOKENS_SAIDA),
    // Sem prazo, um provedor que aceita a conexão e trava consome a função
    // inteira até a plataforma matá-la — e aí o catch que grava o erro nunca
    // roda, deixando a prova presa em "processando" para sempre. O prazo é o
    // que resta do orçamento: assim o fim é sempre nosso, com erro gravado.
    signal: AbortSignal.timeout(prazoMs),
  });
}

interface Falha {
  status: number;
  corpo: string;
  provedor: Provedor;
}

async function chamarComCadeia(texto: string): Promise<ExtracaoBruta> {
  const configurada = lerCadeia(
    lerEnv('EXTRACAO_CADEIA') ?? lerEnv('GEMINI_MODELOS') ?? lerEnv('GEMINI_MODELO'),
  );
  const cadeia = cadeiaUtilizavel(configurada, lerEnv);

  if (cadeia.length === 0) {
    throw new LlmError(
      'Nenhum provedor de extração configurado: falta a chave de API na Edge Function.',
    );
  }

  const comecou = Date.now();
  let ultimaFalha: Falha | null = null;
  let duracaoDaUltima = 0;

  for (let i = 0; i < cadeia.length; i++) {
    const provedor = cadeia[i];

    // Insistir no mesmo provedor vem ANTES de trocar: o 503 passa em segundos,
    // e com um único elo configurado esta é a única saída que existe.
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_POR_MODELO; tentativa++) {
      const restante = ORCAMENTO_MS - (Date.now() - comecou);
      if (restante <= 0) break;

      const inicioDaTentativa = Date.now();
      let status: number;
      let corpo: string;

      try {
        const resposta = await chamarProvedor(provedor, texto, restante);

        if (resposta.ok) {
          const util = lerExtracaoUtilizavel(provedor, await resposta.json());
          if ('extracao' in util) return util.extracao;
          // Respondeu, mas não serve: conta como falha DESTE elo para que o
          // seguinte tenha sua chance, em vez de encerrar tudo.
          status = util.status;
          corpo = util.motivo;
        } else {
          status = resposta.status;
          corpo = await resposta.text();
        }
      } catch (e) {
        // Só prazo e rede viram falha do elo. Qualquer outra exceção é bug
        // NOSSO, e disfarçá-la de indisponibilidade esconderia a causa: o
        // erro sobe com o que realmente aconteceu.
        if (!ehFalhaDeRede(e)) {
          const causa = e instanceof Error ? e.message : String(e);
          throw new LlmError(`Falha inesperada ao chamar ${provedor.nome}: ${causa}`);
        }
        status = STATUS_SEM_RESPOSTA;
        corpo = e instanceof Error ? e.name : '';
      }

      duracaoDaUltima = Date.now() - inicioDaTentativa;
      ultimaFalha = { status, corpo, provedor };

      if (tentativa === MAX_TENTATIVAS_POR_MODELO) break;
      if (!valeRepetirMesmoModelo(status)) break;

      // A espera entra na conta do orçamento: dormir 10s e só depois descobrir
      // que não havia tempo para a chamada desperdiça o que restava.
      const espera = esperaAntesDeRepetir(tentativa);
      if (!cabeOutraTentativa(Date.now() - comecou, ORCAMENTO_MS, espera + duracaoDaUltima)) {
        break;
      }

      await dormir(espera);
    }

    if (i === cadeia.length - 1) break;

    // Quem é o próximo importa: cota e chave recusada são do provedor, então
    // só valem parada quando o elo seguinte usaria a MESMA chave.
    const proximoEhOutroProvedor = cadeia[i + 1].nome !== provedor.nome;
    if (!valeTentarOutroElo(ultimaFalha!.status, proximoEhOutroProvedor)) break;
    if (!cabeOutraTentativa(Date.now() - comecou, ORCAMENTO_MS, duracaoDaUltima)) break;
  }

  const falha = ultimaFalha as Falha;
  const qual = `${falha.provedor.nome}:${falha.provedor.modelo}`;

  // A cadeia efetiva vai no recado. Chave configurada sem o elo correspondente
  // em EXTRACAO_CADEIA falharia calada — a mensagem diria "cota esgotada" sem
  // deixar ver que a alternativa nunca chegou a ser tentada.
  const tentados = cadeia.map((p) => `${p.nome}:${p.modelo}`).join(', ');
  const cadeiaUsada =
    cadeia.length > 1 ? ` Cadeia em uso: ${tentados}.` : ` Único elo configurado: ${tentados}.`;

  throw new LlmError(motivoDaFalha(falha.status, falha.corpo, qual) + cadeiaUsada);
}

// setTimeout e não um laço ocupado: a Edge Function cobra CPU, e esperar
// congestão passar não deve consumir nada.
// Prazo estourado (TimeoutError), aborto e queda de conexão. É a fronteira
// entre "o outro lado não respondeu" e "o nosso código quebrou".
function ehFalhaDeRede(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
  return e.name === 'TypeError' && /fetch|network|conn/i.test(e.message);
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/**
 * Uma resposta só serve se der para ler dela as questões. Truncada, vazia ou
 * fora do formato combinado são desfechos diferentes com a mesma consequência:
 * este elo não entregou, e o próximo merece a chance. Devolver o motivo em vez
 * de lançar é o que permite isso.
 */
type Utilizavel = { extracao: ExtracaoBruta } | { status: number; motivo: string };

function lerExtracaoUtilizavel(provedor: Provedor, json: unknown): Utilizavel {
  const resposta = lerResposta(provedor, json);

  if (resposta.truncou) {
    return { status: STATUS_TRUNCADA, motivo: `parada em ${resposta.motivoDaParada}` };
  }
  if (!resposta.conteudo) {
    return { status: STATUS_ILEGIVEL, motivo: `sem conteúdo (${resposta.motivoDaParada})` };
  }

  try {
    return { extracao: lerExtracao(JSON.parse(resposta.conteudo)) };
  } catch {
    return { status: STATUS_ILEGIVEL, motivo: 'a resposta não veio no JSON combinado' };
  }
}

// Vinte questões devolvem ~4k tokens de resposta. Nas velocidades medidas dos
// modelos gratuitos (38 a 133 tokens/s), isso cabe nos ~110s de orçamento; a
// prova inteira, que pede ~20k, não cabe em nenhum deles.
const QUESTOES_POR_LOTE = 20;

// Linha em branco entre as partes: o cabeçalho do lote precisa se ler como
// instrução separada, não como parte do texto da prova.
const SEPARADOR = '\n\n';

/**
 * Cada lote é uma extração independente, e elas vão em PARALELO.
 *
 * Em série a soma estouraria o orçamento da função; em paralelo o relógio é o
 * do lote mais lento. É isso que faz a prova caber — não o fatiamento sozinho.
 */
export async function extrairQuestoes(texto: string): Promise<ExtracaoBruta> {
  garantirSemMarcaDagua(texto);

  const lotes = fatiarProva(texto, QUESTOES_POR_LOTE);
  if (lotes.length === 0) return chamarComCadeia(texto);

  const resultados = await Promise.allSettled(
    lotes.map((lote) => chamarComCadeia(textoDoLote(lote))),
  );

  const extraidos: ExtracaoBruta[] = [];
  const avisos: string[] = [];

  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      extraidos.push(r.value);
      return;
    }
    const motivo = r.reason instanceof Error ? r.reason.message : String(r.reason);
    avisos.push(
      `Questões ${lotes[i].primeira} a ${lotes[i].ultima} não foram extraídas: ${motivo}`,
    );
  });

  // Todos falharam: não há prova nenhuma para salvar, então o erro sobe.
  if (extraidos.length === 0) throw new LlmError(avisos.join(' '));

  // Alguns falharam: o resto vale. Perder 50 questões porque 20 não vieram
  // seria jogar fora trabalho bom — mas o que faltou vai dito no aviso.
  const junta = juntarLotes(extraidos);
  return avisos.length > 0 ? { ...junta, avisos } : junta;
}

/**
 * O lote não sabe que é um lote. Este cabeçalho é o que evita dois estragos:
 * o modelo transcrever questões vizinhas que outro lote também vai transcrever,
 * e a matéria sumir porque o cabeçalho de seção ficou no lote anterior.
 *
 * As seções vão como CANDIDATAS, nunca como resposta: a lista mistura
 * "LÍNGUA PORTUGUESA" com "BANCO DO BRASIL" e "RASCUNHO", e escolher por conta
 * própria plantaria matéria errada em silêncio.
 */
function textoDoLote(lote: Lote): string {
  const partes = [
    `Esta é uma PARTE de uma prova maior. Extraia SOMENTE as questões de número ${lote.primeira} a ${lote.ultima}. Ignore questões fora dessa faixa, mesmo que apareçam no texto.`,
  ];

  if (lote.secoesAnteriores.length > 0) {
    partes.push(
      `Se nenhuma questão desta parte for precedida por um cabeçalho de seção, a matéria pode ser um destes, que apareceram antes desta parte: ${lote.secoesAnteriores.join(' | ')}. Vários deles NÃO são matérias (nome do banco, "RASCUNHO", título do cargo) — use só o que for disciplina, e na dúvida marque "incerto": true.`,
    );
  }

  const cabecalho = partes.join(SEPARADOR);
  return [cabecalho, '---', lote.texto].join(SEPARADOR);
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
