import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';

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

const FK_INVALIDA = '23503';

export interface ImpactoExclusao {
  readonly provas: number;
  readonly questoes: number;
  readonly respostas: number;
}

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
