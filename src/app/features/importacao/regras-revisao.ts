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

export function motivosAtencao(q: QuestaoParaRevisao): string[] {
  if (q.anulada) return []; // anulada é decisão tomada, não pendência

  const motivos: string[] = [];
  if (q.materia_id === null) motivos.push('sem matéria');
  if (q.gabarito === null) motivos.push('sem gabarito');
  if (q.tem_imagem && q.imagem_path === null) motivos.push('precisa de imagem');
  if (q.incerto) motivos.push('extração duvidou');
  return motivos;
}

export function precisaAtencao(q: QuestaoParaRevisao): boolean {
  return motivosAtencao(q).length > 0;
}

export function podeAprovar(q: QuestaoParaRevisao): boolean {
  return !q.revisada && !precisaAtencao(q);
}

export interface GruposRevisao<T> {
  readonly atencao: T[];
  readonly semPendencia: T[];
  readonly aprovadas: T[];
}

export function agruparParaRevisao<T extends QuestaoParaRevisao>(questoes: T[]): GruposRevisao<T> {
  const porNumero = [...questoes].sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
  return {
    atencao: porNumero.filter((q) => !q.revisada && precisaAtencao(q)),
    semPendencia: porNumero.filter((q) => podeAprovar(q)),
    aprovadas: porNumero.filter((q) => q.revisada),
  };
}

export interface GrupoAssunto {
  readonly assunto: string;
  readonly quantidade: number;
  readonly questaoIds: string[];
}

export function assuntosParaMapear(questoes: QuestaoParaRevisao[]): GrupoAssunto[] {
  const grupos = new Map<string, string[]>();

  for (const q of questoes) {
    if (q.materia_id !== null) continue;
    const chave = q.assunto?.trim();
    if (!chave) continue;
    grupos.set(chave, [...(grupos.get(chave) ?? []), q.id]);
  }

  return [...grupos.entries()]
    .map(([assunto, questaoIds]) => ({ assunto, quantidade: questaoIds.length, questaoIds }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

export function revisaoConcluida(questoes: QuestaoParaRevisao[]): boolean {
  return questoes.length > 0 && questoes.every((q) => q.revisada);
}
