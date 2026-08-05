import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  anotarMudanca,
  EdicaoQuestao,
  LETRAS,
  QuestaoEditavel,
  temMudanca,
  valorEmVigor,
} from '../edicao-questao';
import { ItemDimensao } from '../../features/bancas-materias/dimensoes.service';

@Component({
  selector: 'app-editor-questao',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-questao.component.html',
})
export class EditorQuestaoComponent {
  readonly questao = input.required<QuestaoEditavel>();
  readonly materias = input.required<readonly ItemDimensao[]>();
  readonly urlImagem = input<string | null>(null);
  readonly salvando = input(false);
  readonly respostasAfetadas = input(0);

  readonly salvar = output<EdicaoQuestao>();
  readonly anexarImagem = output<File>();
  readonly removerImagem = output<void>();
  readonly rascunhoMudou = output<EdicaoQuestao>();

  protected readonly rascunho = signal<EdicaoQuestao>({});
  protected readonly LETRAS = LETRAS;

  protected readonly tem = computed(() => temMudanca(this.rascunho()));

  protected readonly gabaritoMudou = computed(() => 'gabarito' in this.rascunho());

  constructor() {
    effect(() => {
      this.questao();
      this.rascunho.set({});
    });

    effect(() => this.rascunhoMudou.emit(this.rascunho()));
  }

  protected valor<K extends keyof QuestaoEditavel>(campo: K): QuestaoEditavel[K] {
    return valorEmVigor(this.rascunho(), this.questao(), campo);
  }

  protected mudar<K extends keyof EdicaoQuestao>(campo: K, valor: QuestaoEditavel[K]): void {
    this.rascunho.update((r) => anotarMudanca(r, this.questao(), campo, valor));
  }

  protected confirmar(): void {
    if (this.tem()) this.salvar.emit(this.rascunho());
  }

  protected descartar(): void {
    this.rascunho.set({});
  }

  limpar(): void {
    this.rascunho.set({});
  }

  protected escolherArquivo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    if (arquivo) this.anexarImagem.emit(arquivo);
    entrada.value = ''; // permite reenviar o mesmo arquivo depois de remover
  }
}
