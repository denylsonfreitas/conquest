import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';

export type Dimensao = 'bancas' | 'materias';

export interface ItemDimensao {
  id: string;
  nome: string;
}

const FK_EM_USO = '23503';
const NOME_DUPLICADO = '23505';

@Injectable({ providedIn: 'root' })
export class DimensoesService {
  private readonly supabase = inject(SupabaseService);

  async listar(tabela: Dimensao): Promise<ItemDimensao[]> {
    const { data, error } = await this.supabase.client
      .from(tabela)
      .select('id, nome')
      .order('nome');

    if (error) throw new Error(`Não foi possível carregar: ${error.message}`);
    return data ?? [];
  }

  async criar(tabela: Dimensao, nome: string): Promise<ItemDimensao> {
    const { data, error } = await this.supabase.client
      .from(tabela)
      .insert({ nome: nome.trim() })
      .select('id, nome')
      .single();

    if (error) {
      if (error.code === NOME_DUPLICADO) throw new Error(`"${nome}" já existe na lista.`);
      throw new Error(`Não foi possível criar: ${error.message}`);
    }
    return data;
  }

  async renomear(tabela: Dimensao, id: string, nome: string): Promise<void> {
    const { error } = await this.supabase.client
      .from(tabela)
      .update({ nome: nome.trim() })
      .eq('id', id);

    if (error) {
      if (error.code === NOME_DUPLICADO) throw new Error(`"${nome}" já existe na lista.`);
      throw new Error(`Não foi possível renomear: ${error.message}`);
    }
  }

  async excluir(tabela: Dimensao, id: string): Promise<void> {
    const { error } = await this.supabase.client.from(tabela).delete().eq('id', id);

    if (error) {
      if (error.code === FK_EM_USO) {
        const usadaPor = tabela === 'bancas' ? 'concursos' : 'questões';
        throw new Error(`Em uso por ${usadaPor}. Remova ou reatribua antes de excluir.`);
      }
      throw new Error(`Não foi possível excluir: ${error.message}`);
    }
  }
}
