import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { StatusProva } from '../../shared/models';

/** Prova como as telas do passo 3 precisam: metadados, sem arquivo ainda. */
export interface Prova {
  id: string;
  concurso_id: string;
  nome: string;
  ano: number | null;
  cargo: string | null;
  status: StatusProva;
  total_questoes: number | null;
  arquivo_path: string | null;
  created_at: string;
}

export interface ProvaNovaForm {
  concurso_id: string;
  nome: string;
  ano: number | null;
  cargo: string | null;
}

/**
 * Data access de provas.
 *
 * Nesta etapa a prova é só um registro de metadados — o PDF entra no passo
 * seguinte. Por isso nada aqui toca em Storage, hash ou status: a prova nasce
 * em 'pendente' pelo default do banco e só sai disso quando houver arquivo.
 */
@Injectable({ providedIn: 'root' })
export class ProvasService {
  private readonly supabase = inject(SupabaseService);

  async listarPorConcurso(concursoId: string): Promise<Prova[]> {
    const { data, error } = await this.supabase.client
      .from('provas')
      .select('id, concurso_id, nome, ano, cargo, status, total_questoes, arquivo_path, created_at')
      .eq('concurso_id', concursoId)
      .order('ano', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Não foi possível carregar as provas: ${error.message}`);
    return (data ?? []) as Prova[];
  }

  async criar(prova: ProvaNovaForm): Promise<Prova> {
    const { data, error } = await this.supabase.client
      .from('provas')
      .insert({
        concurso_id: prova.concurso_id,
        nome: prova.nome.trim(),
        ano: prova.ano,
        cargo: prova.cargo?.trim() || null,
        // arquivo_hash fica nulo de propósito: não há PDF ainda. O UNIQUE
        // (concurso_id, arquivo_hash) tolera vários nulos e só passa a impedir
        // duplicata quando o upload preencher o hash.
      })
      .select('id, concurso_id, nome, ano, cargo, status, total_questoes, arquivo_path, created_at')
      .single();

    if (error) throw new Error(`Não foi possível criar a prova: ${error.message}`);
    return data as Prova;
  }

  async excluir(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('provas').delete().eq('id', id);
    if (error) throw new Error(`Não foi possível excluir a prova: ${error.message}`);
  }
}
