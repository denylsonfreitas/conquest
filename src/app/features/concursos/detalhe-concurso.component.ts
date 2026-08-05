import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { consequenciasDaExclusao } from '../../shared/consequencias-exclusao';
import { ConfirmacaoComponent } from '../../shared/ui/confirmacao.component';
import { IconeComponent } from '../../shared/ui/icone.component';
import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { EstadoVazioComponent } from '../../shared/ui/estado-vazio.component';
import { FaseAnexo, FaseProcessamento, Prova, ProvasService } from '../provas/provas.service';
import {
  corStatusProva,
  estaTravada,
  minutosProcessando,
  motivoBloqueioAnexo,
  podeAnexarPdf,
  podeProcessar,
  rotuloBloqueioAnexo,
  rotuloStatusProva,
} from '../provas/regras-prova';
import { ConcursoComBanca, ConcursosService } from './concursos.service';

type Status = 'carregando' | 'ok' | 'erro';

/**
 * Detalhe de um concurso: seus dados e as provas já registradas nele.
 *
 * As provas moram aqui, e não em rota própria, porque é o fluxo real — você
 * abre o concurso para ver o que já importou. Rota separada seria uma tela sem
 * uso.
 *
 * O `id` vem do parâmetro da rota via withComponentInputBinding, igual ao
 * `data` da tela de dimensões: o roteador entrega direto no input().
 */
@Component({
  selector: 'app-detalhe-concurso',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    EstadoCarregandoComponent,
    EstadoErroComponent,
    EstadoVazioComponent,
    ConfirmacaoComponent,
    IconeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detalhe-concurso.component.html',
})
export class DetalheConcursoComponent {
  private readonly concursosService = inject(ConcursosService);
  private readonly provasService = inject(ProvasService);
  private readonly fb = inject(FormBuilder);

  /** Vem de `/concursos/:id`. */
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
    // O ano vem do input como string; a conversão para número acontece no
    // envio, não no controle, para o campo aceitar vazio.
    ano: [''],
    cargo: [''],
  });

  constructor() {
    // Mesmo motivo da tela de dimensões: input obrigatório não existe no
    // construtor (NG0950), e o effect ainda recarrega se o id mudar.
    effect(() => {
      const id = this.id();
      void this.carregar(id);
    });
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

  // --- anexo de PDF -----------------------------------------------------------

  /** Id da prova cujo painel de anexo está aberto; null = nenhum. */
  protected readonly anexandoEm = signal<string | null>(null);
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

  protected async abrirPdf(prova: Prova): Promise<void> {
    if (!prova.arquivo_path) return;
    this.erroAcao.set(null);
    try {
      // Bucket privado: precisa de URL assinada, não dá para linkar direto.
      window.open(await this.provasService.urlTemporaria(prova.arquivo_path), '_blank');
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  // --- processamento ----------------------------------------------------------

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
    try {
      await this.provasService.processar(prova, (f) => this.faseProcessamento.set(f));
      await this.atualizarProva(prova.id);
    } catch (e) {
      this.erroAcao.set(mensagem(e));
      // Recarrega mesmo em falha: a função grava o motivo em erro_msg, e é
      // essa mensagem — não a genérica do HTTP — que ajuda a agir.
      await this.atualizarProva(prova.id).catch(() => undefined);
    } finally {
      this.processandoId.set(null);
      this.faseProcessamento.set(null);
    }
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

  // Regras puras reexpostas para o template (docs/04: decisão fora do componente).
  protected readonly rotuloStatus = rotuloStatusProva;
  protected readonly corStatus = corStatusProva;
  protected readonly podeAnexar = podeAnexarPdf;
  protected readonly motivoBloqueio = motivoBloqueioAnexo;
  protected readonly rotuloBloqueio = rotuloBloqueioAnexo;
  protected readonly podeProcessar = podeProcessar;
  protected readonly estaTravada = estaTravada;
  protected readonly minutosProcessando = minutosProcessando;
}

/** Aceita vazio; ignora ano fora de uma faixa plausível de concurso. */
function anoValido(valor: string): number | null {
  const n = Number(valor);
  if (!valor.trim() || !Number.isInteger(n) || n < 1900 || n > 2200) return null;
  return n;
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
