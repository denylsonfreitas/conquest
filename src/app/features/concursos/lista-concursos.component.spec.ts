import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DimensoesService, ItemDimensao } from '../bancas-materias/dimensoes.service';
import { ConcursoComBanca, ConcursosService } from './concursos.service';
import { ListaConcursosComponent } from './lista-concursos.component';

const BANCAS: ItemDimensao[] = [
  { id: 'b1', nome: 'Cebraspe' },
  { id: 'b2', nome: 'FCC' },
];

const CONCURSO: ConcursoComBanca = {
  id: 'c1',
  nome: 'TRT 15ª Região',
  orgao: 'TRT15',
  banca_id: 'b2',
  banca_nome: 'FCC',
  created_at: '2026-08-01T12:00:00+00:00',
};

function montar(concursos: Partial<ConcursosService>, bancas: Partial<DimensoesService> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ConcursosService, useValue: concursos },
      { provide: DimensoesService, useValue: { listar: async () => BANCAS, ...bancas } },
    ],
  });
  return TestBed.createComponent(ListaConcursosComponent);
}

async function assentar(fixture: ComponentFixture<ListaConcursosComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (((fixture.nativeElement as HTMLElement).textContent ?? '').includes(texto)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function clicar(fixture: ComponentFixture<ListaConcursosComponent>, rotulo: string) {
  Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
    .find((b) => b.textContent?.includes(rotulo))
    ?.click();
  fixture.detectChanges();
}

describe('ListaConcursosComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('mostra carregando antes da resposta', () => {
    const fixture = montar({ listar: () => new Promise(() => {}) });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Carregando');
  });

  it('lista os concursos com o nome da banca resolvido', async () => {
    const fixture = montar({ listar: async () => [CONCURSO] });
    const texto = await assentar(fixture, 'TRT 15ª Região');
    expect(texto).toContain('FCC');
    expect(texto).toContain('TRT15');
  });

  it('mostra estado vazio quando não há concursos', async () => {
    const fixture = montar({ listar: async () => [] });
    expect(await assentar(fixture, 'Nenhum concurso')).toContain('Nenhum concurso ainda');
  });

  it('mostra erro com retry quando a carga falha', async () => {
    const listar = vi
      .fn<() => Promise<ConcursoComBanca[]>>()
      .mockRejectedValueOnce(new Error('Banco fora do ar'))
      .mockResolvedValueOnce([CONCURSO]);

    const fixture = montar({ listar });
    expect(await assentar(fixture, 'Banco fora do ar')).toContain('Tentar de novo');

    clicar(fixture, 'Tentar de novo');
    expect(await assentar(fixture, 'TRT 15ª Região')).not.toContain('Banco fora do ar');
  });

  it('preenche o select de banca a partir da tabela', async () => {
    const fixture = montar({ listar: async () => [] });
    await assentar(fixture, 'Nenhum concurso');

    clicar(fixture, 'Novo concurso');
    const opcoes = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('select option'),
    ).map((o) => o.textContent?.trim());

    expect(opcoes).toEqual(['Sem banca definida', 'Cebraspe', 'FCC']);
  });

  it('cria concurso com a banca escolhida e mostra na lista', async () => {
    const criar = vi.fn(async () => CONCURSO);
    const fixture = montar({ listar: async () => [], criar });
    await assentar(fixture, 'Nenhum concurso');

    clicar(fixture, 'Novo concurso');
    const c = fixture.componentInstance as unknown as {
      form: { setValue: (v: object) => void };
      criar: () => Promise<void>;
    };
    c.form.setValue({ nome: 'TRT 15ª Região', orgao: 'TRT15', banca_id: 'b2' });
    await c.criar();

    expect(criar).toHaveBeenCalledWith({
      nome: 'TRT 15ª Região',
      orgao: 'TRT15',
      banca_id: 'b2',
    });
    expect(await assentar(fixture, 'TRT 15ª Região')).toContain('FCC');
  });

  it('converte banca vazia em null em vez de string vazia', async () => {
    const criar = vi.fn(async () => ({ ...CONCURSO, banca_id: null, banca_nome: null }));
    const fixture = montar({ listar: async () => [], criar });
    await assentar(fixture, 'Nenhum concurso');

    const c = fixture.componentInstance as unknown as {
      form: { setValue: (v: object) => void };
      criar: () => Promise<void>;
    };
    c.form.setValue({ nome: 'Sem banca', orgao: '', banca_id: '' });
    await c.criar();

    // '' quebraria o insert: banca_id é uuid, e o campo é opcional no docs/01.
    expect(criar).toHaveBeenCalledWith({ nome: 'Sem banca', orgao: null, banca_id: null });
  });
});
