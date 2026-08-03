import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QuestaoQuiz, QuizService } from './quiz.service';
import { ResultadoQuizComponent } from './resultado-quiz.component';
import { SessaoQuizService } from './sessao-quiz.service';

const questao = (id: string, materia: string | null, gabarito: 'A' | 'B'): QuestaoQuiz => ({
  id,
  numero: 1,
  enunciado: `Enunciado da ${id}`,
  alternativas: [
    { letra: 'A', texto: 'primeira' },
    { letra: 'B', texto: 'segunda' },
  ],
  gabarito,
  tipo: 'multipla_escolha',
  materia_id: materia,
  tem_imagem: false,
  anulada: false,
  incerto: false,
  materia,
  imagem_path: null,
  comentario: null,
  prova_nome: 'Prova',
  prova_ano: 2024,
  concurso_nome: 'TRT 15',
  banca_nome: 'FCC',
});

function montar() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: QuizService, useValue: { registrar: async () => {} } },
    ],
  });
  return TestBed.createComponent(ResultadoQuizComponent);
}

async function assentar(fixture: ComponentFixture<ResultadoQuizComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (((fixture.nativeElement as HTMLElement).textContent ?? '').includes(texto)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

/** Monta uma sessão já respondida, como a execução deixaria. */
async function sessaoRespondida(sessao: SessaoQuizService) {
  sessao.iniciar(
    [
      questao('a', 'Português', 'A'),
      questao('b', 'Português', 'A'),
      questao('c', 'RLM', 'A'),
      questao('d', 'RLM', 'A'),
    ],
    'aleatorio',
    true,
  );
  await sessao.responder('A'); // a — acerto
  sessao.avancar();
  await sessao.responder('A'); // b — acerto
  sessao.avancar();
  await sessao.responder('B'); // c — erro
  sessao.avancar();
  await sessao.responder('B'); // d — erro
}

describe('ResultadoQuizComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('volta para a montagem sem sessão em memória', async () => {
    const fixture = montar();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 5));

    expect(navigate).toHaveBeenCalledWith(['/quiz']);
  });

  it('mostra o placar geral', async () => {
    const fixture = montar();
    await sessaoRespondida(TestBed.inject(SessaoQuizService));
    const texto = await assentar(fixture, 'de 4');

    expect(texto).toContain('2');
    expect(texto).toContain('50%');
  });

  it('mostra o desempenho por matéria, do pior para o melhor', async () => {
    // É a informação mais útil do resultado (docs/03): diz onde focar.
    const fixture = montar();
    await sessaoRespondida(TestBed.inject(SessaoQuizService));
    await assentar(fixture, 'Desempenho por matéria');

    const linhas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('ul li')).map(
      (li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

    expect(linhas[0]).toContain('RLM');
    expect(linhas[0]).toContain('0/2');
    expect(linhas[1]).toContain('Português');
    expect(linhas[1]).toContain('2/2');
  });

  it('mostra, na revisão, o que você marcou e o gabarito quando errou', async () => {
    const fixture = montar();
    await sessaoRespondida(TestBed.inject(SessaoQuizService));
    const texto = await assentar(fixture, 'Revisão');

    expect(texto).toContain('Você marcou');
    expect(texto).toContain('gabarito');
    expect(texto).toContain('errou');
    expect(texto).toContain('acertou');
  });

  it('só lista as questões respondidas — quiz encerrado no meio não inventa linha', async () => {
    const fixture = montar();
    const sessao = TestBed.inject(SessaoQuizService);
    sessao.iniciar([questao('a', 'Português', 'A'), questao('b', 'RLM', 'A')], 'aleatorio', true);
    await sessao.responder('A');

    const texto = await assentar(fixture, 'Revisão');
    expect(texto).toContain('Enunciado da a');
    expect(texto).not.toContain('Enunciado da b');
    expect(texto).toContain('de 1');
  });
});
