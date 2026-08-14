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

// Preenche o formulário pelo DOM, como o usuário faz. Depois que ele saiu para
// um componente próprio, alcançar o FormGroup por dentro testaria o filho pelo
// pai — e passaria mesmo se a ligação entre os dois quebrasse.
function preencher(
  fixture: ComponentFixture<ListaConcursosComponent>,
  valores: { nome: string; orgao: string; banca_id: string },
) {
  const raiz = fixture.nativeElement as HTMLElement;
  const escrever = (seletor: string, valor: string) => {
    const campo = raiz.querySelector(seletor) as HTMLInputElement | HTMLSelectElement;
    campo.value = valor;
    campo.dispatchEvent(new Event('change'));
    campo.dispatchEvent(new Event('input'));
  };

  escrever('#concurso-nome', valores.nome);
  escrever('#concurso-orgao', valores.orgao);
  escrever('#concurso-banca', valores.banca_id);
  fixture.detectChanges();
}

function enviarForm(fixture: ComponentFixture<ListaConcursosComponent>) {
  (fixture.nativeElement as HTMLElement).querySelector('form')?.dispatchEvent(new Event('submit'));
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
    preencher(fixture, { nome: 'TRT 15ª Região', orgao: 'TRT15', banca_id: 'b2' });
    enviarForm(fixture);
    await new Promise((r) => setTimeout(r, 20));

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

    clicar(fixture, 'Novo concurso');
    preencher(fixture, { nome: 'Sem banca', orgao: '', banca_id: '' });
    enviarForm(fixture);
    await new Promise((r) => setTimeout(r, 20));

    expect(criar).toHaveBeenCalledWith({ nome: 'Sem banca', orgao: null, banca_id: null });
  });

  it('não cria com o nome vazio, que é o único campo obrigatório', async () => {
    const criar = vi.fn(async () => CONCURSO);
    const fixture = montar({ listar: async () => [], criar });
    await assentar(fixture, 'Nenhum concurso');

    clicar(fixture, 'Novo concurso');
    preencher(fixture, { nome: '', orgao: 'TRT15', banca_id: 'b2' });
    enviarForm(fixture);
    await new Promise((r) => setTimeout(r, 20));

    expect(criar).not.toHaveBeenCalled();
  });
});
