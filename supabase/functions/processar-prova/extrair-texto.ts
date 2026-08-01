import { extractText, getDocumentProxy } from 'unpdf';

import { garantirSemMarcaDagua, removerMarcaDagua } from './marca-dagua.ts';

/**
 * PDF → texto limpo.
 *
 * Deliberadamente burro: só obtém o texto, sem tentar entender estrutura. A
 * inteligência fica no LLM (docs/02). Tentar parsear questões aqui com regex
 * seria frágil a cada layout novo de banca.
 *
 * A limpeza da marca d'água acontece AQUI, no ponto mais próximo da extração,
 * para que nenhum caminho posterior consiga esquecer dela.
 */

/** Abaixo disto o PDF quase certamente é imagem escaneada, não texto. */
const MINIMO_PLAUSIVEL = 200;

export class PdfEscaneadoError extends Error {
  constructor(caracteres: number) {
    super(
      `O PDF parece escaneado: a extração encontrou apenas ${caracteres} caracteres de texto. ` +
        'OCR ainda não é suportado.',
    );
    this.name = 'PdfEscaneadoError';
  }
}

export interface TextoExtraido {
  readonly texto: string;
  readonly paginas: number;
}

export async function extrairTexto(pdf: ArrayBuffer): Promise<TextoExtraido> {
  const documento = await getDocumentProxy(new Uint8Array(pdf));
  const { totalPages, text } = await extractText(documento, { mergePages: false });

  const paginas = Array.isArray(text) ? text : [text];
  const bruto = paginas.join('\n');

  const limpo = removerMarcaDagua(bruto);

  // A checagem vem DEPOIS da limpeza: um PDF escaneado só tem a marca d'água
  // como texto, e sem limpar antes ele pareceria ter conteúdo.
  if (limpo.length < MINIMO_PLAUSIVEL) throw new PdfEscaneadoError(limpo.length);

  // Rede final antes de o texto seguir para qualquer lugar externo.
  garantirSemMarcaDagua(limpo);

  return { texto: limpo, paginas: totalPages };
}
