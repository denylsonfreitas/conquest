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

import { EstadoCarregandoComponent } from '../../shared/ui/estado-carregando.component';
import { EstadoErroComponent } from '../../shared/ui/estado-erro.component';
import { EstadoVazioComponent } from '../../shared/ui/estado-vazio.component';
import { Dimensao, DimensoesService, ItemDimensao } from './dimensoes.service';

/** Os três estados que toda tela que busca dados precisa tratar (docs/04). */
type Status = 'carregando' | 'ok' | 'erro';

/**
 * CRUD de uma dimensão normalizada (bancas ou matérias).
 *
 * A mesma tela serve as duas rotas: `tabela` vem do `data` da rota, ligado ao
 * input pelo `withComponentInputBinding()` do app.config. Duas telas idênticas
 * seriam duplicação pura.
 *
 * O componente não conhece o Supabase — só chama o service e reflete o
 * resultado em signals. Nenhuma regra de negócio mora aqui.
 */
@Component({
  selector: 'app-dimensao-page',
  imports: [FormsModule, EstadoCarregandoComponent, EstadoErroComponent, EstadoVazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dimensao-page.component.html',
})
export class DimensaoPageComponent {
  private readonly service = inject(DimensoesService);

  /** Vem do `data: { tabela: … }` da rota (withComponentInputBinding). */
  readonly tabela = input.required<Dimensao>();

  protected readonly status = signal<Status>('carregando');
  protected readonly itens = signal<ItemDimensao[]>([]);
  protected readonly erroCarga = signal<string | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly novoNome = signal('');
  protected readonly editandoId = signal<string | null>(null);
  protected readonly nomeEditado = signal('');

  protected readonly titulo = computed(() => (this.tabela() === 'bancas' ? 'Bancas' : 'Matérias'));
  protected readonly singular = computed(() => (this.tabela() === 'bancas' ? 'banca' : 'matéria'));

  constructor() {
    // Carrega via effect, não no construtor: inputs obrigatórios ainda não têm
    // valor quando o construtor roda (NG0950). Como o effect depende de
    // `tabela()`, navegar de /materias para /bancas recarrega sozinho, mesmo
    // que o roteador reaproveite a instância do componente.
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
      // Insere já ordenado, evitando um round-trip só para reordenar a lista.
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

  protected async excluir(item: ItemDimensao): Promise<void> {
    this.erroAcao.set(null);
    try {
      await this.service.excluir(this.tabela(), item.id);
      this.itens.update((atual) => atual.filter((i) => i.id !== item.id));
    } catch (e) {
      // Caso mais comum aqui: RESTRICT porque a dimensão está em uso.
      this.erroAcao.set(mensagem(e));
    }
  }
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
