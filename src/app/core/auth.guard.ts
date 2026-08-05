import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { ROTA_INICIAL } from './rotas';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.pronto();

  return auth.autenticado() ? true : router.createUrlTree(['/login']);
};

export const visitanteGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.pronto();

  return auth.autenticado() ? router.createUrlTree([ROTA_INICIAL]) : true;
};
