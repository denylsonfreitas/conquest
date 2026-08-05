import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { IconeComponent } from './icone.component';

import {
  alternarMateria,
  FiltrosAcervo,
  ItemComNomes,
  opcoesDeFiltro,
  temFiltro,
  trocarBanca,
  trocarConcurso,
} from '../filtros-acervo';

@Component({
  selector: 'app-filtros-acervo',
  imports: [FormsModule, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filtros-acervo.component.html',
})
export class FiltrosAcervoComponent {
  readonly universo = input.required<readonly ItemComNomes[]>();
  readonly filtros = input.required<FiltrosAcervo>();

  readonly mudou = output<FiltrosAcervo>();

  protected readonly opcoes = computed(() => opcoesDeFiltro(this.universo(), this.filtros()));
  protected readonly tem = computed(() => temFiltro(this.filtros()));

  protected readonly resumoMaterias = computed(() => {
    const escolhidas = this.filtros().materiaIds;
    if (escolhidas.length === 0) return 'Todas';
    if (escolhidas.length === 1) {
      return this.opcoes().materias.find((m) => m.id === escolhidas[0])?.nome ?? '1 matéria';
    }
    return `${escolhidas.length} matérias`;
  });

  protected escolherBanca(id: string | null): void {
    this.mudou.emit(trocarBanca(id));
  }

  protected escolherConcurso(id: string | null): void {
    this.mudou.emit(trocarConcurso(this.filtros(), id));
  }

  protected alternarMateria(id: string): void {
    this.mudou.emit(alternarMateria(this.filtros(), id));
  }

  protected materiaEscolhida(id: string): boolean {
    return this.filtros().materiaIds.includes(id);
  }

  protected limpar(): void {
    this.mudou.emit({ bancaId: null, concursoId: null, materiaIds: [] });
  }
}
