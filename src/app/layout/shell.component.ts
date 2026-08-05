import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { TemaService } from '../core/tema.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly tema = inject(TemaService);
  private readonly router = inject(Router);

  protected readonly navegacao = [
    { rota: '/concursos', rotulo: 'Concursos' },
    { rota: '/quiz', rotulo: 'Quiz' },
    { rota: '/acervo', rotulo: 'Acervo' },
    { rota: '/progresso', rotulo: 'Progresso' },
    { rota: '/materias', rotulo: 'Matérias' },
    { rota: '/bancas', rotulo: 'Bancas' },
  ] as const;

  protected async sair(): Promise<void> {
    await this.auth.sair();
    await this.router.navigate(['/login']);
  }
}
