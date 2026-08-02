import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { FiltrosAcervoComponent } from '../../shared/ui/filtros-acervo.component';
import { QuizService } from './quiz.service';
import {
  aplicarFiltros,
  FILTROS_VAZIOS,
  FiltrosAcervo,
  ItemComNomes,
} from '../../shared/filtros-acervo';
import {
  aplicarModo,
  filaDoModo,
  ModoQuiz,
  motivoConjuntoVazio,
  normalizarQuantidade,
  primeiras,
  QUANTIDADE_MAX,
  QUANTIDADE_MIN,
  RespostaHistorico,
  ROTULO_MODO,
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
  imports: [FormsModule, EstadoCarregandoComponent, EstadoErroComponent, FiltrosAcervoComponent],
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

  protected readonly acervo = signal<ItemComNomes[]>([]);
  protected readonly historico = signal<RespostaHistorico[]>([]);

  protected readonly filtros = signal<FiltrosAcervo>(FILTROS_VAZIOS);
  protected readonly modo = signal<ModoQuiz>('aleatorio');
  protected readonly quantidade = signal(10);
  protected readonly feedbackImediato = signal(true);

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

  protected readonly MODOS: ModoQuiz[] = ['aleatorio', 'menos_vistas', 'revisao_erros'];
  protected readonly ROTULO_MODO = ROTULO_MODO;
  protected readonly QUANTIDADE_MIN = QUANTIDADE_MIN;
  protected readonly QUANTIDADE_MAX = QUANTIDADE_MAX;

  /**
   * O que o campo MOSTRA, separado do valor em vigor.
   *
   * Só muda ao sair do campo. Reescrever o input a cada tecla jogaria o cursor
   * para o fim ao editar no meio do número — o mesmo problema do comentário na
   * revisão.
   */
  protected readonly quantidadeExibida = signal('10');

  protected digitarQuantidade(texto: string): void {
    this.quantidade.set(normalizarQuantidade(texto, this.quantidade()));
  }

  /** Ao sair do campo, ele passa a mostrar o número que de fato será usado. */
  protected normalizarCampo(): void {
    this.quantidadeExibida.set(String(this.quantidade()));
  }

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

  // --- montagem ---------------------------------------------------------------

  protected async comecar(): Promise<void> {
    if (this.disponiveis() === 0 || this.montando()) return;

    this.montando.set(true);
    this.erroAcao.set(null);
    try {
      // A fila já vem na ordem do modo; cortar no topo é o que respeita a
      // prioridade que "menos vistas" acabou de estabelecer.
      const fila = filaDoModo(
        aplicarFiltros(this.acervo(), this.filtros()),
        this.historico(),
        this.modo(),
      );
      const escolhidas = primeiras(fila, this.quantidade());
      const questoes = await this.service.questoes(escolhidas.map((q) => q.id));
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
