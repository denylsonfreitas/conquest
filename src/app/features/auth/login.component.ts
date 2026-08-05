import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { ROTA_INICIAL } from '../../core/rotas';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
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
      await this.router.navigate([ROTA_INICIAL]);
    } else {
      this.erro.set(resultado.mensagem);
    }
  }
}
