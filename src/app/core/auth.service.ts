import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';

import { SupabaseService } from './supabase.service';

export type ResultadoLogin = { ok: true } | { ok: false; mensagem: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  private readonly _sessao = signal<Session | null>(null);
  private readonly _carregando = signal(true);

  readonly sessao = this._sessao.asReadonly();
  readonly carregando = this._carregando.asReadonly();
  readonly autenticado = computed(() => this._sessao() !== null);
  readonly email = computed(() => this._sessao()?.user.email ?? null);

  constructor() {
    void this.supabase.client.auth.getSession().then(({ data }) => {
      this._sessao.set(data.session);
      this._carregando.set(false);
    });

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

  async pronto(): Promise<void> {
    if (!this._carregando()) return;
    await this.supabase.client.auth.getSession();
    this._carregando.set(false);
  }
}

function traduzErro(erro: AuthError): string {
  if (erro.message.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (erro.message.includes('Failed to fetch')) {
    return 'Não foi possível falar com o servidor. O Supabase local está de pé?';
  }
  return erro.message;
}
