import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding liga params, query params e `data` da rota
    // diretamente aos `input()` do componente — sem injetar ActivatedRoute e
    // ler snapshot na mão. É o que permite a mesma tela servir /materias e
    // /bancas, cada rota passando seu `data: { tabela }`.
    provideRouter(routes, withComponentInputBinding()),
  ],
};
