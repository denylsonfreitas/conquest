import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RespostaNova } from '../../shared/models';
import { QuizExecucaoComponent } from './quiz-execucao.component';
import { QuestaoQuiz, QuizService } from './quiz.service';
import { SessaoQuizService } from './sessao-quiz.service';

const questao = (id: string, over: Partial<QuestaoQuiz> = {}): QuestaoQuiz => ({
  id,
  numero: 1,
  enunciado: `Enunciado da ${id}`,
  alternativas: [
    { letra: 'A', texto: 'primeira' },
    { letra: 'B', texto: 'segunda' },
  ],
  gabarito: 'A',
  tipo: 'multipla_escolha',
  materia_id: 'port',
  tem_imagem: false,
  anulada: false,
  incerto: false,
  materia: 'Português',
  imagem_path: null,
  comentario: null,
  prova_nome: 'Prova',
  prova_ano: 2024,
  concurso_nome: 'TRT 15',
  banca_nome: 'FCC',
  ...over,
});

function montar(quiz: Partial<QuizService> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: QuizService, useValue: { registrar: async () => {}, ...quiz } },
    ],
  });
  return TestBed.createComponent(QuizExecucaoComponent);
}

async function assentar(fixture: ComponentFixture<QuizExecucaoComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (((fixture.nativeElement as HTMLElement).textContent ?? '').includes(texto)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

const clicar = (fixture: ComponentFixture<QuizExecucaoComponent>, texto: string) =>
  Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
    b.textContent?.includes(texto),
  );

describe('QuizExecucaoComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('volta para a montagem quando não há sessão em memória', async () => {
    const fixture = montar();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 5));

    expect(navigate).toHaveBeenCalledWith(['/quiz']);
  });

  it('mostra a questão e registra a resposta no banco', async () => {
    const registrar = vi.fn(async (_r: RespostaNova) => {});
    const fixture = montar({ registrar });
    TestBed.inject(SessaoQuizService).iniciar([questao('q1')], 'aleatorio', true);

    await assentar(fixture, 'Enunciado da q1');
    clicar(fixture, 'primeira')?.click();
    await assentar(fixture, 'Acertou');

    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ questao_id: 'q1', letra_marcada: 'A', acertou: true }),
    );
    // Grava na hora — é o que faz interromper o quiz não perder nada.
    expect(registrar.mock.calls[0][0].quiz_sessao_id).toBeTruthy();
  });

  it('com feedback imediato, revela o gabarito na questão errada', async () => {
    const fixture = montar();
    TestBed.inject(SessaoQuizService).iniciar([questao('q1')], 'aleatorio', true);
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'segunda')?.click();
    expect(await assentar(fixture, 'Errou')).toContain('o gabarito é A');
  });

  it('sem feedback imediato, não revela nada e avança sozinho', async () => {
    const fixture = montar();
    const sessao = TestBed.inject(SessaoQuizService);
    sessao.iniciar([questao('q1'), questao('q2')], 'aleatorio', false);
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'segunda')?.click();
    const texto = await assentar(fixture, 'Enunciado da q2');

    expect(texto).not.toContain('Errou');
    expect(texto).not.toContain('Acertou');
    expect(sessao.indice()).toBe(1);
  });

  it('não deixa responder duas vezes a mesma questão', async () => {
    const registrar = vi.fn(async () => {});
    const fixture = montar({ registrar });
    TestBed.inject(SessaoQuizService).iniciar([questao('q1')], 'aleatorio', true);
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'primeira')?.click();
    await assentar(fixture, 'Acertou');
    clicar(fixture, 'segunda')?.click();
    await assentar(fixture, 'Acertou');

    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it('mantém a resposta local fora quando o banco recusa', async () => {
    // Placar que o banco não conhece seria pior do que repetir o clique.
    const fixture = montar({
      registrar: async () => {
        throw new Error('Sem conexão');
      },
    });
    const sessao = TestBed.inject(SessaoQuizService);
    sessao.iniciar([questao('q1')], 'aleatorio', true);
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'primeira')?.click();
    expect(await assentar(fixture, 'Sem conexão')).toContain('Sem conexão');
    expect(sessao.respostas()).toEqual([]);
  });

  it('oferece o resultado quando todas foram respondidas', async () => {
    const fixture = montar();
    TestBed.inject(SessaoQuizService).iniciar([questao('q1')], 'aleatorio', true);
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'primeira')?.click();
    expect(await assentar(fixture, 'Ver resultado')).toContain('Ver resultado');
  });
});
