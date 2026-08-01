/**
 * Configuração de desenvolvimento (`ng serve` usa este arquivo via
 * `fileReplacements` no angular.json).
 *
 * Mesmas regras do environment.ts: só URL e `anon key`, nunca segredos.
 * Se você rodar o Supabase local (`supabase start`), a URL costuma ser
 * http://127.0.0.1:54321 e a anon key é impressa no terminal.
 */
export const environment = {
  producao: false,
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'SUA_ANON_KEY_AQUI',
};
