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

/**
 * Edição dos campos de uma questão — matéria, gabarito, comentário, imagem,
 * anulada.
 *
 * Burro por contrato (docs/04): recebe a questão e as matérias, acumula um
 * rascunho e emite as mudanças. Não tem service e não sabe salvar; quem grava
 * é o pai.
 *
 * O rascunho fica AQUI, e não no pai, porque é estado de formulário — nasce e
 * morre com o campo aberto. O que o pai precisa saber é só se há algo pendente,
 * e isso sai por `pendente`.
 *
 * Ele existe porque três telas editam questão, e a terceira impõe a restrição
 * que decidiu o desenho: a partir do resultado do quiz, editar NÃO pode
 * navegar — a sessão vive em memória e sair da tela a destruiria. Então a
 * edição precisa acontecer embutida, onde quer que esteja.
 *
 * O que deliberadamente NÃO vem junto: aprovar/desaprovar. Isso é da revisão,
 * não da edição.
 */
@Component({
  selector: 'app-editor-questao',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-questao.component.html',
})
export class EditorQuestaoComponent {
  readonly questao = input.required<QuestaoEditavel>();
  readonly materias = input.required<readonly ItemDimensao[]>();
  /** URL assinada da imagem já anexada, quando houver. */
  readonly urlImagem = input<string | null>(null);
  readonly salvando = input(false);
  /** Quantas respostas passadas serão recontadas se o gabarito mudar. */
  readonly respostasAfetadas = input(0);

  readonly salvar = output<EdicaoQuestao>();
  readonly anexarImagem = output<File>();
  readonly removerImagem = output<void>();
  /**
   * Emite o rascunho a cada mudança. Booleano bastaria para proteger a saída,
   * mas o pai também precisa saber SE o gabarito mudou, para prever a
   * recontagem das respostas antes de salvar.
   */
  readonly rascunhoMudou = output<EdicaoQuestao>();

  protected readonly rascunho = signal<EdicaoQuestao>({});
  protected readonly LETRAS = LETRAS;

  protected readonly tem = computed(() => temMudanca(this.rascunho()));

  /** Só avisa sobre recontagem quando o gabarito é o campo que mudou. */
  protected readonly gabaritoMudou = computed(() => 'gabarito' in this.rascunho());

  constructor() {
    // Trocar a questão exibida descarta o rascunho da anterior: manter seria
    // aplicar edição na questão errada.
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

  /** Chamado pelo pai depois de gravar com sucesso. */
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
