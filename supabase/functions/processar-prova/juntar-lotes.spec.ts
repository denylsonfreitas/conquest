import { describe, expect, it } from 'vitest';

import { juntarLotes } from './juntar-lotes.ts';
import { ExtracaoBruta, QuestaoBruta } from './questao-bruta.ts';

const questao = (over: Partial<QuestaoBruta> = {}): QuestaoBruta => ({
  numero: 1,
  materia: 'Língua Portuguesa',
  enunciado: 'Enunciado',
  alternativas: [{ letra: 'A', texto: 'um' }],
  gabarito: null,
  tipo: 'multipla_escolha',
  tem_imagem: false,
  incerto: false,
  ...over,
});

const lote = (over: Partial<ExtracaoBruta> = {}): ExtracaoBruta => ({
  textos: [],
  questoes: [],
  ...over,
});

describe('juntarLotes', () => {
  it('junta as questões e devolve em ordem de numeração', () => {
    const junta = juntarLotes([
      lote({ questoes: [questao({ numero: 21 }), questao({ numero: 22 })] }),
      lote({ questoes: [questao({ numero: 1 }), questao({ numero: 2 })] }),
    ]);

    expect(junta.questoes.map((q) => q.numero)).toEqual([1, 2, 21, 22]);
  });

  it('questão repetida entre lotes entra uma vez só', () => {
    // Acontece quando o modelo extrapola a faixa pedida e transcreve a questão
    // vizinha, que o lote seguinte também vai transcrever.
    const junta = juntarLotes([
      lote({ questoes: [questao({ numero: 20 }), questao({ numero: 21 })] }),
      lote({ questoes: [questao({ numero: 21, enunciado: 'outra transcrição' })] }),
    ]);

    expect(junta.questoes).toHaveLength(2);
    expect(junta.questoes[1].enunciado).toBe('Enunciado');
  });

  it('id_local igual em lotes diferentes não colide', () => {
    // Todo lote numera do zero: sem prefixo, o "t1" do lote 2 sobrescreve o do
    // lote 1 e as questões passam a apontar para o texto errado.
    const junta = juntarLotes([
      lote({
        textos: [{ id_local: 't1', titulo: 'Texto A', conteudo: 'Conteúdo A', fonte: null }],
        questoes: [questao({ numero: 1, tem_texto_base: true, texto_base: 't1' })],
      }),
      lote({
        textos: [{ id_local: 't1', titulo: 'Texto B', conteudo: 'Conteúdo B', fonte: null }],
        questoes: [questao({ numero: 21, tem_texto_base: true, texto_base: 't1' })],
      }),
    ]);

    expect(junta.textos).toHaveLength(2);

    const [q1, q21] = junta.questoes;
    expect(q1.texto_base).not.toBe(q21.texto_base);

    const de = (id: string | null | undefined) => junta.textos.find((t) => t.id_local === id);
    expect(de(q1.texto_base)?.titulo).toBe('Texto A');
    expect(de(q21.texto_base)?.titulo).toBe('Texto B');
  });

  it('o mesmo texto-base visto por dois lotes vira um só, com os dois vínculos', () => {
    // O corte cai no meio de um grupo que compartilha o texto, então os dois
    // lados o transcrevem. Gravar duas vezes duplicaria o texto na revisão.
    const conteudo = 'A cidade cresceu ao redor da estação.';
    const junta = juntarLotes([
      lote({
        textos: [{ id_local: 't1', titulo: 'A estação', conteudo, fonte: null }],
        questoes: [questao({ numero: 18, tem_texto_base: true, texto_base: 't1' })],
      }),
      lote({
        textos: [{ id_local: 't1', titulo: 'A estação', conteudo: `  ${conteudo}  `, fonte: null }],
        questoes: [questao({ numero: 21, tem_texto_base: true, texto_base: 't1' })],
      }),
    ]);

    expect(junta.textos).toHaveLength(1);
    expect(junta.questoes[0].texto_base).toBe(junta.questoes[1].texto_base);
    expect(junta.questoes[0].texto_base).toBe(junta.textos[0].id_local);
  });

  it('vínculo para texto que não veio vira pendente, não referência quebrada', () => {
    // A revisão sabe tratar "depende de um texto, não sei qual". Não sabe tratar
    // um id que não existe.
    const junta = juntarLotes([
      lote({ questoes: [questao({ numero: 1, tem_texto_base: true, texto_base: 't9' })] }),
    ]);

    expect(junta.questoes[0].tem_texto_base).toBe(true);
    expect(junta.questoes[0].texto_base).toBeNull();
  });

  it('texto sem conteúdo não entra e não gera vínculo', () => {
    const junta = juntarLotes([
      lote({
        textos: [{ id_local: 't1', titulo: 'Vazio', conteudo: '   ', fonte: null }],
        questoes: [questao({ numero: 1, tem_texto_base: true, texto_base: 't1' })],
      }),
    ]);

    expect(junta.textos).toEqual([]);
    expect(junta.questoes[0].texto_base).toBeNull();
  });

  it('questão sem texto-base atravessa intacta', () => {
    const junta = juntarLotes([lote({ questoes: [questao({ numero: 1 })] })]);

    expect(junta.questoes[0].texto_base).toBeNull();
    expect(junta.questoes[0].enunciado).toBe('Enunciado');
  });
});
