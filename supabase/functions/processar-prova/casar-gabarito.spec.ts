import { describe, expect, it } from 'vitest';

import { casarGabarito, lerBlocos } from './casar-gabarito.ts';
import { identificarProva } from './identificar-prova.ts';

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

const PROVA = [
  'ATI - DESENVOLVIMENTO DE SOFTWARE',
  'NÍVEL SUPERIOR TIPO 1 – BRANCA',
  'ATI - Desenvolvimento de Software – TARDE TIPO BRANCA – PÁGINA 3',
].join('\n');

const IDENT = identificarProva(PROVA);

const GABARITO_EM_PARES = [
  'BANCO DO BRASIL - Prova A - Escriturário – Agente Comercial',
  'SELEÇÃO EXTERNA 2022 / 001 - EDITAL No 01 – 2022/001 BB - Prova realizada em: 23/04/2023',
  'GABARITO 1',
  'LÍNGUA PORTUGUESA',
  '1 - B 2 - B 3 - E 4 - C 5 - A',
  'BANCO DO BRASIL - Prova Agente de Tecnologia – Microrregião 158 -TI',
  'SELEÇÃO EXTERNA 2022 / 001 - EDITAL No 01 – 2022/001 BB - Prova realizada em: 23/04/2023',
  'GABARITO 1',
  'LÍNGUA PORTUGUESA',
  '1 - A 2 - E 3 - C 4- D 5 - A',
  'BANCO DO BRASIL - Prova Agente de Tecnologia – Microrregião 158 -TI',
  'GABARITO 2',
  '1 - C 2 - C 3 - C 4 - C 5 - C',
].join('\n');

const PROVA_COM_RODAPE = [
  'BANCO DO BRASIL GABARITO',
  'AGENTE DE TECNOLOGIA - Microrregião 158 - TI',
  'a) este caderno, com o tema da Redação e 70 questões objetivas',
  'AGENTE DE TECNOLOGIA - Microrregião 158 -TI GABARITO 1',
  'AGENTE DE TECNOLOGIA - Microrregião 158 -TI4GABARITO 1',
  'AGENTE DE TECNOLOGIA - Microrregião 158 -TI10GABARITO 1',
].join('\n');

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
    const torto = ['CARGO X – PROVA TIPO 1', '1 2 3 4', 'A B C'].join('\n');
    expect(lerBlocos(torto)[0].respostas.size).toBe(0);
  });
});

describe('casarGabarito', () => {
  it('aplica quando a seleção é inequívoca e a contagem bate', () => {
    const r = casarGabarito(GABARITO, IDENT, 5);
    expect(r.aplicavel).toBe(true);
    if (r.aplicavel) {
      expect([...r.respostas.values()]).toEqual(['E', 'D', 'C', 'C', 'A']);
    }
  });

  it('RECUSA quando a contagem diverge — validação cruzada', () => {
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
    expect(casarGabarito(GABARITO, IDENT, 5).aplicavel).toBe(true);
  });
});

describe('provas que se identificam pelo rodapé, com gabarito em pares', () => {
  const ident = identificarProva(PROVA_COM_RODAPE);

  it('tira cargo e tipo do rodapé que se repete página a página', () => {
    expect(ident).toEqual({
      cargo: 'AGENTE DE TECNOLOGIA - Microrregião 158 -TI',
      tipo: 1,
      cor: null,
    });
  });

  it('não confunde o número da página com o fim do cargo', () => {
    const umaPagina = identificarProva('CARGO X -TI7GABARITO 3');
    expect(umaPagina.cargo).toBe('CARGO X -TI');
    expect(umaPagina.tipo).toBe(3);
  });

  it('lê os pares número-letra, inclusive o que veio sem espaço no traço', () => {
    const blocos = lerBlocos(GABARITO_EM_PARES);
    expect(blocos.map((b) => b.tipo)).toEqual([1, 1, 2]);
    expect([...blocos[1].respostas.entries()]).toEqual([
      [1, 'A'],
      [2, 'E'],
      [3, 'C'],
      [4, 'D'],
      [5, 'A'],
    ]);
  });

  it('não deixa "Prova realizada em" virar nome de cargo', () => {
    const cargos = lerBlocos(GABARITO_EM_PARES).map((b) => b.cargo);
    expect(cargos.some((c) => /realizada/i.test(c))).toBe(false);
  });

  it('escolhe o bloco do cargo certo entre os cinco tipos do PDF', () => {
    const r = casarGabarito(GABARITO_EM_PARES, ident, 5);
    expect(r.aplicavel).toBe(true);
    if (r.aplicavel) expect([...r.respostas.values()]).toEqual(['A', 'E', 'C', 'D', 'A']);
  });

  it('o formato em grade continua tendo precedência sobre o em pares', () => {
    expect(lerBlocos(GABARITO).map((b) => b.tipo)).toEqual([1, 1, 2]);
    expect(identificarProva(PROVA).cor).toBe('BRANCA');
  });
});
