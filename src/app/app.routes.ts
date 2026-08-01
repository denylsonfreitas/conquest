import { Routes } from '@angular/router';

import { authGuard, visitanteGuard } from './core/auth.guard';
import { ROTA_INICIAL } from './core/rotas';

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
        path: 'concursos',
        loadComponent: () =>
          import('./features/concursos/lista-concursos.component').then(
            (m) => m.ListaConcursosComponent,
          ),
      },
      {
        // `:id` chega no input() do componente pelo withComponentInputBinding,
        // mesmo mecanismo que entrega o `data` das rotas de dimensão.
        path: 'concursos/:id',
        loadComponent: () =>
          import('./features/concursos/detalhe-concurso.component').then(
            (m) => m.DetalheConcursoComponent,
          ),
      },
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
      { path: '', pathMatch: 'full', redirectTo: ROTA_INICIAL },
    ],
  },
  { path: '**', redirectTo: '' },
];
