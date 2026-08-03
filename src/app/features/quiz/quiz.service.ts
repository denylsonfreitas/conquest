import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { QuestaoEditavel } from '../../shared/edicao-questao';
import { RespostaNova, TipoQuestao } from '../../shared/models';
import { ItemComNomes } from '../../shared/filtros-acervo';
import { RespostaHistorico } from './regras-quiz';

/**
 * Questão como o quiz precisa dela, direto da view do read-side.
 *
 * Estende `QuestaoEditavel` para poder ser editada a partir do resultado sem
 * conversão: é a mesma questão, vista por duas telas.
 */
export interface QuestaoQuiz extends QuestaoEditavel {
  tipo: TipoQuestao;
  materia: string | null;
  prova_nome: string;
  prova_ano: number | null;
  concurso_nome: string;
  banca_nome: string | null;
}

const COLUNAS_QUESTAO =
  'id, numero, enunciado, alternativas, gabarito, tipo, materia_id, materia, tem_imagem, imagem_path, comentario, anulada, incerto, prova_nome, prova_ano, concurso_nome, banca_nome';

/**
 * Data access do quiz — o lado de LEITURA do sistema (docs/00).
 *
 * Lê `questoes_completas` e escreve `respostas`. Não toca em nenhuma tabela do
 * write-side: a fronteira entre processar e consumir é exatamente esta.
 *
 * A view já traz a coluna `elegivel` calculada, então o filtro de elegibilidade
 * é uma coluna só em vez da expressão repetida em cada query. Quem garante que
 * isso basta é o CHECK de `revisada` — uma questão aprovada tem, por
 * construção, matéria e gabarito.
 */
@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Todo o acervo elegível, só com o que o filtro e o sorteio precisam.
   *
   * Traz ids e nomes (não os enunciados): é o que permite o contador viver a
   * cada clique de filtro sem pesar. As questões completas só são buscadas
   * depois do sorteio, e só as sorteadas.
   */
  async acervoElegivel(): Promise<ItemComNomes[]> {
    const { data, error } = await this.supabase.client
      .from('questoes_completas')
      .select('id, materia_id, materia, banca_id, banca_nome, concurso_id, concurso_nome')
      .eq('elegivel', true);

    if (error) throw new Error(`Não foi possível carregar o acervo: ${error.message}`);
    return (data ?? []) as ItemComNomes[];
  }

  /**
   * O histórico inteiro de respostas.
   *
   * Trazer tudo para o cliente é deliberado: é o que deixa os três modos serem
   * funções puras testáveis sem banco (`regras-quiz.ts`). Empurrar o filtro
   * para uma RPC esconderia a regra dos testes. São três colunas de um usuário
   * só — o custo é desprezível e o ganho é a regra ficar onde se testa.
   */
  async historico(): Promise<RespostaHistorico[]> {
    const { data, error } = await this.supabase.client
      .from('respostas')
      .select('questao_id, acertou, respondido_em');

    if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`);
    return (data ?? []) as RespostaHistorico[];
  }

  /** As questões sorteadas, completas, NA ORDEM do sorteio. */
  async questoes(ids: readonly string[]): Promise<QuestaoQuiz[]> {
    if (ids.length === 0) return [];

    const { data, error } = await this.supabase.client
      .from('questoes_completas')
      .select(COLUNAS_QUESTAO)
      .in('id', ids);

    if (error) throw new Error(`Não foi possível carregar as questões: ${error.message}`);

    // O `in` devolve na ordem do banco, não na do sorteio. Reordenar aqui é o
    // que impede o embaralhamento de ser desfeito silenciosamente pelo SELECT.
    const porId = new Map((data ?? []).map((q) => [q.id, q as QuestaoQuiz]));
    return ids.map((id) => porId.get(id)).filter((q): q is QuestaoQuiz => q !== undefined);
  }

  /** Grava a resposta na hora — é o que faz interromper o quiz não perder nada. */
  async registrar(resposta: RespostaNova): Promise<void> {
    const { error } = await this.supabase.client.from('respostas').insert(resposta);
    if (error) throw new Error(`Não foi possível registrar a resposta: ${error.message}`);
  }

  async urlImagem(caminho: string, segundos = 900): Promise<string> {
    const { data, error } = await this.supabase.questaoImagens.createSignedUrl(caminho, segundos);
    if (error || !data) throw new Error(`Não foi possível abrir a imagem: ${error?.message}`);
    return data.signedUrl;
  }
}
