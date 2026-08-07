import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';

import { casarGabarito } from './casar-gabarito.ts';
import { identificarProva } from './identificar-prova.ts';
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
