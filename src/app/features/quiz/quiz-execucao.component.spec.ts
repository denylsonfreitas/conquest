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

async function respirar(fixture: ComponentFixture<QuizExecucaoComponent>) {
  await new Promise((r) => setTimeout(r, 20));
  fixture.detectChanges();
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
    const registrar = vi.fn(async (_r: readonly RespostaNova[]) => {});
    const fixture = montar({ registrar });
    TestBed.inject(SessaoQuizService).iniciar([questao('q1')], 'aleatorio', 'estudo');

    await assentar(fixture, 'Enunciado da q1');
    clicar(fixture, 'primeira')?.click();
    await assentar(fixture, 'Acertou');

    expect(registrar).toHaveBeenCalledWith([
      expect.objectContaining({ questao_id: 'q1', letra_marcada: 'A', acertou: true }),
    ]);
    expect(registrar.mock.calls[0][0][0].quiz_sessao_id).toBeTruthy();
  });

  it('com feedback imediato, revela o gabarito na questão errada', async () => {
    const fixture = montar();
    TestBed.inject(SessaoQuizService).iniciar([questao('q1')], 'aleatorio', 'estudo');
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'segunda')?.click();
    expect(await assentar(fixture, 'Errou')).toContain('o gabarito é A');
  });

  it('no modo prova não revela nada e não grava nada até a entrega', async () => {
    const registrar = vi.fn(async (_r: readonly RespostaNova[]) => {});
    const fixture = montar({ registrar });
    const sessao = TestBed.inject(SessaoQuizService);
    sessao.iniciar([questao('q1'), questao('q2')], 'aleatorio', 'prova');
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'segunda')?.click();
    const texto = await assentar(fixture, 'Entregar');

    expect(texto).not.toContain('Errou');
    expect(texto).not.toContain('Acertou');
    expect(registrar).not.toHaveBeenCalled();
    expect(sessao.respostas()).toEqual([]);
    expect(sessao.marcadas()).toBe(1);
  });

  it('no modo prova, remarcar troca a marcação', async () => {
    const fixture = montar();
    const sessao = TestBed.inject(SessaoQuizService);
    sessao.iniciar([questao('q1')], 'aleatorio', 'prova');
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'segunda')?.click();
    await respirar(fixture);
    clicar(fixture, 'primeira')?.click();
    await respirar(fixture);

    expect(sessao.letraAtual()).toBe('A');
    expect(sessao.marcadas()).toBe(1);
  });

  it('conta os brancos antes de entregar, e entrega num INSERT só', async () => {
    const registrar = vi.fn(async (_r: readonly RespostaNova[]) => {});
    const fixture = montar({ registrar });
    const sessao = TestBed.inject(SessaoQuizService);
    sessao.iniciar([questao('q1'), questao('q2'), questao('q3')], 'aleatorio', 'prova');
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'primeira')?.click();
    await respirar(fixture);

    clicar(fixture, 'Entregar')?.click();
    const aviso = await assentar(fixture, 'em branco');
    expect(aviso).toContain('2 questões ficam em branco');
    expect(aviso).toContain('Entregar 1 de 3?');

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .filter((b) => b.textContent?.trim() === 'Entregar')
      .at(-1)
      ?.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(registrar).toHaveBeenCalledTimes(1);
    expect(registrar.mock.calls[0][0]).toHaveLength(1);
    expect(registrar.mock.calls[0][0][0].questao_id).toBe('q1');
  });

  it('entrega que falha não deixa nada gravado — dá para tentar de novo', async () => {
    const fixture = montar({
      registrar: async () => {
        throw new Error('Sem conexão');
      },
    });
    const sessao = TestBed.inject(SessaoQuizService);
    sessao.iniciar([questao('q1')], 'aleatorio', 'prova');
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'primeira')?.click();
    await respirar(fixture);
    clicar(fixture, 'Entregar')?.click();
    await respirar(fixture);

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .filter((b) => b.textContent?.trim() === 'Entregar')
      .at(-1)
      ?.click();
    await respirar(fixture);

    expect(await assentar(fixture, 'Sem conexão')).toContain('Sem conexão');
    expect(sessao.respostas()).toEqual([]);
    expect(sessao.marcadas()).toBe(1);
  });
  it('não deixa responder duas vezes a mesma questão', async () => {
    const registrar = vi.fn(async () => {});
    const fixture = montar({ registrar });
    TestBed.inject(SessaoQuizService).iniciar([questao('q1')], 'aleatorio', 'estudo');
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'primeira')?.click();
    await assentar(fixture, 'Acertou');
    clicar(fixture, 'segunda')?.click();
    await assentar(fixture, 'Acertou');

    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it('mantém a resposta local fora quando o banco recusa', async () => {
    const fixture = montar({
      registrar: async () => {
        throw new Error('Sem conexão');
      },
    });
    const sessao = TestBed.inject(SessaoQuizService);
    sessao.iniciar([questao('q1')], 'aleatorio', 'estudo');
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'primeira')?.click();
    expect(await assentar(fixture, 'Sem conexão')).toContain('Sem conexão');
    expect(sessao.respostas()).toEqual([]);
  });

  it('oferece o resultado quando todas foram respondidas', async () => {
    const fixture = montar();
    TestBed.inject(SessaoQuizService).iniciar([questao('q1')], 'aleatorio', 'estudo');
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'primeira')?.click();
    expect(await assentar(fixture, 'Ver resultado')).toContain('Ver resultado');
  });

  it('sair do quiz pede confirmação, e desistir dela não encerra a sessão', async () => {
    const fixture = montar();
    const sessao = TestBed.inject(SessaoQuizService);
    sessao.iniciar([questao('q1'), questao('q2')], 'aleatorio', 'estudo');
    await assentar(fixture, 'Enunciado da q1');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    clicar(fixture, 'Sair do quiz')?.click();
    expect(await assentar(fixture, 'Sair do quiz?')).toContain('Sair do quiz?');
    expect(navegar).not.toHaveBeenCalled();

    clicar(fixture, 'Continuar')?.click();
    await respirar(fixture);
    expect(sessao.ativa()).toBe(true);
    expect(navegar).not.toHaveBeenCalled();
  });

  it('avisa que a marcação da prova se perde ao sair, porque ela não foi gravada', async () => {
    const fixture = montar();
    TestBed.inject(SessaoQuizService).iniciar([questao('q1'), questao('q2')], 'aleatorio', 'prova');
    await assentar(fixture, 'Enunciado da q1');

    clicar(fixture, 'primeira')?.click();
    await respirar(fixture);

    clicar(fixture, 'Sair do quiz')?.click();
    expect(await assentar(fixture, 'Sair do quiz?')).toContain('descarta essa marcação');
  });

  it('encerrar no meio pede confirmação antes de ir ao resultado', async () => {
    const fixture = montar();
    TestBed.inject(SessaoQuizService).iniciar(
      [questao('q1'), questao('q2')],
      'aleatorio',
      'estudo',
    );
    await assentar(fixture, 'Enunciado da q1');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    clicar(fixture, 'primeira')?.click();
    await respirar(fixture);

    clicar(fixture, 'Encerrar com')?.click();
    expect(await assentar(fixture, 'Encerrar com 1 respondidas?')).toContain('só o que você');
    expect(navegar).not.toHaveBeenCalled();

    clicar(fixture, 'Ver resultado')?.click();
    await respirar(fixture);
    expect(navegar).toHaveBeenCalledWith(['/quiz/resultado']);
  });
});
