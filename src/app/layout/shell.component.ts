import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth.service';

/**
 * Moldura das telas autenticadas: cabeçalho, navegação e o outlet das filhas.
 *
 * É a rota-pai protegida pelo authGuard — quem não tem sessão nunca chega a
 * renderizar isto. Fica em `layout/` por não ser reutilizável (o `shared/ui`
 * do docs/04 é para peças genéricas).
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Menu como dado, não como marcação repetida: crescer é adicionar item. */
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
