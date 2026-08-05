import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ConfirmacaoComponent } from '../../shared/ui/confirmacao.component';
import { IconeComponent } from '../../shared/ui/icone.component';
import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { EstadoVazioComponent } from '../../shared/ui/estado-vazio.component';
import { Dimensao, DimensoesService, ItemDimensao } from './dimensoes.service';

type Status = 'carregando' | 'ok' | 'erro';

@Component({
  selector: 'app-dimensao-page',
  imports: [
    FormsModule,
    EstadoCarregandoComponent,
    EstadoErroComponent,
    EstadoVazioComponent,
    ConfirmacaoComponent,
    IconeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dimensao-page.component.html',
})
export class DimensaoPageComponent {
  private readonly service = inject(DimensoesService);

  readonly tabela = input.required<Dimensao>();

  protected readonly status = signal<Status>('carregando');
  protected readonly itens = signal<ItemDimensao[]>([]);
  protected readonly erroCarga = signal<string | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly aExcluir = signal<ItemDimensao | null>(null);
  protected readonly excluindo = signal(false);
  protected readonly salvando = signal(false);
  protected readonly novoNome = signal('');
  protected readonly editandoId = signal<string | null>(null);
  protected readonly nomeEditado = signal('');

  protected readonly titulo = computed(() => (this.tabela() === 'bancas' ? 'Bancas' : 'Matérias'));
  protected readonly singular = computed(() => (this.tabela() === 'bancas' ? 'banca' : 'matéria'));

  constructor() {
    effect(() => {
      const tabela = this.tabela();
      void this.carregar(tabela);
    });
  }

  protected async carregar(tabela: Dimensao = this.tabela()): Promise<void> {
    this.status.set('carregando');
    this.erroCarga.set(null);
    this.erroAcao.set(null);
    try {
      this.itens.set(await this.service.listar(tabela));
      this.status.set('ok');
    } catch (e) {
      this.erroCarga.set(mensagem(e));
      this.status.set('erro');
    }
  }

  protected async criar(): Promise<void> {
    const nome = this.novoNome().trim();
    if (!nome || this.salvando()) return;

    this.salvando.set(true);
    this.erroAcao.set(null);
    try {
      const criado = await this.service.criar(this.tabela(), nome);
      this.itens.update((atual) =>
        [...atual, criado].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      );
      this.novoNome.set('');
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected iniciarEdicao(item: ItemDimensao): void {
    this.editandoId.set(item.id);
    this.nomeEditado.set(item.nome);
    this.erroAcao.set(null);
  }

  protected async confirmarEdicao(item: ItemDimensao): Promise<void> {
    const nome = this.nomeEditado().trim();
    if (!nome || nome === item.nome) {
      this.editandoId.set(null);
      return;
    }

    this.erroAcao.set(null);
    try {
      await this.service.renomear(this.tabela(), item.id, nome);
      this.itens.update((atual) =>
        atual
          .map((i) => (i.id === item.id ? { ...i, nome } : i))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      );
      this.editandoId.set(null);
    } catch (e) {
      this.erroAcao.set(mensagem(e));
    }
  }

  protected pedirExclusao(item: ItemDimensao): void {
    this.erroAcao.set(null);
    this.aExcluir.set(item);
  }

  protected cancelarExclusao(): void {
    this.aExcluir.set(null);
  }

  protected async excluir(item: ItemDimensao): Promise<void> {
    this.erroAcao.set(null);
    this.excluindo.set(true);
    try {
      await this.service.excluir(this.tabela(), item.id);
      this.itens.update((atual) => atual.filter((i) => i.id !== item.id));
      this.aExcluir.set(null);
    } catch (e) {
      this.erroAcao.set(mensagem(e));
      this.aExcluir.set(null);
    } finally {
      this.excluindo.set(false);
    }
  }
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
