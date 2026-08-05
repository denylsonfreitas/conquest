import { Routes } from '@angular/router';

import { authGuard, visitanteGuard } from './core/auth.guard';
import { ROTA_INICIAL } from './core/rotas';

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
        path: 'concursos/:id',
        loadComponent: () =>
          import('./features/concursos/detalhe-concurso.component').then(
            (m) => m.DetalheConcursoComponent,
          ),
      },
      {
        path: 'provas/:id/revisao',
        loadComponent: () =>
          import('./features/importacao/revisao-questoes.component').then(
            (m) => m.RevisaoQuestoesComponent,
          ),
      },
      {
        path: 'acervo',
        loadComponent: () =>
          import('./features/acervo/lista-acervo.component').then((m) => m.ListaAcervoComponent),
      },
      {
        path: 'quiz',
        loadComponent: () =>
          import('./features/quiz/montar-quiz.component').then((m) => m.MontarQuizComponent),
      },
      {
        path: 'quiz/executar',
        loadComponent: () =>
          import('./features/quiz/quiz-execucao.component').then((m) => m.QuizExecucaoComponent),
      },
      {
        path: 'quiz/resultado',
        loadComponent: () =>
          import('./features/quiz/resultado-quiz.component').then((m) => m.ResultadoQuizComponent),
      },
      {
        path: 'progresso',
        loadComponent: () =>
          import('./features/progresso/progresso.component').then((m) => m.ProgressoComponent),
      },
      {
        path: 'materias',
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
