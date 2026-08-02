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
import { QuestaoRevisao, RevisaoService } from './revisao.service';

type Status = 'carregando' | 'ok' | 'erro';

/**
 * Revisão das questões extraídas — fecha o pipeline write-side.
 *
 * A tela é organizada pelo que economiza tempo, não pela ordem do banco:
 *
 * 1. **Mapeamento de matérias** primeiro, se houver `assunto` sem matéria
 *    canônica. Uma prova chama a seção de "Conhecimentos Específicos" trinta
 *    vezes; mapear esse nome uma vez resolve as trinta.
 * 2. **Dois grupos**: precisa de atenção e sem pendência, com a numeração
 *    original preservada dentro de cada — um sort global por gravidade
 *    embaralharia os números e impediria conferir a questão contra o PDF.
 * 3. **Aprovar em lote** o que não tem pendência, com contagem explícita.
 *
 * As edições de uma questão salvam no `change` do campo, sem botão de
 * confirmar, e cada questão mostra "Salvando…" → "Salvo". A alternativa —
 * um botão por questão — reintroduziria a pergunta "cliquei em salvar?" a
 * cada uma das 70; aqui a resposta fica na tela sem ninguém precisar agir.
 */
@Component({
  selector: 'app-revisao-questoes',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    EstadoCarregandoComponent,
    EstadoErroComponent,
    EstadoVazioComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './revisao-questoes.component.html',
})
export class RevisaoQuestoesComponent {
  private readonly service = inject(RevisaoService);
  private readonly dimensoes = inject(DimensoesService);

  /** Vem de `/provas/:id/revisao`. */
  readonly id = input.required<string>();

  protected readonly status = signal<Status>('carregando');
  protected readonly questoes = signal<QuestaoRevisao[]>([]);
  protected readonly materias = signal<ItemDimensao[]>([]);
  protected readonly erroCarga = signal<string | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly expandidaId = signal<string | null>(null);

  /** Matéria escolhida para cada grupo de assunto, antes de confirmar. */
  protected readonly escolhaMateria = signal<Record<string, string>>({});
  protected readonly novaMateria = signal<Record<string, string>>({});

  /** Feedback de gravação por questão: some sozinho alguns segundos depois. */
  protected readonly salvamento = signal<Record<string, 'salvando' | 'salvo'>>({});
  private readonly temporizadores = new Map<string, ReturnType<typeof setTimeout>>();

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

    inject(DestroyRef).onDestroy(() => {
      for (const t of this.temporizadores.values()) clearTimeout(t);
    });
  }

  /** Duração do "Salvo" antes de sumir. Curto o bastante para não virar ruído. */
  private static readonly MS_SALVO_VISIVEL = 3000;

  private marcarSalvamento(id: string, estado: 'salvando' | 'salvo' | null): void {
    clearTimeout(this.temporizadores.get(id));
    this.temporizadores.delete(id);

    this.salvamento.update((atual) => {
      const proximo = { ...atual };
      if (estado) proximo[id] = estado;
      else delete proximo[id];
      return proximo;
    });

    if (estado === 'salvo') {
      this.temporizadores.set(
        id,
        setTimeout(
          () => this.marcarSalvamento(id, null),
          RevisaoQuestoesComponent.MS_SALVO_VISIVEL,
        ),
      );
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

  // --- fase 1: mapeamento de matérias -----------------------------------------

  protected async mapear(assunto: string, questaoIds: string[]): Promise<void> {
    if (this.salvando()) return;
    this.salvando.set(true);
    this.erroAcao.set(null);

    try {
      let materiaId = this.escolhaMateria()[assunto];

      // Criar inline: mandar você a /materias e voltar é a fricção que faz a
      // revisão ser adiada.
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

  // --- fase 2: aprovação -------------------------------------------------------

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
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async alternarAprovacao(q: QuestaoRevisao): Promise<void> {
    // Desaprovar devolve a prova a aguardando_revisao pelo trigger do banco.
    await this.aplicar(q, { revisada: !q.revisada });
  }

  // --- edição de uma questão ---------------------------------------------------

  protected async definirMateria(q: QuestaoRevisao, materiaId: string): Promise<void> {
    await this.aplicar(q, { materia_id: materiaId || null });
  }

  protected async definirGabarito(q: QuestaoRevisao, letra: string): Promise<void> {
    await this.aplicar(q, { gabarito: (letra || null) as QuestaoRevisao['gabarito'] });
  }

  protected async definirComentario(q: QuestaoRevisao, texto: string): Promise<void> {
    await this.aplicar(q, { comentario: texto.trim() || null });
  }

  protected async alternarAnulada(q: QuestaoRevisao): Promise<void> {
    await this.aplicar(q, { anulada: !q.anulada });
  }

  protected async alternarTemImagem(q: QuestaoRevisao): Promise<void> {
    await this.aplicar(q, { tem_imagem: !q.tem_imagem });
  }

  protected async limparIncerto(q: QuestaoRevisao): Promise<void> {
    await this.aplicar(q, { incerto: false });
  }

  protected async anexarImagem(q: QuestaoRevisao, evento: Event): Promise<void> {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    if (!arquivo) return;

    this.erroAcao.set(null);
    this.marcarSalvamento(q.id, 'salvando');
    try {
      const atualizada = await this.service.anexarImagem(q, arquivo);
      this.substituir(atualizada);
      this.marcarSalvamento(q.id, 'salvo');
    } catch (e) {
      this.marcarSalvamento(q.id, null);
      this.erroAcao.set(mensagem(e));
    }
  }

  /**
   * Toda edição de campo passa por aqui — é o único lugar que precisa saber
   * mostrar "Salvando…" e "Salvo", em vez de cada handler repetir o par.
   */
  private async aplicar(q: QuestaoRevisao, mudancas: Parameters<RevisaoService['editar']>[1]) {
    this.erroAcao.set(null);
    this.marcarSalvamento(q.id, 'salvando');
    try {
      this.substituir(await this.service.editar(q.id, mudancas));
      this.marcarSalvamento(q.id, 'salvo');
    } catch (e) {
      // Sem "Salvo" fantasma: some o indicador e o erro aparece no alerta.
      this.marcarSalvamento(q.id, null);
      this.erroAcao.set(mensagem(e));
    }
  }

  private substituir(q: QuestaoRevisao): void {
    this.questoes.update((atual) => atual.map((x) => (x.id === q.id ? q : x)));
  }

  protected alternarExpansao(id: string): void {
    this.expandidaId.update((atual) => (atual === id ? null : id));
  }

  // Regras puras reexpostas ao template.
  protected readonly precisaAtencao = precisaAtencao;
  protected readonly motivosAtencao = motivosAtencao;
  protected readonly podeAprovar = podeAprovar;
  protected readonly LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
