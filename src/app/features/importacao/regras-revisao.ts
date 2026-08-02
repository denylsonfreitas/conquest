/**
 * Regras da revisão como funções PURAS (docs/04). Decidem o que exige atenção,
 * como agrupar e o que pode ser aprovado em lote — sem Angular e sem banco.
 */

/** O que a revisão precisa saber de uma questão. */
export interface QuestaoParaRevisao {
  readonly id: string;
  readonly numero: number | null;
  readonly materia_id: string | null;
  readonly assunto: string | null;
  readonly gabarito: string | null;
  readonly tem_imagem: boolean;
  readonly imagem_path: string | null;
  readonly incerto: boolean;
  readonly anulada: boolean;
  readonly revisada: boolean;
}

/**
 * Motivos legíveis pelos quais uma questão exige atenção — a lista COMPLETA,
 * não o primeiro que aparecer.
 *
 * É a regra de elegibilidade do docs/03 lida ao contrário: o que impediria a
 * questão de entrar num quiz é exatamente o que a revisão precisa resolver.
 *
 * Cada motivo vira um selo na lista fechada. Por isso todos precisam sair
 * juntos: o agrupamento diz que HÁ pendência, o selo diz QUAL — e abrir 70
 * questões para descobrir qual é derrota a revisão em lote inteira.
 */
export function motivosAtencao(q: QuestaoParaRevisao): string[] {
  if (q.anulada) return []; // anulada é decisão tomada, não pendência

  const motivos: string[] = [];
  if (q.materia_id === null) motivos.push('sem matéria');
  if (q.gabarito === null) motivos.push('sem gabarito');
  if (q.tem_imagem && q.imagem_path === null) motivos.push('precisa de imagem');
  if (q.incerto) motivos.push('extração duvidou');
  return motivos;
}

/**
 * Derivado de `motivosAtencao` de propósito: se as duas expressões existissem
 * lado a lado, um selo poderia aparecer sem que a questão caísse no grupo de
 * atenção (ou o contrário) na primeira vez que uma delas mudasse.
 */
export function precisaAtencao(q: QuestaoParaRevisao): boolean {
  return motivosAtencao(q).length > 0;
}

/** Pode ser aprovada: nada pendente e ainda não aprovada. */
export function podeAprovar(q: QuestaoParaRevisao): boolean {
  return !q.revisada && !precisaAtencao(q);
}

export interface GruposRevisao<T> {
  readonly atencao: T[];
  readonly semPendencia: T[];
  readonly aprovadas: T[];
}

/**
 * Agrupa por necessidade de ação, PRESERVANDO a numeração original dentro de
 * cada grupo.
 *
 * Um sort global por gravidade embaralharia os números e destruiria a
 * capacidade de conferir a questão contra o PDF — que é como a extração foi
 * validada. O grupo resolve a prioridade; o número, a rastreabilidade.
 */
export function agruparParaRevisao<T extends QuestaoParaRevisao>(questoes: T[]): GruposRevisao<T> {
  const porNumero = [...questoes].sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
  return {
    atencao: porNumero.filter((q) => !q.revisada && precisaAtencao(q)),
    semPendencia: porNumero.filter((q) => podeAprovar(q)),
    aprovadas: porNumero.filter((q) => q.revisada),
  };
}

export interface GrupoAssunto {
  /** O nome que a prova usava, ex.: "Conhecimentos Específicos". */
  readonly assunto: string;
  readonly quantidade: number;
  readonly questaoIds: string[];
}

/**
 * Agrupa as questões sem matéria pelo `assunto` que a extração leu.
 *
 * É o que transforma 41 atribuições idênticas em 3 decisões: a prova chama a
 * seção de "Conhecimentos Específicos" trinta vezes, e mapear esse nome uma vez
 * resolve as trinta.
 */
export function assuntosParaMapear(questoes: QuestaoParaRevisao[]): GrupoAssunto[] {
  const grupos = new Map<string, string[]>();

  for (const q of questoes) {
    if (q.materia_id !== null) continue;
    // Sem assunto lido não há o que agrupar: essas vão uma a uma.
    const chave = q.assunto?.trim();
    if (!chave) continue;
    grupos.set(chave, [...(grupos.get(chave) ?? []), q.id]);
  }

  return [...grupos.entries()]
    .map(([assunto, questaoIds]) => ({ assunto, quantidade: questaoIds.length, questaoIds }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

/** A prova está concluída quando toda questão foi revisada (espelha o trigger). */
export function revisaoConcluida(questoes: QuestaoParaRevisao[]): boolean {
  return questoes.length > 0 && questoes.every((q) => q.revisada);
}
