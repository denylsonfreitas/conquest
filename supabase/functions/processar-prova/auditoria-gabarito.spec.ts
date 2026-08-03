import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';

import { casarGabarito } from './casar-gabarito.ts';
import { identificarProva } from './identificar-prova.ts';
import { prepararTexto } from './preparar-texto.ts';

/**
 * Auditoria: o gabarito no banco ainda é o do documento oficial da banca?
 *
 * Roda o MESMO casamento do passo 5 contra os PDFs reais e imprime a tabela
 * `numero → letra` oficial. Comparar com o banco responde, sem heurística, se
 * alguma edição corrompeu o acervo — `updated_at` diz que a linha mudou, não
 * qual campo.
 *
 * Fica no projeto de testes das functions porque é lá que os módulos do
 * pipeline vivem, e reusá-los é o que torna a auditoria confiável: se ela
 * usasse um parser próprio, estaria conferindo o gabarito contra outra leitura,
 * não contra a leitura oficial.
 */
async function texto(caminho: string): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(caminho)));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

const PROVA = 'provas/prova_real.pdf';
const GABARITO = 'provas/gabarito_real.pdf';

// Os PDFs não estão no repositório (são material da banca, baixado por mim).
// Sem eles a auditoria não roda — e pular é melhor do que falhar por ausência
// de um arquivo que nunca foi prometido.
const temPdfs = existsSync(PROVA) && existsSync(GABARITO);

describe.skipIf(!temPdfs)('auditoria do gabarito contra o PDF oficial', () => {
  it('casa 70 respostas e imprime a tabela oficial numero → letra', async () => {
    const textoProva = prepararTexto(await texto(PROVA));
    const textoGabarito = prepararTexto(await texto(GABARITO));

    const casamento = casarGabarito(textoGabarito, identificarProva(textoProva), 70);
    // A trava do passo 5 é discriminada: sem `aplicavel`, não há `respostas`.
    if (!casamento.aplicavel) throw new Error(`gabarito não aplicável — ${casamento.motivo}`);

    const oficial = [...casamento.respostas.entries()].sort((a, b) => a[0] - b[0]);
    expect(oficial).toHaveLength(70);

    console.log('OFICIAL=' + oficial.map(([n, l]) => `${n}:${l}`).join(','));
  }, 120_000);
});
