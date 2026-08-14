import { z } from 'zod';

const timestamp = z.iso.datetime({ offset: true });
const uuid = z.uuid();
const textoObrigatorio = z.string().trim().min(1);
const textoOpcional = z.string().trim().min(1).nullable();

export const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
export const LetraSchema = z.enum(LETRAS);

export const TipoQuestaoSchema = z.enum(['multipla_escolha', 'certo_errado']);

export const StatusProvaSchema = z.enum([
  'pendente',
  'processando',
  'aguardando_revisao',
  'pronta',
  'erro',
]);

export const BancaSchema = z.object({
  id: uuid,
  nome: textoObrigatorio,
  created_at: timestamp,
});

export const BancaNovaSchema = BancaSchema.omit({ id: true, created_at: true });

export const MateriaSchema = z.object({
  id: uuid,
  nome: textoObrigatorio,
  created_at: timestamp,
});

export const MateriaNovaSchema = MateriaSchema.omit({ id: true, created_at: true });

export const ConcursoSchema = z.object({
  id: uuid,
  nome: textoObrigatorio,
  banca_id: uuid.nullable(),
  orgao: textoOpcional,
  created_at: timestamp,
});

export const ConcursoNovoSchema = ConcursoSchema.omit({
  id: true,
  created_at: true,
}).partial({ banca_id: true, orgao: true });

export const ProvaSchema = z.object({
  id: uuid,
  concurso_id: uuid,
  nome: textoObrigatorio,
  ano: z.number().int().min(1900).max(2200).nullable(),
  cargo: textoOpcional,
  arquivo_path: textoOpcional,
  arquivo_hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, { error: 'arquivo_hash deve ser um SHA-256 em hex minúsculo' })
    .nullable(),
  gabarito_path: textoOpcional,
  status: StatusProvaSchema,
  erro_msg: textoOpcional,
  total_questoes: z.number().int().nonnegative().nullable(),
  processando_desde: timestamp.nullable(),
  created_at: timestamp,
});

export const ProvaNovaSchema = ProvaSchema.omit({ id: true, created_at: true })
  .partial({
    ano: true,
    cargo: true,
    arquivo_path: true,
    arquivo_hash: true,
    gabarito_path: true,
    status: true,
    erro_msg: true,
    total_questoes: true,
    processando_desde: true,
  })
  .refine((p) => !p.arquivo_path || !!p.arquivo_hash, {
    error: 'prova com arquivo precisa do hash',
    path: ['arquivo_hash'],
  });

export const AlternativaSchema = z.object({
  letra: LetraSchema,
  texto: z.string().trim(),
});

const questaoCampos = z.object({
  numero: z.number().int().positive().nullable(),
  materia_id: uuid.nullable(),
  assunto: textoOpcional,
  enunciado: textoObrigatorio,
  alternativas: z
    .array(AlternativaSchema)
    .min(2, { error: 'questão precisa de ao menos 2 alternativas' }),
  gabarito: LetraSchema.nullable(),
  tipo: TipoQuestaoSchema,
  tem_imagem: z.boolean(),
  imagem_path: textoOpcional,
  comentario: textoOpcional,
  anulada: z.boolean(),
  revisada: z.boolean(),
  incerto: z.boolean(),
  // Espelho de tem_imagem / imagem_path: a marca diz que a questão depende de um
  // texto que não está no enunciado, o id diz qual. Marcada sem id, a questão
  // fica pendente na revisão em vez de entrar quebrada no quiz.
  tem_texto_base: z.boolean(),
  texto_base_id: uuid.nullable(),
});

type CamposVerificaveis = {
  readonly gabarito?: string | null;
  readonly alternativas: readonly { readonly letra: string; readonly texto: string }[];
  readonly materia_id?: string | null;
  readonly revisada: boolean;
  readonly tem_imagem?: boolean;
};

const gabaritoExisteNasAlternativas = (q: CamposVerificaveis): boolean =>
  q.gabarito == null || q.alternativas.some((a) => a.letra === q.gabarito);

const revisadaExigeGabarito = (q: CamposVerificaveis): boolean => !q.revisada || q.gabarito != null;

const letrasNaoRepetem = (q: CamposVerificaveis): boolean =>
  new Set(q.alternativas.map((a) => a.letra)).size === q.alternativas.length;

const alternativaSemTextoExigeImagem = (q: CamposVerificaveis): boolean =>
  q.alternativas.every((a) => a.texto.length > 0) || q.tem_imagem === true;

const revisadaExigeMateria = (q: CamposVerificaveis): boolean =>
  !q.revisada || (q.materia_id !== null && q.materia_id !== undefined);

export const QuestaoSchema = questaoCampos
  .extend({
    id: uuid,
    prova_id: uuid,
    created_at: timestamp,
    updated_at: timestamp,
  })
  .refine(gabaritoExisteNasAlternativas, {
    error: 'gabarito não corresponde a nenhuma alternativa',
    path: ['gabarito'],
  })
  .refine(letrasNaoRepetem, {
    error: 'há letras de alternativa repetidas',
    path: ['alternativas'],
  })
  .refine(alternativaSemTextoExigeImagem, {
    error: 'alternativa sem texto só é aceita em questão marcada como dependente de imagem',
    path: ['alternativas'],
  })
  .refine(revisadaExigeMateria, {
    error: 'questão revisada precisa ter matéria atribuída',
    path: ['materia_id'],
  })
  .refine(revisadaExigeGabarito, {
    error: 'questão revisada precisa ter gabarito',
    path: ['gabarito'],
  });

export const QuestaoNovaSchema = questaoCampos
  .extend({ prova_id: uuid })
  .partial({
    numero: true,
    materia_id: true,
    assunto: true,
    gabarito: true,
    imagem_path: true,
    comentario: true,
  })
  .extend({
    tem_imagem: z.boolean().default(false),
    anulada: z.boolean().default(false),
    revisada: z.boolean().default(false),
    incerto: z.boolean().default(false),
    tem_texto_base: z.boolean().default(false),
    texto_base_id: uuid.nullable().default(null),
  })
  .refine(gabaritoExisteNasAlternativas, {
    error: 'gabarito não corresponde a nenhuma alternativa',
    path: ['gabarito'],
  })
  .refine(letrasNaoRepetem, {
    error: 'há letras de alternativa repetidas',
    path: ['alternativas'],
  })
  .refine(alternativaSemTextoExigeImagem, {
    error: 'alternativa sem texto só é aceita em questão marcada como dependente de imagem',
    path: ['alternativas'],
  })
  .refine(revisadaExigeMateria, {
    error: 'questão revisada precisa ter matéria atribuída',
    path: ['materia_id'],
  })
  .refine(revisadaExigeGabarito, {
    error: 'questão revisada precisa ter gabarito',
    path: ['gabarito'],
  });

export const RespostaSchema = z.object({
  id: uuid,
  questao_id: uuid,
  letra_marcada: LetraSchema,
  acertou: z.boolean(),
  respondido_em: timestamp,
  quiz_sessao_id: uuid.nullable(),
});

export const RespostaNovaSchema = RespostaSchema.omit({
  id: true,
  respondido_em: true,
}).partial({ quiz_sessao_id: true });

// Contrato do que a Edge Function devolve depois de ler a prova. Ela declara a
// mesma forma do lado dela — não dá para importar daqui, porque este arquivo é
// o único de shared/ que o Deno consegue resolver, e models.ts importa './schema'
// sem extensão. Validar na volta é o que impede as duas pontas de divergirem em
// silêncio.
export const SugestaoConcursoSchema = z.object({
  banca_id: uuid.nullable(),
  banca_nome: textoOpcional,
  orgao: textoOpcional,
});

export const TextoBaseSchema = z.object({
  id: uuid,
  prova_id: uuid,
  titulo: textoOpcional,
  conteudo: textoObrigatorio,
  fonte: textoOpcional,
  ordem: z.number().int().nullable(),
  created_at: timestamp,
});

export const TextoBaseNovoSchema = TextoBaseSchema.omit({ id: true, created_at: true }).partial({
  titulo: true,
  fonte: true,
  ordem: true,
});

export const QuestaoCompletaSchema = questaoCampos.extend({
  id: uuid,
  prova_id: uuid,
  created_at: timestamp,
  updated_at: timestamp,
  materia: textoOpcional,
  concurso_id: uuid,
  prova_nome: textoObrigatorio,
  prova_ano: z.number().int().nullable(),
  concurso_nome: textoObrigatorio,
  banca_id: uuid.nullable(),
  banca_nome: textoOpcional,
  elegivel: z.boolean(),
});

export const REGRAS_QUESTAO = {
  gabaritoExisteNasAlternativas,
  letrasNaoRepetem,
  revisadaExigeMateria,
  revisadaExigeGabarito,
} as const;
