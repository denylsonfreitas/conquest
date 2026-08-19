import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';

import { casarGabarito } from './casar-gabarito.ts';
import { identificarProva } from './identificar-prova.ts';
import { extrairTextoPdf } from '../../../src/app/features/provas/extrair-texto-pdf.ts';
import { prepararTexto } from './preparar-texto.ts';

async function texto(caminho: string): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(caminho)));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

const PARES = [
  {
    nome: 'grade numérica',
    prova: 'provas/prova_real.pdf',
    gabarito: 'provas/gabarito_real.pdf',
  },
  {
    nome: 'pares número-letra',
    prova: 'provas/escriturario_agente_de_tecnologia.pdf',
    gabarito: 'provas/gabarito.pdf',
  },
];

// O app extrai o texto com extrairTextoPdf, não com extractText cru: ele
// devolve o recuo aos blocos de código. A auditoria roda sobre os DOIS para
// provar que essa diferença não alcança o casamento do gabarito.
async function textoDoApp(caminho: string): Promise<string> {
  return extrairTextoPdf(new Blob([await readFile(caminho)]));
}

describe('auditoria do gabarito contra o PDF oficial', () => {
  for (const par of PARES) {
    const temPdfs = existsSync(par.prova) && existsSync(par.gabarito);

    it.skipIf(!temPdfs)(
      `casa 70 respostas e imprime a tabela oficial numero → letra (${par.nome})`,
      async () => {
        const textoProva = prepararTexto(await texto(par.prova));
        const textoGabarito = prepararTexto(await texto(par.gabarito));

        const casamento = casarGabarito(textoGabarito, identificarProva(textoProva), 70);
        if (!casamento.aplicavel) throw new Error(`gabarito não aplicável — ${casamento.motivo}`);

        const oficial = [...casamento.respostas.entries()].sort((a, b) => a[0] - b[0]);
        expect(oficial).toHaveLength(70);

        console.log(`OFICIAL[${par.nome}]=` + oficial.map(([n, l]) => `${n}:${l}`).join(','));
      },
      120_000,
    );
  }
});

describe('o recuo do código não alcança o casamento do gabarito', () => {
  for (const par of PARES) {
    const temPdfs = existsSync(par.prova) && existsSync(par.gabarito);

    it.skipIf(!temPdfs)(
      `casa as mesmas 70 respostas com o texto do app (${par.nome})`,
      async () => {
        const comExtractText = casarGabarito(
          prepararTexto(await texto(par.gabarito)),
          identificarProva(prepararTexto(await texto(par.prova))),
          70,
        );
        const comRecuo = casarGabarito(
          prepararTexto(await textoDoApp(par.gabarito)),
          identificarProva(prepararTexto(await textoDoApp(par.prova))),
          70,
        );

        expect(comExtractText.aplicavel).toBe(true);
        expect(comRecuo.aplicavel).toBe(true);

        if (comExtractText.aplicavel && comRecuo.aplicavel) {
          expect([...comRecuo.respostas.entries()].sort()).toEqual(
            [...comExtractText.respostas.entries()].sort(),
          );
        }
      },
      180_000,
    );
  }
});
