import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { EdicaoQuestao, QuestaoEditavel, respostasQueMudam } from '../../shared/edicao-questao';
import { FiltrosAcervo, ItemComNomes } from '../../shared/filtros-acervo';
import { Letra } from '../../shared/models';

export type Situacao =
  'todas' | 'elegivel' | 'falta_imagem' | 'falta_texto' | 'anulada' | 'nao_revisada';

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  todas: 'Todas',
  elegivel: 'Elegíveis',
  falta_imagem: 'Falta imagem',
  falta_texto: 'Falta texto',
  anulada: 'Anuladas',
  nao_revisada: 'Não revisadas',
};

export interface QuestaoAcervo extends QuestaoEditavel {
  readonly prova_id: string;
  readonly revisada: boolean;
  readonly elegivel: boolean;
  readonly assunto: string | null;
  readonly materia: string | null;
  readonly prova_nome: string;
  readonly concurso_nome: string;
  readonly banca_nome: string | null;
}

export interface PaginaAcervo {
  readonly questoes: QuestaoAcervo[];
  readonly total: number;
}

const COLUNAS =
  'id, prova_id, numero, enunciado, alternativas, materia_id, materia, assunto, gabarito, comentario, tem_imagem, imagem_path, tem_texto_base, texto_base_id, anulada, incerto, revisada, elegivel, prova_nome, concurso_nome, banca_nome';

export const POR_PAGINA = 20;

@Injectable({ providedIn: 'root' })
export class AcervoService {
  private readonly supabase = inject(SupabaseService);

  async universo(): Promise<ItemComNomes[]> {
    const { data, error } = await this.supabase.client
      .from('questoes_completas')
      .select('id, materia_id, materia, banca_id, banca_nome, concurso_id, concurso_nome');

    if (error) throw new Error(`Não foi possível carregar o acervo: ${error.message}`);
    return (data ?? []) as ItemComNomes[];
  }

  async listar(
    filtros: FiltrosAcervo,
    situacao: Situacao,
    busca: string,
    pagina: number,
  ): Promise<PaginaAcervo> {
    let consulta = this.supabase.client
      .from('questoes_completas')
      .select(COLUNAS, { count: 'exact' });

    if (filtros.bancaId) consulta = consulta.eq('banca_id', filtros.bancaId);
    if (filtros.concursoId) consulta = consulta.eq('concurso_id', filtros.concursoId);
    if (filtros.materiaIds.length > 0) consulta = consulta.in('materia_id', filtros.materiaIds);

    if (situacao === 'elegivel') consulta = consulta.eq('elegivel', true);
    if (situacao === 'anulada') consulta = consulta.eq('anulada', true);
    if (situacao === 'nao_revisada') consulta = consulta.eq('revisada', false);
    if (situacao === 'falta_imagem') {
      consulta = consulta.eq('tem_imagem', true).is('imagem_path', null);
    }
    if (situacao === 'falta_texto') {
      consulta = consulta.eq('tem_texto_base', true).is('texto_base_id', null);
    }

    const termo = busca.trim();
    if (termo) {
      consulta = consulta.or(`enunciado.ilike.%${termo}%,comentario.ilike.%${termo}%`);
    }

    const de = pagina * POR_PAGINA;
    const { data, error, count } = await consulta
      .order('numero', { nullsFirst: false })
      .range(de, de + POR_PAGINA - 1);

    if (error) throw new Error(`Não foi possível buscar: ${error.message}`);
    return { questoes: (data ?? []) as QuestaoAcervo[], total: count ?? 0 };
  }

  async respostasAfetadas(questaoId: string, novoGabarito: Letra | null): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('respostas')
      .select('letra_marcada, acertou')
      .eq('questao_id', questaoId);

    if (error) return 0; // aviso é cortesia; falhar aqui não pode travar a edição
    return respostasQueMudam(data ?? [], novoGabarito);
  }

  async editar(id: string, mudancas: EdicaoQuestao): Promise<QuestaoAcervo> {
    const { data, error } = await this.supabase.client
      .from('questoes')
      .update(mudancas)
      .eq('id', id)
      .select('id')
      .single();

    if (error) throw new Error(traduzir(error.code, error.message));

    const { data: completa, error: erroLeitura } = await this.supabase.client
      .from('questoes_completas')
      .select(COLUNAS)
      .eq('id', data.id)
      .single();

    if (erroLeitura) throw new Error(`Salvou, mas não deu para reler: ${erroLeitura.message}`);
    return completa as QuestaoAcervo;
  }

  async anexarImagem(questao: QuestaoAcervo, imagem: Blob, provaId?: string): Promise<string> {
    const caminho = `${provaId ?? 'acervo'}/${questao.id}`;
    const { error } = await this.supabase.questaoImagens.upload(caminho, imagem, { upsert: true });
    if (error) throw new Error(`Falha ao enviar a imagem: ${error.message}`);
    return caminho;
  }

  async urlImagem(caminho: string, segundos = 900): Promise<string> {
    const { data, error } = await this.supabase.questaoImagens.createSignedUrl(caminho, segundos);
    if (error || !data) throw new Error(`Não foi possível abrir a imagem: ${error?.message}`);
    return data.signedUrl;
  }

  // O acervo atravessa provas, então os textos oferecidos são os da prova
  // daquela questão — associar a um texto de outra prova não faria sentido.
  async textosDaProva(provaId: string): Promise<TextoDaProva[]> {
    const { data, error } = await this.supabase.client
      .from('textos_base')
      .select('id, titulo, conteudo')
      .eq('prova_id', provaId)
      .order('ordem', { nullsFirst: false });

    if (error) throw new Error(`Não foi possível carregar os textos: ${error.message}`);
    return (data ?? []) as TextoDaProva[];
  }
}

export interface TextoDaProva {
  readonly id: string;
  readonly titulo: string | null;
  readonly conteudo: string;
}

const CHECK_VIOLADO = '23514';

function traduzir(codigo: string | undefined, mensagem: string): string {
  if (codigo === CHECK_VIOLADO) {
    if (mensagem.includes('materia')) return 'Questão aprovada não pode ficar sem matéria.';
    if (mensagem.includes('gabarito')) return 'Questão aprovada não pode ficar sem gabarito.';
  }
  return `Não foi possível salvar: ${mensagem}`;
}
