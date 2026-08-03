import { describe, expect, it } from 'vitest';

import {
  contaveis,
  evolucaoPorMateria,
  maisFracas,
  porBanca,
  porMateria,
  RespostaAnalisavel,
  totalPraticado,
} from './regras-progresso';

const r = (over: Partial<RespostaAnalisavel> = {}): RespostaAnalisavel => ({
  questaoId: 'q1',
  acertou: true,
  respondidoEm: '2026-08-01T10:00:00Z',
  materia: 'Português',
  bancaNome: 'FGV',
  anulada: false,
  ...over,
});

/** N respostas de uma matéria, com carimbos crescentes. */
const serie = (materia: string, acertos: boolean[], desdeODia = 1): RespostaAnalisavel[] =>
  acertos.map((acertou, i) =>
    r({
      questaoId: `${materia}-${i}`,
      materia,
      acertou,
      respondidoEm: `2026-08-${String(desdeODia + i).padStart(2, '0')}T10:00:00Z`,
    }),
  );

describe('contaveis', () => {
  it('tira as anuladas da conta sem apagar nada', () => {
    // A banca invalidou a questão; contar como erro seu seria registrar contra
    // você algo que não valia.
    const todas = [r(), r({ anulada: true, acertou: false })];
    expect(contaveis(todas)).toHaveLength(1);
    expect(todas).toHaveLength(2);
  });
});

describe('totalPraticado', () => {
  it('conta respostas e questões DISTINTAS', () => {
    // Responder a mesma questão três vezes não são três questões praticadas.
    const t = totalPraticado([
      r({ questaoId: 'a' }),
      r({ questaoId: 'a', acertou: false }),
      r({ questaoId: 'b' }),
    ]);
    expect(t.respostas).toBe(3);
    expect(t.questoes).toBe(2);
    expect(t.acertos).toBe(2);
    expect(t.percentual).toBe(67);
  });

  it('informa quantas foram desconsideradas por anulação', () => {
    const t = totalPraticado([r(), r({ anulada: true })]);
    expect(t.respostas).toBe(1);
    expect(t.desconsideradas).toBe(1);
  });

  it('histórico vazio não divide por zero', () => {
    expect(totalPraticado([])).toMatchObject({ respostas: 0, percentual: 0 });
  });
});

describe('desempenho por eixo', () => {
  const respostas = [
    r({ materia: 'Português', bancaNome: 'FGV', acertou: true }),
    r({ materia: 'Português', bancaNome: 'FGV', acertou: false }),
    r({ materia: 'RLM', bancaNome: 'Cespe', acertou: true }),
  ];

  it('agrupa por matéria, do mais praticado para o menos', () => {
    expect(porMateria(respostas).map((d) => [d.chave, d.acertos, d.total])).toEqual([
      ['Português', 1, 2],
      ['RLM', 1, 1],
    ]);
  });

  it('agrupa por banca — a mesma pergunta, outro eixo', () => {
    expect(porBanca(respostas).map((d) => [d.chave, d.percentual])).toEqual([
      ['FGV', 50],
      ['Cespe', 100],
    ]);
  });

  it('não perde resposta sem matéria nem sem banca', () => {
    const soltas = [r({ materia: null, bancaNome: null })];
    expect(porMateria(soltas)[0].chave).toBe('Sem matéria');
    expect(porBanca(soltas)[0].chave).toBe('Sem banca');
  });

  it('ignora anuladas nos dois eixos', () => {
    const comAnulada = [...respostas, r({ materia: 'Direito', anulada: true, acertou: false })];
    expect(porMateria(comAnulada).map((d) => d.chave)).not.toContain('Direito');
  });
});

describe('evolucaoPorMateria', () => {
  it('compara as últimas N com o que veio antes', () => {
    // 4 antigas (todas erradas) e 3 recentes (todas certas), janela de 3.
    const respostas = serie('Português', [false, false, false, false, true, true, true]);
    const [linha] = evolucaoPorMateria(respostas, 3);

    expect(linha.recentes).toMatchObject({ total: 3, percentual: 100 });
    expect(linha.anteriores).toMatchObject({ total: 4, percentual: 0 });
    expect(linha.delta).toBe(100);
  });

  it('não inventa comparação quando só há a janela', () => {
    const [linha] = evolucaoPorMateria(serie('RLM', [true, false]), 20);
    expect(linha.anteriores).toBeNull();
    expect(linha.delta).toBeNull();
  });

  it('usa a ordem do carimbo, não a de chegada', () => {
    const embaralhadas = [...serie('Português', [false, true, true])].reverse();
    const [linha] = evolucaoPorMateria(embaralhadas, 2);
    // As duas últimas por data são as certas.
    expect(linha.recentes.percentual).toBe(100);
    expect(linha.anteriores?.percentual).toBe(0);
  });

  it('põe a pior queda no topo, e o que não dá para comparar no fim', () => {
    const piorou = serie('Piorou', [true, true, false, false], 1);
    const melhorou = serie('Melhorou', [false, false, true, true], 10);
    const nova = serie('Nova', [true], 20);

    const linhas = evolucaoPorMateria([...piorou, ...melhorou, ...nova], 2);
    expect(linhas.map((l) => l.materia)).toEqual(['Piorou', 'Melhorou', 'Nova']);
    expect(linhas[0].delta).toBe(-100);
    expect(linhas[1].delta).toBe(100);
  });
});

describe('maisFracas', () => {
  const d = (chave: string, acertos: number, total: number) => ({
    chave,
    acertos,
    total,
    percentual: Math.round((acertos / total) * 100),
  });

  it('só ranqueia quem tem amostra — 2 de 2 erradas é acaso, não sinal', () => {
    const f = maisFracas([d('Direito', 0, 2), d('Português', 5, 20), d('RLM', 15, 20)], 10);

    expect(f.ranqueadas.map((x) => x.chave)).toEqual(['Português', 'RLM']);
    // Não some: some da ORDENAÇÃO, não da tela.
    expect(f.poucaAmostra.map((x) => x.chave)).toEqual(['Direito']);
  });

  it('empate de percentual desempata pela amostra maior', () => {
    const f = maisFracas([d('A', 5, 10), d('B', 10, 20)], 10);
    expect(f.ranqueadas.map((x) => x.chave)).toEqual(['B', 'A']);
  });

  it('com acervo novo, tudo cai em poucaAmostra — e isso é o certo', () => {
    // O caso real de um histórico recém-começado: nada ranqueável ainda.
    const f = maisFracas([d('Português', 1, 3), d('RLM', 1, 1)], 10);
    expect(f.ranqueadas).toEqual([]);
    expect(f.poucaAmostra).toHaveLength(2);
  });
});
