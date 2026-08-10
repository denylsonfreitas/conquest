import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
} from '@angular/core';

import { IconeComponent } from './icone.component';

let sequencia = 0;

@Component({
  selector: 'app-modal',
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal.component.html',
  host: { '(document:keydown.escape)': 'pedirFechar()' },
})
export class ModalComponent {
  readonly titulo = input.required<string>();
  readonly largura = input<'media' | 'grande'>('grande');
  readonly bloqueado = input(false);

  readonly fechar = output<void>();

  protected readonly idTitulo = `modal-titulo-${sequencia++}`;

  constructor() {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => {
      document.body.style.overflow = anterior;
    });
  }

  protected pedirFechar(): void {
    if (!this.bloqueado()) this.fechar.emit();
  }
}
