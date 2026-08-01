import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { StatusProva } from '../../shared/models';
import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { EstadoVazioComponent } from '../../shared/ui/estado-vazio.component';
import { Prova, ProvasService } from '../provas/provas.service';
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

  protected async excluirProva(prova: Prova): Promise<void> {
    this.erroAcao.set(null);
    try {
      await this.provasService.excluir(prova.id);
      this.provas.update((atual) => atual.filter((p) => p.id !== prova.id));
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  /**
   * Rótulo do status da prova.
   *
   * Fica inline nesta tela de propósito: é a primeira e única ocorrência. Vira
   * componente de shared/ui quando a segunda tela precisar dele de verdade
   * (docs/04 → extrair na segunda ocorrência), não por previsão.
   */
  protected readonly rotuloStatus: Record<StatusProva, string> = {
    pendente: 'Sem PDF',
    processando: 'Processando',
    aguardando_revisao: 'Aguardando revisão',
    pronta: 'Pronta',
    erro: 'Erro',
  };

  protected readonly corStatus: Record<StatusProva, string> = {
    pendente: 'bg-tinta-50 text-tinta-500 ring-tinta-200',
    processando: 'bg-blue-50 text-blue-700 ring-blue-200',
    aguardando_revisao: 'bg-amber-50 text-amber-700 ring-amber-200',
    pronta: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    erro: 'bg-red-50 text-red-700 ring-red-200',
  };
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
