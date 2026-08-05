import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-estado-carregando',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estado-carregando.component.html',
  styleUrl: './estado-carregando.component.scss',
})
export class EstadoCarregandoComponent {
  readonly mensagem = input('Carregando…');
}
