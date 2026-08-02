import { describe, expect, it } from 'vitest';

import { casarGabarito, lerBlocos } from './casar-gabarito.ts';
import { identificarProva } from './identificar-prova.ts';

/** Formato real do gabarito da DATAPREV/FGV: 35 blocos, um por cargo × tipo. */
const GABARITO = [
  'Gabarito preliminares da prova aplicada no dia 17/11/2024',
  'TÉCNICO DE SEGURANÇA DO TRABALHO – PROVA TIPO 1',
  '1 2 3 4 5',
  'A B E B B',
  'ATI - DESENVOLVIMENTO DE SOFTWARE – PROVA TIPO 1',
  '1 2 3 4 5',
  'E D C C A',
  'ATI - DESENVOLVIMENTO DE SOFTWARE – PROVA TIPO 2',
  '1 2 3 4 5',
  'C E D A A',
].join('\n');

/** Como a prova se identifica: capa + cabeçalho repetido em toda página. */
const PROVA = [
  'ATI - DESENVOLVIMENTO DE SOFTWARE',
  'NÍVEL SUPERIOR TIPO 1 – BRANCA',
  'ATI - Desenvolvimento de Software – TARDE TIPO BRANCA – PÁGINA 3',
].join('\n');

const IDENT = identificarProva(PROVA);

describe('identificarProva', () => {
  it('extrai as três coordenadas do texto, sem digitação manual', () => {
    expect(IDENT).toEqual({
      cargo: 'ATI - Desenvolvimento de Software',
      tipo: 1,
      cor: 'BRANCA',
    });
  });

  it('não afirma nada quando a prova não se identifica', () => {
    expect(identificarProva('texto qualquer sem cabeçalho')).toEqual({
      cargo: null,
      tipo: null,
      cor: null,
    });
  });
});

describe('lerBlocos', () => {
  it('lê todos os blocos do concurso, não só o da prova', () => {
    const blocos = lerBlocos(GABARITO);
    expect(blocos.length).toBe(3);
    expect(blocos.map((b) => b.tipo)).toEqual([1, 1, 2]);
    expect(blocos[1].respostas.get(1)).toBe('E');
  });

  it('ignora grade desalinhada em vez de deslocar todas as respostas', () => {
    // Uma letra a menos deslocaria tudo: 1->A, 2->B, 3->C quando o certo seria
    // 1->A, 2->B, 3->C, 4->D. Erro silencioso — melhor não ler o par.
    const torto = ['CARGO X – PROVA TIPO 1', '1 2 3 4', 'A B C'].join('\n');
    expect(lerBlocos(torto)[0].respostas.size).toBe(0);
  });
});

describe('casarGabarito', () => {
  it('aplica quando a seleção é inequívoca e a contagem bate', () => {
    const r = casarGabarito(GABARITO, IDENT, 5);
    expect(r.aplicavel).toBe(true);
    if (r.aplicavel) {
      // O bloco do TIPO 1, não o do TIPO 2 nem o de outro cargo.
      expect([...r.respostas.values()]).toEqual(['E', 'D', 'C', 'C', 'A']);
    }
  });

  it('RECUSA quando a contagem diverge — validação cruzada', () => {
    // Dois caminhos independentes (extração e grade) discordam: pelo menos um
    // está errado e não dá para saber qual.
    const r = casarGabarito(GABARITO, IDENT, 4);
    expect(r.aplicavel).toBe(false);
    if (!r.aplicavel) expect(r.motivo).toMatch(/Contagens divergentes/);
  });

  it('RECUSA quando o tipo não existe, em vez de cair no tipo vizinho', () => {
    const r = casarGabarito(GABARITO, { ...IDENT, tipo: 9 }, 5);
    expect(r.aplicavel).toBe(false);
  });

  it('RECUSA quando o cargo não casa, em vez de escolher o mais parecido', () => {
    const r = casarGabarito(GABARITO, { ...IDENT, cargo: 'ATI - ADVOCACIA' }, 5);
    expect(r.aplicavel).toBe(false);
  });

  it('RECUSA quando a prova não pôde ser identificada', () => {
    const r = casarGabarito(GABARITO, { cargo: null, tipo: null, cor: null }, 5);
    expect(r.aplicavel).toBe(false);
  });

  it('RECUSA quando dois blocos casam — ambiguidade não vira palpite', () => {
    const duplicado = GABARITO + '\n' + GABARITO;
    const r = casarGabarito(duplicado, IDENT, 5);
    expect(r.aplicavel).toBe(false);
    if (!r.aplicavel) expect(r.motivo).toMatch(/Ambíguo/);
  });

  it('casa ignorando caixa e acento entre prova e gabarito', () => {
    // "ATI - Desenvolvimento de Software" vs "ATI - DESENVOLVIMENTO DE SOFTWARE"
    expect(casarGabarito(GABARITO, IDENT, 5).aplicavel).toBe(true);
  });
});
