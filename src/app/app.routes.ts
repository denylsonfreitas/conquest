import { Routes } from '@angular/router';

import { authGuard, visitanteGuard } from './core/auth.guard';

/**
 * Rotas standalone com `loadComponent` (docs/04): cada tela vira um chunk
 * próprio, carregado só quando visitada.
 *
 * Duas zonas: `/login` para quem não tem sessão, e tudo o mais aninhado sob o
 * ShellComponent, protegido pelo authGuard. Colocar o guard na rota-pai
 * protege todas as filhas de uma vez — não dá para esquecer de uma.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [visitanteGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'materias',
        // `data` alimenta o input `tabela` do componente via
        // withComponentInputBinding(), então uma tela serve as duas rotas.
        data: { tabela: 'materias' },
        loadComponent: () =>
          import('./features/bancas-materias/dimensao-page.component').then(
            (m) => m.DimensaoPageComponent,
          ),
      },
      {
        path: 'bancas',
        data: { tabela: 'bancas' },
        loadComponent: () =>
          import('./features/bancas-materias/dimensao-page.component').then(
            (m) => m.DimensaoPageComponent,
          ),
      },
      { path: '', pathMatch: 'full', redirectTo: 'materias' },
    ],
  },
  { path: '**', redirectTo: '' },
];
