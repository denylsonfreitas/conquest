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
import { ConfirmacaoComponent } from '../../shared/ui/confirmacao.component';
import { EnunciadoComponent } from '../../shared/ui/enunciado.component';
import { IconeComponent } from '../../shared/ui/icone.component';
import { QuestaoQuiz, QuizService } from './quiz.service';
import { avisoDeSaida } from './regras-quiz';
import { SessaoQuizService } from './sessao-quiz.service';

@Component({
  selector: 'app-quiz-execucao',
  imports: [EnunciadoComponent, ConfirmacaoComponent, IconeComponent],
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
  protected readonly confirmandoEntrega = signal(false);

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

    effect(() => {
      const caminho = this.sessao.atual()?.imagem_path;
      this.urlImagem.set(null);
      if (caminho) void this.carregarImagem(caminho);
    });

    effect(() => {
      const questao = this.sessao.atual();
      this.urlsAlternativas.set({});
      if (questao) void this.carregarAlternativas(questao);
    });
  }

  // Alternativa que é figura não tem texto: sem a imagem o botão sairia com a
  // letra e mais nada.
  protected readonly urlsAlternativas = signal<Record<string, string>>({});

  protected urlAlternativa(letra: string): string | null {
    return this.urlsAlternativas()[letra] ?? null;
  }

  private async carregarAlternativas(questao: QuestaoQuiz): Promise<void> {
    const urls: Record<string, string> = {};
    for (const alt of questao.alternativas) {
      if (alt.texto.trim() !== '' || !alt.imagem_path) continue;
      try {
        urls[alt.letra] = await this.service.urlImagem(alt.imagem_path);
      } catch (e) {
        this.erro.set(mensagem(e));
      }
    }
    this.urlsAlternativas.set(urls);
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

  protected estilo(letra: Letra): string {
    if (!this.revelado()) {
      return this.marcada(letra)
        ? 'bg-marca text-marca-contraste ring-marca'
        : 'bg-superficie text-texto ring-borda hover:bg-superficie-sutil';
    }

    const gabarito = this.sessao.atual()?.gabarito;
    if (letra === gabarito) return 'bg-sucesso-fundo text-sucesso ring-sucesso';
    if (this.marcada(letra)) return 'bg-perigo-fundo text-perigo ring-perigo';
    return 'bg-superficie text-texto-fraco ring-borda';
  }

  protected pedirEntrega(): void {
    this.confirmandoEntrega.set(true);
  }

  protected cancelarEntrega(): void {
    this.confirmandoEntrega.set(false);
  }

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

  // Encerrar no meio e sair do quiz não são a mesma coisa: o primeiro leva ao
  // resultado com o que já foi respondido, o segundo joga fora a sessão. Por
  // isso são duas confirmações, com textos que dizem qual é qual.
  protected readonly confirmandoEncerramento = signal(false);
  protected readonly confirmandoSaida = signal(false);

  protected pedirEncerramento(): void {
    this.confirmandoEncerramento.set(true);
  }

  protected async confirmarEncerramento(): Promise<void> {
    this.confirmandoEncerramento.set(false);
    await this.verResultado();
  }

  protected pedirSaida(): void {
    this.confirmandoSaida.set(true);
  }

  protected async abandonar(): Promise<void> {
    this.confirmandoSaida.set(false);
    this.sessao.encerrar();
    await this.router.navigate(['/quiz']);
  }

  protected readonly avisoDeSaida = computed(() =>
    avisoDeSaida(
      this.sessao.ehProva() ? 'prova' : 'estudo',
      this.sessao.marcadas(),
      this.sessao.respostas().length,
    ),
  );
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
