import { z } from 'zod';

import {
  BancaSchema,
  ConcursoSchema,
  MateriaSchema,
  ProvaSchema,
  QuestaoSchema,
  RespostaSchema,
  TextoBaseSchema,
} from '../../shared/schema';

export const VERSAO_BACKUP = 1;

export const BackupSchema = z.object({
  versao: z.literal(VERSAO_BACKUP),
  exportado_em: z.iso.datetime({ offset: true }),
  dados: z.object({
    bancas: z.array(BancaSchema),
    materias: z.array(MateriaSchema),
    concursos: z.array(ConcursoSchema),
    provas: z.array(ProvaSchema),
    // Antes de questoes: a questão referencia o texto, e importar na ordem
    // inversa quebraria a chave estrangeira.
    textos_base: z.array(TextoBaseSchema),
    questoes: z.array(QuestaoSchema),
    respostas: z.array(RespostaSchema),
  }),
});

export type Backup = z.infer<typeof BackupSchema>;
export type TabelaBackup = keyof Backup['dados'];

export const ORDEM_IMPORTACAO: TabelaBackup[] = [
  'bancas',
  'materias',
  'concursos',
  'provas',
  'textos_base',
  'questoes',
  'respostas',
];

export interface DiferencaTabela {
  readonly tabela: TabelaBackup;
  readonly criar: number;
  readonly atualizar: number;
  readonly soNoBanco: number;
}

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

export function acharPonteirosOrfaos(
  questoes: readonly { id: string; imagem_path: string | null }[],
  caminhosNoBucket: readonly string[],
): string[] {
  const existem = new Set(caminhosNoBucket);
  return questoes
    .filter((q) => q.imagem_path !== null && !existem.has(q.imagem_path))
    .map((q) => q.id);
}

export function nomeDoArquivo(quando: Date = new Date()): string {
  return `conquest-${quando.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
}
