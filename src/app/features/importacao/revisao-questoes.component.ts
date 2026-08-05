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
 * As ações em massa (mapear, aprovar em lote) gravam na hora: são um clique
 * deliberado sobre um conjunto nomeado. A **edição de uma questão** é a
 * exceção — acumula num rascunho e só vai ao banco no "Salvar", numa
 * requisição só. São as 2 ou 3 questões problemáticas de uma prova, não as 70:
 * o custo do botão é desprezível e ele agrupa as mudanças.
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
    EditorQuestaoComponent,
    IconeComponent,
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

  /**
   * Mudanças pendentes por questão — só os campos que realmente diferem do que
   * está gravado. É o que permite o "Salvar" mandar uma requisição com tudo, e
   * é o que sabe se há algo a perder ao fechar a questão.
   */
  protected readonly rascunhos = signal<Record<string, EdicaoQuestao>>({});

  /** Questão cujo fechamento foi barrado por ter rascunho. */
  protected readonly avisoNaoSalvo = signal<string | null>(null);

  /** Confirmação efêmera. Fica longe dos botões para não virar um deles. */
  protected readonly toast = signal<string | null>(null);
  private temporizadorToast?: ReturnType<typeof setTimeout>;

  /** URLs assinadas das imagens já anexadas, por caminho no bucket. */
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

    // O bucket é privado: a imagem só aparece atrás de uma URL assinada, e
    // pedi-la para as 70 questões seria desperdício. Busca sob demanda, quando
    // a questão é aberta.
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

  /** Quanto tempo a confirmação fica na tela. */
  private static readonly MS_TOAST = 2500;

  private mostrarToast(texto: string): void {
    clearTimeout(this.temporizadorToast);
    this.toast.set(texto);
    this.temporizadorToast = setTimeout(
      () => this.toast.set(null),
      RevisaoQuestoesComponent.MS_TOAST,
    );
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
      this.mostrarToast(`${ids.length} aprovadas`);
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.salvando.set(false);
    }
  }

  /** Ação de um clique só, sem campo envolvido: grava direto. */
  protected async alternarAprovacao(q: QuestaoRevisao): Promise<void> {
    // Desaprovar devolve a prova a aguardando_revisao pelo trigger do banco.
    this.erroAcao.set(null);
    try {
      this.substituir(await this.service.editar(q.id, { revisada: !q.revisada }));
      this.mostrarToast(q.revisada ? 'Aprovação desfeita' : 'Aprovada');
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  // --- edição de uma questão: rascunho + Salvar --------------------------------

  /**
   * O editor avisa o que está pendente; aqui só se guarda o suficiente para
   * proteger a saída. O rascunho em si vive lá, porque é estado de formulário.
   */
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

  /** Uma requisição com tudo que mudou, em vez de uma por campo. */
  protected async salvar(q: QuestaoRevisao, mudancas: EdicaoQuestao): Promise<void> {
    if (this.salvando()) return;

    this.salvando.set(true);
    this.erroAcao.set(null);
    try {
      this.substituir(await this.service.editar(q.id, mudancas));
      this.descartar(q.id);
      this.mostrarToast('Salvo');
    } catch (e) {
      // O rascunho SOBREVIVE ao erro: o texto digitado é o trabalho, e jogá-lo
      // fora junto com a mensagem de falha seria a pior hora de perdê-lo.
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

  /**
   * Fechar com rascunho pendente é barrado, não silencioso.
   *
   * Salvar exige um clique, então perder a edição também precisa exigir um:
   * "Descartar" está ao lado do aviso. É o preço de ter botão em vez de
   * gravação automática — e o único jeito de não pagar em edição perdida.
   */
  protected alternarExpansao(id: string): void {
    const aberta = this.expandidaId();

    if (aberta !== null && this.temRascunho(aberta)) {
      this.avisoNaoSalvo.set(aberta);
      return;
    }

    this.avisoNaoSalvo.set(null);
    this.expandidaId.set(aberta === id ? null : id);
  }

  /** Enviar o arquivo JÁ É o gesto explícito; não faria sentido pedir outro. */
  protected async anexarImagem(q: QuestaoRevisao, arquivo: File): Promise<void> {
    this.erroAcao.set(null);
    try {
      const atualizada = await this.service.anexarImagem(q, arquivo);
      // O caminho no bucket é determinístico, então trocar a imagem reaproveita
      // o mesmo endereço: sem invalidar, a miniatura continuaria mostrando a
      // figura antiga com uma URL assinada ainda válida.
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

  // Regras puras reexpostas ao template.
  protected readonly precisaAtencao = precisaAtencao;
  protected readonly motivosAtencao = motivosAtencao;
  protected readonly podeAprovar = podeAprovar;
  protected readonly LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
