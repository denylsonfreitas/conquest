import { QuestaoNovaSchema } from '../../../src/app/shared/schema.ts';
import { QuestaoBruta } from './questao-bruta.ts';
import { normalizar } from './identificar-prova.ts';

export interface Descarte {
  numero: number;
  motivo: string;
}

export interface Montagem {
  validas: unknown[];
  descartadas: Descarte[];
}

export function montarQuestoes(
  brutas: QuestaoBruta[],
  provaId: string,
  respostas: ReadonlyMap<number, string> | null,
  materias: Map<string, string>,
): Montagem {
  const validas: unknown[] = [];
  const descartadas: Descarte[] = [];

  for (const bruta of brutas) {
    const gabarito = respostas?.get(bruta.numero) ?? bruta.gabarito ?? null;
    const materiaId = bruta.materia ? (materias.get(normalizar(bruta.materia)) ?? null) : null;

    const candidata = {
      prova_id: provaId,
      numero: bruta.numero,
      materia_id: materiaId,
      assunto: bruta.materia && !materiaId ? bruta.materia : null,
      enunciado: bruta.enunciado,
      alternativas: bruta.alternativas,
      gabarito,
      tipo: bruta.tipo,
      tem_imagem: bruta.tem_imagem,
      incerto: bruta.incerto,
      anulada: false,
      revisada: false,
    };

    const validacao = QuestaoNovaSchema.safeParse(candidata);
    if (validacao.success) validas.push(validacao.data);
    else descartadas.push({ numero: bruta.numero, motivo: motivoDoDescarte(validacao.error) });
  }

  return { validas, descartadas };
}

export function motivoDoDescarte(erro: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): string {
  const vistos = new Map<string, string>();

  for (const issue of erro.issues) {
    const campo = issue.path.length > 0 ? issue.path.map(String).join('.') : 'questão';
    if (!vistos.has(campo)) vistos.set(campo, issue.message);
  }

  return [...vistos.entries()].map(([campo, mensagem]) => `${campo}: ${mensagem}`).join('; ');
}
