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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { consequenciasDaExclusao } from '../../shared/consequencias-exclusao';
import { ConfirmacaoComponent } from '../../shared/ui/confirmacao.component';
import { FormConcursoComponent, ValoresConcurso } from '../../shared/ui/form-concurso.component';
import { IconeComponent } from '../../shared/ui/icone.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { DimensoesService, ItemDimensao } from '../bancas-materias/dimensoes.service';
import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { EstadoVazioComponent } from '../../shared/ui/estado-vazio.component';
import { SugestaoConcurso } from '../../shared/models';
import { FaseAnexo, FaseProcessamento, Prova, ProvasService } from '../provas/provas.service';
import {
  corStatusProva,
  estaTravada,
  minutosProcessando,
  motivoBloqueioAnexo,
  podeAnexarPdf,
  podeProcessar,
  rotuloStatusProva,
  valeReconsultar,
} from '../provas/regras-prova';
import { ConcursoComBanca, ConcursosService } from './concursos.service';

type Status = 'carregando' | 'ok' | 'erro';

// Cinco segundos: a extração leva dezenas de segundos, então consultar mais
// rápido só gera tráfego sem antecipar nada de útil.
const INTERVALO_RECONSULTA_MS = 5_000;

@Component({
  selector: 'app-detalhe-concurso',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    EstadoCarregandoComponent,
    EstadoErroComponent,
    EstadoVazioComponent,
    ConfirmacaoComponent,
    FormConcursoComponent,
    IconeComponent,
    ModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detalhe-concurso.component.html',
})
export class DetalheConcursoComponent {
  private readonly concursosService = inject(ConcursosService);
  private readonly provasService = inject(ProvasService);
  private readonly dimensoes = inject(DimensoesService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly status = signal<Status>('carregando');
  protected readonly concurso = signal<ConcursoComBanca | null>(null);
  protected readonly provas = signal<Prova[]>([]);
  protected readonly erroCarga = signal<string | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly provaAExcluir = signal<Prova | null>(null);
  protected readonly consequencias = signal<string[]>([]);
  protected readonly excluindo = signal(false);
  protected readonly salvando = signal(false);
  protected readonly formAberto = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    nome: ['', [Validators.required]],
    ano: [''],
    cargo: [''],
  });

  protected readonly bancas = signal<ItemDimensao[]>([]);
  protected readonly edicaoAberta = signal(false);
  protected readonly salvandoEdicao = signal(false);
  protected readonly erroEdicao = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.id();
      void this.carregar(id);
    });

    this.destroyRef.onDestroy(() => this.pararDeReconsultar());
  }

  private timerReconsulta: ReturnType<typeof setInterval> | null = null;

  /**
   * A resposta da Edge Function não é a única fonte do desfecho — e às vezes
   * nem chega. Enquanto houver prova processando, o banco é reconsultado; é o
   * que faz o cartão sair de "processando" sozinho, sem depender de F5.
   */
  private acompanharProcessamento(): void {
    if (!valeReconsultar(this.provas())) {
      this.pararDeReconsultar();
      return;
    }
    if (this.timerReconsulta !== null) return;

    this.timerReconsulta = setInterval(() => void this.reconsultar(), INTERVALO_RECONSULTA_MS);
  }

  private pararDeReconsultar(): void {
    if (this.timerReconsulta === null) return;
    clearInterval(this.timerReconsulta);
    this.timerReconsulta = null;
  }

  private async reconsultar(): Promise<void> {
    const emCurso = this.provas().filter((p) => p.status === 'processando');

    for (const prova of emCurso) {
      // Falha de rede aqui é ruído passageiro: a próxima volta tenta de novo,
      // e derrubar a tela por isso seria pior que o atraso.
      await this.atualizarProva(prova.id).catch(() => undefined);
    }

    this.acompanharProcessamento();
  }

  protected async abrirEdicao(): Promise<void> {
    this.erroEdicao.set(null);

    // As bancas carregam ANTES de o modal abrir, não depois: um <select> só
    // assume um valor quando a <option> correspondente já existe, então abrir
    // primeiro deixaria a banca atual em branco até alguém mexer nela.
    if (this.bancas().length === 0) {
      try {
        this.bancas.set(await this.dimensoes.listar('bancas'));
      } catch (e) {
        this.erroEdicao.set(mensagem(e));
      }
    }

    this.edicaoAberta.set(true);
  }

  protected fecharEdicao(): void {
    this.edicaoAberta.set(false);
    this.erroEdicao.set(null);
  }

  protected async salvarEdicao(valores: ValoresConcurso): Promise<void> {
    if (this.salvandoEdicao()) return;

    this.salvandoEdicao.set(true);
    this.erroEdicao.set(null);
    try {
      this.concurso.set(await this.concursosService.editar(this.id(), valores));
      this.fecharEdicao();
    } catch (e) {
      this.erroEdicao.set(mensagem(e));
    } finally {
      this.salvandoEdicao.set(false);
    }
  }

  protected async carregar(id: string = this.id()): Promise<void> {
    this.status.set('carregando');
    this.erroCarga.set(null);
    this.erroAcao.set(null);
    try {
      const [concurso, provas] = await Promise.all([
        this.concursosService.buscar(id),
        this.provasService.listarPorConcurso(id),
      ]);
      this.concurso.set(concurso);
      this.provas.set(provas);
      this.status.set('ok');
      this.acompanharProcessamento();
    } catch (e) {
      this.erroCarga.set(mensagem(e));
      this.status.set('erro');
    }
  }

  protected abrirForm(): void {
    this.formAberto.set(true);
    this.erroAcao.set(null);
  }

  protected fecharForm(): void {
    this.formAberto.set(false);
    this.form.reset();
    this.erroAcao.set(null);
  }

  protected async criarProva(): Promise<void> {
    if (this.form.invalid || this.salvando()) return;

    this.salvando.set(true);
    this.erroAcao.set(null);
    const { nome, ano, cargo } = this.form.getRawValue();

    try {
      const criada = await this.provasService.criar({
        concurso_id: this.id(),
        nome,
        ano: anoValido(ano),
        cargo: cargo || null,
      });
      this.provas.update((atual) => [criada, ...atual]);
      this.fecharForm();
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.salvando.set(false);
    }
  }

  // Enquanto processa, o que vale é o estado novo — não o erro da tentativa
  // anterior, que o banco já apagou mas ainda pode estar na cópia local.
  protected ehTransitorio(prova: Prova): boolean {
    return prova.status === 'processando' || this.processandoId() === prova.id;
  }

  // Sem ano, cargo, contagem nem cadeado, o parágrafo de metadados vira uma
  // faixa vazia entre o nome da prova e o resto — e o cadeado sozinho nela
  // parece solto. Melhor a linha não existir.
  protected temMetadados(prova: Prova): boolean {
    const cadeado = !podeAnexarPdf(prova.status) && prova.status !== 'processando';
    return prova.ano !== null || prova.cargo !== null || prova.total_questoes !== null || cadeado;
  }

  protected async pedirExclusaoProva(prova: Prova): Promise<void> {
    this.erroAcao.set(null);
    this.provaAExcluir.set(prova);
    this.consequencias.set([]);
    try {
      this.consequencias.set(
        consequenciasDaExclusao(await this.provasService.impactoDaExclusao(prova.id)),
      );
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected cancelarExclusaoProva(): void {
    this.provaAExcluir.set(null);
  }

  protected async excluirProva(prova: Prova): Promise<void> {
    this.erroAcao.set(null);
    this.excluindo.set(true);
    try {
      await this.provasService.excluir(prova);
      this.provaAExcluir.set(null);
      this.provas.update((atual) => atual.filter((p) => p.id !== prova.id));
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.excluindo.set(false);
    }
  }

  protected readonly anexandoEm = signal<string | null>(null);

  protected readonly provaAnexando = computed(() => {
    const id = this.anexandoEm();
    return id === null ? null : (this.provas().find((p) => p.id === id) ?? null);
  });

  protected readonly pdfEscolhido = signal<File | null>(null);
  protected readonly gabaritoEscolhido = signal<File | null>(null);
  protected readonly fase = signal<FaseAnexo | null>(null);
  protected readonly erroAnexo = signal<string | null>(null);

  protected readonly rotuloFase: Record<FaseAnexo, string> = {
    hash: 'Calculando identidade do arquivo…',
    verificando: 'Verificando duplicidade…',
    enviando: 'Enviando PDF…',
    vinculando: 'Vinculando à prova…',
  };

  protected abrirAnexo(prova: Prova): void {
    this.anexandoEm.set(prova.id);
    this.pdfEscolhido.set(null);
    this.gabaritoEscolhido.set(null);
    this.erroAnexo.set(null);
  }

  protected fecharAnexo(): void {
    this.anexandoEm.set(null);
    this.pdfEscolhido.set(null);
    this.gabaritoEscolhido.set(null);
    this.erroAnexo.set(null);
  }

  protected escolherArquivo(evento: Event, alvo: 'pdf' | 'gabarito'): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
    if (alvo === 'pdf') this.pdfEscolhido.set(arquivo);
    else this.gabaritoEscolhido.set(arquivo);
    this.erroAnexo.set(null);
  }

  protected async anexar(prova: Prova): Promise<void> {
    const pdf = this.pdfEscolhido();
    if (!pdf || this.fase()) return;

    this.erroAnexo.set(null);
    try {
      const atualizada = await this.provasService.anexarArquivos(
        prova,
        pdf,
        this.gabaritoEscolhido(),
        (f) => this.fase.set(f),
      );
      this.provas.update((atual) => atual.map((p) => (p.id === atualizada.id ? atualizada : p)));
      this.fecharAnexo();
    } catch (e) {
      this.erroAnexo.set(mensagem(e));
    } finally {
      this.fase.set(null);
    }
  }

  // Uma prova pode ter dois PDFs, e dois ícones lado a lado obrigavam a
  // decifrar qual era qual. Um só abre a escolha, com os nomes por extenso.
  protected readonly pdfEscolha = signal<Prova | null>(null);

  protected pedirPdf(prova: Prova): void {
    if (!prova.arquivo_path) return;

    // Sem gabarito não há escolha a fazer: abre direto o único que existe.
    if (!prova.gabarito_path) {
      void this.abrirPdf(prova, 'prova');
      return;
    }

    this.pdfEscolha.set(prova);
  }

  protected async escolherPdf(prova: Prova, alvo: 'prova' | 'gabarito'): Promise<void> {
    this.pdfEscolha.set(null);
    await this.abrirPdf(prova, alvo);
  }

  protected async abrirPdf(prova: Prova, alvo: 'prova' | 'gabarito' = 'prova'): Promise<void> {
    const caminho = alvo === 'prova' ? prova.arquivo_path : prova.gabarito_path;
    if (!caminho) return;

    this.erroAcao.set(null);
    try {
      window.open(await this.provasService.urlTemporaria(caminho), '_blank');
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected readonly processandoId = signal<string | null>(null);
  protected readonly faseProcessamento = signal<FaseProcessamento | null>(null);

  protected readonly rotuloFaseProcessamento: Record<FaseProcessamento, string> = {
    baixando: 'Baixando o PDF…',
    extraindo: 'Extraindo o texto…',
    processando: 'Extraindo questões com IA — pode levar mais de um minuto…',
  };

  protected async processar(prova: Prova): Promise<void> {
    if (this.processandoId()) return;

    this.processandoId.set(prova.id);
    this.erroAcao.set(null);

    // O estado real só volta do banco quando a função termina, e até lá o
    // cartão continuaria dizendo "aguardando processamento" — parecia que o
    // clique não pegou. A prova entra em processando na hora, e o que volta
    // do banco depois corrige.
    this.marcarLocal(prova.id, {
      status: 'processando',
      processando_desde: new Date().toISOString(),
      erro_msg: null,
    });

    try {
      const sugestao = await this.provasService.processar(prova, (f) =>
        this.faseProcessamento.set(f),
      );
      await this.atualizarProva(prova.id);
      this.sugestao.set(sugestao);
    } catch (e) {
      this.erroAcao.set(mensagem(e));
      await this.atualizarProva(prova.id).catch(() => undefined);
    } finally {
      this.processandoId.set(null);
      this.faseProcessamento.set(null);
      this.acompanharProcessamento();
    }
  }

  protected readonly sugestao = signal<SugestaoConcurso | null>(null);

  // Só vale interromper por aquilo que o concurso ainda não sabe. Repetir o que
  // já está preenchido transformaria a sugestão em ruído a cada processamento.
  protected readonly sugestaoUtil = computed(() => {
    const s = this.sugestao();
    const c = this.concurso();
    if (!s || !c) return null;

    const banca = s.banca_id && s.banca_id !== c.banca_id ? s : null;
    const orgao = s.orgao && s.orgao !== c.orgao ? s : null;
    return banca || orgao ? s : null;
  });

  protected dispensarSugestao(): void {
    this.sugestao.set(null);
  }

  protected async aplicarSugestao(): Promise<void> {
    const s = this.sugestao();
    const c = this.concurso();
    if (!s || !c) return;

    await this.salvarEdicao({
      nome: c.nome,
      orgao: s.orgao ?? c.orgao,
      banca_id: s.banca_id ?? c.banca_id,
    });
    this.dispensarSugestao();
  }

  private marcarLocal(id: string, campos: Partial<Prova>): void {
    this.provas.update((atual) => atual.map((p) => (p.id === id ? { ...p, ...campos } : p)));
  }

  protected async destravar(prova: Prova): Promise<void> {
    this.erroAcao.set(null);
    try {
      const atualizada = await this.provasService.destravar(prova);
      this.provas.update((atual) => atual.map((p) => (p.id === atualizada.id ? atualizada : p)));
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  private async atualizarProva(id: string): Promise<void> {
    const atualizada = await this.provasService.buscar(id);
    this.provas.update((atual) => atual.map((p) => (p.id === id ? atualizada : p)));
  }

  protected readonly rotuloStatus = rotuloStatusProva;
  protected readonly corStatus = corStatusProva;
  protected readonly podeAnexar = podeAnexarPdf;
  protected readonly motivoBloqueio = motivoBloqueioAnexo;
  protected readonly podeProcessar = podeProcessar;
  protected readonly estaTravada = estaTravada;
  protected readonly minutosProcessando = minutosProcessando;
}

function anoValido(valor: string): number | null {
  const n = Number(valor);
  if (!valor.trim() || !Number.isInteger(n) || n < 1900 || n > 2200) return null;
  return n;
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
