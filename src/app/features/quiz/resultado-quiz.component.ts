import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { EdicaoQuestao } from '../../shared/edicao-questao';
import { EditorQuestaoComponent } from '../../shared/ui/editor-questao.component';
import { AcervoService } from '../acervo/acervo.service';
import { DimensoesService, ItemDimensao } from '../bancas-materias/dimensoes.service';
import { QuestaoQuiz } from './quiz.service';

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
  imports: [RouterLink, EditorQuestaoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resultado-quiz.component.html',
})
export class ResultadoQuizComponent {
  private readonly router = inject(Router);
  private readonly acervo = inject(AcervoService);
  private readonly dimensoes = inject(DimensoesService);

  /**
   * Editar a questão AQUI, embutido, e não numa rota própria.
   *
   * A sessão do quiz vive em memória: navegar para uma tela de edição a
   * destruiria, e você perderia o resultado que estava lendo. O docs/03 pede o
   * atalho justamente para o momento em que você percebe o erro respondendo —
   * seria contraditório que usá-lo custasse o resultado.
   */
  protected readonly editandoId = signal<string | null>(null);
  protected readonly materias = signal<ItemDimensao[]>([]);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly recontadas = signal(0);
  protected readonly respostasAfetadas = signal(0);
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

  protected async editar(id: string): Promise<void> {
    this.editandoId.update((atual) => (atual === id ? null : id));
    this.recontadas.set(0);
    this.respostasAfetadas.set(0);
    if (this.materias().length === 0) {
      try {
        this.materias.set(await this.dimensoes.listar('materias'));
      } catch (e) {
        this.erro.set(mensagem(e));
      }
    }
  }

  protected async acompanhar(questao: QuestaoQuiz, rascunho: EdicaoQuestao): Promise<void> {
    if (rascunho.gabarito === undefined) {
      this.respostasAfetadas.set(0);
      return;
    }
    this.respostasAfetadas.set(await this.acervo.respostasAfetadas(questao.id, rascunho.gabarito));
  }

  /**
   * Salvar NÃO recarrega o quiz nem mexe no placar já mostrado.
   *
   * O placar é o retrato do que aconteceu naquela sessão; corrigir o gabarito
   * agora reconta as respostas no banco (pelo trigger), e é lá que a correção
   * vale — nas estatísticas e na fila de revisão de erros, não no retrato.
   */
  protected async salvar(questao: QuestaoQuiz, mudancas: EdicaoQuestao): Promise<void> {
    if (this.salvando()) return;
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const afetadas =
        mudancas.gabarito !== undefined
          ? await this.acervo.respostasAfetadas(questao.id, mudancas.gabarito)
          : 0;
      await this.acervo.editar(questao.id, mudancas);
      this.sessao.atualizarQuestao(questao.id, mudancas);
      this.recontadas.set(afetadas);
    } catch (e) {
      this.erro.set(mensagem(e));
    } finally {
      this.salvando.set(false);
    }
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

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
