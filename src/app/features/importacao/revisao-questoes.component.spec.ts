import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DimensoesService, ItemDimensao } from '../bancas-materias/dimensoes.service';
import { RevisaoQuestoesComponent } from './revisao-questoes.component';
import { QuestaoRevisao, RevisaoService } from './revisao.service';

const MATERIAS: ItemDimensao[] = [
  { id: 'm1', nome: 'Língua Portuguesa' },
  { id: 'm2', nome: 'Raciocínio Lógico' },
];

const base = (over: Partial<QuestaoRevisao> = {}): QuestaoRevisao => ({
  id: 'q1',
  prova_id: 'p1',
  numero: 1,
  materia_id: 'm1',
  assunto: null,
  enunciado: 'Enunciado da questão',
  alternativas: [
    { letra: 'A', texto: 'um' },
    { letra: 'B', texto: 'dois' },
  ],
  gabarito: 'A',
  tipo: 'multipla_escolha',
  tem_imagem: false,
  imagem_path: null,
  comentario: null,
  incerto: false,
  anulada: false,
  revisada: false,
  ...over,
});

function montar(revisao: Partial<RevisaoService>, dimensoes: Partial<DimensoesService> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: RevisaoService, useValue: revisao },
      {
        provide: DimensoesService,
        useValue: { listar: async () => MATERIAS, criar: async () => MATERIAS[0], ...dimensoes },
      },
    ],
  });
  const fixture = TestBed.createComponent(RevisaoQuestoesComponent);
  fixture.componentRef.setInput('id', 'p1');
  return fixture;
}

async function assentar(fixture: ComponentFixture<RevisaoQuestoesComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (((fixture.nativeElement as HTMLElement).textContent ?? '').includes(texto)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('RevisaoQuestoesComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('mostra carregando antes da resposta', () => {
    const fixture = montar({ listar: () => new Promise(() => {}) });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Carregando');
  });

  it('mostra erro com retry quando a carga falha', async () => {
    const listar = vi
      .fn<() => Promise<QuestaoRevisao[]>>()
      .mockRejectedValueOnce(new Error('Banco fora do ar'))
      .mockResolvedValueOnce([base()]);

    const fixture = montar({ listar });
    expect(await assentar(fixture, 'Banco fora do ar')).toContain('Tentar de novo');

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Tentar de novo'))
      ?.click();
    expect(await assentar(fixture, 'Enunciado da questão')).not.toContain('Banco fora do ar');
  });

  it('mostra vazio quando a prova não tem questões', async () => {
    const fixture = montar({ listar: async () => [] });
    expect(await assentar(fixture, 'ainda não tem questões')).toContain('ainda não tem questões');
  });

  it('abre na fase de mapeamento, com a contagem de cada assunto', async () => {
    const questoes = [
      ...Array.from({ length: 30 }, (_, i) =>
        base({ id: `e${i}`, numero: i + 1, materia_id: null, assunto: 'Conhecimentos Específicos' }),
      ),
      base({ id: 'ok', numero: 60 }),
    ];
    const fixture = montar({ listar: async () => questoes });
    const texto = await assentar(fixture, 'Matérias a mapear');
    // Uma linha resolve trinta questões — é o ponto da fase.
    expect(texto).toContain('Conhecimentos Específicos');
    expect(texto).toContain('30 questões');
  });

  it('aplica a matéria a todo o grupo de uma vez', async () => {
    const mapearAssunto = vi.fn(async () => {});
    const questoes = [
      base({ id: 'a', numero: 1, materia_id: null, assunto: 'Conhecimentos Específicos' }),
      base({ id: 'b', numero: 2, materia_id: null, assunto: 'Conhecimentos Específicos' }),
    ];
    const fixture = montar({ listar: async () => questoes, mapearAssunto });
    await assentar(fixture, 'Matérias a mapear');

    const c = fixture.componentInstance as unknown as {
      escolherMateria: (a: string, m: string) => void;
      mapear: (a: string, ids: string[]) => Promise<void>;
    };
    c.escolherMateria('Conhecimentos Específicos', 'm2');
    await c.mapear('Conhecimentos Específicos', ['a', 'b']);

    expect(mapearAssunto).toHaveBeenCalledWith(['a', 'b'], 'm2');
    // Some da fase de mapeamento depois de resolvido.
    expect(await assentar(fixture, 'Sem pendência')).not.toContain('Matérias a mapear');
  });

  it('separa em grupos preservando a numeração dentro de cada', async () => {
    const questoes = [
      base({ id: 'a', numero: 30 }),
      base({ id: 'b', numero: 10, gabarito: null }),
      base({ id: 'c', numero: 20 }),
    ];
    const fixture = montar({ listar: async () => questoes });
    const texto = await assentar(fixture, 'Precisam de atenção');
    expect(texto).toContain('Precisam de atenção (1)');
    expect(texto).toContain('Sem pendência (2)');
    expect(texto).toContain('sem gabarito');
  });

  it('aprova em lote com a contagem explícita', async () => {
    const aprovarEmLote = vi.fn(async () => {});
    const questoes = [base({ id: 'a', numero: 1 }), base({ id: 'b', numero: 2 })];
    const fixture = montar({ listar: async () => questoes, aprovarEmLote });

    const texto = await assentar(fixture, 'Aprovar as 2 questões');
    expect(texto).toContain('Aprovar as 2 questões sem pendência');

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Aprovar as 2'))
      ?.click();
    await assentar(fixture, 'Aprovadas (2)');

    expect(aprovarEmLote).toHaveBeenCalledWith(['a', 'b']);
    expect(await assentar(fixture, '2 de 2 questões aprovadas')).toContain('Prova pronta');
  });

  it('não oferece lote para questão com pendência', async () => {
    const fixture = montar({
      listar: async () => [base({ id: 'a', numero: 1, tem_imagem: true, imagem_path: null })],
    });
    const texto = await assentar(fixture, 'depende de imagem');
    expect(texto).not.toContain('Aprovar as');
  });

  it('mostra a mensagem do CHECK quando a aprovação é recusada', async () => {
    const aprovarEmLote = vi.fn(async () => {
      throw new Error('Não dá para aprovar sem gabarito.');
    });
    const fixture = montar({ listar: async () => [base()], aprovarEmLote });
    await assentar(fixture, 'Aprovar as 1');

    const c = fixture.componentInstance as unknown as { aprovarSemPendencia: () => Promise<void> };
    await c.aprovarSemPendencia();

    expect(await assentar(fixture, 'sem gabarito')).toContain('Não dá para aprovar sem gabarito.');
  });
});
