import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-estado-vazio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estado-vazio.component.html',
})
export class EstadoVazioComponent {
  readonly mensagem = input.required<string>();
}
