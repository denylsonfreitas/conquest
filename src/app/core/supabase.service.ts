import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';

/**
 * Único ponto de contato com o Supabase.
 *
 * `providedIn: 'root'` faz deste um singleton da aplicação — importante aqui:
 * criar mais de um `SupabaseClient` duplicaria a sessão de auth e as conexões
 * de realtime.
 *
 * Este service NÃO tem queries. Ele só expõe o client; as queries de cada
 * feature moram no `*.service.ts` dela (docs/04). Assim `provas.service.ts`
 * sabe sobre provas, e ninguém precisa saber sobre configuração do Supabase.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    {
      auth: {
        // Single-user: a sessão fica no localStorage e é renovada sozinha, para
        // você não precisar logar de novo a cada vez que abre o app no tablet.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  );

  /** Atalho tipado para o Storage dos PDFs originais (bucket privado). */
  get provasPdf() {
    return this.client.storage.from('provas-pdf');
  }

  /** Atalho tipado para o Storage das figuras de questão (bucket privado). */
  get questaoImagens() {
    return this.client.storage.from('questao-imagens');
  }
}
