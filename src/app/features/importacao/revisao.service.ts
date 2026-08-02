import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { Alternativa, Letra, TipoQuestao } from '../../shared/models';

/** Questão como a tela de revisão precisa dela. */
export interface QuestaoRevisao {
  id: string;
  prova_id: string;
  numero: number | null;
  materia_id: string | null;
  assunto: string | null;
  enunciado: string;
  alternativas: Alternativa[];
  gabarito: Letra | null;
  tipo: TipoQuestao;
  tem_imagem: boolean;
  imagem_path: string | null;
  comentario: string | null;
  incerto: boolean;
  anulada: boolean;
  revisada: boolean;
}

/** Campos que a revisão pode alterar numa questão. */
export type EdicaoQuestao = Partial<
  Pick<
    QuestaoRevisao,
    | 'materia_id'
    | 'gabarito'
    | 'enunciado'
    | 'comentario'
    | 'tem_imagem'
    | 'imagem_path'
    | 'anulada'
    | 'revisada'
    | 'incerto'
  >
>;

const COLUNAS =
  'id, prova_id, numero, materia_id, assunto, enunciado, alternativas, gabarito, tipo, tem_imagem, imagem_path, comentario, incerto, anulada, revisada';

/** Postgres: CHECK violado — aprovar sem matéria ou sem gabarito. */
const CHECK_VIOLADO = '23514';

/**
 * Data access da revisão.
 *
 * Note o que NÃO existe aqui: nenhum método mexe em `provas.status`. A
 * transição entre aguardando_revisao e pronta é derivada por trigger no banco,
 * justamente para nenhum caminho da UI poder esquecer de recalculá-la.
 */
@Injectable({ providedIn: 'root' })
export class RevisaoService {
  private readonly supabase = inject(SupabaseService);

  async listar(provaId: string): Promise<QuestaoRevisao[]> {
    const { data, error } = await this.supabase.client
      .from('questoes')
      .select(COLUNAS)
      .eq('prova_id', provaId)
      .order('numero', { nullsFirst: false });

    if (error) throw new Error(`Não foi possível carregar as questões: ${error.message}`);
    return (data ?? []) as QuestaoRevisao[];
  }

  /**
   * Atribui uma matéria a todas as questões de um mesmo `assunto`.
   *
   * É o que transforma 41 atribuições idênticas em 3 decisões — a diferença
   * entre uma revisão que se faz e uma que se adia.
   */
  async mapearAssunto(questaoIds: string[], materiaId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('questoes')
      .update({ materia_id: materiaId })
      .in('id', questaoIds);

    if (error) throw new Error(`Não foi possível atribuir a matéria: ${error.message}`);
  }

  async editar(id: string, mudancas: EdicaoQuestao): Promise<QuestaoRevisao> {
    const { data, error } = await this.supabase.client
      .from('questoes')
      .update(mudancas)
      .eq('id', id)
      .select(COLUNAS)
      .single();

    if (error) throw new Error(traduzir(error.code, error.message));
    return data as QuestaoRevisao;
  }

  /**
   * Aprova várias de uma vez.
   *
   * Os CHECKs do banco são a rede: `revisada = true` exige matéria e gabarito,
   * então o lote falha em voz alta se alguma questão não estiver pronta — em
   * vez de gravar torto. Nada é aprovado parcialmente: o UPDATE é atômico.
   */
  async aprovarEmLote(questaoIds: string[]): Promise<void> {
    if (questaoIds.length === 0) return;

    const { error } = await this.supabase.client
      .from('questoes')
      .update({ revisada: true })
      .in('id', questaoIds);

    if (error) throw new Error(traduzir(error.code, error.message));
  }

  /** Anexa a figura de uma questão que depende de imagem. */
  async anexarImagem(questao: QuestaoRevisao, imagem: Blob): Promise<QuestaoRevisao> {
    // Determinístico, como os PDFs: retentar sobrescreve em vez de acumular.
    const caminho = `${questao.prova_id}/${questao.id}`;
    const { error: erroUpload } = await this.supabase.questaoImagens.upload(caminho, imagem, {
      upsert: true,
    });
    if (erroUpload) throw new Error(`Falha ao enviar a imagem: ${erroUpload.message}`);

    return this.editar(questao.id, { imagem_path: caminho, tem_imagem: true });
  }

  /**
   * Desfaz o anexo.
   *
   * O ponteiro cai PRIMEIRO: é ele que a revisão enxerga, e um ponteiro para
   * um objeto que não existe mais seria pior que um objeto órfão. Se a remoção
   * no bucket falhar depois disso, o caminho é determinístico e o próximo
   * upload sobrescreve — o estranho seria abortar uma remoção já concluída aos
   * olhos de quem pediu.
   */
  async removerImagem(questao: QuestaoRevisao): Promise<QuestaoRevisao> {
    const atualizada = await this.editar(questao.id, { imagem_path: null });
    if (questao.imagem_path) await this.supabase.questaoImagens.remove([questao.imagem_path]);
    return atualizada;
  }

  async urlImagem(caminho: string, segundos = 300): Promise<string> {
    const { data, error } = await this.supabase.questaoImagens.createSignedUrl(caminho, segundos);
    if (error || !data) throw new Error(`Não foi possível abrir a imagem: ${error?.message}`);
    return data.signedUrl;
  }
}

function traduzir(codigo: string | undefined, mensagem: string): string {
  if (codigo === CHECK_VIOLADO) {
    if (mensagem.includes('materia')) return 'Não dá para aprovar sem matéria atribuída.';
    if (mensagem.includes('gabarito')) return 'Não dá para aprovar sem gabarito.';
  }
  return `Não foi possível salvar: ${mensagem}`;
}
