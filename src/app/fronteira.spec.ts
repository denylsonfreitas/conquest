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

describe('fronteira app ↔ edge function', () => {
  it('nenhum arquivo de src/ importa supabase/functions/', () => {
    const infratores = arquivosTs(RAIZ)
      .filter((caminho) => !caminho.endsWith('fronteira.spec.ts'))
      .filter((caminho) =>
        /from\s+['"][^'"]*supabase\/functions/.test(semComentarios(readFileSync(caminho, 'utf8'))),
      )
      .map((caminho) => caminho.replace(RAIZ, 'src'));

    expect(infratores, 'código do front alcançando a Edge Function').toEqual([]);
  });

  it('nenhum arquivo de src/ menciona os segredos do servidor', () => {
    const suspeitos = arquivosTs(RAIZ)
      .filter((caminho) => !caminho.endsWith('fronteira.spec.ts'))
      .filter((caminho) =>
        /GEMINI_API_KEY|service_role|SERVICE_ROLE/.test(
          semComentarios(readFileSync(caminho, 'utf8')),
        ),
      )
      .map((caminho) => caminho.replace(RAIZ, 'src'));

    expect(suspeitos, 'segredo de servidor citado em código de front').toEqual([]);
  });
});
