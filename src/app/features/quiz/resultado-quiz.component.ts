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

  protected readonly editandoId = signal<string | null>(null);
  protected readonly materias = signal<ItemDimensao[]>([]);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly recontadas = signal(0);
  protected readonly respostasAfetadas = signal(0);
  protected readonly sessao = inject(SessaoQuizService);

  protected readonly placar = computed(() => placar(this.sessao.respostas(), this.sessao.total()));

  protected readonly porMateria = computed(() =>
    desempenhoPorMateria(this.sessao.respostas(), this.sessao.materiaPorQuestao()),
  );

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
    if (percentual >= 70) return 'text-sucesso';
    if (percentual >= 50) return 'text-atencao';
    return 'text-perigo';
  }
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
