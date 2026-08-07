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
  arquivo_hash: null,
  gabarito_path: null,
  erro_msg: null,
  processando_desde: null,
  created_at: '2026-08-01T12:00:00+00:00',
};

const PROVA_COM_PDF: Prova = {
  ...PROVA,
  arquivo_path: 'c1/p1.pdf',
  arquivo_hash: 'a'.repeat(64),
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

function legivel(fixture: ComponentFixture<DetalheConcursoComponent>): string {
  const raiz = fixture.nativeElement as HTMLElement;
  const rotulos = Array.from(raiz.querySelectorAll('[aria-label]'))
    .map((e) => e.getAttribute('aria-label'))
    .join(' ');
  return `${raiz.textContent ?? ''} ${rotulos}`;
}

async function assentar(fixture: ComponentFixture<DetalheConcursoComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (legivel(fixture).includes(texto)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  fixture.detectChanges();
  return legivel(fixture);
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

  it('rotula prova com PDF como aguardando processamento, sem sair de pendente', async () => {
    const fixture = montar({}, { listarPorConcurso: async () => [PROVA_COM_PDF] });
    const texto = await assentar(fixture, 'Aguardando processamento');
    expect(texto).not.toContain('Sem PDF');
    expect(PROVA_COM_PDF.status).toBe('pendente');
  });

  it('oferece anexar quando não há PDF e substituir quando há', async () => {
    const semPdf = montar({}, { listarPorConcurso: async () => [PROVA] });
    expect(await assentar(semPdf, 'Anexar PDF')).not.toContain('Substituir PDF');

    const comPdf = montar({}, { listarPorConcurso: async () => [PROVA_COM_PDF] });
    const texto = await assentar(comPdf, 'Substituir PDF');
    expect(texto).toContain('Ver PDF');
  });

  it('trava a troca de PDF a partir de processando', async () => {
    const emProcessamento: Prova = { ...PROVA_COM_PDF, status: 'processando' };
    const fixture = montar({}, { listarPorConcurso: async () => [emProcessamento] });
    const texto = await assentar(fixture, 'Processando');
    expect(texto).not.toContain('Substituir PDF');
  });

  it('diz como sair do impasse quando a prova já foi extraída', async () => {
    const extraida: Prova = { ...PROVA_COM_PDF, status: 'aguardando_revisao' };
    const fixture = montar({}, { listarPorConcurso: async () => [extraida] });
    const texto = await assentar(fixture, 'invalidaria as questões');
    expect(texto).toContain('já foi extraída');

    const dicas = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-dica]'),
    ).map((e) => e.getAttribute('data-dica') ?? '');
    expect(dicas.some((d) => d.includes('invalidaria as questões'))).toBe(true);
  });

  it('anexa o PDF escolhido e atualiza a prova na lista', async () => {
    const anexarArquivos = vi.fn(async () => PROVA_COM_PDF);
    const fixture = montar({}, { listarPorConcurso: async () => [PROVA], anexarArquivos });
    await assentar(fixture, 'Anexar PDF');

    const c = fixture.componentInstance as unknown as {
      abrirAnexo: (p: Prova) => void;
      pdfEscolhido: { set: (f: File) => void };
      anexar: (p: Prova) => Promise<void>;
    };
    const pdf = new File(['%PDF-1.4'], 'prova.pdf', { type: 'application/pdf' });
    c.abrirAnexo(PROVA);
    c.pdfEscolhido.set(pdf);
    await c.anexar(PROVA);

    expect(anexarArquivos).toHaveBeenCalledWith(PROVA, pdf, null, expect.any(Function));
    expect(await assentar(fixture, 'Aguardando processamento')).toContain('Ver PDF');
  });

  it('mostra a mensagem de duplicidade sem quebrar a tela', async () => {
    const anexarArquivos = vi.fn(async () => {
      throw new Error('Este PDF já foi importado em "Prova antiga".');
    });
    const fixture = montar({}, { listarPorConcurso: async () => [PROVA], anexarArquivos });
    await assentar(fixture, 'Anexar PDF');

    const c = fixture.componentInstance as unknown as {
      abrirAnexo: (p: Prova) => void;
      pdfEscolhido: { set: (f: File) => void };
      anexar: (p: Prova) => Promise<void>;
    };
    c.abrirAnexo(PROVA);
    c.pdfEscolhido.set(new File(['x'], 'p.pdf'));
    await c.anexar(PROVA);

    const texto = await assentar(fixture, 'já foi importado');
    expect(texto).toContain('Prova antiga');
    expect(texto).toContain('Sem PDF');
  });

  it('oferece Processar só quando há PDF e não está em curso', async () => {
    const semPdf = montar({}, { listarPorConcurso: async () => [PROVA] });
    expect(await assentar(semPdf, 'Anexar PDF')).not.toContain('Processar');

    const comPdf = montar({}, { listarPorConcurso: async () => [PROVA_COM_PDF] });
    expect(await assentar(comPdf, 'Processar')).toContain('Processar');
  });

  it('mostra Destravar apenas quando a prova passou do limite em processando', async () => {
    const viva: Prova = {
      ...PROVA_COM_PDF,
      status: 'processando',
      processando_desde: new Date(Date.now() - 60_000).toISOString(),
    };
    const travada: Prova = {
      ...PROVA_COM_PDF,
      status: 'processando',
      processando_desde: new Date(Date.now() - 30 * 60_000).toISOString(),
    };

    const a = montar({}, { listarPorConcurso: async () => [viva] });
    expect(await assentar(a, 'Processando')).not.toContain('Destravar');

    const b = montar({}, { listarPorConcurso: async () => [travada] });
    expect(await assentar(b, 'Destravar')).toContain('Parece travada');
  });

  it('exibe o erro_msg da função, não uma mensagem genérica', async () => {
    const comErro: Prova = {
      ...PROVA_COM_PDF,
      status: 'erro',
      erro_msg: 'O PDF parece escaneado: OCR ainda não é suportado.',
    };
    const fixture = montar({}, { listarPorConcurso: async () => [comErro] });
    const texto = await assentar(fixture, 'escaneado');
    expect(texto).toContain('Tentar de novo');
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
