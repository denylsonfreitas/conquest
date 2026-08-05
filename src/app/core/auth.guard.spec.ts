import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { authGuard, visitanteGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ROTA_INICIAL } from './rotas';

function comAuth(autenticado: boolean) {
  const dublê = {
    autenticado: signal(autenticado),
    pronto: async () => {},
  };
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: dublê }],
  });
  return TestBed.inject(Router);
}

function rodar(guard: typeof authGuard) {
  return TestBed.runInInjectionContext(
    () => guard(null as never, null as never) as Promise<boolean | UrlTree>,
  );
}

describe('authGuard', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('libera quem tem sessão', async () => {
    comAuth(true);
    expect(await rodar(authGuard)).toBe(true);
  });

  it('manda quem não tem sessão para /login', async () => {
    const router = comAuth(false);
    const resultado = await rodar(authGuard);
    expect(resultado).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login');
  });
});

describe('visitanteGuard', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('libera quem não tem sessão', async () => {
    comAuth(false);
    expect(await rodar(visitanteGuard)).toBe(true);
  });

  it('tira quem já está logado da tela de login', async () => {
    const router = comAuth(true);
    const resultado = await rodar(visitanteGuard);
    expect(resultado).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(resultado as UrlTree)).toBe(ROTA_INICIAL);
  });
});
