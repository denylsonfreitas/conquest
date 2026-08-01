import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';

/**
 * As duas dimensões normalizadas do sistema (docs/01). Têm exatamente a mesma
 * forma — id e nome únicos — então um service só atende as duas, parametrizado
 * pela tabela, em vez de dois arquivos idênticos.
 */
export type Dimensao = 'bancas' | 'materias';

export interface ItemDimensao {
  id: string;
  nome: string;
}

/** Postgres: violação de FK. Aqui significa "está em uso por alguém". */
const FK_EM_USO = '23503';
/** Postgres: violação de UNIQUE. Aqui significa "esse nome já existe". */
const NOME_DUPLICADO = '23505';

/**
 * Data access das dimensões. Todas as queries do Supabase ficam aqui — os
 * componentes nunca falam com o banco (docs/04).
 *
 * Os métodos lançam `Error` com mensagem já legível: traduzir o código do
 * Postgres é responsabilidade desta camada, não do template.
 */
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
      // O ON DELETE RESTRICT do docs/01 chegando na UI: em vez de um erro
      // técnico, o usuário lê por que a exclusão foi barrada.
      if (error.code === FK_EM_USO) {
        const usadaPor = tabela === 'bancas' ? 'concursos' : 'questões';
        throw new Error(`Em uso por ${usadaPor}. Remova ou reatribua antes de excluir.`);
      }
      throw new Error(`Não foi possível excluir: ${error.message}`);
    }
  }
}
