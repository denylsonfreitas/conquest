import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { QuestaoEditavel } from '../../shared/edicao-questao';
import { RespostaNova, TipoQuestao } from '../../shared/models';
import { ItemComNomes } from '../../shared/filtros-acervo';
import { RespostaHistorico } from './regras-quiz';

export interface QuestaoQuiz extends QuestaoEditavel {
  tipo: TipoQuestao;
  materia: string | null;
  prova_nome: string;
  prova_ano: number | null;
  concurso_nome: string;
  banca_nome: string | null;
}

export interface TextoDoQuiz {
  id: string;
  titulo: string | null;
  conteudo: string;
  fonte: string | null;
}

const COLUNAS_QUESTAO =
  'id, numero, enunciado, alternativas, gabarito, tipo, materia_id, materia, tem_imagem, imagem_path, comentario, anulada, incerto, tem_texto_base, texto_base_id, prova_nome, prova_ano, concurso_nome, banca_nome';

@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly supabase = inject(SupabaseService);

  async acervoElegivel(): Promise<ItemComNomes[]> {
    const { data, error } = await this.supabase.client
      .from('questoes_completas')
      .select('id, materia_id, materia, banca_id, banca_nome, concurso_id, concurso_nome')
      .eq('elegivel', true);

    if (error) throw new Error(`Não foi possível carregar o acervo: ${error.message}`);
    return (data ?? []) as ItemComNomes[];
  }

  async historico(): Promise<RespostaHistorico[]> {
    const { data, error } = await this.supabase.client
      .from('respostas')
      .select('questao_id, acertou, respondido_em');

    if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`);
    return (data ?? []) as RespostaHistorico[];
  }

  async questoes(ids: readonly string[]): Promise<QuestaoQuiz[]> {
    if (ids.length === 0) return [];

    const { data, error } = await this.supabase.client
      .from('questoes_completas')
      .select(COLUNAS_QUESTAO)
      .in('id', ids);

    if (error) throw new Error(`Não foi possível carregar as questões: ${error.message}`);

    const porId = new Map((data ?? []).map((q) => [q.id, q as QuestaoQuiz]));
    return ids.map((id) => porId.get(id)).filter((q): q is QuestaoQuiz => q !== undefined);
  }

  // Os textos vêm à parte, e só os distintos: dez questões do mesmo texto
  // trariam o mesmo conteúdo dez vezes se ele viesse pela view.
  async textosDe(questoes: readonly QuestaoQuiz[]): Promise<Map<string, TextoDoQuiz>> {
    const ids = [...new Set(questoes.map((q) => q.texto_base_id).filter((id) => id !== null))];
    if (ids.length === 0) return new Map();

    const { data, error } = await this.supabase.client
      .from('textos_base')
      .select('id, titulo, conteudo, fonte')
      .in('id', ids);

    if (error) throw new Error(`Não foi possível carregar os textos: ${error.message}`);
    return new Map((data ?? []).map((t) => [t.id, t as TextoDoQuiz]));
  }

  async registrar(respostas: readonly RespostaNova[]): Promise<void> {
    if (respostas.length === 0) return;

    const { error } = await this.supabase.client.from('respostas').insert([...respostas]);
    if (error) {
      const quantas = respostas.length === 1 ? 'a resposta' : `as ${respostas.length} respostas`;
      throw new Error(`Não foi possível registrar ${quantas}: ${error.message}`);
    }
  }

  async urlImagem(caminho: string, segundos = 900): Promise<string> {
    const { data, error } = await this.supabase.questaoImagens.createSignedUrl(caminho, segundos);
    if (error || !data) throw new Error(`Não foi possível abrir a imagem: ${error?.message}`);
    return data.signedUrl;
  }
}
