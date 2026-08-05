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
  ModoExecucao,
  ModoQuiz,
  motivoConjuntoVazio,
  normalizarQuantidade,
  primeiras,
  QUANTIDADE_MAX,
  QUANTIDADE_MIN,
  RespostaHistorico,
  RESUMO_EXECUCAO,
  ROTULO_EXECUCAO,
  ROTULO_MODO,
} from './regras-quiz';
import { SessaoQuizService } from './sessao-quiz.service';

type Status = 'carregando' | 'ok' | 'erro';

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
  protected readonly execucao = signal<ModoExecucao>('estudo');

  protected readonly candidatas = computed(() =>
    aplicarModo(aplicarFiltros(this.acervo(), this.filtros()), this.historico(), this.modo()),
  );

  protected readonly disponiveis = computed(() => this.candidatas().length);

  protected readonly motivoVazio = computed(() =>
    motivoConjuntoVazio(this.acervo(), this.historico(), this.filtros(), this.modo()),
  );

  protected readonly vaiMontarCom = computed(() => Math.min(this.quantidade(), this.disponiveis()));

  protected readonly MODOS: ModoQuiz[] = ['aleatorio', 'menos_vistas', 'revisao_erros'];
  protected readonly ROTULO_MODO = ROTULO_MODO;
  protected readonly EXECUCOES: ModoExecucao[] = ['estudo', 'prova'];
  protected readonly ROTULO_EXECUCAO = ROTULO_EXECUCAO;
  protected readonly RESUMO_EXECUCAO = RESUMO_EXECUCAO;
  protected readonly QUANTIDADE_MIN = QUANTIDADE_MIN;
  protected readonly QUANTIDADE_MAX = QUANTIDADE_MAX;

  protected readonly quantidadeExibida = signal('10');

  protected digitarQuantidade(texto: string): void {
    this.quantidade.set(normalizarQuantidade(texto, this.quantidade()));
  }

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

  protected async comecar(): Promise<void> {
    if (this.disponiveis() === 0 || this.montando()) return;

    this.montando.set(true);
    this.erroAcao.set(null);
    try {
      const fila = filaDoModo(
        aplicarFiltros(this.acervo(), this.filtros()),
        this.historico(),
        this.modo(),
      );
      const escolhidas = primeiras(fila, this.quantidade());
      const questoes = await this.service.questoes(escolhidas.map((q) => q.id));
      this.sessao.iniciar(questoes, this.modo(), this.execucao());
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
