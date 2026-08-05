import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { EdicaoQuestao, QuestaoEditavel, respostasQueMudam } from '../../shared/edicao-questao';
import { FiltrosAcervo, ItemComNomes } from '../../shared/filtros-acervo';
import { Letra } from '../../shared/models';

export type Situacao = 'todas' | 'elegivel' | 'falta_imagem' | 'anulada' | 'nao_revisada';

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  todas: 'Todas',
  elegivel: 'Elegíveis',
  falta_imagem: 'Falta imagem',
  anulada: 'Anuladas',
  nao_revisada: 'Não revisadas',
};

export interface QuestaoAcervo extends QuestaoEditavel {
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
  'id, numero, enunciado, alternativas, materia_id, materia, assunto, gabarito, comentario, tem_imagem, imagem_path, anulada, incerto, revisada, elegivel, prova_nome, concurso_nome, banca_nome';

export const POR_PAGINA = 20;

/**
 * Data access do acervo.
 *
 * Ao contrário do quiz, esta tela filtra em SQL: ela carrega enunciados e
 * pagina, então trazer tudo para a memória seria o desperdício que no quiz é
 * economia. Mesma pergunta, cargas diferentes — por isso `aplicarFiltros` (que
 * o quiz usa em memória) não é reaproveitado aqui.
 *
 * E ao contrário do quiz, ela mostra o acervo INTEIRO, não só o elegível: é
 * onde se caça a questão que não virou elegível. Filtrar por elegibilidade
 * esconderia o que a tela existe para achar.
 */
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

    // A situação é a leitura da elegibilidade pelos seus componentes: cada
    // opção corresponde a um motivo concreto de a questão estar ou não pronta.
    if (situacao === 'elegivel') consulta = consulta.eq('elegivel', true);
    if (situacao === 'anulada') consulta = consulta.eq('anulada', true);
    if (situacao === 'nao_revisada') consulta = consulta.eq('revisada', false);
    if (situacao === 'falta_imagem') {
      consulta = consulta.eq('tem_imagem', true).is('imagem_path', null);
    }

    const termo = busca.trim();
    if (termo) {
      // Sem índice, isto é um seq-scan. Com o acervo atual é instantâneo;
      // quando crescer, a resposta é um índice trigram — não uma gambiarra
      // no cliente.
      consulta = consulta.or(`enunciado.ilike.%${termo}%,comentario.ilike.%${termo}%`);
    }

    const de = pagina * POR_PAGINA;
    const { data, error, count } = await consulta
      .order('numero', { nullsFirst: false })
      .range(de, de + POR_PAGINA - 1);

    if (error) throw new Error(`Não foi possível buscar: ${error.message}`);
    return { questoes: (data ?? []) as QuestaoAcervo[], total: count ?? 0 };
  }

  /**
   * Quantas respostas passadas o trigger vai recontar se o gabarito mudar.
   *
   * Só uma previsão para a tela poder avisar antes: quem realmente reconta é o
   * `recalcular_acertos` no banco, que vale para qualquer caminho de edição.
   */
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

    // Relê da VIEW: `elegivel` e os nomes são calculados lá, e a tela precisa
    // deles atualizados — editar pode ter mudado a elegibilidade da questão.
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
}

/** Postgres: CHECK violado — aprovada exige matéria e gabarito. */
const CHECK_VIOLADO = '23514';

function traduzir(codigo: string | undefined, mensagem: string): string {
  if (codigo === CHECK_VIOLADO) {
    if (mensagem.includes('materia')) return 'Questão aprovada não pode ficar sem matéria.';
    if (mensagem.includes('gabarito')) return 'Questão aprovada não pode ficar sem gabarito.';
  }
  return `Não foi possível salvar: ${mensagem}`;
}
