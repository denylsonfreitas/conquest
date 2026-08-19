import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { extrairTextoPdf } from './extrair-texto-pdf';

const PROVAS = [
  'provas/escriturario_agente_de_tecnologia.pdf',
  'provas/prova_real.pdf',
  'provas/gabarito.pdf',
  'provas/gabarito_real.pdf',
];

const semEspacamento = (linha: string) => linha.replace(/\s+/g, ' ').trim();

async function comExtractText(caminho: string): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const documento = await getDocumentProxy(new Uint8Array(await readFile(caminho)));
  const { text } = await extractText(documento, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join('\n').split('\n');
}

describe('extrairTextoPdf contra os PDFs reais', () => {
  for (const caminho of PROVAS) {
    it.skipIf(!existsSync(caminho))(
      `não altera nada além do espaçamento — ${caminho}`,
      async () => {
        const novo = (await extrairTextoPdf(new Blob([await readFile(caminho)]))).split('\n');
        const antigo = await comExtractText(caminho);

        // A garantia que protege gabarito e extração: mesma quantidade de
        // linhas, mesmo conteúdo. Só o espaçamento interno muda.
        expect(novo).toHaveLength(antigo.length);
        expect(novo.map(semEspacamento)).toEqual(antigo.map(semEspacamento));
      },
      120_000,
    );
  }

  it.skipIf(!existsSync(PROVAS[0]))(
    'devolve o recuo ao código, que o extractText joga fora',
    async () => {
      const caminho = PROVAS[0];
      const novo = (await extrairTextoPdf(new Blob([await readFile(caminho)]))).split('\n');
      const antigo = await comExtractText(caminho);

      const recuadas = (linhas: string[]) => linhas.filter((l) => /^ +\S/.test(l)).length;
      expect(recuadas(antigo)).toBe(0);
      expect(recuadas(novo)).toBeGreaterThan(20);

      const i = novo.findIndex((l) => l.trim().startsWith('public class Main'));
      expect(i).toBeGreaterThan(-1);
      expect(novo[i + 1]).toMatch(/^ {4,}public static void main/);
      expect(novo[i + 2]).toMatch(/^ {8,}int lista\[\]=/);
    },
    120_000,
  );
});
