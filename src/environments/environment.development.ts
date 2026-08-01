/**
 * Configuração de desenvolvimento (`ng serve` usa este arquivo via
 * `fileReplacements` no angular.json).
 *
 * Aponta para a stack local do Supabase, que sobe com `npx supabase start`.
 * A URL e a chave abaixo são as MESMAS em qualquer máquina — são as
 * credenciais demo do ambiente local, não segredo nenhum. Por isso podem ser
 * versionadas sem problema.
 *
 * Se a stack não estiver de pé, toda chamada ao Supabase vai falhar: rode
 * `npx supabase start` antes do `ng serve`. Studio em http://127.0.0.1:54323.
 */
export const environment = {
  producao: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
};
