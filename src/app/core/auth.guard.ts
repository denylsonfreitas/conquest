import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Protege as rotas do app. Guard FUNCIONAL (`CanActivateFn`), não classe com
 * `CanActivate` — a forma atual do Angular, e que permite usar `inject()`.
 *
 * Devolve `true` para liberar, ou um `UrlTree` para redirecionar. Devolver o
 * UrlTree é melhor que chamar `router.navigate()` e retornar `false`: o Angular
 * trata como um único redirecionamento, sem uma navegação cancelada no meio.
 *
 * O `await pronto()` é o detalhe que evita o bug clássico: no primeiro
 * carregamento a sessão do localStorage ainda não foi restaurada, e sem
 * esperar o guard chutaria você para o login mesmo já estando logado.
 */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.pronto();

  return auth.autenticado() ? true : router.createUrlTree(['/login']);
};

/**
 * O inverso, para a rota de login: quem já está logado não deve ver a tela de
 * login de novo — vai direto para o app.
 */
export const visitanteGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.pronto();

  return auth.autenticado() ? router.createUrlTree(['/materias']) : true;
};
