/**
 * Tipos TypeScript do domínio.
 *
 * Nada é declarado à mão aqui: todo tipo é DERIVADO do schema Zod com
 * `z.infer`. Mudou o schema, o tipo muda junto e o compilador aponta o que
 * quebrou. É o que impede o schema e os tipos de divergirem com o tempo.
 */
import { z } from 'zod';
import {
  AlternativaSchema,
  BancaNovaSchema,
  BancaSchema,
  ConcursoNovoSchema,
  ConcursoSchema,
  LetraSchema,
  MateriaNovaSchema,
  MateriaSchema,
  ProvaNovaSchema,
  ProvaSchema,
  QuestaoCompletaSchema,
  QuestaoNovaSchema,
  QuestaoSchema,
  RespostaNovaSchema,
  RespostaSchema,
  StatusProvaSchema,
  TipoQuestaoSchema,
} from './schema';

export type Letra = z.infer<typeof LetraSchema>;
export type TipoQuestao = z.infer<typeof TipoQuestaoSchema>;
export type StatusProva = z.infer<typeof StatusProvaSchema>;

export type Banca = z.infer<typeof BancaSchema>;
export type BancaNova = z.infer<typeof BancaNovaSchema>;

export type Materia = z.infer<typeof MateriaSchema>;
export type MateriaNova = z.infer<typeof MateriaNovaSchema>;

export type Concurso = z.infer<typeof ConcursoSchema>;
export type ConcursoNovo = z.infer<typeof ConcursoNovoSchema>;

export type Prova = z.infer<typeof ProvaSchema>;
export type ProvaNova = z.infer<typeof ProvaNovaSchema>;

export type Alternativa = z.infer<typeof AlternativaSchema>;
export type Questao = z.infer<typeof QuestaoSchema>;
/** O que você MONTA para inserir: `tem_imagem`/`anulada`/`revisada` podem faltar. */
export type QuestaoNova = z.input<typeof QuestaoNovaSchema>;

/** Linha da view `questoes_completas` — o formato que o read-side consome. */
export type QuestaoCompleta = z.infer<typeof QuestaoCompletaSchema>;

export type Resposta = z.infer<typeof RespostaSchema>;
export type RespostaNova = z.infer<typeof RespostaNovaSchema>;

/**
 * O que SAI do `.parse()`, com os defaults já aplicados — é o formato exato que
 * vai para o INSERT. `z.infer` é apelido de `z.output`; a distinção só importa
 * em schemas com `.default()`, como este.
 */
export type QuestaoNovaValidada = z.output<typeof QuestaoNovaSchema>;
