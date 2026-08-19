import { aplicarRecuoDeCodigo } from './recuo-de-codigo';

const TOLERANCIA_Y = 2;
const MIN_LINHAS_DO_BLOCO = 3;
const MIN_CARACTERES_MEDIANOS = 8;
const FATOR_DE_QUEBRA = 1.6;

interface ItemPdf {
  str: string;
  width: number;
  transform: number[];
  fontName: string;
}

interface LinhaGeometrica {
  y: number;
  itens: ItemPdf[];
}

const fimDe = (it: ItemPdf) => it.transform[4] + it.width;
const conteudo = (l: LinhaGeometrica) =>
  l.itens
    .map((i) => i.str)
    .join('')
    .trim();

/**
 * Extrai o texto do PDF e devolve o recuo aos blocos de código.
 *
 * O texto continua vindo do extractText, e não da geometria: é dele que
 * dependem o casamento do gabarito e a extração das questões, e reconstruir a
 * página inteira quebrou os dois quando foi medido. A geometria entra só onde
 * o extractText joga fora informação que existe no arquivo — o recuo à esquerda
 * dentro de código, que em Python é semântica e nas demais linguagens é leitura.
 */
export async function extrairTextoPdf(arquivo: Blob): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');

  const documento = await getDocumentProxy(new Uint8Array(await arquivo.arrayBuffer()));
  const { text } = await extractText(documento, { mergePages: false });
  const linhas = (Array.isArray(text) ? text : [text]).join('\n').split('\n');

  const blocos = await blocosDeCodigo(documento);
  return aplicarRecuoDeCodigo(linhas, blocos).join('\n');
}

// Bloco de código é identificado pela fonte, não por palpite: o pdf.js informa
// fontFamily 'monospace', e a prova usa uma fonte só para código.
interface DocumentoPdf {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{
      items: unknown[];
      styles?: Record<string, { fontFamily?: string }>;
    }>;
  }>;
}

// items traz texto e marcação misturados; só o texto tem posição e fonte.
function ehItemDeTexto(item: unknown): item is ItemPdf {
  const i = item as Partial<ItemPdf>;
  return typeof i?.str === 'string' && Array.isArray(i.transform) && typeof i.width === 'number';
}

async function blocosDeCodigo(documento: DocumentoPdf): Promise<string[][]> {
  const blocos: LinhaGeometrica[][] = [];

  for (let p = 1; p <= documento.numPages; p++) {
    const pagina = await documento.getPage(p);
    const conteudoPagina = await pagina.getTextContent();

    const mono = conteudoPagina.items
      .filter(ehItemDeTexto)
      .filter(
        (i) =>
          i.str.trim() !== '' && conteudoPagina.styles?.[i.fontName]?.fontFamily === 'monospace',
      );
    if (mono.length === 0) continue;

    blocos.push(...corridas(agruparPorAltura(mono)));
  }

  return blocos.filter(substancial).map(comRecuo);
}

function agruparPorAltura(itens: readonly ItemPdf[]): LinhaGeometrica[] {
  const linhas: LinhaGeometrica[] = [];

  for (const it of itens) {
    const alvo = linhas.find((l) => Math.abs(l.y - it.transform[5]) <= TOLERANCIA_Y);
    if (alvo) alvo.itens.push(it);
    else linhas.push({ y: it.transform[5], itens: [it] });
  }

  for (const l of linhas) l.itens.sort((a, b) => a.transform[4] - b.transform[4]);
  return linhas.sort((a, b) => b.y - a.y);
}

// Um bloco é uma sequência de linhas com espaçamento vertical regular. O que
// interrompe a corrida é um salto — voltar para a prosa, ou mudar de página.
function corridas(linhas: readonly LinhaGeometrica[]): LinhaGeometrica[][] {
  if (linhas.length === 0) return [];

  const distancias: number[] = [];
  for (let i = 1; i < linhas.length; i++) distancias.push(linhas[i - 1].y - linhas[i].y);
  distancias.sort((a, b) => a - b);
  const passo = distancias[Math.floor(distancias.length / 2)] ?? 12;

  const blocos: LinhaGeometrica[][] = [];
  let atual: LinhaGeometrica[] = [linhas[0]];

  const fechar = () => {
    if (atual.length >= MIN_LINHAS_DO_BLOCO) blocos.push(atual);
  };

  for (let i = 1; i < linhas.length; i++) {
    if (linhas[i - 1].y - linhas[i].y <= passo * FATOR_DE_QUEBRA) atual.push(linhas[i]);
    else {
      fechar();
      atual = [linhas[i]];
    }
  }
  fechar();

  return blocos;
}

// A coluna com o número das questões também sai em monoespaçada e também forma
// corrida — mas de linhas com um ou dois caracteres. Código tem dezenas.
function substancial(linhas: readonly LinhaGeometrica[]): boolean {
  const tamanhos = linhas.map((l) => conteudo(l).length).sort((a, b) => a - b);
  return tamanhos[Math.floor(tamanhos.length / 2)] >= MIN_CARACTERES_MEDIANOS;
}

function comRecuo(linhas: readonly LinhaGeometrica[]): string[] {
  const primeiro = linhas[0].itens[0];
  const largura = primeiro.width / primeiro.str.length;
  const margem = Math.min(...linhas.map((l) => l.itens[0].transform[4]));

  return linhas.map((linha) => {
    const recuo = Math.max(0, Math.round((linha.itens[0].transform[4] - margem) / largura));

    let texto = ' '.repeat(recuo);
    let anterior: number | null = null;

    for (const it of linha.itens) {
      if (anterior !== null) {
        texto += ' '.repeat(Math.max(0, Math.round((it.transform[4] - anterior) / largura)));
      }
      texto += it.str;
      anterior = fimDe(it);
    }

    return texto.replace(/\s+$/, '');
  });
}
