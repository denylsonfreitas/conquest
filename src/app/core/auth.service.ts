import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';

import { SupabaseService } from './supabase.service';

/** Resultado de uma tentativa de login, sem vazar o tipo do Supabase pra UI. */
export type ResultadoLogin = { ok: true } | { ok: false; mensagem: string };

/**
 * Sessão do usuário único do app.
 *
 * Toda a leitura de estado sai de signals: `sessao()`, `autenticado()` e
 * `carregando()`. Componentes leem esses signals direto no template e o Angular
 * re-renderiza sozinho — sem `async` pipe, sem subscribe manual.
 *
 * O `onAuthStateChange` do Supabase é a única ponte assíncrona: ele empurra
 * cada mudança (login, logout, refresh de token) para dentro do signal.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  private readonly _sessao = signal<Session | null>(null);
  /**
   * Começa `true` porque, ao abrir o app, ainda não sabemos se há sessão salva
   * no localStorage. Sem isso a tela piscaria o login antes de restaurar a
   * sessão — o guard veria `autenticado() === false` e redirecionaria à toa.
   */
  private readonly _carregando = signal(true);

  readonly sessao = this._sessao.asReadonly();
  readonly carregando = this._carregando.asReadonly();
  readonly autenticado = computed(() => this._sessao() !== null);
  readonly email = computed(() => this._sessao()?.user.email ?? null);

  constructor() {
    // Restaura a sessão persistida (se houver) e só então libera o guard.
    void this.supabase.client.auth.getSession().then(({ data }) => {
      this._sessao.set(data.session);
      this._carregando.set(false);
    });

    // Mantém o signal em dia depois disso: login, logout e refresh de token.
    this.supabase.client.auth.onAuthStateChange((_evento, sessao) => {
      this._sessao.set(sessao);
      this._carregando.set(false);
    });
  }

  async entrar(email: string, senha: string): Promise<ResultadoLogin> {
    const { error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password: senha,
    });
    return error ? { ok: false, mensagem: traduzErro(error) } : { ok: true };
  }

  async sair(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this._sessao.set(null);
  }

  /** Espera a restauração inicial terminar. O guard usa isto antes de decidir. */
  async pronto(): Promise<void> {
    if (!this._carregando()) return;
    await this.supabase.client.auth.getSession();
    this._carregando.set(false);
  }
}

/**
 * As mensagens do Supabase vêm em inglês e genéricas. Como o app é single-user,
 * só dois casos importam de verdade; o resto cai no fallback.
 */
function traduzErro(erro: AuthError): string {
  if (erro.message.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (erro.message.includes('Failed to fetch')) {
    return 'Não foi possível falar com o servidor. O Supabase local está de pé?';
  }
  return erro.message;
}
