import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { Letra } from '../../shared/models';
import { QuizService } from './quiz.service';
import { SessaoQuizService } from './sessao-quiz.service';

/**
 * Execução do quiz — uma questão por vez, em dois modos.
 *
 * **Estudo:** marcar grava na hora, a resposta certa aparece na hora, e não se
 * remarca. O valor é o compromisso.
 *
 * **Prova:** marcar só registra a intenção, remarcar é livre, e nada é
 * revelado até a entrega. É o simulado.
 *
 * Toda a sessão está no `SessaoQuizService`; esta tela só renderiza e despacha.
 * Sem sessão em memória (recarregou a página, entrou pela URL) ela volta para a
 * montagem: o quiz é efêmero por decisão do docs/01.
 */
@Component({
  selector: 'app-quiz-execucao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quiz-execucao.component.html',
})
export class QuizExecucaoComponent {
  private readonly service = inject(QuizService);
  private readonly router = inject(Router);
  protected readonly sessao = inject(SessaoQuizService);

  protected readonly erro = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly urlImagem = signal<string | null>(null);
  /** Passo de confirmação da entrega, onde os brancos são contados. */
  protected readonly confirmandoEntrega = signal(false);

  /** Só revela certo/errado no modo estudo, e só depois de responder. */
  protected readonly revelado = computed(
    () => this.sessao.revelaFeedback() && this.sessao.respostaAtual() !== null,
  );

  protected readonly progresso = computed(() =>
    this.sessao.ehProva() ? this.sessao.marcadas() : this.sessao.respostas().length,
  );

  constructor() {
    effect(() => {
      if (!this.sessao.ativa()) void this.router.navigate(['/quiz']);
    });

    // A imagem é parte do enunciado: sem ela a questão não se responde — é a
    // mesma regra de elegibilidade, agora do lado de quem estuda.
    effect(() => {
      const caminho = this.sessao.atual()?.imagem_path;
      this.urlImagem.set(null);
      if (caminho) void this.carregarImagem(caminho);
    });
  }

  private async carregarImagem(caminho: string): Promise<void> {
    try {
      this.urlImagem.set(await this.service.urlImagem(caminho));
    } catch (e) {
      this.erro.set(mensagem(e));
    }
  }

  protected async marcar(letra: Letra): Promise<void> {
    if (this.ocupado()) return;
    // No estudo, marcado é marcado. Na prova, remarcar é o ponto.
    if (!this.sessao.ehProva() && this.sessao.respostaAtual()) return;

    this.ocupado.set(true);
    this.erro.set(null);
    try {
      await this.sessao.marcar(letra);
    } catch (e) {
      this.erro.set(mensagem(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected marcada(letra: Letra): boolean {
    return this.sessao.letraAtual() === letra;
  }

  /** Cor da alternativa: seleção antes de revelar, acerto/erro depois. */
  protected estilo(letra: Letra): string {
    if (!this.revelado()) {
      return this.marcada(letra)
        ? 'bg-tinta-900 text-white ring-tinta-900'
        : 'bg-white ring-tinta-200 hover:bg-tinta-50';
    }

    const gabarito = this.sessao.atual()?.gabarito;
    if (letra === gabarito) return 'bg-emerald-50 text-emerald-900 ring-emerald-300';
    if (this.marcada(letra)) return 'bg-red-50 text-red-900 ring-red-300';
    return 'bg-white text-tinta-500 ring-tinta-200';
  }

  // --- entrega (modo prova) ----------------------------------------------------

  protected pedirEntrega(): void {
    this.confirmandoEntrega.set(true);
  }

  protected cancelarEntrega(): void {
    this.confirmandoEntrega.set(false);
  }

  /**
   * Entrega: um INSERT com tudo. Só aqui as marcações viram respostas.
   *
   * Se falhar, nada foi gravado e as marcações continuam na tela — o insert é
   * atômico justamente para não existir simulado meio entregue.
   */
  protected async entregar(): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.erro.set(null);
    try {
      await this.sessao.entregar();
      this.confirmandoEntrega.set(false);
      await this.router.navigate(['/quiz/resultado']);
    } catch (e) {
      this.erro.set(mensagem(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async verResultado(): Promise<void> {
    await this.router.navigate(['/quiz/resultado']);
  }

  protected async abandonar(): Promise<void> {
    // No estudo as respostas já dadas ficam no banco e contam. Na prova, as
    // marcações somem sem virar nada — é o preço de gravar só na entrega.
    this.sessao.encerrar();
    await this.router.navigate(['/quiz']);
  }
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
