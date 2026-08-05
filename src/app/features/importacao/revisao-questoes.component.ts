import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { IconeComponent } from '../../shared/ui/icone.component';
import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { EstadoVazioComponent } from '../../shared/ui/estado-vazio.component';
import { DimensoesService, ItemDimensao } from '../bancas-materias/dimensoes.service';
import {
  agruparParaRevisao,
  assuntosParaMapear,
  motivosAtencao,
  podeAprovar,
  precisaAtencao,
} from './regras-revisao';
import { EdicaoQuestao } from '../../shared/edicao-questao';
import { EditorQuestaoComponent } from '../../shared/ui/editor-questao.component';
import { QuestaoRevisao, RevisaoService } from './revisao.service';

type Status = 'carregando' | 'ok' | 'erro';

@Component({
  selector: 'app-revisao-questoes',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    EstadoCarregandoComponent,
    EstadoErroComponent,
    EstadoVazioComponent,
    EditorQuestaoComponent,
    IconeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './revisao-questoes.component.html',
})
export class RevisaoQuestoesComponent {
  private readonly service = inject(RevisaoService);
  private readonly dimensoes = inject(DimensoesService);

  readonly id = input.required<string>();

  protected readonly status = signal<Status>('carregando');
  protected readonly questoes = signal<QuestaoRevisao[]>([]);
  protected readonly materias = signal<ItemDimensao[]>([]);
  protected readonly erroCarga = signal<string | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly expandidaId = signal<string | null>(null);

  protected readonly escolhaMateria = signal<Record<string, string>>({});
  protected readonly novaMateria = signal<Record<string, string>>({});

  protected readonly rascunhos = signal<Record<string, EdicaoQuestao>>({});

  protected readonly avisoNaoSalvo = signal<string | null>(null);

  protected readonly toast = signal<string | null>(null);
  private temporizadorToast?: ReturnType<typeof setTimeout>;

  protected readonly urlsPorCaminho = signal<Record<string, string>>({});

  protected readonly grupos = computed(() => agruparParaRevisao(this.questoes()));
  protected readonly paraMapear = computed(() => assuntosParaMapear(this.questoes()));
  protected readonly nomesMateria = computed(
    () => new Map(this.materias().map((m) => [m.id, m.nome])),
  );

  protected readonly totalAprovadas = computed(() => this.grupos().aprovadas.length);
  protected readonly concluida = computed(
    () => this.questoes().length > 0 && this.totalAprovadas() === this.questoes().length,
  );

  constructor() {
    effect(() => {
      const id = this.id();
      void this.carregar(id);
    });

    effect(() => {
      const id = this.expandidaId();
      const questao = this.questoes().find((q) => q.id === id);
      const caminho = questao?.imagem_path;
      if (caminho && !this.urlsPorCaminho()[caminho]) void this.assinarImagem(caminho);
    });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.temporizadorToast));
  }

  private async assinarImagem(caminho: string): Promise<void> {
    try {
      const url = await this.service.urlImagem(caminho);
      this.urlsPorCaminho.update((atual) => ({ ...atual, [caminho]: url }));
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected async carregar(provaId: string = this.id()): Promise<void> {
    this.status.set('carregando');
    this.erroCarga.set(null);
    this.erroAcao.set(null);
    try {
      const [questoes, materias] = await Promise.all([
        this.service.listar(provaId),
        this.dimensoes.listar('materias'),
      ]);
      this.questoes.set(questoes);
      this.materias.set(materias);
      this.status.set('ok');
    } catch (e) {
      this.erroCarga.set(mensagem(e));
      this.status.set('erro');
    }
  }

  private static readonly MS_TOAST = 2500;

  private mostrarToast(texto: string): void {
    clearTimeout(this.temporizadorToast);
    this.toast.set(texto);
    this.temporizadorToast = setTimeout(
      () => this.toast.set(null),
      RevisaoQuestoesComponent.MS_TOAST,
    );
  }

  protected async mapear(assunto: string, questaoIds: string[]): Promise<void> {
    if (this.salvando()) return;
    this.salvando.set(true);
    this.erroAcao.set(null);

    try {
      let materiaId = this.escolhaMateria()[assunto];

      const nome = this.novaMateria()[assunto]?.trim();
      if (!materiaId && nome) {
        const criada = await this.dimensoes.criar('materias', nome);
        this.materias.update((atual) =>
          [...atual, criada].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        );
        materiaId = criada.id;
      }

      if (!materiaId) throw new Error('Escolha uma matéria ou informe o nome de uma nova.');

      await this.service.mapearAssunto(questaoIds, materiaId);
      const ids = new Set(questaoIds);
      this.questoes.update((atual) =>
        atual.map((q) => (ids.has(q.id) ? { ...q, materia_id: materiaId } : q)),
      );
      this.mostrarToast(
        `${questaoIds.length} em ${this.nomesMateria().get(materiaId) ?? 'matéria nova'}`,
      );
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected escolherMateria(assunto: string, materiaId: string): void {
    this.escolhaMateria.update((atual) => ({ ...atual, [assunto]: materiaId }));
  }

  protected digitarNovaMateria(assunto: string, nome: string): void {
    this.novaMateria.update((atual) => ({ ...atual, [assunto]: nome }));
  }

  protected async aprovarSemPendencia(): Promise<void> {
    const ids = this.grupos().semPendencia.map((q) => q.id);
    if (ids.length === 0 || this.salvando()) return;

    this.salvando.set(true);
    this.erroAcao.set(null);
    try {
      await this.service.aprovarEmLote(ids);
      const set = new Set(ids);
      this.questoes.update((atual) =>
        atual.map((q) => (set.has(q.id) ? { ...q, revisada: true } : q)),
      );
      this.mostrarToast(`${ids.length} aprovadas`);
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async alternarAprovacao(q: QuestaoRevisao): Promise<void> {
    this.erroAcao.set(null);
    try {
      this.substituir(await this.service.editar(q.id, { revisada: !q.revisada }));
      this.mostrarToast(q.revisada ? 'Aprovação desfeita' : 'Aprovada');
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected acompanhar(id: string, rascunho: EdicaoQuestao): void {
    this.avisoNaoSalvo.set(null);
    this.rascunhos.update((atual) => {
      const proximo = { ...atual };
      if (Object.keys(rascunho).length > 0) proximo[id] = rascunho;
      else delete proximo[id];
      return proximo;
    });
  }

  protected temRascunho(id: string): boolean {
    return this.rascunhos()[id] !== undefined;
  }

  protected async salvar(q: QuestaoRevisao, mudancas: EdicaoQuestao): Promise<void> {
    if (this.salvando()) return;

    this.salvando.set(true);
    this.erroAcao.set(null);
    try {
      this.substituir(await this.service.editar(q.id, mudancas));
      this.descartar(q.id);
      this.mostrarToast('Salvo');
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected descartar(id: string): void {
    this.avisoNaoSalvo.set(null);
    this.rascunhos.update((atual) => {
      const proximo = { ...atual };
      delete proximo[id];
      return proximo;
    });
  }

  protected descartarEFechar(id: string): void {
    this.descartar(id);
    this.expandidaId.set(null);
  }

  protected alternarExpansao(id: string): void {
    const aberta = this.expandidaId();

    if (aberta !== null && this.temRascunho(aberta)) {
      this.avisoNaoSalvo.set(aberta);
      return;
    }

    this.avisoNaoSalvo.set(null);
    this.expandidaId.set(aberta === id ? null : id);
  }

  protected async anexarImagem(q: QuestaoRevisao, arquivo: File): Promise<void> {
    this.erroAcao.set(null);
    try {
      const atualizada = await this.service.anexarImagem(q, arquivo);
      if (atualizada.imagem_path) this.esquecerUrl(atualizada.imagem_path);
      this.substituir(atualizada);
      this.mostrarToast(q.imagem_path ? 'Imagem trocada' : 'Imagem anexada');
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected async removerImagem(q: QuestaoRevisao): Promise<void> {
    this.erroAcao.set(null);
    try {
      const atualizada = await this.service.removerImagem(q);
      if (q.imagem_path) this.esquecerUrl(q.imagem_path);
      this.substituir(atualizada);
      this.mostrarToast('Imagem removida');
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  private esquecerUrl(caminho: string): void {
    this.urlsPorCaminho.update((atual) => {
      const proximo = { ...atual };
      delete proximo[caminho];
      return proximo;
    });
  }

  private substituir(q: QuestaoRevisao): void {
    this.questoes.update((atual) => atual.map((x) => (x.id === q.id ? q : x)));
  }

  protected readonly precisaAtencao = precisaAtencao;
  protected readonly motivosAtencao = motivosAtencao;
  protected readonly podeAprovar = podeAprovar;
  protected readonly LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
