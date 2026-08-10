import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ModalComponent } from './modal.component';

@Component({
  selector: 'app-confirmacao',
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirmacao.component.html',
})
export class ConfirmacaoComponent {
  readonly titulo = input.required<string>();
  readonly consequencias = input<readonly string[]>([]);
  readonly rotuloConfirmar = input('Excluir');
  readonly ocupado = input(false);

  readonly confirmar = output<void>();
  readonly cancelar = output<void>();
}
