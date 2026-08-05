import { computed, inject, Injectable, signal } from '@angular/core';

import { Letra, RespostaNova } from '../../shared/models';
import { QuestaoQuiz, QuizService } from './quiz.service';
import { ModoExecucao, ModoQuiz, RespostaDada } from './regras-quiz';

@Injectable({ providedIn: 'root' })
export class SessaoQuizService {
  private readonly service = inject(QuizService);

  readonly questoes = signal<QuestaoQuiz[]>([]);
  readonly respostas = signal<RespostaDada[]>([]);
  readonly indice = signal(0);
  readonly modo = signal<ModoQuiz>('aleatorio');
  readonly execucao = signal<ModoExecucao>('estudo');

  readonly marcacoes = signal<Record<string, Letra>>({});

  private readonly sessaoId = signal<string | null>(null);

  readonly ativa = computed(() => this.questoes().length > 0);
  readonly atual = computed<QuestaoQuiz | null>(() => this.questoes()[this.indice()] ?? null);
  readonly total = computed(() => this.questoes().length);
  readonly ehProva = computed(() => this.execucao() === 'prova');

  readonly revelaFeedback = computed(() => this.execucao() === 'estudo');

  readonly marcadas = computed(() => Object.keys(this.marcacoes()).length);
  readonly brancos = computed(() => this.total() - this.marcadas());

  readonly terminou = computed(
    () => this.ativa() && !this.ehProva() && this.respostas().length === this.total(),
  );

  readonly entregue = computed(() => this.ativa() && this.respostas().length > 0);

  readonly respostaAtual = computed<RespostaDada | null>(() => {
    const id = this.atual()?.id;
    return this.respostas().find((r) => r.questaoId === id) ?? null;
  });

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
    this.sessaoId.set(crypto.randomUUID());
  }

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

  situacaoDe(questao: QuestaoQuiz): 'marcada' | 'branca' {
    const marcada =
      this.marcacoes()[questao.id] !== undefined ||
      this.respostas().some((r) => r.questaoId === questao.id);
    return marcada ? 'marcada' : 'branca';
  }

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
