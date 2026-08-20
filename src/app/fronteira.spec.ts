import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname ?? '', '..');

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return nome.endsWith('.ts') ? [caminho] : [];
  });
}

function fontesDoFront(): { caminho: string; fonte: string }[] {
  return arquivosTs(RAIZ)
    .filter((caminho) => !caminho.endsWith('fronteira.spec.ts'))
    .map((caminho) => ({ caminho, fonte: semComentarios(readFileSync(caminho, 'utf8')) }));
}

const curto = (caminho: string) => caminho.replace(RAIZ, 'src');

// Substrings literais, e não um padrão com classes de caractere: o sufixo
// `_API_KEY` cobre toda a cadeia de provedores (GEMINI, MISTRAL, GROQ,
// OPENROUTER, DEEPSEEK, CEREBRAS e os que vierem) sem virar uma lista que
// envelhece — e sem regex, que é justamente onde uma guarda como esta pode se
// corromper em silêncio e passar a aprovar tudo.
const MARCAS_DE_SEGREDO = ['_API_KEY', 'service_role', 'SERVICE_ROLE'];

describe('fronteira app ↔ edge function', () => {
  // A guarda só vale se estiver mesmo lendo o código. Sem esta âncora, qualquer
  // engano de caminho a transformaria numa lista vazia que aprova tudo.
  it('a varredura enxerga o código do front', () => {
    expect(arquivosTs(RAIZ).length).toBeGreaterThan(50);
  });

  it('nenhum arquivo de src/ importa supabase/functions/', () => {
    const infratores = fontesDoFront()
      .filter(({ fonte }) => /from\s+['"][^'"]*supabase\/functions/.test(fonte))
      .map(({ caminho }) => curto(caminho));

    expect(infratores, 'código do front alcançando a Edge Function').toEqual([]);
  });

  it('nenhum arquivo de src/ menciona os segredos do servidor', () => {
    const suspeitos = fontesDoFront()
      .filter(({ fonte }) => MARCAS_DE_SEGREDO.some((marca) => fonte.includes(marca)))
      .map(({ caminho }) => curto(caminho));

    expect(suspeitos, 'segredo de servidor citado em código de front').toEqual([]);
  });
});
