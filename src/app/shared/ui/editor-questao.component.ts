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

export interface OpcaoTexto {
  readonly id: string;
  readonly titulo: string | null;
  readonly conteudo: string;
}

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

  // Vazio nas telas que não têm prova em contexto (acervo, resultado): sem os
  // textos da prova não há o que oferecer, e o seletor some.
  readonly textos = input<readonly OpcaoTexto[]>([]);

  readonly salvar = output<EdicaoQuestao>();
  readonly anexarImagem = output<File>();
  readonly removerImagem = output<void>();
  readonly rascunhoMudou = output<EdicaoQuestao>();
  readonly criarTexto = output<void>();
  readonly anexarImagemAlternativa = output<{ letra: string; arquivo: File }>();
  readonly removerImagemAlternativa = output<string>();

  // Letra → URL assinada. Vem de fora porque assinar é trabalho de service.
  readonly urlsAlternativas = input<Readonly<Record<string, string>>>({});

  protected readonly rascunho = signal<EdicaoQuestao>({});
  protected readonly LETRAS = LETRAS;

  protected readonly tem = computed(() => temMudanca(this.rascunho()));

  protected readonly gabaritoMudou = computed(() => 'gabarito' in this.rascunho());

  // Um rótulo curto para o select: o conteúdo tem milhares de caracteres, e o
  // título nem sempre existe.
  protected rotuloTexto(texto: OpcaoTexto): string {
    if (texto.titulo) return texto.titulo;
    const inicio = texto.conteudo.trim().slice(0, 60);
    return texto.conteudo.trim().length > 60 ? `${inicio}…` : inicio;
  }

  // Marcar o vínculo implica depender de texto; desmarcar mantém a dependência
  // e devolve a questão para a pendência, que é o estado honesto.
  protected escolherTexto(id: string): void {
    this.mudar('texto_base_id', id || null);
    if (id) this.mudar('tem_texto_base', true);
  }

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

  // Alternativa sem texto é figura: o desenho é o enunciado dela.
  protected emFigura(alt: { texto: string }): boolean {
    return alt.texto.trim() === '';
  }

  protected readonly alternativasEmFigura = computed(() =>
    this.questao().alternativas.filter((a) => this.emFigura(a)),
  );

  protected urlAlternativa(letra: string): string | null {
    return this.urlsAlternativas()[letra] ?? null;
  }

  protected escolherArquivoAlternativa(letra: string, evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    if (arquivo) this.anexarImagemAlternativa.emit({ letra, arquivo });
    entrada.value = '';
  }

  protected escolherArquivo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    if (arquivo) this.anexarImagem.emit(arquivo);
    entrada.value = ''; // permite reenviar o mesmo arquivo depois de remover
  }
}
