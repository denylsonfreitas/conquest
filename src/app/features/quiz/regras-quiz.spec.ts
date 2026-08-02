import { describe, expect, it } from 'vitest';

import {
  aplicarFiltros,
  aplicarModo,
  CandidataComNomes,
  CandidataQuiz,
  desempenhoPorMateria,
  embaralhar,
  FILTROS_VAZIOS,
  motivoConjuntoVazio,
  normalizarQuantidade,
  opcoesDeFiltro,
  QUANTIDADE_MAX,
  QUANTIDADE_MIN,
  placar,
  RespostaHistorico,
  sortear,
  ultimaRespostaPorQuestao,
} from './regras-quiz';

const q = (id: string, over: Partial<CandidataQuiz> = {}): CandidataQuiz => ({
  id,
  materia_id: 'port',
  banca_id: 'fcc',
  concurso_id: 'trt15',
  ...over,
});

const comNomes = (
  id: string,
  banca_id: string,
  banca_nome: string,
  concurso_id: string,
  concurso_nome: string,
  materia_id: string,
  materia: string,
): CandidataComNomes => ({
  id,
  banca_id,
  banca_nome,
  concurso_id,
  concurso_nome,
  materia_id,
  materia,
});

const resp = (questao_id: string, acertou: boolean, dia: string): RespostaHistorico => ({
  questao_id,
  acertou,
  respondido_em: `2026-08-${dia}T10:00:00Z`,
});

/** RNG determinístico: devolve sempre o mesmo ciclo, para o sorteio ser testável. */
const rngFixo = (valores: number[]) => {
  let i = 0;
  return () => valores[i++ % valores.length];
};

describe('ultimaRespostaPorQuestao', () => {
  it('fica com a resposta de carimbo mais alto', () => {
    const ultima = ultimaRespostaPorQuestao([
      resp('a', false, '01'),
      resp('a', true, '10'),
      resp('a', false, '05'),
    ]);
    expect(ultima.get('a')?.acertou).toBe(true);
  });

  it('não depende da ordem em que o histórico chega', () => {
    const linhas = [resp('a', true, '10'), resp('a', false, '01')];
    expect(ultimaRespostaPorQuestao(linhas).get('a')?.acertou).toBe(true);
    expect(ultimaRespostaPorQuestao([...linhas].reverse()).get('a')?.acertou).toBe(true);
  });
});

describe('aplicarModo', () => {
  const candidatas = [q('a'), q('b'), q('c')];

  it('aleatório é a identidade — não olha o histórico', () => {
    expect(aplicarModo(candidatas, [resp('a', false, '01')], 'aleatorio')).toHaveLength(3);
  });

  it('não respondidas exclui tudo que já tem resposta, certa ou errada', () => {
    const historico = [resp('a', true, '01'), resp('b', false, '01')];
    expect(aplicarModo(candidatas, historico, 'nao_respondidas').map((x) => x.id)).toEqual(['c']);
  });

  it('revisão de erros usa a ÚLTIMA resposta, não "existe alguma errada"', () => {
    // A distinção que define o modo: errei ontem, acertei hoje. A questão foi
    // dominada e precisa sair da fila — senão o modo nunca se esvazia.
    const historico = [resp('a', false, '01'), resp('a', true, '02'), resp('b', false, '01')];
    expect(aplicarModo(candidatas, historico, 'revisao_erros').map((x) => x.id)).toEqual(['b']);
  });

  it('revisão de erros ignora questão nunca respondida', () => {
    expect(aplicarModo(candidatas, [], 'revisao_erros')).toEqual([]);
  });

  it('devolve à fila a questão que voltou a ser errada', () => {
    const historico = [resp('a', false, '01'), resp('a', true, '02'), resp('a', false, '03')];
    expect(aplicarModo(candidatas, historico, 'revisao_erros').map((x) => x.id)).toEqual(['a']);
  });
});

describe('aplicarFiltros', () => {
  const acervo = [
    q('a', { banca_id: 'fcc', concurso_id: 'trt15', materia_id: 'port' }),
    q('b', { banca_id: 'fcc', concurso_id: 'tre', materia_id: 'rlm' }),
    q('c', { banca_id: 'cespe', concurso_id: 'pf', materia_id: 'port' }),
  ];

  it('sem filtro nenhum, o acervo inteiro', () => {
    expect(aplicarFiltros(acervo, FILTROS_VAZIOS)).toHaveLength(3);
  });

  it('banca reúne todos os concursos dela — é o caso de uso central', () => {
    const r = aplicarFiltros(acervo, { ...FILTROS_VAZIOS, bancaId: 'fcc' });
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('combina banca e matéria, ignorando o concurso', () => {
    const r = aplicarFiltros(acervo, {
      bancaId: 'fcc',
      concursoId: null,
      materiaIds: ['port'],
    });
    expect(r.map((x) => x.id)).toEqual(['a']);
  });

  it('matéria aceita várias', () => {
    const r = aplicarFiltros(acervo, { ...FILTROS_VAZIOS, materiaIds: ['port', 'rlm'] });
    expect(r).toHaveLength(3);
  });

  it('questão sem matéria some quando há filtro de matéria', () => {
    const r = aplicarFiltros([q('x', { materia_id: null })], {
      ...FILTROS_VAZIOS,
      materiaIds: ['port'],
    });
    expect(r).toEqual([]);
  });
});

describe('opcoesDeFiltro', () => {
  const acervo = [
    comNomes('a', 'fcc', 'FCC', 'trt15', 'TRT 15', 'port', 'Português'),
    comNomes('b', 'fcc', 'FCC', 'tre', 'TRE', 'rlm', 'RLM'),
    comNomes('c', 'cespe', 'Cespe', 'pf', 'PF', 'info', 'Informática'),
  ];

  it('oferece só o que existe no acervo — nenhuma opção leva a zero sozinha', () => {
    const o = opcoesDeFiltro(acervo, FILTROS_VAZIOS);
    expect(o.bancas.map((b) => b.nome)).toEqual(['Cespe', 'FCC']);
    expect(o.materias).toHaveLength(3);
  });

  it('encolhe os concursos e as matérias conforme a banca escolhida', () => {
    const o = opcoesDeFiltro(acervo, { ...FILTROS_VAZIOS, bancaId: 'fcc' });
    expect(o.concursos.map((c) => c.nome)).toEqual(['TRE', 'TRT 15']);
    expect(o.materias.map((m) => m.nome)).toEqual(['Português', 'RLM']);
    // As bancas não encolhem: é por elas que se começa.
    expect(o.bancas).toHaveLength(2);
  });

  it('ignora questão sem banca — não há id para filtrar', () => {
    const semBanca = [{ ...acervo[0], banca_id: null, banca_nome: null }];
    expect(opcoesDeFiltro(semBanca, FILTROS_VAZIOS).bancas).toEqual([]);
  });
});

describe('sortear', () => {
  const acervo = [q('a'), q('b'), q('c'), q('d')];

  it('nunca repete a mesma questão no mesmo quiz', () => {
    const sorteadas = sortear(acervo, 4, rngFixo([0.9, 0.1, 0.5, 0.3]));
    expect(new Set(sorteadas.map((x) => x.id)).size).toBe(4);
  });

  it('pedir mais do que existe monta com o que há, sem erro', () => {
    expect(sortear(acervo, 50)).toHaveLength(4);
  });

  it('pedir zero ou menos devolve vazio', () => {
    expect(sortear(acervo, 0)).toEqual([]);
    expect(sortear(acervo, -3)).toEqual([]);
  });

  it('é determinístico com um RNG fixo — é o que torna o sorteio testável', () => {
    const a = sortear(acervo, 3, rngFixo([0.1, 0.7, 0.3, 0.9]));
    const b = sortear(acervo, 3, rngFixo([0.1, 0.7, 0.3, 0.9]));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it('não altera a lista original', () => {
    const original = [...acervo];
    sortear(acervo, 2);
    expect(acervo).toEqual(original);
  });
});

describe('embaralhar', () => {
  it('preserva todos os itens', () => {
    const r = embaralhar([1, 2, 3, 4, 5], rngFixo([0.2, 0.8, 0.4, 0.6]));
    expect([...r].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('normalizarQuantidade', () => {
  it('aceita um número dentro dos limites', () => {
    expect(normalizarQuantidade('35', 10)).toBe(35);
    expect(normalizarQuantidade(' 20 ', 10)).toBe(20);
  });

  it('prende ao teto e ao piso em vez de recusar', () => {
    expect(normalizarQuantidade('500', 10)).toBe(QUANTIDADE_MAX);
    expect(normalizarQuantidade('0', 10)).toBe(QUANTIDADE_MIN);
    expect(normalizarQuantidade('-3', 10)).toBe(QUANTIDADE_MIN);
  });

  it('cai no último valor válido quando não dá para ler número', () => {
    // Campo vazio é o estado natural de quem está apagando para redigitar —
    // zerar o quiz nesse instante seria punir a edição.
    expect(normalizarQuantidade('', 25)).toBe(25);
    expect(normalizarQuantidade('abc', 25)).toBe(25);
  });

  it('trunca decimal — não existe meia questão', () => {
    expect(normalizarQuantidade('5.7', 10)).toBe(5);
  });
});

describe('motivoConjuntoVazio', () => {
  const acervo = [
    q('a', { banca_id: 'fcc', concurso_id: 'trt15', materia_id: 'port' }),
    q('b', { banca_id: 'fcc', concurso_id: 'trt15', materia_id: 'rlm' }),
  ];

  it('cala quando há questões', () => {
    expect(motivoConjuntoVazio(acervo, [], FILTROS_VAZIOS, 'aleatorio')).toBeNull();
  });

  it('acusa acervo vazio antes de culpar filtro', () => {
    expect(motivoConjuntoVazio([], [], FILTROS_VAZIOS, 'aleatorio')).toContain('Revise uma prova');
  });

  it('aponta o eixo que, sozinho, destrava o conjunto', () => {
    // O caso comum no começo: acervo de uma prova só e filtro de outra banca.
    const motivo = motivoConjuntoVazio(
      acervo,
      [],
      { ...FILTROS_VAZIOS, bancaId: 'cespe' },
      'aleatorio',
    );
    expect(motivo).toContain('sem a banca');
  });

  it('explica o modo quando os filtros têm questões mas o modo não', () => {
    const historico = [resp('a', true, '01'), resp('b', true, '01')];
    expect(motivoConjuntoVazio(acervo, historico, FILTROS_VAZIOS, 'nao_respondidas')).toContain(
      'já respondeu todas',
    );
    expect(motivoConjuntoVazio(acervo, historico, FILTROS_VAZIOS, 'revisao_erros')).toContain(
      'errada na última tentativa',
    );
  });
});

describe('placar e desempenho', () => {
  const respostas = [
    { questaoId: 'a', letraMarcada: 'A', acertou: true },
    { questaoId: 'b', letraMarcada: 'B', acertou: false },
    { questaoId: 'c', letraMarcada: 'C', acertou: true },
    { questaoId: 'd', letraMarcada: 'D', acertou: false },
  ];

  it('conta acertos e percentual', () => {
    expect(placar(respostas)).toEqual({ acertos: 2, total: 4, percentual: 50 });
  });

  it('quiz sem resposta não divide por zero', () => {
    expect(placar([])).toEqual({ acertos: 0, total: 0, percentual: 0 });
  });

  it('agrupa por matéria e ordena do pior para o melhor', () => {
    // A matéria que precisa de atenção aparece primeiro — é o ponto da tela.
    const materias = new Map([
      ['a', 'Português'],
      ['b', 'RLM'],
      ['c', 'Português'],
      ['d', 'RLM'],
    ]);
    expect(desempenhoPorMateria(respostas, materias)).toEqual([
      { materia: 'RLM', acertos: 0, total: 2, percentual: 0 },
      { materia: 'Português', acertos: 2, total: 2, percentual: 100 },
    ]);
  });

  it('não perde a questão sem matéria', () => {
    const r = desempenhoPorMateria([respostas[0]], new Map([['a', null]]));
    expect(r).toEqual([{ materia: 'sem matéria', acertos: 1, total: 1, percentual: 100 }]);
  });
});
