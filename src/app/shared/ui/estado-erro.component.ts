import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

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
