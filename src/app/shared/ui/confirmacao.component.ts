import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirmacao',
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
