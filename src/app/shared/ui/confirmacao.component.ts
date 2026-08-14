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
  readonly descricao = input<string | null>(null);
  readonly consequencias = input<readonly string[]>([]);
  readonly rotuloConfirmar = input('Excluir');
  readonly rotuloCancelar = input('Cancelar');
  readonly ocupado = input(false);
  readonly rotuloOcupado = input('Excluindo…');

  // Sair de um quiz não destrói nada: no tom neutro somem o botão vermelho e o
  // "não dá para desfazer", que só fazem sentido diante de exclusão.
  readonly tom = input<'perigo' | 'neutro'>('perigo');

  readonly confirmar = output<void>();
  readonly cancelar = output<void>();
}
