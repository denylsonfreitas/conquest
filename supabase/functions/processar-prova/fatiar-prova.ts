/**
 * Corta a prova em lotes de questões, para que cada chamada ao modelo peça uma
 * saída pequena.
 *
 * O motivo é tempo, não cota: uma prova inteira pede ~20k tokens de resposta, e
 * nas velocidades reais dos modelos isso passa dos ~110s de orçamento da função
 * — inclusive nos mais rápidos. Em lotes de ~20 questões cada resposta fica em
 * torno de 5k tokens, que cabe com folga e ainda permite chamar os lotes em
 * paralelo, fazendo o relógio ser o do lote mais lento em vez da soma.
 */

/** Linha que é só um número: candidata a número de questão — ou de página. */
interface Candidato {
  readonly linha: number;
  readonly numero: number;
}

function candidatos(linhas: readonly string[]): Candidato[] {
  const achados: Candidato[] = [];
  linhas.forEach((linha, i) => {
    const limpo = linha.trim();
    if (/^\d{1,3}$/.test(limpo)) achados.push({ linha: i, numero: Number(limpo) });
  });
  return achados;
}

/**
 * A maior subsequência crescente entre as linhas que são só um número.
 *
 * Numeração de página também aparece sozinha numa linha e também começa em 1,
 * então não dá para separar por formato. O que separa é o comprimento: numa
 * prova de 70 questões em 27 páginas, a sequência das questões é a maior. Blocos
 * de código e listas numeradas entram como candidatos e saem por aqui também.
 */
export function numerosDeQuestao(linhas: readonly string[]): Candidato[] {
  const cands = candidatos(linhas);
  if (cands.length === 0) return [];

  const tamanho = new Array<number>(cands.length).fill(1);
  const anterior = new Array<number>(cands.length).fill(-1);
  let melhorFim = 0;

  for (let i = 0; i < cands.length; i++) {
    for (let j = 0; j < i; j++) {
      if (cands[j].numero < cands[i].numero && tamanho[j] + 1 > tamanho[i]) {
        tamanho[i] = tamanho[j] + 1;
        anterior[i] = j;
      }
    }
    if (tamanho[i] > tamanho[melhorFim]) melhorFim = i;
  }

  const sequencia: Candidato[] = [];
  for (let i = melhorFim; i >= 0; i = anterior[i]) sequencia.unshift(cands[i]);
  return sequencia;
}

/**
 * A sequência encontrada é mesmo a numeração das questões?
 *
 * Densidade alta e começo perto de 1 é o que distingue "achei as questões" de
 * "achei uma coincidência de números crescentes". Reprovar aqui não é falha: o
 * chamador manda a prova inteira, como antes.
 */
export function pareceNumeracaoDeProva(sequencia: readonly Candidato[]): boolean {
  if (sequencia.length < 10) return false;

  const primeiro = sequencia[0].numero;
  const ultimo = sequencia[sequencia.length - 1].numero;
  if (primeiro > 5) return false;

  const densidade = sequencia.length / (ultimo - primeiro + 1);
  return densidade >= 0.8;
}

export interface Lote {
  readonly primeira: number;
  readonly ultima: number;
  readonly texto: string;
  /**
   * Linhas que parecem cabeçalho de seção e aparecem ANTES deste lote. São
   * candidatas, não respostas: a lista traz "LÍNGUA PORTUGUESA" junto de "BANCO
   * DO BRASIL" e "RASCUNHO", e escolher entre elas por conta própria plantaria
   * matéria errada em silêncio. Quem decide é o modelo, que sabe distinguir
   * disciplina de nome de banco — e marca incerto quando não souber.
   */
  readonly secoesAnteriores: readonly string[];
}

const RUIM_PARA_CABECALHO = /[.;:,?!]$/;

function ehCandidatoASecao(linha: string): boolean {
  const t = linha.trim();
  if (t.length < 3 || t.length > 60) return false;
  if (/^\d+$/.test(t)) return false;
  if (/^\([A-E]\)/.test(t)) return false;
  if (RUIM_PARA_CABECALHO.test(t)) return false;

  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letras.length < 3) return false;

  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, '').length;
  return maiusculas / letras.length > 0.7;
}

/**
 * Divide o texto em lotes de no máximo `porLote` questões.
 *
 * Cortes só acontecem em fronteiras detectadas. Uma questão cujo número não foi
 * reconhecido não some: ela fica no lote da questão anterior, que é maior. Isso
 * é de propósito — perder conteúdo seria pior que um lote desigual.
 *
 * Devolve lista vazia quando não dá para cortar com confiança; aí o chamador
 * segue mandando a prova inteira.
 */
export function fatiarProva(texto: string, porLote: number): Lote[] {
  const linhas = texto.split('\n');
  const sequencia = numerosDeQuestao(linhas);

  if (!pareceNumeracaoDeProva(sequencia) || sequencia.length <= porLote) return [];

  const lotes: Lote[] = [];

  for (let i = 0; i < sequencia.length; i += porLote) {
    const doLote = sequencia.slice(i, i + porLote);
    const proximo = sequencia[i + porLote];

    // O primeiro lote leva tudo o que vem antes da questão 1: capa, instruções
    // e, principalmente, texto-base que apareça antes das questões.
    const inicio = i === 0 ? 0 : doLote[0].linha;
    const fim = proximo ? proximo.linha : linhas.length;

    lotes.push({
      primeira: doLote[0].numero,
      ultima: doLote[doLote.length - 1].numero,
      texto: linhas.slice(inicio, fim).join('\n'),
      secoesAnteriores: [...new Set(linhas.slice(0, inicio).filter(ehCandidatoASecao))].map((l) =>
        l.trim(),
      ),
    });
  }

  return lotes;
}

/**
 * Teto de tokens de saída para um pedido de `questoes` questões.
 *
 * O teto existia dimensionado para a prova inteira e continuou o mesmo depois do
 * fatiamento — treze vezes maior que o necessário. Modelo sem JSON estrito
 * enche o espaço que recebe: com 65k liberados e 69 tokens/s, divagar até o fim
 * levaria quinze minutos, e o prazo estoura muito antes.
 *
 * ~400 tokens por questão em JSON (enunciado, cinco alternativas, metadados),
 * com três vezes de folga para questão longa com bloco de código.
 */
export function tetoDeSaida(questoes: number): number {
  return Math.max(4_000, questoes * 1_200);
}
