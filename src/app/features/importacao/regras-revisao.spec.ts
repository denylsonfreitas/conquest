import { describe, expect, it } from 'vitest';

import {
  agruparParaRevisao,
  assuntosParaMapear,
  motivosAtencao,
  podeAprovar,
  precisaAtencao,
  QuestaoParaRevisao,
  revisaoConcluida,
} from './regras-revisao';

const limpa = (over: Partial<QuestaoParaRevisao> = {}): QuestaoParaRevisao => ({
  id: 'q1',
  numero: 1,
  materia_id: 'm1',
  assunto: null,
  gabarito: 'A',
  tem_imagem: false,
  imagem_path: null,
  incerto: false,
  anulada: false,
  revisada: false,
  ...over,
});

describe('precisaAtencao', () => {
  it('não acusa questão completa', () => {
    expect(precisaAtencao(limpa())).toBe(false);
  });

  it('acusa o que impediria a questão de entrar num quiz', () => {
    expect(precisaAtencao(limpa({ materia_id: null }))).toBe(true);
    expect(precisaAtencao(limpa({ gabarito: null }))).toBe(true);
    expect(precisaAtencao(limpa({ tem_imagem: true, imagem_path: null }))).toBe(true);
  });

  it('não acusa questão com imagem já anexada', () => {
    expect(precisaAtencao(limpa({ tem_imagem: true, imagem_path: 'p/q.png' }))).toBe(false);
  });

  it('acusa dúvida declarada pela extração', () => {
    expect(precisaAtencao(limpa({ incerto: true }))).toBe(true);
  });

  it('trata anulada como decisão tomada, não como pendência', () => {
    expect(precisaAtencao(limpa({ anulada: true, materia_id: null, gabarito: null }))).toBe(false);
  });
});

describe('motivosAtencao', () => {
  it('explica o que falta em vez de só destacar', () => {
    const motivos = motivosAtencao(limpa({ materia_id: null, gabarito: null }));
    expect(motivos).toEqual(['sem matéria', 'sem gabarito']);
  });

  it('lista TODOS os motivos, não só o primeiro', () => {
    const motivos = motivosAtencao(
      limpa({ materia_id: null, gabarito: null, tem_imagem: true, incerto: true }),
    );
    expect(motivos).toEqual([
      'sem matéria',
      'sem gabarito',
      'precisa de imagem',
      'extração duvidou',
    ]);
  });

  it('acusa a imagem faltante mesmo com o resto completo', () => {
    expect(motivosAtencao(limpa({ tem_imagem: true }))).toEqual(['precisa de imagem']);
    expect(motivosAtencao(limpa({ tem_imagem: true, imagem_path: 'p/q.png' }))).toEqual([]);
  });

  it('não acusa nada numa questão anulada', () => {
    expect(motivosAtencao(limpa({ anulada: true, materia_id: null }))).toEqual([]);
  });

  it('concorda sempre com precisaAtencao — o selo e o grupo não podem divergir', () => {
    const casos = [
      limpa(),
      limpa({ materia_id: null }),
      limpa({ gabarito: null }),
      limpa({ tem_imagem: true }),
      limpa({ incerto: true }),
      limpa({ anulada: true, materia_id: null, gabarito: null }),
    ];
    for (const q of casos) {
      expect(precisaAtencao(q)).toBe(motivosAtencao(q).length > 0);
    }
  });
});

describe('podeAprovar', () => {
  it('exige que nada esteja pendente', () => {
    expect(podeAprovar(limpa())).toBe(true);
    expect(podeAprovar(limpa({ gabarito: null }))).toBe(false);
  });

  it('não reoferece aprovação para questão já aprovada', () => {
    expect(podeAprovar(limpa({ revisada: true }))).toBe(false);
  });
});

describe('agruparParaRevisao', () => {
  it('preserva a numeração original dentro de cada grupo', () => {
    const qs = [
      limpa({ id: 'c', numero: 30 }),
      limpa({ id: 'a', numero: 10, gabarito: null }),
      limpa({ id: 'b', numero: 20 }),
      limpa({ id: 'd', numero: 5, materia_id: null }),
    ];
    const g = agruparParaRevisao(qs);

    expect(g.atencao.map((q) => q.numero)).toEqual([5, 10]);
    expect(g.semPendencia.map((q) => q.numero)).toEqual([20, 30]);
  });

  it('separa as já aprovadas dos dois grupos de trabalho', () => {
    const g = agruparParaRevisao([limpa({ id: 'x', revisada: true }), limpa({ id: 'y' })]);
    expect(g.aprovadas.map((q) => q.id)).toEqual(['x']);
    expect(g.semPendencia.map((q) => q.id)).toEqual(['y']);
    expect(g.atencao).toEqual([]);
  });
});

describe('assuntosParaMapear', () => {
  it('agrupa por assunto, do maior para o menor', () => {
    const qs = [
      ...Array.from({ length: 30 }, (_, i) =>
        limpa({ id: `e${i}`, materia_id: null, assunto: 'Conhecimentos Específicos' }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        limpa({ id: `r${i}`, materia_id: null, assunto: 'Raciocínio Lógico Matemático' }),
      ),
    ];
    const grupos = assuntosParaMapear(qs);

    expect(grupos.map((g) => [g.assunto, g.quantidade])).toEqual([
      ['Conhecimentos Específicos', 30],
      ['Raciocínio Lógico Matemático', 6],
    ]);
    expect(grupos[0].questaoIds).toHaveLength(30);
  });

  it('ignora questões que já têm matéria', () => {
    expect(assuntosParaMapear([limpa({ assunto: 'Qualquer' })])).toEqual([]);
  });

  it('ignora questões sem assunto lido — essas vão uma a uma', () => {
    expect(assuntosParaMapear([limpa({ materia_id: null, assunto: null })])).toEqual([]);
  });
});

describe('revisaoConcluida', () => {
  it('exige todas revisadas', () => {
    expect(revisaoConcluida([limpa({ revisada: true }), limpa({ revisada: true })])).toBe(true);
    expect(revisaoConcluida([limpa({ revisada: true }), limpa()])).toBe(false);
  });

  it('prova sem questões não está concluída', () => {
    expect(revisaoConcluida([])).toBe(false);
  });
});
