import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Estado de carregamento. Componente burro: recebe `input()`, não injeta nada
 * e não sabe de onde o dado vem (docs/04 → shared/ui).
 */
@Component({
  selector: 'app-estado-carregando',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estado-carregando.component.html',
  styleUrl: './estado-carregando.component.scss',
})
export class EstadoCarregandoComponent {
  readonly mensagem = input('Carregando…');
}
