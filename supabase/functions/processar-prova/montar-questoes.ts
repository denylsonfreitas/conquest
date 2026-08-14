import { QuestaoNovaSchema } from '../../../src/app/shared/schema.ts';
import { normalizar } from './identificar-prova.ts';
import { QuestaoBruta, TextoBaseBruto } from './questao-bruta.ts';

export interface Descarte {
  numero: number;
  motivo: string;
}

export interface Montagem {
  validas: unknown[];
  descartadas: Descarte[];
}

export interface TextoParaGravar {
  prova_id: string;
  titulo: string | null;
  conteudo: string;
  fonte: string | null;
  ordem: number;
}

export function montarTextos(
  brutos: readonly TextoBaseBruto[],
  provaId: string,
): TextoParaGravar[] {
  return brutos
    .filter((t) => (t?.conteudo ?? '').trim().length > 0)
    .map((t, i) => ({
      prova_id: provaId,
      titulo: t.titulo?.trim() || null,
      conteudo: t.conteudo.trim(),
      fonte: t.fonte?.trim() || null,
      ordem: i,
    }));
}

export function montarQuestoes(
  brutas: QuestaoBruta[],
  provaId: string,
  respostas: ReadonlyMap<number, string> | null,
  materias: Map<string, string>,
  // Id local escolhido pelo modelo ("t1") para o uuid gravado no banco. Vazio
  // quando a prova não tem texto-base.
  textosPorIdLocal: ReadonlyMap<string, string> = new Map(),
): Montagem {
  const validas: unknown[] = [];
  const descartadas: Descarte[] = [];

  for (const bruta of brutas) {
    const gabarito = respostas?.get(bruta.numero) ?? bruta.gabarito ?? null;
    const materiaId = bruta.materia ? (materias.get(normalizar(bruta.materia)) ?? null) : null;

    // Apontar para um id local que não existe é o mesmo que não apontar: a
    // questão vai para a revisão em vez de guardar um vínculo quebrado.
    const textoBaseId = bruta.texto_base ? (textosPorIdLocal.get(bruta.texto_base) ?? null) : null;

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
      // Ter o vínculo implica depender de um texto, mesmo que o modelo tenha
      // esquecido de marcar.
      tem_texto_base: bruta.tem_texto_base === true || textoBaseId !== null,
      texto_base_id: textoBaseId,
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
