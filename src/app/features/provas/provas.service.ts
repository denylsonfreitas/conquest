import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { StatusProva, SugestaoConcurso } from '../../shared/models';
import { SugestaoConcursoSchema } from '../../shared/schema';
import { extrairTextoPdf } from './extrair-texto-pdf';
import { calcularSha256 } from './hash-arquivo';
import { caminhoGabarito, caminhoPdf, motivoBloqueioAnexo } from './regras-prova';

export interface Prova {
  id: string;
  concurso_id: string;
  nome: string;
  ano: number | null;
  cargo: string | null;
  status: StatusProva;
  total_questoes: number | null;
  arquivo_path: string | null;
  arquivo_hash: string | null;
  gabarito_path: string | null;
  erro_msg: string | null;
  processando_desde: string | null;
  created_at: string;
}

export interface ProvaNovaForm {
  concurso_id: string;
  nome: string;
  ano: number | null;
  cargo: string | null;
}

export type FaseAnexo = 'hash' | 'verificando' | 'enviando' | 'vinculando';

export type FaseProcessamento = 'baixando' | 'extraindo' | 'processando';

const COLUNAS =
  'id, concurso_id, nome, ano, cargo, status, total_questoes, arquivo_path, arquivo_hash, gabarito_path, erro_msg, processando_desde, created_at';

const HASH_DUPLICADO = '23505';

@Injectable({ providedIn: 'root' })
export class ProvasService {
  private readonly supabase = inject(SupabaseService);

  async listarPorConcurso(concursoId: string): Promise<Prova[]> {
    const { data, error } = await this.supabase.client
      .from('provas')
      .select(COLUNAS)
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
      })
      .select(COLUNAS)
      .single();

    if (error) throw new Error(`Não foi possível criar a prova: ${error.message}`);
    return data as Prova;
  }

  async anexarArquivos(
    prova: Prova,
    pdf: Blob,
    gabarito: Blob | null,
    aoMudarFase?: (fase: FaseAnexo) => void,
  ): Promise<Prova> {
    const bloqueio = motivoBloqueioAnexo(prova.status);
    if (bloqueio) throw new Error(bloqueio);

    aoMudarFase?.('hash');
    const hash = await calcularSha256(pdf);

    aoMudarFase?.('verificando');
    await this.garantirHashLivre(prova, hash);

    aoMudarFase?.('enviando');
    const { error: erroClaim } = await this.supabase.client
      .from('provas')
      .update({ arquivo_hash: hash, arquivo_path: null, gabarito_path: null })
      .eq('id', prova.id);

    if (erroClaim) {
      if (erroClaim.code === HASH_DUPLICADO) throw new Error(MSG_DUPLICADO);
      throw new Error(`Não foi possível reservar o arquivo: ${erroClaim.message}`);
    }

    try {
      const pdfPath = caminhoPdf(prova.concurso_id, prova.id);
      await this.subir(pdfPath, pdf);

      let gabaritoPath: string | null = null;
      if (gabarito) {
        gabaritoPath = caminhoGabarito(prova.concurso_id, prova.id);
        await this.subir(gabaritoPath, gabarito);
      }

      aoMudarFase?.('vinculando');
      const { data, error } = await this.supabase.client
        .from('provas')
        .update({ arquivo_path: pdfPath, gabarito_path: gabaritoPath })
        .eq('id', prova.id)
        .select(COLUNAS)
        .single();

      if (error) throw new Error(`Não foi possível vincular o arquivo: ${error.message}`);
      return data as Prova;
    } catch (e) {
      await this.liberarReserva(prova.id);
      throw e;
    }
  }

  async impactoDaExclusao(provaId: string): Promise<{ questoes: number; respostas: number }> {
    const { data: questoes } = await this.supabase.client
      .from('questoes')
      .select('id')
      .eq('prova_id', provaId);

    const ids = (questoes ?? []).map((q) => q.id);
    const { count } = ids.length
      ? await this.supabase.client
          .from('respostas')
          .select('id', { count: 'exact', head: true })
          .in('questao_id', ids)
      : { count: 0 };

    return { questoes: ids.length, respostas: count ?? 0 };
  }

  async excluir(prova: Prova): Promise<void> {
    const { error } = await this.supabase.client.from('provas').delete().eq('id', prova.id);
    if (error) throw new Error(`Não foi possível excluir a prova: ${error.message}`);

    const caminhos = [prova.arquivo_path, prova.gabarito_path].filter(
      (c): c is string => c !== null,
    );
    if (caminhos.length > 0) await this.supabase.provasPdf.remove(caminhos);
  }

  async processar(
    prova: Prova,
    aoMudarFase?: (fase: FaseProcessamento) => void,
  ): Promise<SugestaoConcurso | null> {
    if (!prova.arquivo_path) throw new Error('A prova não tem PDF anexado.');

    aoMudarFase?.('baixando');
    const pdf = await this.baixar(prova.arquivo_path);
    const gabarito = prova.gabarito_path ? await this.baixar(prova.gabarito_path) : null;

    aoMudarFase?.('extraindo');
    const texto = await extrairTextoPdf(pdf);
    const textoGabarito = gabarito ? await extrairTextoPdf(gabarito) : undefined;

    aoMudarFase?.('processando');
    const { data, error } = await this.supabase.client.functions.invoke('processar-prova', {
      body: { prova_id: prova.id, texto, texto_gabarito: textoGabarito },
    });

    if (error) throw new Error(await motivoDaFuncao(error));

    // A Edge Function declara essa forma do lado dela; validar aqui é o que
    // faz uma divergência aparecer em vez de virar undefined na tela.
    const bruta = (data as { sugestao_concurso?: unknown } | null)?.sugestao_concurso;
    const lida = SugestaoConcursoSchema.safeParse(bruta);
    if (!lida.success) return null;

    // Sugestão sem banca nem órgão é ruído: não vale interromper a revisão.
    const sugestao = lida.data;
    return sugestao.banca_id || sugestao.orgao ? sugestao : null;
  }

  async destravar(prova: Prova): Promise<Prova> {
    const { data, error } = await this.supabase.client
      .from('provas')
      .update({
        status: 'erro',
        processando_desde: null,
        erro_msg:
          'Processamento interrompido sem retorno (a função pode ter excedido tempo ou memória). Destravada manualmente; o PDF foi preservado.',
      })
      .eq('id', prova.id)
      .select(COLUNAS)
      .single();

    if (error) throw new Error(`Não foi possível destravar: ${error.message}`);
    return data as Prova;
  }

  async buscar(id: string): Promise<Prova> {
    const { data, error } = await this.supabase.client
      .from('provas')
      .select(COLUNAS)
      .eq('id', id)
      .single();

    if (error) throw new Error(`Não foi possível recarregar a prova: ${error.message}`);
    return data as Prova;
  }

  private async baixar(caminho: string): Promise<Blob> {
    const { data, error } = await this.supabase.provasPdf.download(caminho);
    if (error || !data) throw new Error(`Não foi possível baixar o PDF: ${error?.message}`);
    return data;
  }

  async urlTemporaria(caminho: string, segundos = 60): Promise<string> {
    const { data, error } = await this.supabase.provasPdf.createSignedUrl(caminho, segundos);
    if (error || !data) throw new Error(`Não foi possível abrir o arquivo: ${error?.message}`);
    return data.signedUrl;
  }

  private async garantirHashLivre(prova: Prova, hash: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('provas')
      .select('nome')
      .eq('concurso_id', prova.concurso_id)
      .eq('arquivo_hash', hash)
      .neq('id', prova.id)
      .maybeSingle();

    if (error) throw new Error(`Não foi possível verificar duplicidade: ${error.message}`);
    if (data) throw new Error(`Este PDF já foi importado em "${data.nome}".`);
  }

  private async subir(caminho: string, arquivo: Blob): Promise<void> {
    const { error } = await this.supabase.provasPdf.upload(caminho, arquivo, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (error) throw new Error(`Falha ao enviar o arquivo: ${error.message}`);
  }

  private async liberarReserva(provaId: string): Promise<void> {
    await this.supabase.client
      .from('provas')
      .update({ arquivo_hash: null, arquivo_path: null, gabarito_path: null })
      .eq('id', provaId);
  }
}

const MSG_DUPLICADO = 'Este PDF já foi importado em outra prova deste concurso.';

// O supabase-js resume qualquer resposta de erro como "Edge Function returned
// a non-2xx status code" e joga o corpo fora — justamente onde está a razão.
// Ler a resposta é o que faz a tela dizer "o Gemini está sobrecarregado" em
// vez de falar de código HTTP.
async function motivoDaFuncao(erro: { message: string; context?: unknown }): Promise<string> {
  const resposta = erro.context as Response | undefined;

  if (resposta && typeof resposta.json === 'function') {
    try {
      const corpo = (await resposta.clone().json()) as { erro?: unknown };
      if (typeof corpo?.erro === 'string' && corpo.erro.trim() !== '') return corpo.erro;
    } catch {
      // Corpo ilegível: sobra a mensagem genérica, melhor que quebrar aqui.
    }
  }

  return `Falha ao processar: ${erro.message}`;
}
