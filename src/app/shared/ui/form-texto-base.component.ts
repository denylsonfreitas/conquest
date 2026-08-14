import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface ValoresTextoBase {
  titulo: string | null;
  conteudo: string;
  fonte: string | null;
}

@Component({
  selector: 'app-form-texto-base',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-texto-base.component.html',
})
export class FormTextoBaseComponent {
  readonly valorInicial = input<ValoresTextoBase | null>(null);
  readonly salvando = input(false);
  readonly erro = input<string | null>(null);

  readonly salvar = output<ValoresTextoBase>();
  readonly cancelar = output<void>();

  protected readonly titulo = signal('');
  protected readonly conteudo = signal('');
  protected readonly fonte = signal('');

  protected readonly podeSalvar = computed(() => this.conteudo().trim().length > 0);

  constructor() {
    effect(() => {
      const valor = this.valorInicial();
      this.titulo.set(valor?.titulo ?? '');
      this.conteudo.set(valor?.conteudo ?? '');
      this.fonte.set(valor?.fonte ?? '');
    });
  }

  protected enviar(): void {
    if (!this.podeSalvar() || this.salvando()) return;
    this.salvar.emit({
      titulo: this.titulo().trim() || null,
      conteudo: this.conteudo().trim(),
      fonte: this.fonte().trim() || null,
    });
  }
}
