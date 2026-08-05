import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { EdicaoQuestao } from '../../shared/edicao-questao';
import { Alternativa, Letra, TipoQuestao } from '../../shared/models';

export type EdicaoRevisao = EdicaoQuestao & { revisada?: boolean };

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

const COLUNAS =
  'id, prova_id, numero, materia_id, assunto, enunciado, alternativas, gabarito, tipo, tem_imagem, imagem_path, comentario, incerto, anulada, revisada';

const CHECK_VIOLADO = '23514';

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

  async mapearAssunto(questaoIds: string[], materiaId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('questoes')
      .update({ materia_id: materiaId })
      .in('id', questaoIds);

    if (error) throw new Error(`Não foi possível atribuir a matéria: ${error.message}`);
  }

  async editar(id: string, mudancas: EdicaoRevisao): Promise<QuestaoRevisao> {
    const { data, error } = await this.supabase.client
      .from('questoes')
      .update(mudancas)
      .eq('id', id)
      .select(COLUNAS)
      .single();

    if (error) throw new Error(traduzir(error.code, error.message));
    return data as QuestaoRevisao;
  }

  async aprovarEmLote(questaoIds: string[]): Promise<void> {
    if (questaoIds.length === 0) return;

    const { error } = await this.supabase.client
      .from('questoes')
      .update({ revisada: true })
      .in('id', questaoIds);

    if (error) throw new Error(traduzir(error.code, error.message));
  }

  async anexarImagem(questao: QuestaoRevisao, imagem: Blob): Promise<QuestaoRevisao> {
    const caminho = `${questao.prova_id}/${questao.id}`;
    const { error: erroUpload } = await this.supabase.questaoImagens.upload(caminho, imagem, {
      upsert: true,
    });
    if (erroUpload) throw new Error(`Falha ao enviar a imagem: ${erroUpload.message}`);

    return this.editar(questao.id, { imagem_path: caminho, tem_imagem: true });
  }

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
