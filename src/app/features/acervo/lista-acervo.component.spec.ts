import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DimensoesService } from '../bancas-materias/dimensoes.service';
import { AcervoService, PaginaAcervo, QuestaoAcervo, Situacao } from './acervo.service';
import { ListaAcervoComponent } from './lista-acervo.component';
import { FiltrosAcervo } from '../../shared/filtros-acervo';

const questao = (over: Partial<QuestaoAcervo> = {}): QuestaoAcervo => ({
  id: 'q1',
  numero: 1,
  enunciado: 'Sobre a Lei Geral de Proteção de Dados',
  alternativas: [
    { letra: 'A', texto: 'um' },
    { letra: 'B', texto: 'dois' },
  ],
  materia_id: 'm1',
  materia: 'Legislação',
  assunto: null,
  gabarito: 'A',
  comentario: null,
  tem_imagem: false,
  imagem_path: null,
  anulada: false,
  incerto: false,
  revisada: true,
  elegivel: true,
  prova_nome: 'Prova',
  concurso_nome: 'DATAPREV',
  banca_nome: 'FGV',
  ...over,
});

interface Chamada {
  filtros: FiltrosAcervo;
  situacao: Situacao;
  busca: string;
  pagina: number;
}

function montar(resposta: PaginaAcervo, chamadas: Chamada[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AcervoService,
        useValue: {
          universo: async () => [],
          listar: async (
            filtros: FiltrosAcervo,
            situacao: Situacao,
            busca: string,
            pagina: number,
          ) => {
            chamadas.push({ filtros, situacao, busca, pagina });
            return resposta;
          },
          respostasAfetadas: async () => 0,
          editar: async (_id: string, m: Partial<QuestaoAcervo>) => questao({ ...m }),
          urlImagem: async () => 'https://local/x.png',
        },
      },
      { provide: DimensoesService, useValue: { listar: async () => [] } },
    ],
  });
  return TestBed.createComponent(ListaAcervoComponent);
}

async function assentar(fixture: ComponentFixture<ListaAcervoComponent>, texto: string) {
  for (let i = 0; i < 50; i++) {
    fixture.detectChanges();
    if (((fixture.nativeElement as HTMLElement).textContent ?? '').includes(texto)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

const controles = (fixture: ComponentFixture<ListaAcervoComponent>) =>
  fixture.componentInstance as unknown as {
    digitarBusca: (t: string) => void;
    mudarSituacao: (s: Situacao) => void;
    irPara: (p: number) => void;
    alternarAberta: (id: string) => void;
    salvar: (q: QuestaoAcervo, m: Record<string, unknown>) => Promise<void>;
    recontadas: () => number;
    pagina: () => number;
  };

describe('ListaAcervoComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('mostra vazio quando nada casa com os filtros', async () => {
    const fixture = montar({ questoes: [], total: 0 });
    expect(await assentar(fixture, 'Nenhuma questão')).toContain('Nenhuma questão');
  });

  it('mostra o acervo INTEIRO, marcando o que está fora dos quizzes', async () => {
    const fixture = montar({
      questoes: [
        questao({ id: 'a', elegivel: true }),
        questao({ id: 'b', elegivel: false, revisada: false }),
      ],
      total: 2,
    });
    const texto = await assentar(fixture, 'fora dos quizzes');
    expect(texto).toContain('elegível');
    expect(texto).toContain('fora dos quizzes');
    expect(texto).toContain('não revisada');
  });

  it('leva a busca por texto ao SQL, não filtra em memória', async () => {
    const chamadas: Chamada[] = [];
    const fixture = montar({ questoes: [questao()], total: 1 }, chamadas);
    await assentar(fixture, 'Proteção de Dados');

    controles(fixture).digitarBusca('proteção');
    await assentar(fixture, 'Proteção de Dados');

    expect(chamadas.at(-1)?.busca).toBe('proteção');
  });

  it('leva a situação ao SQL e volta para a primeira página', async () => {
    const chamadas: Chamada[] = [];
    const fixture = montar({ questoes: [questao()], total: 60 }, chamadas);
    await assentar(fixture, 'questões');

    controles(fixture).irPara(2);
    await assentar(fixture, 'questões');
    expect(chamadas.at(-1)?.pagina).toBe(2);

    controles(fixture).mudarSituacao('falta_imagem');
    await assentar(fixture, 'questões');

    expect(chamadas.at(-1)?.situacao).toBe('falta_imagem');
    expect(chamadas.at(-1)?.pagina).toBe(0);
  });

  it('conta as respostas recontadas ao corrigir o gabarito', async () => {
    const chamadas: Chamada[] = [];
    const fixture = montar({ questoes: [questao()], total: 1 }, chamadas);
    await assentar(fixture, 'Proteção de Dados');

    const service = TestBed.inject(AcervoService);
    vi.spyOn(service, 'respostasAfetadas').mockResolvedValue(3);

    controles(fixture).alternarAberta('q1');
    await controles(fixture).salvar(questao(), { gabarito: 'B' });
    expect(controles(fixture).recontadas()).toBe(3);
    expect(await assentar(fixture, 'recontadas')).toContain('3 respostas passadas recontadas');
  });

  it('não conta recontagem quando o gabarito não mudou', async () => {
    const fixture = montar({ questoes: [questao()], total: 1 });
    await assentar(fixture, 'Proteção de Dados');

    const service = TestBed.inject(AcervoService);
    const previsao = vi.spyOn(service, 'respostasAfetadas');

    await controles(fixture).salvar(questao(), { comentario: 'anotação' });
    expect(previsao).not.toHaveBeenCalled();
    expect(controles(fixture).recontadas()).toBe(0);
  });
});
