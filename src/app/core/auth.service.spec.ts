import { TestBed } from '@angular/core/testing';
import { AuthError, Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

const sessaoFake = { user: { email: 'eu@local.test' } } as Session;

function criarDuplo(sessaoInicial: Session | null) {
  let notificar: ((evento: string, sessao: Session | null) => void) | null = null;
  const signInWithPassword = vi.fn(async () => ({ data: {}, error: null }));

  const client = {
    auth: {
      getSession: async () => ({ data: { session: sessaoInicial } }),
      onAuthStateChange: (cb: (evento: string, sessao: Session | null) => void) => {
        notificar = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword,
      signOut: async () => ({ error: null }),
    },
  };

  return { client, signInWithPassword, notificar: () => notificar };
}

function criarService(sessaoInicial: Session | null) {
  const duplo = criarDuplo(sessaoInicial);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: duplo }],
  });
  return { service: TestBed.inject(AuthService), duplo };
}

describe('AuthService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('começa carregando, para não deixar o guard decidir cedo demais', () => {
    const { service } = criarService(sessaoFake);
    expect(service.carregando()).toBe(true);
    expect(service.autenticado()).toBe(false);
  });

  it('restaura a sessão persistida', async () => {
    const { service } = criarService(sessaoFake);
    await service.pronto();
    expect(service.autenticado()).toBe(true);
    expect(service.email()).toBe('eu@local.test');
    expect(service.carregando()).toBe(false);
  });

  it('fica deslogado quando não há sessão salva', async () => {
    const { service } = criarService(null);
    await service.pronto();
    expect(service.autenticado()).toBe(false);
    expect(service.email()).toBeNull();
  });

  it('acompanha o onAuthStateChange do Supabase', async () => {
    const { service, duplo } = criarService(null);
    await service.pronto();

    duplo.notificar()?.('SIGNED_IN', sessaoFake);
    expect(service.autenticado()).toBe(true);

    duplo.notificar()?.('SIGNED_OUT', null);
    expect(service.autenticado()).toBe(false);
  });

  it('traduz credencial inválida em vez de vazar a mensagem do Supabase', async () => {
    const { service, duplo } = criarService(null);
    duplo.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: new AuthError('Invalid login credentials', 400),
    } as never);

    const r = await service.entrar('eu@local.test', 'errada');
    expect(r).toEqual({ ok: false, mensagem: 'E-mail ou senha incorretos.' });
  });

  it('devolve ok quando o login dá certo', async () => {
    const { service } = criarService(null);
    expect(await service.entrar('eu@local.test', 'conquest')).toEqual({ ok: true });
  });
});
