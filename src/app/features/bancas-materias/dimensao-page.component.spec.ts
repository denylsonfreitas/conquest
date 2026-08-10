import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DimensaoPageComponent } from './dimensao-page.component';
import { DimensoesService, ItemDimensao } from './dimensoes.service';

function montar(serviceDuplo: Partial<DimensoesService>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: DimensoesService, useValue: serviceDuplo }],
  });
  const fixture = TestBed.createComponent(DimensaoPageComponent);
  fixture.componentRef.setInput('tabela', 'materias');
  return fixture;
}

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

    const botoesExcluir = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).filter((b) =>
        `${b.textContent} ${b.getAttribute('aria-label') ?? ''}`.includes('Excluir'),
      );

    botoesExcluir()[0]?.click();
    await assentar(fixture, 'Não dá para desfazer');

    botoesExcluir().at(-1)?.click();

    const texto = await assentar(fixture, 'Em uso por questões');
    expect(texto).toContain('Em uso por questões');
    expect(texto).toContain('Direito Constitucional');
  });
});
