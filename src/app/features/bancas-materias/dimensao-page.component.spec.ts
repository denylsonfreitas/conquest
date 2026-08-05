import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DimensaoPageComponent } from './dimensao-page.component';
import { DimensoesService, ItemDimensao } from './dimensoes.service';

/**
 * Testa os três estados que o docs/04 exige de toda tela que busca dados —
 * carregando, ok/vazio e erro — com o service dublado. Hermético: não precisa
 * da stack local de pé.
 *
 * Também cobre uma regressão real: o carregamento precisa acontecer DEPOIS de
 * o input obrigatório existir. Fazê-lo no construtor levanta NG0950.
 */
function montar(serviceDuplo: Partial<DimensoesService>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: DimensoesService, useValue: serviceDuplo }],
  });
  const fixture = TestBed.createComponent(DimensaoPageComponent);
  fixture.componentRef.setInput('tabela', 'materias');
  return fixture;
}

/** O fetch é disparado por effect; o Angular não o rastreia no whenStable. */
async function assentar(fixture: ComponentFixture<DimensaoPageComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (((fixture.nativeElement as HTMLElement).textContent ?? '').includes(texto)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

const DUAS: ItemDimensao[] = [
  { id: '1', nome: 'Direito Constitucional' },
  { id: '2', nome: 'Língua Portuguesa' },
];

describe('DimensaoPageComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('mostra o estado de carregando antes da resposta', () => {
    const fixture = montar({ listar: () => new Promise(() => {}) });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Carregando');
  });

  it('lista os itens quando carrega', async () => {
    const fixture = montar({ listar: async () => DUAS });
    const texto = await assentar(fixture, 'Direito Constitucional');
    expect(texto).toContain('2 matérias');
    expect(texto).toContain('Língua Portuguesa');
    expect(texto).not.toContain('Carregando');
  });

  it('mostra estado vazio quando não há nada', async () => {
    const fixture = montar({ listar: async () => [] });
    const texto = await assentar(fixture, 'Nenhuma');
    expect(texto).toContain('Nenhuma matéria cadastrada ainda');
  });

  it('mostra o erro e permite tentar de novo', async () => {
    const listar = vi
      .fn<() => Promise<ItemDimensao[]>>()
      .mockRejectedValueOnce(new Error('Banco fora do ar'))
      .mockResolvedValueOnce(DUAS);

    const fixture = montar({ listar });
    const comErro = await assentar(fixture, 'Banco fora do ar');
    expect(comErro).toContain('Tentar de novo');

    // Clica no botão de retry e confirma a recuperação. Busca pelo texto:
    // querySelector('button') pegaria o "Adicionar" do formulário acima.
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Tentar de novo'))
      ?.click();
    const depois = await assentar(fixture, 'Direito Constitucional');
    expect(depois).not.toContain('Banco fora do ar');
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('recarrega ao trocar de dimensão sem recriar o componente', async () => {
    const listar = vi
      .fn<(t: 'bancas' | 'materias') => Promise<ItemDimensao[]>>()
      .mockImplementation(async (t) => (t === 'materias' ? DUAS : [{ id: '9', nome: 'Cebraspe' }]));

    const fixture = montar({ listar });
    await assentar(fixture, 'Direito Constitucional');

    fixture.componentRef.setInput('tabela', 'bancas');
    const texto = await assentar(fixture, 'Cebraspe');
    expect(texto).toContain('Bancas');
    expect(texto).toContain('1 bancas');
  });

  it('não deixa a exclusão barrada por RESTRICT passar em silêncio', async () => {
    const fixture = montar({
      listar: async () => DUAS,
      excluir: async () => {
        throw new Error('Em uso por questões. Remova ou reatribua antes de excluir.');
      },
    });
    await assentar(fixture, 'Direito Constitucional');

    // Excluir agora passa pela confirmação: o primeiro clique só abre o modal.
    const botoesExcluir = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).filter((b) =>
        b.textContent?.includes('Excluir'),
      );

    botoesExcluir()[0]?.click();
    await assentar(fixture, 'Não dá para desfazer');

    // O de dentro do modal é o último — é ele que dispara a exclusão.
    botoesExcluir().at(-1)?.click();

    const texto = await assentar(fixture, 'Em uso por questões');
    expect(texto).toContain('Em uso por questões');
    // O item continua na lista: nada foi removido da UI otimisticamente.
    expect(texto).toContain('Direito Constitucional');
  });
});
