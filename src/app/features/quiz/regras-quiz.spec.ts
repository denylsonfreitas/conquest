import {
  aplicarModo,
  desempenhoPorMateria,
  embaralhar,
  filaDoModo,
  motivoConjuntoVazio,
  normalizarQuantidade,
  placar,
  primeiras,
  QUANTIDADE_MAX,
  QUANTIDADE_MIN,
  RespostaHistorico,
  ultimaRespostaPorQuestao,
  usoPorQuestao,
} from './regras-quiz';
import { FILTROS_VAZIOS, ItemFiltravel } from '../../shared/filtros-acervo';

const q = (id: string, over: Partial<ItemFiltravel> = {}): ItemFiltravel => ({
  id,
  materia_id: 'port',
  banca_id: 'fcc',
  concurso_id: 'trt15',
  ...over,
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

  it('menos vistas não exclui ninguém — é por isso que não esgota', () => {
    const historico = [resp('a', true, '01'), resp('b', false, '01')];
    expect(aplicarModo(candidatas, historico, 'menos_vistas')).toHaveLength(3);
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

describe('filaDoModo — menos vistas', () => {
  const acervo = [q('a'), q('b'), q('c'), q('d')];

  it('põe as nunca respondidas na frente', () => {
    const historico = [resp('a', true, '01'), resp('b', true, '01')];
    const fila = filaDoModo(acervo, historico, 'menos_vistas', rngFixo([0.5]));
    expect(new Set(fila.slice(0, 2).map((x) => x.id))).toEqual(new Set(['c', 'd']));
  });

  it('NUNCA esgota — é a diferença para o modo que substituiu', () => {
    // Com tudo respondido, "só não respondidas" devolvia vazio. Este continua
    // devolvendo o acervo inteiro, agora ordenado por prioridade.
    const historico = acervo.map((x) => resp(x.id, true, '01'));
    expect(filaDoModo(acervo, historico, 'menos_vistas')).toHaveLength(4);
  });

  it('ordena as vistas por menos vezes, depois pela mais antiga', () => {
    const historico = [
      resp('a', true, '10'),
      resp('b', true, '01'),
      resp('b', true, '02'), // b foi vista duas vezes
      resp('c', true, '05'),
    ];
    // 'd' nunca foi vista; entre as vistas, c (1x, 05) vem antes de a (1x, 10),
    // e b (2x) vai para o fim.
    const fila = filaDoModo(acervo, historico, 'menos_vistas');
    expect(fila.map((x) => x.id)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('responder de novo joga a questão para o fim, sem apagar nada', () => {
    // É o mecanismo da rotação: a fila se reorganiza pelo ato de responder.
    const antes = [resp('a', true, '01'), resp('b', true, '02'), resp('c', true, '03')];
    const soD = filaDoModo([q('a'), q('b'), q('c')], antes, 'menos_vistas');
    expect(soD.map((x) => x.id)).toEqual(['a', 'b', 'c']);

    const depois = [...antes, resp('a', true, '20')];
    const reordenada = filaDoModo([q('a'), q('b'), q('c')], depois, 'menos_vistas');
    expect(reordenada.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('embaralha as nunca respondidas entre si, sem critério inventado', () => {
    const fila = filaDoModo(acervo, [], 'menos_vistas', rngFixo([0.9, 0.1, 0.5]));
    expect(new Set(fila.map((x) => x.id)).size).toBe(4);
  });

  it('não altera a lista original', () => {
    const original = [...acervo];
    filaDoModo(acervo, [resp('a', true, '01')], 'menos_vistas');
    expect(acervo).toEqual(original);
  });
});

describe('filaDoModo — aleatório e erros', () => {
  const acervo = [q('a'), q('b'), q('c'), q('d')];

  it('não repete questão dentro do mesmo quiz', () => {
    const fila = filaDoModo(acervo, [], 'aleatorio', rngFixo([0.9, 0.1, 0.5, 0.3]));
    expect(new Set(fila.map((x) => x.id)).size).toBe(4);
  });

  it('é determinístico com RNG fixo', () => {
    const a = filaDoModo(acervo, [], 'aleatorio', rngFixo([0.1, 0.7, 0.3, 0.9]));
    const b = filaDoModo(acervo, [], 'aleatorio', rngFixo([0.1, 0.7, 0.3, 0.9]));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it('revisão de erros continua podendo esvaziar — ali é sucesso', () => {
    const historico = acervo.map((x) => resp(x.id, true, '01'));
    expect(filaDoModo(acervo, historico, 'revisao_erros')).toEqual([]);
  });
});

describe('primeiras', () => {
  const fila = [q('a'), q('b'), q('c'), q('d')];

  it('corta no topo, preservando a ordem que o modo estabeleceu', () => {
    expect(primeiras(fila, 2).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('pedir mais do que existe devolve o que há, sem erro', () => {
    expect(primeiras(fila, 50)).toHaveLength(4);
  });

  it('pedir zero ou menos devolve vazio', () => {
    expect(primeiras(fila, 0)).toEqual([]);
    expect(primeiras(fila, -3)).toEqual([]);
  });
});

describe('usoPorQuestao', () => {
  it('conta as vezes e guarda a mais recente', () => {
    const uso = usoPorQuestao([
      resp('a', true, '01'),
      resp('a', false, '09'),
      resp('b', true, '05'),
    ]);
    expect(uso.get('a')).toEqual({ vezes: 2, ultimaEm: '2026-08-09T10:00:00Z' });
    expect(uso.get('b')?.vezes).toBe(1);
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
    expect(motivoConjuntoVazio(acervo, historico, FILTROS_VAZIOS, 'revisao_erros')).toContain(
      'errada na última tentativa',
    );
  });

  it('menos vistas nunca fica sem motivo próprio — ele não esvazia sozinho', () => {
    const historico = acervo.map((x) => resp(x.id, true, '01'));
    expect(motivoConjuntoVazio(acervo, historico, FILTROS_VAZIOS, 'menos_vistas')).toBeNull();
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
