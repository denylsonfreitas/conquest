import { describe, expect, it } from 'vitest';

import { partirEmBlocos, temCodigo } from './blocos-enunciado';

describe('partirEmBlocos', () => {
  it('sem cerca, o enunciado inteiro é prosa', () => {
    expect(partirEmBlocos('Uma questão comum.\nCom duas linhas.')).toEqual([
      { tipo: 'prosa', texto: 'Uma questão comum.\nCom duas linhas.' },
    ]);
  });

  it('separa prosa, código e prosa na ordem em que aparecem', () => {
    const texto = [
      'A seguir, um fragmento em Java.',
      '```java',
      'public class Main {',
      '  public static void main(String[] a) {}',
      '}',
      '```',
      'O que será exibido?',
    ].join('\n');

    expect(partirEmBlocos(texto)).toEqual([
      { tipo: 'prosa', texto: 'A seguir, um fragmento em Java.' },
      {
        tipo: 'codigo',
        texto: 'public class Main {\n  public static void main(String[] a) {}\n}',
      },
      { tipo: 'prosa', texto: 'O que será exibido?' },
    ]);
  });

  it('preserva a indentação dentro do bloco de código', () => {
    const texto = ['```', 'if (x) {', '    return 1;', '}', '```'].join('\n');
    expect(partirEmBlocos(texto)[0].texto).toBe('if (x) {\n    return 1;\n}');
  });

  it('cerca não fechada não engole o resto como prosa nem descarta o código', () => {
    const texto = ['Veja:', '```', 'SELECT 1', 'FROM t'].join('\n');
    expect(partirEmBlocos(texto)).toEqual([
      { tipo: 'prosa', texto: 'Veja:' },
      { tipo: 'codigo', texto: 'SELECT 1\nFROM t' },
    ]);
  });

  it('aceita dois blocos de código no mesmo enunciado', () => {
    const texto = ['```', 'a', '```', 'e depois', '```', 'b', '```'].join('\n');
    expect(partirEmBlocos(texto).map((b) => b.tipo)).toEqual(['codigo', 'prosa', 'codigo']);
  });

  it('não cria bloco vazio quando a cerca abre logo no começo', () => {
    expect(partirEmBlocos('```\nx\n```')).toEqual([{ tipo: 'codigo', texto: 'x' }]);
  });

  it('temCodigo distingue enunciado com e sem cerca', () => {
    expect(temCodigo('só prosa')).toBe(false);
    expect(temCodigo('a\n```\nb\n```')).toBe(true);
  });
});
