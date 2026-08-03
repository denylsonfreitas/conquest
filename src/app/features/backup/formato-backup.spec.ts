import { describe, expect, it } from 'vitest';

import {
  acharPonteirosOrfaos,
  Backup,
  BackupSchema,
  compararTabela,
  montarPrevia,
  nomeDoArquivo,
  ORDEM_IMPORTACAO,
  TabelaBackup,
  VERSAO_BACKUP,
} from './formato-backup';

const vazio = (): Backup['dados'] => ({
  bancas: [],
  materias: [],
  concursos: [],
  provas: [],
  questoes: [],
  respostas: [],
});

const idsVazios = (): Record<TabelaBackup, string[]> => ({
  bancas: [],
  materias: [],
  concursos: [],
  provas: [],
  questoes: [],
  respostas: [],
});

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('compararTabela', () => {
  it('separa criar, atualizar e o que só existe no banco', () => {
    const d = compararTabela('questoes', ['a', 'b', 'c'], ['b', 'c', 'd']);
    expect(d).toEqual({ tabela: 'questoes', criar: 1, atualizar: 2, soNoBanco: 1 });
  });

  it('banco vazio: tudo é criação', () => {
    expect(compararTabela('provas', ['a', 'b'], [])).toMatchObject({ criar: 2, atualizar: 0 });
  });

  it('arquivo igual ao banco: tudo é sobrescrita, nada some', () => {
    // O caso que morde: exportar segunda, revisar terça, restaurar quarta.
    const d = compararTabela('questoes', ['a', 'b'], ['a', 'b']);
    expect(d).toMatchObject({ criar: 0, atualizar: 2, soNoBanco: 0 });
  });
});

describe('montarPrevia', () => {
  it('soma os totais de todas as tabelas', () => {
    const backup: Backup = {
      versao: VERSAO_BACKUP,
      exportado_em: '2026-08-03T00:00:00Z',
      dados: { ...vazio() },
    };
    const ids = idsVazios();
    // Simula ids sem precisar montar linhas completas.
    const previa = montarPrevia(
      { ...backup, dados: { ...backup.dados } },
      { ...ids, questoes: ['x'] },
      [],
    );

    expect(previa.totalCriar).toBe(0);
    expect(previa.totalSoNoBanco).toBe(1);
    expect(previa.diferencas).toHaveLength(ORDEM_IMPORTACAO.length);
  });
});

describe('acharPonteirosOrfaos', () => {
  const questoes = [
    { id: 'a', imagem_path: 'p/a.png' },
    { id: 'b', imagem_path: 'p/b.png' },
    { id: 'c', imagem_path: null },
  ];

  it('acha quem aponta para imagem que não está no bucket', () => {
    // Os binários ficam fora do backup, então o restore deixa ponteiros sem
    // arquivo — e a view mede elegibilidade pelo ponteiro, não pelo arquivo.
    expect(acharPonteirosOrfaos(questoes, ['p/a.png'])).toEqual(['b']);
  });

  it('ignora quem não depende de imagem', () => {
    expect(acharPonteirosOrfaos(questoes, ['p/a.png', 'p/b.png'])).toEqual([]);
  });

  it('bucket vazio: todos os ponteiros são órfãos', () => {
    expect(acharPonteirosOrfaos(questoes, [])).toEqual(['a', 'b']);
  });
});

describe('BackupSchema', () => {
  const minimo = {
    versao: VERSAO_BACKUP,
    exportado_em: '2026-08-03T00:00:00+00:00',
    dados: vazio(),
  };

  it('aceita um envelope válido', () => {
    expect(BackupSchema.safeParse(minimo).success).toBe(true);
  });

  it('recusa versão desconhecida — o importador não deve adivinhar', () => {
    expect(BackupSchema.safeParse({ ...minimo, versao: 99 }).success).toBe(false);
  });

  it('recusa arquivo sem envelope', () => {
    expect(BackupSchema.safeParse({ questoes: [] }).success).toBe(false);
  });

  it('recusa linha que não passa no schema canônico', () => {
    const torto = {
      ...minimo,
      dados: { ...vazio(), bancas: [{ id: UUID_A, nome: '' }] },
    };
    expect(BackupSchema.safeParse(torto).success).toBe(false);
  });

  it('aceita linha válida do schema canônico', () => {
    const bom = {
      ...minimo,
      dados: {
        ...vazio(),
        bancas: [{ id: UUID_B, nome: 'FGV', created_at: '2026-08-01T00:00:00+00:00' }],
      },
    };
    expect(BackupSchema.safeParse(bom).success).toBe(true);
  });
});

describe('nomeDoArquivo', () => {
  it('é ordenável por data e sem caractere proibido em nome de arquivo', () => {
    const nome = nomeDoArquivo(new Date('2026-08-03T14:30:05Z'));
    expect(nome).toBe('conquest-2026-08-03-14-30-05.json');
    expect(nome).not.toContain(':');
  });
});

describe('ORDEM_IMPORTACAO', () => {
  it('põe as dependências antes dos dependentes', () => {
    // A FK recusaria uma questão cuja prova ainda não existe.
    const posicao = (t: TabelaBackup) => ORDEM_IMPORTACAO.indexOf(t);
    expect(posicao('bancas')).toBeLessThan(posicao('concursos'));
    expect(posicao('concursos')).toBeLessThan(posicao('provas'));
    expect(posicao('provas')).toBeLessThan(posicao('questoes'));
    expect(posicao('materias')).toBeLessThan(posicao('questoes'));
    expect(posicao('questoes')).toBeLessThan(posicao('respostas'));
  });
});
