import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { consequenciasDaExclusao } from '../../shared/consequencias-exclusao';
import { ConfirmacaoComponent } from '../../shared/ui/confirmacao.component';
import { IconeComponent } from '../../shared/ui/icone.component';
import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { EstadoVazioComponent } from '../../shared/ui/estado-vazio.component';
import { DimensoesService, ItemDimensao } from '../bancas-materias/dimensoes.service';
import { ConcursoComBanca, ConcursosService } from './concursos.service';

type Status = 'carregando' | 'ok' | 'erro';

@Component({
  selector: 'app-lista-concursos',
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
  templateUrl: './lista-concursos.component.html',
})
export class ListaConcursosComponent {
  private readonly service = inject(ConcursosService);
  private readonly dimensoes = inject(DimensoesService);
  private readonly fb = inject(FormBuilder);

  protected readonly status = signal<Status>('carregando');
  protected readonly concursos = signal<ConcursoComBanca[]>([]);
  protected readonly bancas = signal<ItemDimensao[]>([]);
  protected readonly erroCarga = signal<string | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly aExcluir = signal<ConcursoComBanca | null>(null);
  protected readonly consequencias = signal<string[]>([]);
  protected readonly excluindo = signal(false);
  protected readonly salvando = signal(false);
  protected readonly formAberto = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    nome: ['', [Validators.required]],
    orgao: [''],
    banca_id: [''],
  });

  constructor() {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.status.set('carregando');
    this.erroCarga.set(null);
    this.erroAcao.set(null);
    try {
      const [concursos, bancas] = await Promise.all([
        this.service.listar(),
        this.dimensoes.listar('bancas'),
      ]);
      this.concursos.set(concursos);
      this.bancas.set(bancas);
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

  protected async criar(): Promise<void> {
    if (this.form.invalid || this.salvando()) return;

    this.salvando.set(true);
    this.erroAcao.set(null);
    const { nome, orgao, banca_id } = this.form.getRawValue();

    try {
      const criado = await this.service.criar({
        nome,
        orgao: orgao || null,
        banca_id: banca_id || null,
      });
      this.concursos.update((atual) => [criado, ...atual]);
      this.fecharForm();
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async pedirExclusao(concurso: ConcursoComBanca): Promise<void> {
    this.erroAcao.set(null);
    this.aExcluir.set(concurso);
    this.consequencias.set([]);
    try {
      this.consequencias.set(
        consequenciasDaExclusao(await this.service.impactoDaExclusao(concurso.id)),
      );
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected cancelarExclusao(): void {
    this.aExcluir.set(null);
  }

  protected async excluir(concurso: ConcursoComBanca): Promise<void> {
    this.erroAcao.set(null);
    this.excluindo.set(true);
    try {
      await this.service.excluir(concurso.id);
      this.aExcluir.set(null);
      this.concursos.update((atual) => atual.filter((c) => c.id !== concurso.id));
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.excluindo.set(false);
    }
  }
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
