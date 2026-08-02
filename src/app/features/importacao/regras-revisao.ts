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
 * Uma questão exige atenção quando algo impede aprová-la ou quando a extração
 * declarou dúvida.
 *
 * É a regra de elegibilidade do docs/03 lida ao contrário — o que impediria a
 * questão de entrar num quiz é exatamente o que a revisão precisa resolver.
 * Deriva da mesma expressão em vez de duplicá-la com outras palavras.
 */
export function precisaAtencao(q: QuestaoParaRevisao): boolean {
  if (q.anulada) return false; // anulada é decisão tomada, não pendência
  return (
    q.incerto ||
    q.materia_id === null ||
    q.gabarito === null ||
    (q.tem_imagem && q.imagem_path === null)
  );
}

/** Motivos legíveis, para a tela dizer o que falta em vez de só destacar. */
export function motivosAtencao(q: QuestaoParaRevisao): string[] {
  const motivos: string[] = [];
  if (q.materia_id === null) motivos.push('sem matéria');
  if (q.gabarito === null) motivos.push('sem gabarito');
  if (q.tem_imagem && q.imagem_path === null) motivos.push('depende de imagem não anexada');
  if (q.incerto && motivos.length === 0) motivos.push('extração marcou como duvidosa');
  return motivos;
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
