import { computed, inject, Injectable, signal } from '@angular/core';

import { Letra } from '../../shared/models';
import { QuestaoQuiz, QuizService } from './quiz.service';
import { ModoQuiz, RespostaDada } from './regras-quiz';

/**
 * A sessão de quiz em andamento.
 *
 * Vive num service, e não num componente, porque atravessa três rotas
 * (montar → executar → resultado). Vive em MEMÓRIA, e não no banco, porque o
 * quiz é efêmero por decisão do docs/01: não existe tabela `quizzes`, só o
 * `quiz_sessao_id` carimbado em cada resposta.
 *
 * A consequência é deliberada: recarregar a página no meio do quiz encerra a
 * sessão. Nada se perde — cada resposta já foi gravada quando dada, e conta
 * para as estatísticas. Você só não continua de onde parou.
 */
@Injectable({ providedIn: 'root' })
export class SessaoQuizService {
  private readonly service = inject(QuizService);

  readonly questoes = signal<QuestaoQuiz[]>([]);
  readonly respostas = signal<RespostaDada[]>([]);
  readonly indice = signal(0);
  readonly feedbackImediato = signal(true);
  readonly modo = signal<ModoQuiz>('aleatorio');

  private readonly sessaoId = signal<string | null>(null);

  readonly ativa = computed(() => this.questoes().length > 0);
  readonly atual = computed<QuestaoQuiz | null>(() => this.questoes()[this.indice()] ?? null);
  readonly total = computed(() => this.questoes().length);
  readonly terminou = computed(() => this.ativa() && this.respostas().length === this.total());

  /** A resposta já dada para a questão na tela, se houver. */
  readonly respostaAtual = computed<RespostaDada | null>(() => {
    const id = this.atual()?.id;
    return this.respostas().find((r) => r.questaoId === id) ?? null;
  });

  iniciar(questoes: QuestaoQuiz[], modo: ModoQuiz, feedbackImediato: boolean): void {
    this.questoes.set(questoes);
    this.respostas.set([]);
    this.indice.set(0);
    this.modo.set(modo);
    this.feedbackImediato.set(feedbackImediato);
    // Gerado no cliente: agrupa as respostas deste quiz sem precisar de uma
    // linha em `quizzes` que não existe.
    this.sessaoId.set(crypto.randomUUID());
  }

  /**
   * Grava PRIMEIRO, registra localmente depois.
   *
   * Se o insert falhar, a resposta não entra na lista e o erro sobe: melhor
   * repetir o clique do que ver um placar que o banco não conhece.
   */
  async responder(letra: Letra): Promise<void> {
    const questao = this.atual();
    if (!questao || this.respostaAtual()) return;

    const acertou = letra === questao.gabarito;
    await this.service.registrar({
      questao_id: questao.id,
      letra_marcada: letra,
      acertou,
      quiz_sessao_id: this.sessaoId(),
    });

    this.respostas.update((atual) => [
      ...atual,
      { questaoId: questao.id, letraMarcada: letra, acertou },
    ]);
  }

  /**
   * Reflete na sessão uma edição feita a partir do resultado.
   *
   * Só a questão muda. As `respostas` já dadas ficam como estão: o placar é o
   * retrato daquela sessão, e corrigir um gabarito agora vale para as
   * estatísticas e para a fila de revisão de erros — quem reconta isso é o
   * trigger do banco, não esta tela.
   */
  atualizarQuestao(id: string, mudancas: Partial<QuestaoQuiz>): void {
    this.questoes.update((atual) => atual.map((q) => (q.id === id ? { ...q, ...mudancas } : q)));
  }

  avancar(): void {
    if (this.indice() < this.total() - 1) this.indice.update((i) => i + 1);
  }

  voltar(): void {
    if (this.indice() > 0) this.indice.update((i) => i - 1);
  }

  irPara(indice: number): void {
    if (indice >= 0 && indice < this.total()) this.indice.set(indice);
  }

  /** Matéria por questão — o que o desempenho por matéria precisa. */
  materiaPorQuestao(): Map<string, string | null> {
    return new Map(this.questoes().map((q) => [q.id, q.materia]));
  }

  encerrar(): void {
    this.questoes.set([]);
    this.respostas.set([]);
    this.indice.set(0);
    this.sessaoId.set(null);
  }
}
