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
 * Execução do quiz — uma questão por vez.
 *
 * Toda a sessão está no `SessaoQuizService`; esta tela só renderiza e despacha.
 * Sem sessão em memória (recarregou a página, entrou pela URL) ela volta para a
 * montagem: o quiz é efêmero por decisão do docs/01, e fingir que dá para
 * retomar seria pior que dizer que não dá.
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
  protected readonly respondendo = signal(false);
  protected readonly urlImagem = signal<string | null>(null);

  /** Só revela certo/errado quando o modo de feedback pede. */
  protected readonly revelado = computed(
    () => this.sessao.feedbackImediato() && this.sessao.respostaAtual() !== null,
  );

  protected readonly respondidas = computed(() => this.sessao.respostas().length);

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

  protected async responder(letra: Letra): Promise<void> {
    if (this.respondendo() || this.sessao.respostaAtual()) return;

    this.respondendo.set(true);
    this.erro.set(null);
    try {
      await this.sessao.responder(letra);
      // Sem feedback imediato não há o que ler na tela: avança sozinho, como
      // uma folha de respostas.
      if (!this.sessao.feedbackImediato() && !this.sessao.terminou()) this.sessao.avancar();
    } catch (e) {
      this.erro.set(mensagem(e));
    } finally {
      this.respondendo.set(false);
    }
  }

  protected marcada(letra: Letra): boolean {
    return this.sessao.respostaAtual()?.letraMarcada === letra;
  }

  /** Cor da alternativa depois de revelada: a certa e a que você marcou. */
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

  protected async encerrar(): Promise<void> {
    await this.router.navigate(['/quiz/resultado']);
  }

  protected async abandonar(): Promise<void> {
    // As respostas já dadas ficam no banco e contam; só a sessão se desfaz.
    this.sessao.encerrar();
    await this.router.navigate(['/quiz']);
  }
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
