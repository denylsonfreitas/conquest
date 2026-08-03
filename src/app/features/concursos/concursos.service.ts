import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';

/**
 * Concurso já com o nome da banca resolvido — é o que as telas precisam.
 * Guardar só `banca_id` obrigaria cada tela a buscar a lista de bancas para
 * traduzir o id, então o join acontece uma vez, aqui.
 */
export interface ConcursoComBanca {
  id: string;
  nome: string;
  orgao: string | null;
  banca_id: string | null;
  banca_nome: string | null;
  created_at: string;
}

export interface ConcursoNovoForm {
  nome: string;
  orgao: string | null;
  banca_id: string | null;
}

/** Postgres: violação de FK. Aqui: a banca escolhida não existe mais. */
const FK_INVALIDA = '23503';

/** O que uma exclusão arrasta pelo CASCADE — para a confirmação poder dizer. */
export interface ImpactoExclusao {
  readonly provas: number;
  readonly questoes: number;
  readonly respostas: number;
}

/**
 * Data access de concursos (docs/04: queries só no service da feature).
 *
 * `bancas(nome)` é um embedded resource do PostgREST: ele segue a FK
 * `concursos.banca_id` e traz o registro relacionado no mesmo request. Sai
 * aninhado, e este service achata para `banca_nome` — assim o formato que
 * circula pelo app não depende do jeito que o PostgREST serializa join.
 */
@Injectable({ providedIn: 'root' })
export class ConcursosService {
  private readonly supabase = inject(SupabaseService);

  async listar(): Promise<ConcursoComBanca[]> {
    const { data, error } = await this.supabase.client
      .from('concursos')
      .select('id, nome, orgao, banca_id, created_at, bancas(nome)')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Não foi possível carregar os concursos: ${error.message}`);
    return (data ?? []).map(achatar);
  }

  async buscar(id: string): Promise<ConcursoComBanca> {
    const { data, error } = await this.supabase.client
      .from('concursos')
      .select('id, nome, orgao, banca_id, created_at, bancas(nome)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Não foi possível carregar o concurso: ${error.message}`);
    // maybeSingle devolve null em vez de erro quando não acha: id inválido na
    // URL é caso esperado, não falha de infraestrutura.
    if (!data) throw new Error('Concurso não encontrado.');
    return achatar(data);
  }

  async criar(concurso: ConcursoNovoForm): Promise<ConcursoComBanca> {
    const { data, error } = await this.supabase.client
      .from('concursos')
      .insert({
        nome: concurso.nome.trim(),
        orgao: concurso.orgao?.trim() || null,
        banca_id: concurso.banca_id,
      })
      .select('id, nome, orgao, banca_id, created_at, bancas(nome)')
      .single();

    if (error) {
      if (error.code === FK_INVALIDA) throw new Error('A banca escolhida não existe mais.');
      throw new Error(`Não foi possível criar o concurso: ${error.message}`);
    }
    return achatar(data);
  }

  /**
   * O que o CASCADE leva junto ao excluir um concurso.
   *
   * "Tem certeza?" mudo não informa nada: quem clica precisa ver o tamanho do
   * estrago ANTES, do mesmo jeito que a prévia do import mostra quantas linhas
   * serão sobrescritas. Aqui a cadeia é concurso → provas → questões →
   * respostas, e as respostas são a parte insubstituível.
   */
  async impactoDaExclusao(id: string): Promise<ImpactoExclusao> {
    const { data: provas } = await this.supabase.client
      .from('provas')
      .select('id')
      .eq('concurso_id', id);

    const idsProvas = (provas ?? []).map((p) => p.id);
    if (idsProvas.length === 0) return { provas: 0, questoes: 0, respostas: 0 };

    const { data: questoes } = await this.supabase.client
      .from('questoes')
      .select('id')
      .in('prova_id', idsProvas);

    const idsQuestoes = (questoes ?? []).map((q) => q.id);
    const { count: respostas } = idsQuestoes.length
      ? await this.supabase.client
          .from('respostas')
          .select('id', { count: 'exact', head: true })
          .in('questao_id', idsQuestoes)
      : { count: 0 };

    return { provas: idsProvas.length, questoes: idsQuestoes.length, respostas: respostas ?? 0 };
  }

  async excluir(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('concursos').delete().eq('id', id);
    if (error) throw new Error(`Não foi possível excluir: ${error.message}`);
  }
}

/** Achata o `bancas: { nome }` do PostgREST em `banca_nome`. */
function achatar(linha: {
  id: string;
  nome: string;
  orgao: string | null;
  banca_id: string | null;
  created_at: string;
  bancas: { nome: string } | null;
}): ConcursoComBanca {
  return {
    id: linha.id,
    nome: linha.nome,
    orgao: linha.orgao,
    banca_id: linha.banca_id,
    banca_nome: linha.bancas?.nome ?? null,
    created_at: linha.created_at,
  };
}
