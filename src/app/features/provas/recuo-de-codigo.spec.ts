import { describe, expect, it } from 'vitest';

import { aplicarRecuoDeCodigo } from './recuo-de-codigo';

const TEXTO = [
  'Considere o trecho:',
  'public class Main {',
  'public static void main(String[] args) {',
  'busca(78, lista);',
  '}',
  '}',
  'O que será exibido?',
];

const BLOCO = [
  'public class Main {',
  '      public static void main(String[] args) {',
  '            busca(78, lista);',
  '      }',
  '}',
];

describe('aplicarRecuoDeCodigo', () => {
  it('devolve o recuo ao bloco, sem tocar na prosa em volta', () => {
    const saida = aplicarRecuoDeCodigo(TEXTO, [BLOCO]);

    expect(saida[0]).toBe('Considere o trecho:');
    expect(saida.slice(1, 6)).toEqual(BLOCO);
    expect(saida[6]).toBe('O que será exibido?');
  });

  it('bloco que não casa por inteiro é ignorado — meia emenda é pior que nenhuma', () => {
    const divergente = [...BLOCO.slice(0, 3), '            outra coisa()', ...BLOCO.slice(4)];
    expect(aplicarRecuoDeCodigo(TEXTO, [divergente])).toEqual(TEXTO);
  });

  it('não muda nada além do espaçamento — o conteúdo continua o mesmo', () => {
    const saida = aplicarRecuoDeCodigo(TEXTO, [BLOCO]);
    const semEspaco = (l: string) => l.replace(/\s+/g, ' ').trim();
    expect(saida.map(semEspaco)).toEqual(TEXTO.map(semEspaco));
  });

  it('não reusa a mesma região para dois blocos iguais', () => {
    const texto = ['a()', 'b()', 'meio', 'a()', 'b()'];
    const bloco = ['  a()', '  b()'];
    const saida = aplicarRecuoDeCodigo(texto, [bloco, bloco]);

    expect(saida).toEqual(['  a()', '  b()', 'meio', '  a()', '  b()']);
  });

  it('sem blocos, o texto sai intacto', () => {
    expect(aplicarRecuoDeCodigo(TEXTO, [])).toEqual(TEXTO);
  });

  it('bloco ausente do texto não quebra nem desloca nada', () => {
    expect(aplicarRecuoDeCodigo(TEXTO, [['   nunca()', '   apareceu()']])).toEqual(TEXTO);
  });
});
