import { computed, inject, Injectable, signal } from '@angular/core';

import { Letra, RespostaNova } from '../../shared/models';
import { QuestaoQuiz, QuizService } from './quiz.service';
import { ModoExecucao, ModoQuiz, RespostaDada } from './regras-quiz';

/**
 * A sessão de quiz em andamento.
 *
 * Vive num service, e não num componente, porque atravessa três rotas
 * (montar → executar → resultado). Vive em MEMÓRIA, e não no banco, porque o
 * quiz é efêmero por decisão do docs/01: não existe tabela `quizzes`, só o
 * `quiz_sessao_id` carimbado em cada resposta.
 *
 * Duas estruturas, e a distinção é o coração do modo prova:
 *
 * - `marcacoes` — INTENÇÃO. Mutável, some se a sessão morrer.
 * - `respostas` — FATO. O que está gravado no banco.
 *
 * É a mesma linha que separa `letra_marcada` de `acertou` no schema: uma
 * marcação não é uma resposta até você entregar.
 *
 * No modo estudo as duas andam juntas — marcar já grava. No modo prova,
 * `marcacoes` enche sozinha e só vira `respostas` na entrega. A consequência é
 * assumida: fechar o tablet no meio de um simulado perde as marcações. É o
 * preço de poder remarcar, não um defeito.
 */
@Injectable({ providedIn: 'root' })
export class SessaoQuizService {
  private readonly service = inject(QuizService);

  readonly questoes = signal<QuestaoQuiz[]>([]);
  readonly respostas = signal<RespostaDada[]>([]);
  readonly indice = signal(0);
  readonly modo = signal<ModoQuiz>('aleatorio');
  readonly execucao = signal<ModoExecucao>('estudo');

  /** Marcações do modo prova, ainda não entregues. */
  readonly marcacoes = signal<Record<string, Letra>>({});

  private readonly sessaoId = signal<string | null>(null);

  readonly ativa = computed(() => this.questoes().length > 0);
  readonly atual = computed<QuestaoQuiz | null>(() => this.questoes()[this.indice()] ?? null);
  readonly total = computed(() => this.questoes().length);
  readonly ehProva = computed(() => this.execucao() === 'prova');

  /** No modo prova nada é revelado antes da entrega. */
  readonly revelaFeedback = computed(() => this.execucao() === 'estudo');

  readonly marcadas = computed(() => Object.keys(this.marcacoes()).length);
  readonly brancos = computed(() => this.total() - this.marcadas());

  /** Terminou: no estudo, tudo respondido; na prova, tudo entregue. */
  readonly terminou = computed(
    () => this.ativa() && !this.ehProva() && this.respostas().length === this.total(),
  );

  readonly entregue = computed(() => this.ativa() && this.respostas().length > 0);

  /** A resposta já gravada para a questão na tela, se houver. */
  readonly respostaAtual = computed<RespostaDada | null>(() => {
    const id = this.atual()?.id;
    return this.respostas().find((r) => r.questaoId === id) ?? null;
  });

  /** A letra em vigor na tela: marcação (prova) ou resposta gravada (estudo). */
  readonly letraAtual = computed<Letra | null>(() => {
    const id = this.atual()?.id;
    if (!id) return null;
    return (
      this.marcacoes()[id] ?? (this.respostaAtual()?.letraMarcada as Letra | undefined) ?? null
    );
  });

  iniciar(questoes: QuestaoQuiz[], modo: ModoQuiz, execucao: ModoExecucao): void {
    this.questoes.set(questoes);
    this.respostas.set([]);
    this.marcacoes.set({});
    this.indice.set(0);
    this.modo.set(modo);
    this.execucao.set(execucao);
    // Gerado no cliente: agrupa as respostas deste quiz sem precisar de uma
    // linha em `quizzes` que não existe.
    this.sessaoId.set(crypto.randomUUID());
  }

  /**
   * Marca uma alternativa.
   *
   * No estudo, marcar é gravar — e não se desfaz: o valor do modo é o
   * compromisso. Na prova, marcar só registra a intenção, e remarcar é livre
   * até a entrega.
   */
  async marcar(letra: Letra): Promise<void> {
    const questao = this.atual();
    if (!questao) return;

    if (this.ehProva()) {
      this.marcacoes.update((atual) => ({ ...atual, [questao.id]: letra }));
      return;
    }

    if (this.respostaAtual()) return;
    await this.gravar([{ questao: questao, letra }]);
  }

  /**
   * Entrega o simulado: um INSERT com todas as marcações.
   *
   * Atômico de propósito — ou tudo grava, ou nada. Falhando, as marcações
   * continuam em memória e dá para tentar de novo; gravação parcial deixaria
   * um simulado meio registrado que ninguém saberia completar.
   *
   * Questão em branco não vira linha: `letra_marcada` é NOT NULL, e um branco
   * não é um erro.
   */
  async entregar(): Promise<void> {
    const marcacoes = this.marcacoes();
    const paraGravar = this.questoes()
      .filter((q) => marcacoes[q.id] !== undefined)
      .map((q) => ({ questao: q, letra: marcacoes[q.id] }));

    await this.gravar(paraGravar);
  }

  private async gravar(itens: readonly { questao: QuestaoQuiz; letra: Letra }[]): Promise<void> {
    if (itens.length === 0) return;

    const linhas: RespostaNova[] = itens.map(({ questao, letra }) => ({
      questao_id: questao.id,
      letra_marcada: letra,
      acertou: letra === questao.gabarito,
      quiz_sessao_id: this.sessaoId(),
    }));

    // Grava PRIMEIRO, registra localmente depois: se o insert falhar, nada
    // entra no placar. Placar que o banco não conhece é pior que repetir.
    await this.service.registrar(linhas);

    this.respostas.update((atual) => [
      ...atual,
      ...itens.map(({ questao, letra }) => ({
        questaoId: questao.id,
        letraMarcada: letra,
        acertou: letra === questao.gabarito,
      })),
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

  /** Estado de cada questão para a tira de marcadores. */
  situacaoDe(questao: QuestaoQuiz): 'marcada' | 'branca' {
    const marcada =
      this.marcacoes()[questao.id] !== undefined ||
      this.respostas().some((r) => r.questaoId === questao.id);
    return marcada ? 'marcada' : 'branca';
  }

  /** Matéria por questão — o que o desempenho por matéria precisa. */
  materiaPorQuestao(): Map<string, string | null> {
    return new Map(this.questoes().map((q) => [q.id, q.materia]));
  }

  encerrar(): void {
    this.questoes.set([]);
    this.respostas.set([]);
    this.marcacoes.set({});
    this.indice.set(0);
    this.sessaoId.set(null);
  }
}
