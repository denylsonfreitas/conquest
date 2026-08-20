import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';

import { fatiarProva, numerosDeQuestao, pareceNumeracaoDeProva } from './fatiar-prova.ts';
import { prepararTexto } from './preparar-texto.ts';

const linhasDe = (t: string) => t.split('\n');

// Prova sintética: número sozinho na linha, como o prompt já exige e como os
// PDFs reais entregam.
function provaFalsa(quantas: number): string {
  const partes: string[] = ['CONHECIMENTOS BÁSICOS', ''];
  for (let n = 1; n <= quantas; n++) {
    partes.push(String(n), `Enunciado da questão ${n}?`, '(A) um', '(B) dois', '');
  }
  return partes.join('\n');
}

describe('numerosDeQuestao', () => {
  it('separa a numeração das questões da numeração de página', () => {
    // Páginas 1..3 intercaladas com questões 1..12: as duas começam em 1 e as
    // duas aparecem sozinhas numa linha. O que decide é qual sequência é maior.
    const linhas: string[] = [];
    for (let n = 1; n <= 12; n++) {
      linhas.push(String(n), `Enunciado ${n}`);
      if (n % 4 === 0) linhas.push(String(n / 4));
    }

    const nums = numerosDeQuestao(linhas).map((c) => c.numero);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('texto sem numeração nenhuma não inventa sequência', () => {
    expect(numerosDeQuestao(linhasDe('só prosa\nsem números\n'))).toEqual([]);
  });
});

describe('pareceNumeracaoDeProva', () => {
  it('recusa sequência curta demais para ser uma prova', () => {
    expect(pareceNumeracaoDeProva(numerosDeQuestao(linhasDe(provaFalsa(4))))).toBe(false);
  });

  it('recusa sequência esburacada, que provavelmente é coincidência', () => {
    const esburacada = [1, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400].map((n, i) => ({
      linha: i,
      numero: n,
    }));
    expect(pareceNumeracaoDeProva(esburacada)).toBe(false);
  });

  it('aceita a numeração cheia de uma prova de verdade', () => {
    expect(pareceNumeracaoDeProva(numerosDeQuestao(linhasDe(provaFalsa(70))))).toBe(true);
  });
});

describe('fatiarProva', () => {
  it('corta em lotes do tamanho pedido, cobrindo a prova inteira', () => {
    const lotes = fatiarProva(provaFalsa(70), 20);

    expect(lotes).toHaveLength(4);
    expect(lotes.map((l) => [l.primeira, l.ultima])).toEqual([
      [1, 20],
      [21, 40],
      [41, 60],
      [61, 70],
    ]);
  });

  it('NÃO perde conteúdo: juntar os lotes reproduz o texto original', () => {
    // O invariante que mais importa. Um corte que come uma linha só apareceria
    // como questão faltando semanas depois, sem ninguém saber por quê.
    const texto = provaFalsa(70);
    const juntos = fatiarProva(texto, 20)
      .map((l) => l.texto)
      .join('\n');

    expect(juntos).toBe(texto);
  });

  it('devolve vazio quando não dá para cortar com confiança', () => {
    // Falhar aqui não pode impedir o processamento: quem chama manda a prova
    // inteira, como era antes de existir fatiamento.
    expect(fatiarProva('prosa sem numeração alguma', 20)).toEqual([]);
    expect(fatiarProva(provaFalsa(5), 20)).toEqual([]);
  });

  it('o primeiro lote leva o que vem antes da questão 1', () => {
    // É onde mora o texto-base que aparece antes das questões.
    const lotes = fatiarProva(provaFalsa(70), 20);
    expect(lotes[0].texto).toContain('CONHECIMENTOS BÁSICOS');
  });

  it('passa os cabeçalhos anteriores como candidatos, sem escolher por conta', () => {
    const lotes = fatiarProva(provaFalsa(70), 20);

    expect(lotes[0].secoesAnteriores).toEqual([]);
    expect(lotes[1].secoesAnteriores).toContain('CONHECIMENTOS BÁSICOS');
  });
});

// =============================================================================
// Auditoria contra os PDFs de verdade. Sem cota de LLM: o fatiador é função
// pura, então dá para provar o corte antes de gastar qualquer chamada.
// =============================================================================

const PROVAS = ['provas/prova_real.pdf', 'provas/escriturario_agente_de_tecnologia.pdf'];

async function textoDoPdf(caminho: string): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(caminho)));
  const { text } = await extractText(pdf, { mergePages: true });
  return prepararTexto(text);
}

describe('auditoria do fatiamento nos PDFs reais', () => {
  for (const caminho of PROVAS) {
    const nome = caminho.replace('provas/', '');

    it(`${nome}: reconhece a numeração e corta`, async ({ skip }) => {
      if (!existsSync(caminho)) skip();

      const texto = await textoDoPdf(caminho);
      const sequencia = numerosDeQuestao(texto.split('\n'));

      expect(pareceNumeracaoDeProva(sequencia)).toBe(true);
      expect(sequencia[0].numero).toBe(1);
      expect(sequencia[sequencia.length - 1].numero).toBe(70);
    });

    it(`${nome}: juntar os lotes reproduz o texto, byte a byte`, async ({ skip }) => {
      if (!existsSync(caminho)) skip();

      const texto = await textoDoPdf(caminho);
      const lotes = fatiarProva(texto, 20);

      expect(lotes.length).toBeGreaterThan(1);
      expect(lotes.map((l) => l.texto).join('\n')).toBe(texto);
    });

    it(`${nome}: cada lote fica pequeno o bastante para caber no orçamento`, async ({ skip }) => {
      if (!existsSync(caminho)) skip();

      const texto = await textoDoPdf(caminho);
      const lotes = fatiarProva(texto, 20);

      // A saída reescreve enunciado e alternativas, então o texto do lote é a
      // melhor estimativa dela. ~4 chars por token: 32k chars ≈ 8k tokens, que
      // o modelo mais lento da lista gratuita ainda entrega dentro dos 110s.
      for (const lote of lotes) {
        expect(lote.texto.length).toBeLessThan(32_000);
      }
    });

    it(`${nome}: nenhuma questão fica de fora das faixas`, async ({ skip }) => {
      if (!existsSync(caminho)) skip();

      const texto = await textoDoPdf(caminho);
      const lotes = fatiarProva(texto, 20);

      // As faixas precisam ser contíguas: o fim de um lote encosta no começo do
      // seguinte. Buraco aqui seria questão que ninguém pediu para extrair.
      expect(lotes[0].primeira).toBe(1);
      expect(lotes[lotes.length - 1].ultima).toBe(70);

      for (let i = 1; i < lotes.length; i++) {
        expect(lotes[i].primeira).toBeGreaterThan(lotes[i - 1].ultima);
      }
    });
  }
});
