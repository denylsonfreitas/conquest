import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { EdicaoQuestao } from '../../shared/edicao-questao';
import { Alternativa, Letra, TipoQuestao } from '../../shared/models';

export type EdicaoRevisao = EdicaoQuestao & {
  revisada?: boolean;
  alternativas?: Alternativa[];
};

function comImagem(
  alternativas: readonly Alternativa[],
  letra: string,
  caminho: string | null,
): Alternativa[] {
  return alternativas.map((a) => (a.letra === letra ? { ...a, imagem_path: caminho ?? null } : a));
}

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
  tem_texto_base: boolean;
  texto_base_id: string | null;
}

const COLUNAS =
  'id, prova_id, numero, materia_id, assunto, enunciado, alternativas, gabarito, tipo, tem_imagem, imagem_path, comentario, incerto, anulada, revisada, tem_texto_base, texto_base_id';

export interface TextoBase {
  id: string;
  prova_id: string;
  titulo: string | null;
  conteudo: string;
  fonte: string | null;
  ordem: number | null;
}

export interface TextoBaseForm {
  titulo: string | null;
  conteudo: string;
  fonte: string | null;
}

const COLUNAS_TEXTO = 'id, prova_id, titulo, conteudo, fonte, ordem';

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

  // A imagem da alternativa mora no mesmo bucket, com a letra no caminho. O
  // caminho é determinístico para reenviar sobrescrever em vez de acumular
  // lixo — a URL assinada é invalidada por quem exibe.
  async anexarImagemAlternativa(
    questao: QuestaoRevisao,
    letra: string,
    imagem: Blob,
  ): Promise<QuestaoRevisao> {
    const caminho = `${questao.prova_id}/${questao.id}-${letra}`;
    const { error } = await this.supabase.questaoImagens.upload(caminho, imagem, { upsert: true });
    if (error) throw new Error(`Falha ao enviar a imagem da alternativa: ${error.message}`);

    return this.editar(questao.id, {
      alternativas: comImagem(questao.alternativas, letra, caminho),
    });
  }

  async removerImagemAlternativa(questao: QuestaoRevisao, letra: string): Promise<QuestaoRevisao> {
    const anterior = questao.alternativas.find((a) => a.letra === letra)?.imagem_path;
    const atualizada = await this.editar(questao.id, {
      alternativas: comImagem(questao.alternativas, letra, null),
    });
    if (anterior) await this.supabase.questaoImagens.remove([anterior]);
    return atualizada;
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

  async listarTextos(provaId: string): Promise<TextoBase[]> {
    const { data, error } = await this.supabase.client
      .from('textos_base')
      .select(COLUNAS_TEXTO)
      .eq('prova_id', provaId)
      .order('ordem', { nullsFirst: false });

    if (error) throw new Error(`Não foi possível carregar os textos: ${error.message}`);
    return (data ?? []) as TextoBase[];
  }

  async criarTexto(provaId: string, texto: TextoBaseForm): Promise<TextoBase> {
    const { data, error } = await this.supabase.client
      .from('textos_base')
      .insert({
        prova_id: provaId,
        titulo: texto.titulo?.trim() || null,
        conteudo: texto.conteudo.trim(),
        fonte: texto.fonte?.trim() || null,
      })
      .select(COLUNAS_TEXTO)
      .single();

    if (error) throw new Error(`Não foi possível criar o texto: ${error.message}`);
    return data as TextoBase;
  }

  async editarTexto(id: string, texto: TextoBaseForm): Promise<TextoBase> {
    const { data, error } = await this.supabase.client
      .from('textos_base')
      .update({
        titulo: texto.titulo?.trim() || null,
        conteudo: texto.conteudo.trim(),
        fonte: texto.fonte?.trim() || null,
      })
      .eq('id', id)
      .select(COLUNAS_TEXTO)
      .single();

    if (error) throw new Error(`Não foi possível salvar o texto: ${error.message}`);
    return data as TextoBase;
  }
}

function traduzir(codigo: string | undefined, mensagem: string): string {
  if (codigo === CHECK_VIOLADO) {
    if (mensagem.includes('materia')) return 'Não dá para aprovar sem matéria atribuída.';
    if (mensagem.includes('gabarito')) return 'Não dá para aprovar sem gabarito.';
  }
  return `Não foi possível salvar: ${mensagem}`;
}
