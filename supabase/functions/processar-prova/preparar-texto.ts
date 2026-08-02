import { garantirSemMarcaDagua, removerMarcaDagua } from './marca-dagua.ts';

/**
 * Prepara o texto recebido do cliente antes de qualquer uso.
 *
 * A extração do PDF acontece no navegador — pdf.js custa ~2,4s de CPU para
 * uma prova de 16 páginas, e o Edge Runtime corta bem antes disso. Mas a
 * LIMPEZA e a VERIFICAÇÃO ficam aqui, no servidor, de propósito:
 *
 *   - é este processo que fala com a API do LLM, então é aqui que a garantia
 *     de privacidade precisa valer;
 *   - texto vindo do cliente é entrada não confiável por princípio, mesmo num
 *     app de um usuário só.
 *
 * Ordem: remove a marca d'água → confere que sobrou conteúdo → confere que
 * nada de `pcimark` escapou. Só depois disso o texto pode ir para o LLM.
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

export function prepararTexto(bruto: string): string {
  const limpo = removerMarcaDagua(bruto);

  // A checagem vem DEPOIS da limpeza: um PDF escaneado só tem a marca d'água
  // como texto, e sem limpar antes ele pareceria ter conteúdo.
  if (limpo.length < MINIMO_PLAUSIVEL) throw new PdfEscaneadoError(limpo.length);

  garantirSemMarcaDagua(limpo);
  return limpo;
}
