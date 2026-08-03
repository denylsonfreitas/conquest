/**
 * Schema canônico do sistema (fonte da verdade).
 *
 * Este arquivo é compartilhado entre o app Angular e a Edge Function de
 * importação. Uma definição, um formato, zero divergência (docs/04).
 *
 * Convenção adotada aqui:
 *   - `XSchema`     → a LINHA como o Postgres devolve (id e timestamps presentes,
 *                     colunas opcionais como `null`, nunca `undefined`).
 *   - `XNovaSchema` → o que se manda no INSERT (sem colunas geradas pelo banco;
 *                     campos opcionais podem vir ausentes).
 *
 * Regra de ouro: nada entra no banco sem passar por aqui. Lixo não cruza a
 * fronteira entre os dois subsistemas (docs/00, princípio 2).
 */
import { z } from 'zod';

// -----------------------------------------------------------------------------
// Primitivos reutilizados
// -----------------------------------------------------------------------------

/** timestamptz do Postgres chega via PostgREST como ISO 8601 com offset. */
const timestamp = z.iso.datetime({ offset: true });
const uuid = z.uuid();
/** Texto obrigatório: rejeita string vazia e só-espaços. */
const textoObrigatorio = z.string().trim().min(1);
/** Texto opcional: ausente vira `null`, nunca string vazia disfarçada. */
const textoOpcional = z.string().trim().min(1).nullable();

// -----------------------------------------------------------------------------
// Enums do domínio — espelham os CHECKs das migrations
// -----------------------------------------------------------------------------

/** Letras possíveis de alternativa. 'C'/'E' cobrem também certo/errado. */
export const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
export const LetraSchema = z.enum(LETRAS);

export const TipoQuestaoSchema = z.enum(['multipla_escolha', 'certo_errado']);

/** Estado do processamento assíncrono de uma prova (docs/00, princípio 5). */
export const StatusProvaSchema = z.enum([
  'pendente',
  'processando',
  'aguardando_revisao',
  'pronta',
  'erro',
]);

// -----------------------------------------------------------------------------
// bancas — dimensão normalizada
// -----------------------------------------------------------------------------

export const BancaSchema = z.object({
  id: uuid,
  nome: textoObrigatorio,
  created_at: timestamp,
});

export const BancaNovaSchema = BancaSchema.omit({ id: true, created_at: true });

// -----------------------------------------------------------------------------
// materias — dimensão normalizada, mesma forma de bancas
// -----------------------------------------------------------------------------

export const MateriaSchema = z.object({
  id: uuid,
  nome: textoObrigatorio,
  created_at: timestamp,
});

export const MateriaNovaSchema = MateriaSchema.omit({ id: true, created_at: true });

// -----------------------------------------------------------------------------
// concursos
// -----------------------------------------------------------------------------

export const ConcursoSchema = z.object({
  id: uuid,
  nome: textoObrigatorio,
  // nullable: dá pra registrar um concurso sem banca conhecida (docs/01).
  banca_id: uuid.nullable(),
  orgao: textoOpcional,
  created_at: timestamp,
});

export const ConcursoNovoSchema = ConcursoSchema.omit({
  id: true,
  created_at: true,
}).partial({ banca_id: true, orgao: true });

// -----------------------------------------------------------------------------
// provas
// -----------------------------------------------------------------------------

export const ProvaSchema = z.object({
  id: uuid,
  concurso_id: uuid,
  nome: textoObrigatorio,
  ano: z.number().int().min(1900).max(2200).nullable(),
  cargo: textoOpcional,
  arquivo_path: textoOpcional,
  /**
   * SHA-256 do PDF em hex minúsculo — é a chave da idempotência (docs/00).
   * Nulo enquanto a prova é só um registro de metadados, antes do upload.
   */
  arquivo_hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, { error: 'arquivo_hash deve ser um SHA-256 em hex minúsculo' })
    .nullable(),
  gabarito_path: textoOpcional,
  status: StatusProvaSchema,
  erro_msg: textoOpcional,
  total_questoes: z.number().int().nonnegative().nullable(),
  /** Carimbo de início do processamento; detecta prova travada. */
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
  // Espelha a CHECK `provas_arquivo_exige_hash`: prova com PDF anexado precisa
  // do hash, senão vira um registro impossível de deduplicar.
  .refine((p) => !p.arquivo_path || !!p.arquivo_hash, {
    error: 'prova com arquivo precisa do hash',
    path: ['arquivo_hash'],
  });

// -----------------------------------------------------------------------------
// alternativas + questões
// -----------------------------------------------------------------------------

export const AlternativaSchema = z.object({
  letra: LetraSchema,
  texto: textoObrigatorio,
});

/**
 * Campos de conteúdo da questão, sem as colunas de identidade/carimbo.
 * Extraído à parte para que a linha do banco e o payload de inserção
 * compartilhem exatamente a mesma definição.
 */
const questaoCampos = z.object({
  numero: z.number().int().positive().nullable(),
  // nullable: a extração cria em rascunho; a matéria canônica é atribuída na
  // revisão (docs/03). A regra "revisada exige matéria" está nos refinements.
  materia_id: uuid.nullable(),
  assunto: textoOpcional,
  enunciado: textoObrigatorio,
  alternativas: z
    .array(AlternativaSchema)
    .min(2, { error: 'questão precisa de ao menos 2 alternativas' }),
  // nullable: a extração pode não casar o gabarito (PDF separado ilegível,
  // bloco de respostas ambíguo). A questão entra em rascunho sinalizada em vez
  // de barrar a prova inteira — ver `revisadaExigeGabarito` abaixo.
  gabarito: LetraSchema.nullable(),
  tipo: TipoQuestaoSchema,
  tem_imagem: z.boolean(),
  imagem_path: textoOpcional,
  comentario: textoOpcional,
  anulada: z.boolean(),
  revisada: z.boolean(),
  /** Extração marcou como duvidosa; aparece destacada na revisão (docs/02). */
  incerto: z.boolean(),
});

// --- Regras estruturais da questão --------------------------------------------
// Predicados isolados: são as invariantes que nenhum INSERT pode violar. Ficam
// fora dos schemas para poderem ser aplicadas igualmente à linha e ao payload.

type CamposVerificaveis = {
  readonly gabarito?: string | null;
  readonly alternativas: readonly { readonly letra: string }[];
  // opcional (`?`) porque no payload de inserção a chave pode nem existir.
  readonly materia_id?: string | null;
  readonly revisada: boolean;
};

/**
 * O gabarito precisa apontar para uma alternativa que existe.
 * Ausente é caso válido (não casado ainda) — quem exige presença é
 * `revisadaExigeGabarito`.
 */
const gabaritoExisteNasAlternativas = (q: CamposVerificaveis): boolean =>
  q.gabarito == null || q.alternativas.some((a) => a.letra === q.gabarito);

/** Espelha a CHECK `questoes_revisada_exige_gabarito` do banco. */
const revisadaExigeGabarito = (q: CamposVerificaveis): boolean => !q.revisada || q.gabarito != null;

/** Duas alternativas 'B' quebrariam o quiz silenciosamente. */
const letrasNaoRepetem = (q: CamposVerificaveis): boolean =>
  new Set(q.alternativas.map((a) => a.letra)).size === q.alternativas.length;

/** Espelha a CHECK `questoes_revisada_exige_materia` do banco. */
const revisadaExigeMateria = (q: CamposVerificaveis): boolean =>
  !q.revisada || (q.materia_id !== null && q.materia_id !== undefined);

/**
 * Linha de `questoes` como vem do banco.
 * Os três refinements repetem-se no schema de inserção logo abaixo — de
 * propósito: `.refine()` valida o objeto inteiro, então precisa ser aplicado a
 * cada schema final, não ao fragmento compartilhado.
 */
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
  .refine(revisadaExigeMateria, {
    error: 'questão revisada precisa ter matéria atribuída',
    path: ['materia_id'],
  })
  .refine(revisadaExigeGabarito, {
    error: 'questão revisada precisa ter gabarito',
    path: ['gabarito'],
  });

/** Payload de inserção — é o que a Edge Function valida antes de gravar. */
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
    // O banco tem default para os quatro; aqui o default explícito deixa o
    // payload da Edge Function mais enxuto e o tipo continua não-opcional.
    tem_imagem: z.boolean().default(false),
    anulada: z.boolean().default(false),
    revisada: z.boolean().default(false),
    incerto: z.boolean().default(false),
  })
  .refine(gabaritoExisteNasAlternativas, {
    error: 'gabarito não corresponde a nenhuma alternativa',
    path: ['gabarito'],
  })
  .refine(letrasNaoRepetem, {
    error: 'há letras de alternativa repetidas',
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

// -----------------------------------------------------------------------------
// respostas
// -----------------------------------------------------------------------------

export const RespostaSchema = z.object({
  id: uuid,
  questao_id: uuid,
  letra_marcada: LetraSchema,
  acertou: z.boolean(),
  respondido_em: timestamp,
  /** Agrupa as respostas de um mesmo quiz; não existe tabela `quizzes` no MVP. */
  quiz_sessao_id: uuid.nullable(),
});

export const RespostaNovaSchema = RespostaSchema.omit({
  id: true,
  respondido_em: true,
}).partial({ quiz_sessao_id: true });

// -----------------------------------------------------------------------------
// questoes_completas — a view do read-side (docs/01)
// -----------------------------------------------------------------------------

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
  /** Calculado pela view: revisada && !anulada && (!tem_imagem || tem arquivo). */
  elegivel: z.boolean(),
});

// -----------------------------------------------------------------------------
// Predicados exportados para reuso (a Edge Function valida antes de gravar)
// -----------------------------------------------------------------------------

export const REGRAS_QUESTAO = {
  gabaritoExisteNasAlternativas,
  letrasNaoRepetem,
  revisadaExigeMateria,
  revisadaExigeGabarito,
} as const;
