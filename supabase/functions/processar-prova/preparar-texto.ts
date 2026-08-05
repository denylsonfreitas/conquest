import { garantirSemMarcaDagua, removerMarcaDagua } from './marca-dagua.ts';

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

  if (limpo.length < MINIMO_PLAUSIVEL) throw new PdfEscaneadoError(limpo.length);

  garantirSemMarcaDagua(limpo);
  return limpo;
}
