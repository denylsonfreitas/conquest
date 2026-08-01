import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';

/**
 * Login do usuário único. Não há cadastro nem "esqueci minha senha": o usuário
 * é criado uma vez (ver supabase/seed.sql no ambiente local).
 *
 * Template inline por ser uma tela pequena — mantém marcação e estado à vista
 * um do outro. Telas maiores ganham arquivo `.html` próprio.
 *
 * Reactive forms com `nonNullable: true`: sem isso `.value` seria
 * `string | null | undefined` e você acabaria com `!` espalhado pelo código.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
      <div class="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 class="text-2xl font-semibold text-slate-900">Conquest</h1>
        <p class="mt-1 text-sm text-slate-500">Entre para acessar seu acervo.</p>

        <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="enviar()">
          <div>
            <label for="email" class="block text-sm font-medium text-slate-700">E-mail</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              autocomplete="username"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <label for="senha" class="block text-sm font-medium text-slate-700">Senha</label>
            <input
              id="senha"
              type="password"
              formControlName="senha"
              autocomplete="current-password"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <!-- Estado de erro: só aparece quando existe, e some na próxima tentativa. -->
          @if (erro(); as mensagem) {
            <p role="alert" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {{ mensagem }}
            </p>
          }

          <button
            type="submit"
            [disabled]="enviando() || form.invalid"
            class="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {{ enviando() ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required]],
  });

  protected async enviar(): Promise<void> {
    if (this.form.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.erro.set(null);

    const { email, senha } = this.form.getRawValue();
    const resultado = await this.auth.entrar(email, senha);

    this.enviando.set(false);

    if (resultado.ok) {
      await this.router.navigate(['/materias']);
    } else {
      this.erro.set(resultado.mensagem);
    }
  }
}
