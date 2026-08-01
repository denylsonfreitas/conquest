import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth.service';

/**
 * Moldura das telas autenticadas: cabeçalho, navegação e o outlet das filhas.
 *
 * É a rota-pai protegida pelo authGuard — quem não tem sessão nunca chega a
 * renderizar isto. Fica em `layout/` por não ser reutilizável (o `shared/ui`
 * do docs/04 é para peças genéricas como botão e card).
 *
 * `RouterLinkActive` marca o item de menu da rota atual; `exact` evita que a
 * raiz fique sempre ativa.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh bg-slate-50">
      <header class="border-b border-slate-200 bg-white">
        <div class="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
          <span class="text-lg font-semibold text-slate-900">Conquest</span>

          <nav class="flex gap-1 text-sm">
            <a
              routerLink="/materias"
              routerLinkActive="bg-slate-900 text-white"
              class="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100"
              >Matérias</a
            >
            <a
              routerLink="/bancas"
              routerLinkActive="bg-slate-900 text-white"
              class="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100"
              >Bancas</a
            >
          </nav>

          <div class="ml-auto flex items-center gap-3">
            <span class="hidden text-sm text-slate-500 sm:inline">{{ auth.email() }}</span>
            <button
              type="button"
              (click)="sair()"
              class="rounded-lg px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-4xl px-4 py-8">
        <router-outlet />
      </main>
    </div>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async sair(): Promise<void> {
    await this.auth.sair();
    await this.router.navigate(['/login']);
  }
}
