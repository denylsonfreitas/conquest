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
  readonly tem_texto_base: boolean;
  readonly texto_base_id: string | null;
  readonly alternativas: readonly AlternativaParaRevisao[];
}

export interface AlternativaParaRevisao {
  readonly letra: string;
  readonly texto: string;
  readonly imagem_path?: string | null;
}

// Alternativa em figura chega sem texto. Enquanto não tiver imagem, o botão do
// quiz seria só a letra — clicável e ilegível.
export function alternativasSemImagem(q: QuestaoParaRevisao): string[] {
  return q.alternativas.filter((a) => a.texto.trim() === '' && !a.imagem_path).map((a) => a.letra);
}

export function motivosAtencao(q: QuestaoParaRevisao): string[] {
  if (q.anulada) return []; // anulada é decisão tomada, não pendência

  const motivos: string[] = [];
  if (q.materia_id === null) motivos.push('sem matéria');
  if (q.gabarito === null) motivos.push('sem gabarito');
  if (q.tem_imagem && q.imagem_path === null) motivos.push('precisa de imagem');
  // A extração marca quando a questão depende de um texto mas não soube dizer
  // qual. Sem o vínculo ela é insolúvel, então não pode ser aprovada.
  if (q.tem_texto_base && q.texto_base_id === null) motivos.push('precisa de texto');

  const semImagem = alternativasSemImagem(q);
  if (semImagem.length > 0) motivos.push(`alternativas sem imagem: ${semImagem.join(', ')}`);

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
