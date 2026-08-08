import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { partirEmBlocos } from '../blocos-enunciado';

@Component({
  selector: 'app-enunciado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './enunciado.component.html',
})
export class EnunciadoComponent {
  readonly texto = input.required<string>();

  protected readonly blocos = computed(() => partirEmBlocos(this.texto()));
}
