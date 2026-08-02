import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MontarQuizComponent } from './montar-quiz.component';
import { QuestaoQuiz, QuizService } from './quiz.service';
import { CandidataComNomes, RespostaHistorico } from './regras-quiz';
import { SessaoQuizService } from './sessao-quiz.service';

const candidata = (id: string, over: Partial<CandidataComNomes> = {}): CandidataComNomes => ({
  id,
  materia_id: 'port',
  materia: 'Português',
  banca_id: 'fcc',
  banca_nome: 'FCC',
  concurso_id: 'trt15',
  concurso_nome: 'TRT 15',
  ...over,
});

const acervoDe = (n: number, over: Partial<CandidataComNomes> = {}) =>
  Array.from({ length: n }, (_, i) => candidata(`q${i}`, over));

function montar(quiz: Partial<QuizService>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: QuizService, useValue: quiz }],
  });
  return TestBed.createComponent(MontarQuizComponent);
}

async function assentar(fixture: ComponentFixture<MontarQuizComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (((fixture.nativeElement as HTMLElement).textContent ?? '').includes(texto)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

const controles = (fixture: ComponentFixture<MontarQuizComponent>) =>
  fixture.componentInstance as unknown as {
    modo: { set: (m: string) => void };
    quantidade: { set: (n: number) => void };
    escolherBanca: (id: string) => void;
    alternarMateria: (id: string) => void;
    disponiveis: () => number;
    comecar: () => Promise<void>;
  };

const clicar = (fixture: ComponentFixture<MontarQuizComponent>, texto: string) =>
  Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
    b.textContent?.includes(texto),
  );

describe('MontarQuizComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('mostra carregando antes da resposta', () => {
    const fixture = montar({
      acervoElegivel: () => new Promise(() => {}),
      historico: async () => [],
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Carregando');
  });

  it('mostra erro com retry quando a carga falha', async () => {
    const acervoElegivel = vi
      .fn<() => Promise<CandidataComNomes[]>>()
      .mockRejectedValueOnce(new Error('Banco fora do ar'))
      .mockResolvedValueOnce(acervoDe(3));

    const fixture = montar({ acervoElegivel, historico: async () => [] });
    expect(await assentar(fixture, 'Banco fora do ar')).toContain('Tentar de novo');

    clicar(fixture, 'Tentar de novo')?.click();
    expect(await assentar(fixture, 'disponíveis')).not.toContain('Banco fora do ar');
  });

  it('conta as disponíveis sem ir ao banco a cada filtro', async () => {
    const acervoElegivel = vi.fn(async () => [
      ...acervoDe(3),
      ...acervoDe(2, { materia_id: 'rlm', materia: 'RLM' }),
    ]);
    const fixture = montar({ acervoElegivel, historico: async () => [] });
    expect(await assentar(fixture, 'disponíveis')).toContain('5');

    controles(fixture).alternarMateria('rlm');
    fixture.detectChanges();

    expect(controles(fixture).disponiveis()).toBe(2);
    // O ponto do contador vivo: uma consulta só, e a contagem responde a cada
    // clique de filtro.
    expect(acervoElegivel).toHaveBeenCalledTimes(1);
  });

  it('avisa antes de começar quando há menos questões que o pedido', async () => {
    // "Pediu 50, tem 38" precisa aparecer ANTES do clique — descobrir depois
    // seria tarde.
    const fixture = montar({ acervoElegivel: async () => acervoDe(3), historico: async () => [] });
    await assentar(fixture, 'disponíveis');

    controles(fixture).quantidade.set(50);
    const texto = await assentar(fixture, 'vai começar com');
    expect(texto).toContain('vai começar com 3, não 50');
  });

  it('não oferece começar com zero, e diz qual filtro esvaziou', async () => {
    const fixture = montar({
      acervoElegivel: async () => [
        ...acervoDe(2),
        ...acervoDe(2, { banca_id: 'cespe', banca_nome: 'Cespe', materia_id: 'x', materia: 'X' }),
      ],
      historico: async () => [],
    });
    await assentar(fixture, 'disponíveis');

    // Banca Cespe só tem matéria X; escolher a banca e depois a matéria de
    // outra banca é o beco que a mensagem precisa explicar.
    controles(fixture).escolherBanca('cespe');
    controles(fixture).alternarMateria('port');
    const texto = await assentar(fixture, 'Nenhuma questão');

    expect(texto).toContain('Nenhuma questão');
    expect(clicar(fixture, 'Começar')?.disabled).toBe(true);
  });

  it('explica o modo quando é ele que esvazia, não o filtro', async () => {
    const historico: RespostaHistorico[] = [
      { questao_id: 'q0', acertou: true, respondido_em: '2026-08-01T10:00:00Z' },
      { questao_id: 'q1', acertou: true, respondido_em: '2026-08-01T10:00:00Z' },
    ];
    const fixture = montar({
      acervoElegivel: async () => acervoDe(2),
      historico: async () => historico,
    });
    await assentar(fixture, 'disponíveis');

    controles(fixture).modo.set('nao_respondidas');
    expect(await assentar(fixture, 'já respondeu')).toContain('já respondeu todas');
  });

  it('monta a sessão e navega para a execução', async () => {
    const questoes = [{ id: 'q1' }, { id: 'q2' }] as QuestaoQuiz[];
    const buscar = vi.fn(async (_ids: readonly string[]) => questoes);
    const fixture = montar({
      acervoElegivel: async () => acervoDe(5),
      historico: async () => [],
      questoes: buscar,
    });
    await assentar(fixture, 'disponíveis');

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    controles(fixture).quantidade.set(10);
    await controles(fixture).comecar();

    // Sorteou 5 (tinha menos que os 10 pedidos) e só então buscou as completas.
    expect(buscar.mock.calls[0][0]).toHaveLength(5);
    expect(TestBed.inject(SessaoQuizService).questoes()).toEqual(questoes);
    expect(navigate).toHaveBeenCalledWith(['/quiz/executar']);
  });
});
