/**
 * MODELO — não é importado por nada, serve de documentação (docs/04).
 *
 * Copie o conteúdo para `environment.ts` e `environment.development.ts` e
 * preencha com os valores do seu projeto Supabase.
 *
 * | Chave           | Onde encontrar                                  | Vai pro front? |
 * |-----------------|-------------------------------------------------|----------------|
 * | supabaseUrl     | Project Settings → API → Project URL            | sim            |
 * | supabaseAnonKey | Project Settings → API → anon / public          | sim            |
 * | service_role    | Project Settings → API → service_role           | NÃO            |
 * | GEMINI_API_KEY  | Google AI Studio                                 | NÃO            |
 *
 * As duas últimas são segredos da Edge Function:
 *   supabase secrets set GEMINI_API_KEY=...
 */
export const environment = {
  producao: false,
  supabaseUrl: 'https://xxxxxxxxxxxxxxxxxxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
};
