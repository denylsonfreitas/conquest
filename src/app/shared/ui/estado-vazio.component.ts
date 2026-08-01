import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Estado vazio: a busca funcionou, mas não há nada para mostrar. É diferente
 * de erro e de carregando, e confundir os três é o defeito mais comum em tela
 * de lista — por isso os três são componentes distintos.
 */
@Component({
  selector: 'app-estado-vazio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estado-vazio.component.html',
})
export class EstadoVazioComponent {
  readonly mensagem = input.required<string>();
}
