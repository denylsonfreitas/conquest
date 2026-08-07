import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname ?? '', '..');
const EXTENSOES = ['.ts', '.html', '.scss', '.css'];
const ISENTOS = ['styles.css', 'database.types.ts', 'cor.spec.ts'];

const PALETA_NATIVA = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'white',
  'black',
].join('|');

const PREFIXOS = [
  'bg',
  'text',
  'ring',
  'border',
  'divide',
  'outline',
  'decoration',
  'shadow',
  'accent',
  'caret',
  'fill',
  'stroke',
  'placeholder',
  'from',
  'via',
  'to',
].join('|');

const PROIBIDOS: readonly { nome: string; padrao: RegExp }[] = [
  { nome: 'cor em hexadecimal', padrao: /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g },
  { nome: 'função de cor crua', padrao: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g },
  {
    nome: 'utilitária da paleta nativa do Tailwind',
    padrao: new RegExp(
      `(?<![\\w-])(?:${PREFIXOS})-(?:${PALETA_NATIVA})(?:-\\d{2,3})?(?![\\w-])`,
      'g',
    ),
  },
];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    const relevante = EXTENSOES.some((ext) => nome.endsWith(ext));
    return relevante && !ISENTOS.includes(nome) ? [caminho] : [];
  });
}

describe('cor só vem da camada de tokens', () => {
  for (const { nome, padrao } of PROIBIDOS) {
    it(`nenhum arquivo de src/ usa ${nome}`, () => {
      const infratores = arquivos(RAIZ).flatMap((caminho) => {
        const achados = readFileSync(caminho, 'utf8').match(new RegExp(padrao)) ?? [];
        return achados.map((achado) => `${caminho.replace(RAIZ, 'src')}: ${achado}`);
      });

      expect(infratores, `${nome} escapando de styles.css`).toEqual([]);
    });
  }
});
