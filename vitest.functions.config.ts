import { defineConfig } from 'vitest/config';

/**
 * Testes das funções puras da Edge Function.
 *
 * O builder `@angular/build:unit-test` só descobre specs dentro de `sourceRoot`
 * (`src/`), e o docs/04 coloca o pipeline em `supabase/functions/`. Em vez de
 * mover o código para agradar a ferramenta, roda-se um segundo projeto vitest
 * sobre essa pasta — `npm test` executa os dois.
 *
 * Ambiente `node`: estas funções são TypeScript agnóstico de runtime (sem DOM,
 * sem Angular, sem Deno-específico), o que é justamente o que permite testá-las
 * aqui e executá-las no Deno.
 */
export default defineConfig({
  test: {
    name: 'edge-functions',
    include: ['supabase/functions/**/*.spec.ts'],
    environment: 'node',
  },
});
