import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgressoComponent } from './progresso.component';
import { ProgressoService } from './progresso.service';
import { RespostaAnalisavel } from './regras-progresso';

const r = (over: Partial<RespostaAnalisavel> = {}): RespostaAnalisavel => ({
  questaoId: 'q1',
  acertou: true,
  respondidoEm: '2026-08-01T10:00:00Z',
  materia: 'Português',
  bancaNome: 'FGV',
  anulada: false,
  ...over,
});

const serie = (materia: string, acertos: boolean[], dia = 1): RespostaAnalisavel[] =>
  acertos.map((acertou, i) =>
    r({
      questaoId: `${materia}-${i}`,
      materia,
      acertou,
      respondidoEm: `2026-08-${String(dia + i).padStart(2, '0')}T10:00:00Z`,
    }),
  );

function montar(historico: () => Promise<RespostaAnalisavel[]>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ProgressoService, useValue: { historico } }],
  });
  return TestBed.createComponent(ProgressoComponent);
}

async function assentar(fixture: ComponentFixture<ProgressoComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (((fixture.nativeElement as HTMLElement).textContent ?? '').includes(texto)) break;
    await new Promise((res) => setTimeout(res, 5));
  }
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('ProgressoComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('mostra carregando antes da resposta', () => {
    const fixture = montar(() => new Promise(() => {}));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Somando');
  });

  it('mostra erro com retry quando a carga falha', async () => {
    const historico = vi
      .fn<() => Promise<RespostaAnalisavel[]>>()
      .mockRejectedValueOnce(new Error('Banco fora do ar'))
      .mockResolvedValueOnce([r()]);

    const fixture = montar(historico);
    expect(await assentar(fixture, 'Banco fora do ar')).toContain('Tentar de novo');

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Tentar de novo'))
      ?.click();
    expect(await assentar(fixture, 'Português')).not.toContain('Banco fora do ar');
  });

  it('convida a responder quando não há histórico — o primeiro estado que se vê', async () => {
    const fixture = montar(async () => []);
    const texto = await assentar(fixture, 'Responda alguns quizzes');
    expect(texto).toContain('Responda alguns quizzes para ver seu progresso');
    expect(texto).toContain('Montar um quiz');
  });

  it('conta questões distintas, não respostas', async () => {
    const fixture = montar(async () => [
      r({ questaoId: 'a' }),
      r({ questaoId: 'a', acertou: false }),
      r({ questaoId: 'b' }),
    ]);
    const texto = await assentar(fixture, 'questões praticadas');
    expect(texto).toContain('2 questões praticadas');
    expect(texto).toContain('de 3');
  });

  it('avisa que as anuladas ficaram de fora da conta', async () => {
    const fixture = montar(async () => [r(), r({ questaoId: 'x', anulada: true, acertou: false })]);
    const texto = await assentar(fixture, 'anuladas');
    expect(texto).toContain('1 de questões anuladas, fora da conta');
    expect(texto).toContain('100%');
  });

  it('separa o que dá para ranquear do que ainda é acaso', async () => {
    const fixture = montar(async () => [
      ...serie('Português', Array(12).fill(false)),
      ...serie('RLM', [false, false], 20),
    ]);
    const texto = await assentar(fixture, 'Poucas respostas');

    expect(texto).toContain('Onde focar');
    expect(texto).toContain('Poucas respostas ainda (menos de 10)');
    expect(texto).toContain('RLM');
  });

  it('esconde a evolução enquanto não há histórico anterior à janela', async () => {
    const fixture = montar(async () => serie('Português', [true, false]));
    const texto = await assentar(fixture, 'Onde focar');
    expect(texto).not.toContain('Evolução');
  });

  it('mostra a evolução em pontos percentuais quando há o que comparar', async () => {
    const fixture = montar(async () => serie('Português', [false, ...Array(20).fill(true)]));
    const texto = await assentar(fixture, 'Evolução');
    expect(texto).toContain('0% → 100%');
    expect(texto).toContain('+100 pp');
  });
});
