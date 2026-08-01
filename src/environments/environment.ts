/**
 * Configuração de produção.
 *
 * Só entram aqui valores PÚBLICOS por design: a URL do projeto e a `anon key`.
 * Elas vão no bundle do front e são visíveis a quem abrir o DevTools — o que
 * protege o acervo é o RLS do banco, não o segredo da chave (docs/04).
 *
 * NUNCA coloque aqui a `service_role` do Supabase nem a chave do Gemini. Essas
 * vivem exclusivamente nos segredos da Edge Function.
 *
 * Substitua os placeholders pelos valores do seu projeto:
 *   Supabase → Project Settings → API
 */
export const environment = {
  producao: true,
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'SUA_ANON_KEY_AQUI',
};
