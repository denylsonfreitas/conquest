import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Fronteira entre o app e a Edge Function.
 *
 * A chave do Gemini e a service_role vivem exclusivamente no runtime Deno
 * (docs/04). A garantia disso é ESTRUTURAL: o bundle do Angular só embute o
 * que é alcançável a partir de `src/main.ts`, e a função nunca é alcançável
 * porque nada em `src/` a importa.
 *
 * Este teste transforma esse "nunca" em coisa verificada. Se alguém um dia
 * importar `supabase/functions/...` de dentro de `src/`, código que lê
 * segredos passa a ser alcançável pelo build do front — e aqui quebra antes.
 *
 * A seta contrária é permitida e desejada: a função importa o schema Zod de
 * `src/app/shared/`, que é a fonte da verdade compartilhada.
 */

const RAIZ = join(import.meta.dirname ?? '', '..');

/**
 * Remove comentários antes de procurar.
 *
 * `environment.ts` cita `service_role` justamente para AVISAR que ela nunca
 * pode ir para o front. Documentação da regra não é violação da regra — o que
 * importa é código que usa o segredo, não texto que fala dele.
 */
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
