import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { QuizService } from './quiz.service';
import {
  aplicarFiltros,
  aplicarModo,
  CandidataComNomes,
  FiltrosQuiz,
  FILTROS_VAZIOS,
  ModoQuiz,
  motivoConjuntoVazio,
  opcoesDeFiltro,
  ROTULO_MODO,
  RespostaHistorico,
  sortear,
} from './regras-quiz';
import { SessaoQuizService } from './sessao-quiz.service';

type Status = 'carregando' | 'ok' | 'erro';

/**
 * Montagem do quiz.
 *
 * O acervo e o histórico são carregados UMA vez; a partir daí, mudar filtro ou
 * modo não vai ao banco — a contagem é recalculada por funções puras. É o que
 * permite o contador viver a cada clique sem custo, e é o mesmo cálculo que
 * monta o quiz: o número na tela não pode divergir do que o botão vai sortear.
 */
@Component({
  selector: 'app-montar-quiz',
  imports: [FormsModule, EstadoCarregandoComponent, EstadoErroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './montar-quiz.component.html',
})
export class MontarQuizComponent {
  private readonly service = inject(QuizService);
  private readonly sessao = inject(SessaoQuizService);
  private readonly router = inject(Router);

  protected readonly status = signal<Status>('carregando');
  protected readonly erroCarga = signal<string | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly montando = signal(false);

  protected readonly acervo = signal<CandidataComNomes[]>([]);
  protected readonly historico = signal<RespostaHistorico[]>([]);

  protected readonly filtros = signal<FiltrosQuiz>(FILTROS_VAZIOS);
  protected readonly modo = signal<ModoQuiz>('aleatorio');
  protected readonly quantidade = signal(10);
  protected readonly feedbackImediato = signal(true);

  protected readonly opcoes = computed(() => opcoesDeFiltro(this.acervo(), this.filtros()));

  /** As candidatas de verdade: filtros + modo. É delas que o sorteio sai. */
  protected readonly candidatas = computed(() =>
    aplicarModo(aplicarFiltros(this.acervo(), this.filtros()), this.historico(), this.modo()),
  );

  protected readonly disponiveis = computed(() => this.candidatas().length);

  protected readonly motivoVazio = computed(() =>
    motivoConjuntoVazio(this.acervo(), this.historico(), this.filtros(), this.modo()),
  );

  /** Quantas vão de fato entrar — o aviso de "pediu 50, tem 38" vem daqui. */
  protected readonly vaiMontarCom = computed(() => Math.min(this.quantidade(), this.disponiveis()));

  protected readonly MODOS: ModoQuiz[] = ['aleatorio', 'nao_respondidas', 'revisao_erros'];
  protected readonly QUANTIDADES = [10, 20, 50];
  protected readonly ROTULO_MODO = ROTULO_MODO;

  constructor() {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.status.set('carregando');
    this.erroCarga.set(null);
    try {
      const [acervo, historico] = await Promise.all([
        this.service.acervoElegivel(),
        this.service.historico(),
      ]);
      this.acervo.set(acervo);
      this.historico.set(historico);
      this.status.set('ok');
    } catch (e) {
      this.erroCarga.set(mensagem(e));
      this.status.set('erro');
    }
  }

  // --- filtros ----------------------------------------------------------------

  protected escolherBanca(id: string | null): void {
    // Trocar a banca invalida concurso e matéria escolhidos: eles podem não
    // existir dentro da nova banca, e um filtro fantasma zeraria o conjunto sem
    // nada na tela explicando por quê.
    this.filtros.set({ bancaId: id || null, concursoId: null, materiaIds: [] });
  }

  protected escolherConcurso(id: string | null): void {
    this.filtros.update((f) => ({ ...f, concursoId: id || null, materiaIds: [] }));
  }

  protected alternarMateria(id: string): void {
    this.filtros.update((f) => ({
      ...f,
      materiaIds: f.materiaIds.includes(id)
        ? f.materiaIds.filter((m) => m !== id)
        : [...f.materiaIds, id],
    }));
  }

  protected materiaEscolhida(id: string): boolean {
    return this.filtros().materiaIds.includes(id);
  }

  protected limparFiltros(): void {
    this.filtros.set(FILTROS_VAZIOS);
  }

  protected temFiltro(): boolean {
    const f = this.filtros();
    return f.bancaId !== null || f.concursoId !== null || f.materiaIds.length > 0;
  }

  // --- montagem ---------------------------------------------------------------

  protected async comecar(): Promise<void> {
    if (this.disponiveis() === 0 || this.montando()) return;

    this.montando.set(true);
    this.erroAcao.set(null);
    try {
      const sorteadas = sortear(this.candidatas(), this.quantidade());
      const questoes = await this.service.questoes(sorteadas.map((q) => q.id));
      this.sessao.iniciar(questoes, this.modo(), this.feedbackImediato());
      await this.router.navigate(['/quiz/executar']);
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.montando.set(false);
    }
  }
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
