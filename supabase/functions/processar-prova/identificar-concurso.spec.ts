import { describe, expect, it } from 'vitest';

import { identificarBanca, identificarConcurso } from './identificar-concurso.ts';

const BANCAS = ['Cebraspe', 'FCC', 'FGV', 'Vunesp', 'Cesgranrio', 'IBFC', 'Outra'].map(
  (nome, i) => ({ id: `b${i}`, nome }),
);

// Trechos reduzidos das duas provas reais, preservando o que importa: a linha
// que se repete em toda página e a menção à banca perdida no meio das
// instruções.
const CESGRANRIO = [
  'BANCO DO BRASIL GABARITO',
  'AGENTE DE TECNOLOGIA - Microrregião 158 - TI',
  'SELEÇÃO EXTERNA 2022 / 001',
  'Os gabaritos serão divulgados no site da FUNDAÇÃO CESGRANRIO (http://www.cesgranrio.org.br).',
  'AGENTE DE TECNOLOGIA - Microrregião 158 -TI4GABARITO 1',
  'BANCO DO BRASIL',
  'O trecho do texto que resume o objetivo é',
  'AGENTE DE TECNOLOGIA - Microrregião 158 -TI5GABARITO 1',
  'BANCO DO BRASIL',
].join('\n');

const FGV = [
  'EMPRESA DE TECNOLOGIA E INFORMAÇÕES DA',
  'PREVIDÊNCIA - DATAPREV',
  'ATI - DESENVOLVIMENTO DE SOFTWARE',
  '• A FGV coletará as impressões digitais dos candidatos na',
  'EMPRESA DE TECNOLOGIA E INFORMAÇÕES DA PREVIDÊNCIA - DATAPREV FGV CONHECIMENTO',
  'Assinale a opção correta.',
  'EMPRESA DE TECNOLOGIA E INFORMAÇÕES DA PREVIDÊNCIA - DATAPREV FGV CONHECIMENTO',
].join('\n');

describe('identificarBanca', () => {
  it('acha a banca citada em caixa alta no meio das instruções', () => {
    expect(identificarBanca(CESGRANRIO, BANCAS)?.nome).toBe('Cesgranrio');
    expect(identificarBanca(FGV, BANCAS)?.nome).toBe('FGV');
  });

  it('NÃO confunde a banca "Outra" com a palavra outra no enunciado', () => {
    const enunciado = 'Assinale outra alternativa. Nenhuma outra opção é correta.';
    expect(identificarBanca(enunciado, BANCAS)).toBeNull();
  });

  it('não casa sigla colada dentro de outra palavra', () => {
    expect(identificarBanca('O documento FCCX não existe. AFCC também não.', BANCAS)).toBeNull();
  });

  it('devolve null quando nenhuma banca conhecida aparece', () => {
    expect(identificarBanca('prova aplicada pelo instituto local', BANCAS)).toBeNull();
  });

  it('entre duas bancas citadas, fica com a mais frequente', () => {
    const texto = 'A FGV aplicou. FGV de novo. FGV mais uma. Antes era o CEBRASPE.';
    expect(identificarBanca(texto, BANCAS)?.nome).toBe('FGV');
  });
});

describe('identificarConcurso', () => {
  it('tira o órgão do rodapé que se repete página a página', () => {
    expect(identificarConcurso(CESGRANRIO, BANCAS)).toEqual({
      banca_id: 'b4',
      banca_nome: 'Cesgranrio',
      orgao: 'BANCO DO BRASIL',
    });
  });

  it('corta a banca e o que vem depois dela, deixando só o órgão', () => {
    expect(identificarConcurso(FGV, BANCAS).orgao).toBe(
      'EMPRESA DE TECNOLOGIA E INFORMAÇÕES DA PREVIDÊNCIA - DATAPREV',
    );
  });

  it('não inventa órgão a partir de uma linha que aparece uma vez só', () => {
    const semRepeticao = ['PREFEITURA DE ALGUM LUGAR', 'Questão 1', 'Questão 2'].join('\n');
    expect(identificarConcurso(semRepeticao, BANCAS).orgao).toBeNull();
  });

  it('ignora linha de caixa baixa, que é enunciado e não cabeçalho', () => {
    const prosa = ['um enunciado qualquer repetido', 'um enunciado qualquer repetido'].join('\n');
    expect(identificarConcurso(prosa, BANCAS).orgao).toBeNull();
  });

  it('texto vazio não vira sugestão', () => {
    expect(identificarConcurso('   ', BANCAS)).toEqual({
      banca_id: null,
      banca_nome: null,
      orgao: null,
    });
  });
});
