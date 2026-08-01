import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prova, ProvasService } from '../provas/provas.service';
import { ConcursoComBanca, ConcursosService } from './concursos.service';
import { DetalheConcursoComponent } from './detalhe-concurso.component';

const CONCURSO: ConcursoComBanca = {
  id: 'c1',
  nome: 'TRT 15ª Região',
  orgao: 'TRT15',
  banca_id: 'b2',
  banca_nome: 'FCC',
  created_at: '2026-08-01T12:00:00+00:00',
};

const PROVA: Prova = {
  id: 'p1',
  concurso_id: 'c1',
  nome: 'Analista Judiciário',
  ano: 2024,
  cargo: 'Área Judiciária',
  status: 'pendente',
  total_questoes: null,
  arquivo_path: null,
  created_at: '2026-08-01T12:00:00+00:00',
};

function montar(concursos: Partial<ConcursosService>, provas: Partial<ProvasService>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ConcursosService, useValue: { buscar: async () => CONCURSO, ...concursos } },
      { provide: ProvasService, useValue: provas },
    ],
  });
  const fixture = TestBed.createComponent(DetalheConcursoComponent);
  fixture.componentRef.setInput('id', 'c1');
  return fixture;
}

async function assentar(fixture: ComponentFixture<DetalheConcursoComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (((fixture.nativeElement as HTMLElement).textContent ?? '').includes(texto)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('DetalheConcursoComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('mostra o concurso e suas provas', async () => {
    const fixture = montar({}, { listarPorConcurso: async () => [PROVA] });
    const texto = await assentar(fixture, 'Analista Judiciário');
    expect(texto).toContain('TRT 15ª Região');
    expect(texto).toContain('FCC');
    expect(texto).toContain('2024');
  });

  it('rotula prova sem PDF de forma legível, não com o enum cru', async () => {
    const fixture = montar({}, { listarPorConcurso: async () => [PROVA] });
    const texto = await assentar(fixture, 'Analista Judiciário');
    expect(texto).toContain('Sem PDF');
    expect(texto).not.toContain('pendente');
  });

  it('mostra estado vazio quando o concurso não tem provas', async () => {
    const fixture = montar({}, { listarPorConcurso: async () => [] });
    expect(await assentar(fixture, 'Nenhuma prova')).toContain('Nenhuma prova registrada');
  });

  it('trata concurso inexistente como erro de tela, não como crash', async () => {
    const fixture = montar(
      {
        buscar: async () => {
          throw new Error('Concurso não encontrado.');
        },
      },
      { listarPorConcurso: async () => [] },
    );
    expect(await assentar(fixture, 'não encontrado')).toContain('Tentar de novo');
  });

  it('registra prova sem arquivo, deixando o hash para o upload', async () => {
    const criar = vi.fn(async () => PROVA);
    const fixture = montar({}, { listarPorConcurso: async () => [], criar });
    await assentar(fixture, 'Nenhuma prova');

    const c = fixture.componentInstance as unknown as {
      form: { setValue: (v: object) => void };
      criarProva: () => Promise<void>;
    };
    c.form.setValue({ nome: 'Analista Judiciário', ano: '2024', cargo: 'Área Judiciária' });
    await c.criarProva();

    expect(criar).toHaveBeenCalledWith({
      concurso_id: 'c1',
      nome: 'Analista Judiciário',
      ano: 2024,
      cargo: 'Área Judiciária',
    });
    expect(await assentar(fixture, 'Analista Judiciário')).toContain('Sem PDF');
  });

  it('aceita prova sem ano em vez de gravar NaN', async () => {
    const criar = vi.fn(async () => ({ ...PROVA, ano: null }));
    const fixture = montar({}, { listarPorConcurso: async () => [], criar });
    await assentar(fixture, 'Nenhuma prova');

    const c = fixture.componentInstance as unknown as {
      form: { setValue: (v: object) => void };
      criarProva: () => Promise<void>;
    };
    c.form.setValue({ nome: 'Prova sem ano', ano: '', cargo: '' });
    await c.criarProva();

    expect(criar).toHaveBeenCalledWith({
      concurso_id: 'c1',
      nome: 'Prova sem ano',
      ano: null,
      cargo: null,
    });
  });
});
