import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Raiz da aplicação: só hospeda o roteador.
 *
 * A navegação e o cabeçalho vivem no ShellComponent, que é a rota-pai das
 * telas autenticadas — assim a tela de login não herda o menu do app.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<router-outlet />',
})
export class App {}
