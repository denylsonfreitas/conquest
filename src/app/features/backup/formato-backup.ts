import { z } from 'zod';

import {
  BancaSchema,
  ConcursoSchema,
  MateriaSchema,
  ProvaSchema,
  QuestaoSchema,
  RespostaSchema,
} from '../../shared/schema';

/**
 * Formato do arquivo de backup, e as regras PURAS que decidem o que um import
 * vai fazer antes de fazer.
 *
 * Envelope versionado de propósito: sem `versao`, um importador futuro teria
 * que adivinhar o que está lendo. Os UUIDs originais são preservados — é o que
 * torna o restore idempotente, porque cada linha sabe quem ela é.
 *
 * O que NÃO entra: PDFs e imagens. Os PDFs carregam a marca d'água do
 * pciconcursos, que codifica IP e data de download; embuti-los faria o arquivo
 * de backup — que acaba em Drive, pendrive, anexo — carregar dado pessoal.
 * `arquivo_path` identifica cada binário para quem quiser casá-los à mão.
 */
export const VERSAO_BACKUP = 1;

export const BackupSchema = z.object({
  versao: z.literal(VERSAO_BACKUP),
  exportado_em: z.iso.datetime({ offset: true }),
  dados: z.object({
    bancas: z.array(BancaSchema),
    materias: z.array(MateriaSchema),
    concursos: z.array(ConcursoSchema),
    provas: z.array(ProvaSchema),
    questoes: z.array(QuestaoSchema),
    respostas: z.array(RespostaSchema),
  }),
});

export type Backup = z.infer<typeof BackupSchema>;
export type TabelaBackup = keyof Backup['dados'];

/**
 * Ordem de inserção: dependências antes de dependentes.
 *
 * Não é detalhe de performance — é o que impede a FK de recusar uma questão
 * cuja prova ainda não existe.
 */
export const ORDEM_IMPORTACAO: TabelaBackup[] = [
  'bancas',
  'materias',
  'concursos',
  'provas',
  'questoes',
  'respostas',
];

export interface DiferencaTabela {
  readonly tabela: TabelaBackup;
  readonly criar: number;
  /** Existem nos dois lados: a versão do ARQUIVO vence. */
  readonly atualizar: number;
  /** Existem só no banco: o import NUNCA apaga, elas ficam. */
  readonly soNoBanco: number;
}

/**
 * O que o import faria, sem fazer.
 *
 * `atualizar` é o número que importa ler: são as linhas que serão
 * SOBRESCRITAS pelo arquivo. O caso que morde é exportar segunda, revisar
 * terça e restaurar quarta — a curadoria de terça é mais nova que o arquivo, e
 * some. Só um aviso antes de aplicar evita isso.
 */
export function compararTabela(
  tabela: TabelaBackup,
  idsNoArquivo: readonly string[],
  idsNoBanco: readonly string[],
): DiferencaTabela {
  const noBanco = new Set(idsNoBanco);
  const noArquivo = new Set(idsNoArquivo);

  return {
    tabela,
    criar: idsNoArquivo.filter((id) => !noBanco.has(id)).length,
    atualizar: idsNoArquivo.filter((id) => noBanco.has(id)).length,
    soNoBanco: idsNoBanco.filter((id) => !noArquivo.has(id)).length,
  };
}

export interface Previa {
  readonly diferencas: DiferencaTabela[];
  readonly totalCriar: number;
  readonly totalAtualizar: number;
  readonly totalSoNoBanco: number;
  /** Questões cujo `imagem_path` não tem arquivo no bucket. */
  readonly ponteirosOrfaos: string[];
}

export function montarPrevia(
  backup: Backup,
  idsNoBanco: Record<TabelaBackup, readonly string[]>,
  ponteirosOrfaos: readonly string[],
): Previa {
  const diferencas = ORDEM_IMPORTACAO.map((tabela) =>
    compararTabela(
      tabela,
      backup.dados[tabela].map((linha) => linha.id),
      idsNoBanco[tabela] ?? [],
    ),
  );

  return {
    diferencas,
    totalCriar: soma(diferencas, (d) => d.criar),
    totalAtualizar: soma(diferencas, (d) => d.atualizar),
    totalSoNoBanco: soma(diferencas, (d) => d.soNoBanco),
    ponteirosOrfaos: [...ponteirosOrfaos],
  };
}

function soma(ds: readonly DiferencaTabela[], f: (d: DiferencaTabela) => number): number {
  return ds.reduce((s, d) => s + f(d), 0);
}

/**
 * Questões que apontam para imagem que não está no bucket.
 *
 * Os binários ficam fora do backup, então um restore deixa ponteiros sem
 * arquivo — e a view calcula elegibilidade com `imagem_path is not null`, ou
 * seja, ela vê o PONTEIRO, não o ARQUIVO. A questão entraria num quiz com a
 * imagem quebrada e a resposta dependendo de algo que não carrega.
 *
 * É a mesma doença do `acertou` mentindo: dado derivado que deixou de
 * corresponder à realidade. Zerar o ponteiro devolve a questão ao estado
 * honesto — "precisa de imagem", que a revisão já sabe tratar.
 */
export function acharPonteirosOrfaos(
  questoes: readonly { id: string; imagem_path: string | null }[],
  caminhosNoBucket: readonly string[],
): string[] {
  const existem = new Set(caminhosNoBucket);
  return questoes
    .filter((q) => q.imagem_path !== null && !existem.has(q.imagem_path))
    .map((q) => q.id);
}

/** Nome do arquivo baixado: ordenável por data e sem ambiguidade de fuso. */
export function nomeDoArquivo(quando: Date = new Date()): string {
  return `conquest-${quando.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
}
