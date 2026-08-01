import { describe, expect, it } from 'vitest';
import { QuestaoNovaSchema, QuestaoSchema, ProvaNovaSchema } from './schema';

const base = {
  prova_id: '11111111-1111-4111-8111-111111111111',
  enunciado: 'Enunciado',
  alternativas: [
    { letra: 'A', texto: 'um' },
    { letra: 'B', texto: 'dois' },
  ],
  gabarito: 'A',
  tipo: 'multipla_escolha',
};

/**
 * Trava as invariantes do schema canônico. Se alguma destas quebrar, dado
 * inválido passa a atravessar a fronteira entre os subsistemas (docs/00).
 */
describe('schema canônico', () => {
  it('aplica defaults', () => {
    const r = QuestaoNovaSchema.parse(base);
    expect(r).toMatchObject({ tem_imagem: false, anulada: false, revisada: false });
  });

  it('rejeita gabarito fora das alternativas', () => {
    expect(QuestaoNovaSchema.safeParse({ ...base, gabarito: 'D' }).success).toBe(false);
  });

  it('rejeita letras repetidas', () => {
    const alts = [
      { letra: 'A', texto: 'um' },
      { letra: 'A', texto: 'dois' },
    ];
    expect(QuestaoNovaSchema.safeParse({ ...base, alternativas: alts }).success).toBe(false);
  });

  it('rejeita revisada sem materia_id', () => {
    expect(QuestaoNovaSchema.safeParse({ ...base, revisada: true }).success).toBe(false);
    const ok = QuestaoNovaSchema.safeParse({
      ...base,
      revisada: true,
      materia_id: '22222222-2222-4222-8222-222222222222',
    });
    expect(ok.success).toBe(true);
  });

  it('aceita timestamptz do PostgREST', () => {
    const r = QuestaoSchema.safeParse({
      ...base,
      id: '33333333-3333-4333-8333-333333333333',
      numero: 1,
      materia_id: null,
      assunto: null,
      tem_imagem: false,
      imagem_path: null,
      comentario: null,
      anulada: false,
      revisada: false,
      incerto: false,
      created_at: '2026-08-01T12:00:00+00:00',
      updated_at: '2026-08-01T12:00:00.123456+00:00',
    });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('aceita questão sem gabarito casado — sinaliza, não barra', () => {
    // Caso central do passo 5: o gabarito veio em PDF separado e não casou.
    // A questão precisa entrar em rascunho, senão a prova inteira se perde.
    const r = QuestaoNovaSchema.safeParse({ ...base, gabarito: null, incerto: true });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(r.data?.incerto).toBe(true);
  });

  it('recusa aprovar questão sem gabarito', () => {
    const semGabarito = QuestaoNovaSchema.safeParse({
      ...base,
      gabarito: null,
      revisada: true,
      materia_id: '22222222-2222-4222-8222-222222222222',
    });
    expect(semGabarito.success).toBe(false);
  });

  it('mantém a checagem de gabarito válido quando ele existe', () => {
    expect(QuestaoNovaSchema.safeParse({ ...base, gabarito: 'D' }).success).toBe(false);
  });

  it('rejeita hash que não é SHA-256', () => {
    const p = { concurso_id: base.prova_id, nome: 'P', arquivo_hash: 'abc', status: 'pendente' };
    expect(ProvaNovaSchema.safeParse(p).success).toBe(false);
    expect(ProvaNovaSchema.safeParse({ ...p, arquivo_hash: 'a'.repeat(64) }).success).toBe(true);
  });
});
