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
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-semibold text-slate-900">{{ titulo() }}</h1>
      <p class="mt-1 text-sm text-slate-500">
        Lista canônica — é daqui que {{ ondeUsa() }} escolhem, nunca texto livre.
      </p>
    </header>

    <form class="mb-6 flex gap-2" (ngSubmit)="criar()">
      <input
        name="novo"
        [(ngModel)]="novoNome"
        [placeholder]="'Adicionar ' + singular()"
        class="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
      />
      <button
        type="submit"
        [disabled]="!novoNome().trim() || salvando()"
        class="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Adicionar
      </button>
    </form>

    @if (erroAcao(); as msg) {
      <p role="alert" class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ msg }}</p>
    }

    <!-- Os três estados, tratados desde a primeira tela e não retrofitados. -->
    @switch (status()) {
      @case ('carregando') {
        <p class="py-12 text-center text-slate-400">Carregando…</p>
      }
      @case ('erro') {
        <div class="rounded-xl bg-red-50 p-6 text-center">
          <p class="text-sm text-red-700">{{ erroCarga() }}</p>
          <button
            type="button"
            (click)="carregar()"
            class="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Tentar de novo
          </button>
        </div>
      }
      @case ('ok') {
        @if (itens().length === 0) {
          <div class="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <p class="text-slate-500">Nenhuma {{ singular() }} cadastrada ainda.</p>
          </div>
        } @else {
          <p class="mb-2 text-sm text-slate-500">{{ itens().length }} {{ titulo().toLowerCase() }}</p>
          <ul class="divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
            @for (item of itens(); track item.id) {
              <li class="flex items-center gap-3 px-4 py-3">
                @if (editandoId() === item.id) {
                  <input
                    name="edicao"
                    [(ngModel)]="nomeEditado"
                    class="flex-1 rounded-lg border border-slate-300 px-2 py-1 outline-none focus:border-slate-900"
                  />
                  <button
                    type="button"
                    (click)="confirmarEdicao(item)"
                    class="text-sm font-medium text-slate-900 hover:underline"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    (click)="editandoId.set(null)"
                    class="text-sm text-slate-500 hover:underline"
                  >
                    Cancelar
                  </button>
                } @else {
                  <span class="flex-1 text-slate-900">{{ item.nome }}</span>
                  <button
                    type="button"
                    (click)="iniciarEdicao(item)"
                    class="text-sm text-slate-500 hover:underline"
                  >
                    Renomear
                  </button>
                  <button
                    type="button"
                    (click)="excluir(item)"
                    class="text-sm text-red-600 hover:underline"
                  >
                    Excluir
                  </button>
                }
              </li>
            }
          </ul>
        }
      }
    }
  `,
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
  protected readonly ondeUsa = computed(() =>
    this.tabela() === 'bancas' ? 'os concursos' : 'as questões',
  );

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
