import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { desempenhoPorMateria, placar, ROTULO_MODO } from './regras-quiz';
import { SessaoQuizService } from './sessao-quiz.service';

/**
 * Resultado do quiz.
 *
 * Lê a sessão que ainda está em memória — por isso `encerrar()` não é chamado
 * ao terminar as questões, só ao sair daqui ou montar outro quiz.
 *
 * O desempenho por matéria vem antes da revisão questão a questão porque é a
 * informação mais útil do docs/03: diz onde focar. O placar geral só diz como
 * foi.
 */
@Component({
  selector: 'app-resultado-quiz',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resultado-quiz.component.html',
})
export class ResultadoQuizComponent {
  private readonly router = inject(Router);
  protected readonly sessao = inject(SessaoQuizService);

  protected readonly placar = computed(() => placar(this.sessao.respostas()));

  protected readonly porMateria = computed(() =>
    desempenhoPorMateria(this.sessao.respostas(), this.sessao.materiaPorQuestao()),
  );

  /** As questões respondidas, com a resposta dada ao lado, na ordem do quiz. */
  protected readonly revisao = computed(() => {
    const respostas = new Map(this.sessao.respostas().map((r) => [r.questaoId, r]));
    return this.sessao
      .questoes()
      .map((questao) => ({ questao, resposta: respostas.get(questao.id) }))
      .filter((item) => item.resposta !== undefined);
  });

  protected readonly ROTULO_MODO = ROTULO_MODO;

  constructor() {
    effect(() => {
      // Sem sessão não há resultado a mostrar: recarregar a página cai aqui.
      if (!this.sessao.ativa()) void this.router.navigate(['/quiz']);
    });
  }

  protected async novoQuiz(): Promise<void> {
    this.sessao.encerrar();
    await this.router.navigate(['/quiz']);
  }

  protected corPercentual(percentual: number): string {
    if (percentual >= 70) return 'text-emerald-700';
    if (percentual >= 50) return 'text-amber-700';
    return 'text-red-700';
  }
}
