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
  SugestaoConcursoSchema,
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
export type QuestaoNova = z.input<typeof QuestaoNovaSchema>;

export type QuestaoCompleta = z.infer<typeof QuestaoCompletaSchema>;

export type Resposta = z.infer<typeof RespostaSchema>;
export type RespostaNova = z.infer<typeof RespostaNovaSchema>;

export type QuestaoNovaValidada = z.output<typeof QuestaoNovaSchema>;

export type SugestaoConcurso = z.infer<typeof SugestaoConcursoSchema>;
