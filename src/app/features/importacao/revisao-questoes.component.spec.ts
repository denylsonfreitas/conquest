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
  tem_texto_base: false,
  texto_base_id: null,
  anulada: false,
  revisada: false,
  ...over,
});

function montar(revisao: Partial<RevisaoService>, dimensoes: Partial<DimensoesService> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: RevisaoService, useValue: { listarTextos: async () => [], ...revisao } },
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

function editor(fixture: ComponentFixture<RevisaoQuestoesComponent>) {
  return fixture.componentInstance as unknown as {
    acompanhar: (id: string, rascunho: Record<string, unknown>) => void;
    salvar: (q: QuestaoRevisao, mudancas: Record<string, unknown>) => Promise<void>;
    temRascunho: (id: string) => boolean;
    descartarEFechar: (id: string) => void;
    alternarExpansao: (id: string) => void;
    expandidaId: () => string | null;
  };
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
        base({
          id: `e${i}`,
          numero: i + 1,
          materia_id: null,
          assunto: 'Conhecimentos Específicos',
        }),
      ),
      base({ id: 'ok', numero: 60 }),
    ];
    const fixture = montar({ listar: async () => questoes });
    const texto = await assentar(fixture, 'Matérias a mapear');
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
    const texto = await assentar(fixture, 'precisa de imagem');
    expect(texto).not.toContain('Aprovar as');
  });

  it('mostra cada pendência como selo na lista FECHADA', async () => {
    const fixture = montar({
      listar: async () => [
        base({ id: 'a', numero: 29, tem_imagem: true, imagem_path: null }),
        base({ id: 'b', numero: 49, materia_id: null, assunto: null, incerto: true }),
      ],
    });
    const texto = await assentar(fixture, 'precisa de imagem');

    expect(texto).toContain('precisa de imagem');
    expect(texto).toContain('sem matéria');
    expect(texto).toContain('extração duvidou');
    expect(texto).not.toContain('Comentário');
  });

  it('distingue "tem imagem" de "precisa de imagem"', async () => {
    const fixture = montar({
      listar: async () => [base({ id: 'a', tem_imagem: true, imagem_path: 'p/q.png' })],
    });
    const texto = await assentar(fixture, 'tem imagem');
    expect(texto).not.toContain('precisa de imagem');
  });

  it('abre os campos já preenchidos com o valor da questão', async () => {
    const fixture = montar({ listar: async () => [base({ materia_id: 'm2', gabarito: 'B' })] });
    await assentar(fixture, 'Enunciado da questão');

    editor(fixture).alternarExpansao('q1');
    await assentar(fixture, 'Comentário');

    const selects = (fixture.nativeElement as HTMLElement).querySelectorAll('select');
    const selecionado = (s: HTMLSelectElement) => s.options[s.selectedIndex]?.textContent?.trim();

    expect(selecionado(selects[0])).toBe('Raciocínio Lógico');
    expect(selecionado(selects[1])).toBe('B');
  });

  it('mostra a imagem anexada e deixa removê-la', async () => {
    const removerImagem = vi.fn(async () => base({ tem_imagem: true, imagem_path: null }));
    const fixture = montar({
      listar: async () => [base({ tem_imagem: true, imagem_path: 'p1/q1' })],
      urlImagem: async () => 'https://local/assinada.png',
      removerImagem,
    });
    await assentar(fixture, 'Enunciado da questão');

    editor(fixture).alternarExpansao('q1');
    await assentar(fixture, 'Remover');

    const img = () => (fixture.nativeElement as HTMLElement).querySelector('img');
    for (let i = 0; i < 50 && !img(); i++) {
      await new Promise((r) => setTimeout(r, 5));
      fixture.detectChanges();
    }
    expect(img()?.getAttribute('src')).toBe('https://local/assinada.png');

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Remover'))
      ?.click();
    await assentar(fixture, 'Imagem removida');

    expect(removerImagem).toHaveBeenCalled();
    expect(img()).toBeNull();
  });

  it('manda uma requisição só com tudo que o editor acumulou', async () => {
    const editar = vi.fn(async (_id: string, m: Partial<QuestaoRevisao>) => base({ ...m }));
    const fixture = montar({ listar: async () => [base()], editar });
    await assentar(fixture, 'Enunciado da questão');

    const c = editor(fixture);
    await c.salvar(base(), { materia_id: 'm2', gabarito: 'B' });

    expect(editar).toHaveBeenCalledTimes(1);
    expect(editar).toHaveBeenCalledWith('q1', { materia_id: 'm2', gabarito: 'B' });
    expect(await assentar(fixture, 'Salvo')).toContain('Salvo');
  });

  it('barra o fechamento com mudança não salva, em vez de perdê-la', async () => {
    const fixture = montar({ listar: async () => [base()] });
    await assentar(fixture, 'Enunciado da questão');

    const c = editor(fixture);
    c.alternarExpansao('q1');
    await assentar(fixture, 'Salvar');

    c.acompanhar('q1', { gabarito: 'B' });
    c.alternarExpansao('q1');

    expect(c.expandidaId()).toBe('q1');
    expect(await assentar(fixture, 'Mudanças não salvas')).toContain('Mudanças não salvas');

    c.descartarEFechar('q1');
    expect(c.expandidaId()).toBeNull();
    expect(c.temRascunho('q1')).toBe(false);
  });

  it('esquece o aviso quando o editor diz que não há mais rascunho', async () => {
    const fixture = montar({ listar: async () => [base()] });
    await assentar(fixture, 'Enunciado da questão');

    const c = editor(fixture);
    c.acompanhar('q1', { gabarito: 'B' });
    expect(c.temRascunho('q1')).toBe(true);
    c.acompanhar('q1', {});
    expect(c.temRascunho('q1')).toBe(false);
  });

  it('mostra o erro quando a gravação falha', async () => {
    const editar = vi.fn(async () => {
      throw new Error('Não dá para aprovar sem matéria atribuída.');
    });
    const fixture = montar({ listar: async () => [base()], editar });
    await assentar(fixture, 'Enunciado da questão');

    await editor(fixture).salvar(base(), { materia_id: null });

    const texto = await assentar(fixture, 'Não dá para aprovar');
    expect(texto).not.toContain('Salvo');
  });

  it('não oferece lote para questão com pendência', async () => {
    const fixture = montar({
      listar: async () => [base({ id: 'a', numero: 1, tem_imagem: true, imagem_path: null })],
    });
    const texto = await assentar(fixture, 'precisa de imagem');
    expect(texto).not.toContain('Aprovar as');
  });

  it('mostra cada pendência como selo na lista FECHADA', async () => {
    const fixture = montar({
      listar: async () => [
        base({ id: 'a', numero: 29, tem_imagem: true, imagem_path: null }),
        base({ id: 'b', numero: 49, materia_id: null, assunto: null, incerto: true }),
      ],
    });
    const texto = await assentar(fixture, 'precisa de imagem');

    expect(texto).toContain('precisa de imagem');
    expect(texto).toContain('sem matéria');
    expect(texto).toContain('extração duvidou');
    expect(texto).not.toContain('Comentário');
  });

  it('distingue "tem imagem" de "precisa de imagem"', async () => {
    const fixture = montar({
      listar: async () => [base({ id: 'a', tem_imagem: true, imagem_path: 'p/q.png' })],
    });
    const texto = await assentar(fixture, 'tem imagem');
    expect(texto).not.toContain('precisa de imagem');
  });

  it('abre os campos já preenchidos com o valor da questão', async () => {
    const fixture = montar({ listar: async () => [base({ materia_id: 'm2', gabarito: 'B' })] });
    await assentar(fixture, 'Enunciado da questão');

    editor(fixture).alternarExpansao('q1');
    await assentar(fixture, 'Comentário');

    const selects = (fixture.nativeElement as HTMLElement).querySelectorAll('select');
    const selecionado = (s: HTMLSelectElement) => s.options[s.selectedIndex]?.textContent?.trim();

    expect(selecionado(selects[0])).toBe('Raciocínio Lógico');
    expect(selecionado(selects[1])).toBe('B');
  });

  it('mostra a imagem anexada e deixa removê-la', async () => {
    const removerImagem = vi.fn(async () => base({ tem_imagem: true, imagem_path: null }));
    const fixture = montar({
      listar: async () => [base({ tem_imagem: true, imagem_path: 'p1/q1' })],
      urlImagem: async () => 'https://local/assinada.png',
      removerImagem,
    });
    await assentar(fixture, 'Enunciado da questão');

    editor(fixture).alternarExpansao('q1');
    await assentar(fixture, 'Remover');

    const img = () => (fixture.nativeElement as HTMLElement).querySelector('img');
    for (let i = 0; i < 50 && !img(); i++) {
      await new Promise((r) => setTimeout(r, 5));
      fixture.detectChanges();
    }
    expect(img()?.getAttribute('src')).toBe('https://local/assinada.png');

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Remover'))
      ?.click();
    await assentar(fixture, 'Imagem removida');

    expect(removerImagem).toHaveBeenCalled();
    expect(img()).toBeNull();
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
