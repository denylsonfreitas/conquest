import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { IconeComponent } from '../../shared/ui/icone.component';
import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { EstadoVazioComponent } from '../../shared/ui/estado-vazio.component';
import { EditorQuestaoComponent } from '../../shared/ui/editor-questao.component';
import { EnunciadoComponent } from '../../shared/ui/enunciado.component';
import { FiltrosAcervoComponent } from '../../shared/ui/filtros-acervo.component';
import { EdicaoQuestao } from '../../shared/edicao-questao';
import { FILTROS_VAZIOS, FiltrosAcervo, ItemComNomes } from '../../shared/filtros-acervo';
import { DimensoesService, ItemDimensao } from '../bancas-materias/dimensoes.service';
import {
  AcervoService,
  POR_PAGINA,
  QuestaoAcervo,
  ROTULO_SITUACAO,
  Situacao,
} from './acervo.service';

type Status = 'carregando' | 'ok' | 'erro';

@Component({
  selector: 'app-lista-acervo',
  imports: [
    EstadoCarregandoComponent,
    EstadoErroComponent,
    EstadoVazioComponent,
    EditorQuestaoComponent,
    EnunciadoComponent,
    FiltrosAcervoComponent,
    IconeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lista-acervo.component.html',
})
export class ListaAcervoComponent {
  private readonly service = inject(AcervoService);
  private readonly dimensoes = inject(DimensoesService);

  protected readonly status = signal<Status>('carregando');
  protected readonly erroCarga = signal<string | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly salvando = signal(false);

  protected readonly universo = signal<ItemComNomes[]>([]);
  protected readonly materias = signal<ItemDimensao[]>([]);
  protected readonly questoes = signal<QuestaoAcervo[]>([]);
  protected readonly total = signal(0);

  protected readonly filtros = signal<FiltrosAcervo>(FILTROS_VAZIOS);
  protected readonly situacao = signal<Situacao>('todas');
  protected readonly busca = signal('');
  protected readonly pagina = signal(0);

  protected readonly abertaId = signal<string | null>(null);
  protected readonly pendenteId = signal<string | null>(null);
  protected readonly respostasAfetadas = signal(0);
  protected readonly urlImagem = signal<string | null>(null);

  protected readonly SITUACOES: Situacao[] = [
    'todas',
    'elegivel',
    'falta_imagem',
    'falta_texto',
    'anulada',
    'nao_revisada',
  ];
  protected readonly ROTULO_SITUACAO = ROTULO_SITUACAO;

  protected readonly paginas = computed(() => Math.ceil(this.total() / POR_PAGINA));
  protected readonly aberta = computed(
    () => this.questoes().find((q) => q.id === this.abertaId()) ?? null,
  );

  constructor() {
    void this.carregar();

    effect(() => {
      this.filtros();
      this.situacao();
      this.busca();
      this.pagina();
      void this.buscar();
    });

    effect(() => {
      const caminho = this.aberta()?.imagem_path;
      this.urlImagem.set(null);
      if (caminho) void this.assinar(caminho);
    });
  }

  private async assinar(caminho: string): Promise<void> {
    try {
      this.urlImagem.set(await this.service.urlImagem(caminho));
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected async carregar(): Promise<void> {
    this.status.set('carregando');
    this.erroCarga.set(null);
    try {
      const [universo, materias] = await Promise.all([
        this.service.universo(),
        this.dimensoes.listar('materias'),
      ]);
      this.universo.set(universo);
      this.materias.set(materias);
      this.status.set('ok');
    } catch (e) {
      this.erroCarga.set(mensagem(e));
      this.status.set('erro');
    }
  }

  private async buscar(): Promise<void> {
    try {
      const pagina = await this.service.listar(
        this.filtros(),
        this.situacao(),
        this.busca(),
        this.pagina(),
      );
      this.questoes.set(pagina.questoes);
      this.total.set(pagina.total);
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected mudarFiltros(filtros: FiltrosAcervo): void {
    this.pagina.set(0);
    this.filtros.set(filtros);
  }

  protected mudarSituacao(situacao: Situacao): void {
    this.pagina.set(0);
    this.situacao.set(situacao);
  }

  protected digitarBusca(termo: string): void {
    this.pagina.set(0);
    this.busca.set(termo);
  }

  protected alternarAberta(id: string): void {
    if (this.pendenteId() !== null) return;
    this.abertaId.update((atual) => (atual === id ? null : id));
    this.respostasAfetadas.set(0);
  }

  protected async acompanhar(questao: QuestaoAcervo, rascunho: EdicaoQuestao): Promise<void> {
    const pendente = Object.keys(rascunho).length > 0;
    this.pendenteId.set(pendente ? questao.id : null);

    if (rascunho.gabarito === undefined) {
      this.respostasAfetadas.set(0);
      return;
    }
    this.respostasAfetadas.set(await this.service.respostasAfetadas(questao.id, rascunho.gabarito));
  }

  protected async salvar(questao: QuestaoAcervo, mudancas: EdicaoQuestao): Promise<void> {
    if (this.salvando()) return;
    this.salvando.set(true);
    this.erroAcao.set(null);
    try {
      const afetadas =
        mudancas.gabarito !== undefined
          ? await this.service.respostasAfetadas(questao.id, mudancas.gabarito)
          : 0;

      const atualizada = await this.service.editar(questao.id, mudancas);
      this.questoes.update((atual) => atual.map((q) => (q.id === atualizada.id ? atualizada : q)));
      this.pendenteId.set(null);
      this.recontadas.set(afetadas);
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected readonly recontadas = signal(0);

  protected async anexarImagem(questao: QuestaoAcervo, arquivo: File): Promise<void> {
    this.erroAcao.set(null);
    try {
      const caminho = await this.service.anexarImagem(questao, arquivo);
      const atualizada = await this.service.editar(questao.id, {
        imagem_path: caminho,
        tem_imagem: true,
      });
      this.urlImagem.set(null);
      this.questoes.update((atual) => atual.map((q) => (q.id === atualizada.id ? atualizada : q)));
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected async removerImagem(questao: QuestaoAcervo): Promise<void> {
    this.erroAcao.set(null);
    try {
      const atualizada = await this.service.editar(questao.id, { imagem_path: null });
      this.urlImagem.set(null);
      this.questoes.update((atual) => atual.map((q) => (q.id === atualizada.id ? atualizada : q)));
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected irPara(pagina: number): void {
    if (pagina >= 0 && pagina < this.paginas()) this.pagina.set(pagina);
  }
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
