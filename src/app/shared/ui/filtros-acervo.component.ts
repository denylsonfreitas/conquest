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

/**
 * Os três eixos de filtro do acervo: banca, concurso e matéria.
 *
 * Burro por contrato (docs/04): `input()`/`output()`, sem service e sem estado
 * próprio. Ele não sabe se está numa montagem de quiz ou numa listagem — recebe
 * o conjunto de onde tirar as opções, recebe os filtros em vigor, e devolve os
 * novos. Quem guarda o estado é o pai.
 *
 * Extraído na segunda ocorrência, quando a listagem do acervo passou a precisar
 * da mesma coisa — não antes.
 */
@Component({
  selector: 'app-filtros-acervo',
  imports: [FormsModule, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filtros-acervo.component.html',
})
export class FiltrosAcervoComponent {
  /** De onde saem as opções: só aparece o que existe neste conjunto. */
  readonly universo = input.required<readonly ItemComNomes[]>();
  readonly filtros = input.required<FiltrosAcervo>();

  readonly mudou = output<FiltrosAcervo>();

  protected readonly opcoes = computed(() => opcoesDeFiltro(this.universo(), this.filtros()));
  protected readonly tem = computed(() => temFiltro(this.filtros()));

  /**
   * Rótulo do controle fechado.
   *
   * Chips abertos mostram tudo, mas com dezenas de matérias viram várias
   * linhas empurrando o resto da tela. Fechado, o filtro ocupa uma linha e
   * ainda diz o que está ativo — a contagem substitui a leitura dos nomes.
   */
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
