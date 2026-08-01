import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Estado de erro com ação de retentar.
 *
 * O componente não sabe COMO recarregar — só avisa que o usuário pediu, via
 * `output()`. Quem decide o que fazer é a tela dona do dado.
 */
@Component({
  selector: 'app-estado-erro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estado-erro.component.html',
})
export class EstadoErroComponent {
  readonly mensagem = input.required<string>();
  readonly rotuloAcao = input('Tentar de novo');
  readonly tentarDeNovo = output<void>();
}
