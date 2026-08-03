import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../core/supabase.service';
import { StatusProva } from '../../shared/models';
import { extrairTextoPdf } from './extrair-texto-pdf';
import { calcularSha256 } from './hash-arquivo';
import { caminhoGabarito, caminhoPdf, motivoBloqueioAnexo } from './regras-prova';

/** Prova como as telas precisam: metadados e o que já foi anexado. */
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
  /** Carimbo de início; é o que permite detectar prova travada. */
  processando_desde: string | null;
  created_at: string;
}

export interface ProvaNovaForm {
  concurso_id: string;
  nome: string;
  ano: number | null;
  cargo: string | null;
}

/** Fases do anexo, para a UI dizer o que está acontecendo. */
export type FaseAnexo = 'hash' | 'verificando' | 'enviando' | 'vinculando';

/** Fases do processamento. A última leva ~1,5 min: o LLM lê a prova inteira. */
export type FaseProcessamento = 'baixando' | 'extraindo' | 'processando';

const COLUNAS =
  'id, concurso_id, nome, ano, cargo, status, total_questoes, arquivo_path, arquivo_hash, gabarito_path, erro_msg, processando_desde, created_at';

/** Postgres: violação de UNIQUE — aqui, o hash já pertence a outra prova. */
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
        // arquivo_hash fica nulo: não há PDF ainda. O UNIQUE tolera vários
        // nulos e só passa a impedir duplicata quando o upload preenche o hash.
      })
      .select(COLUNAS)
      .single();

    if (error) throw new Error(`Não foi possível criar a prova: ${error.message}`);
    return data as Prova;
  }

  /**
   * Anexa o PDF (e opcionalmente o gabarito) a uma prova que JÁ EXISTE.
   *
   * A ordem importa e não é a óbvia:
   *
   *   1. calcula o hash no cliente;
   *   2. consulta se outra prova do concurso já o tem — mensagem barata;
   *   3. REIVINDICA o hash no banco, antes de qualquer upload;
   *   4. sobe os arquivos;
   *   5. vincula os caminhos.
   *
   * O passo 2 é advisório: entre ler e escrever, a linha pode mudar. Quem
   * garante a unicidade é a constraint, no passo 3 — e por isso ele vem ANTES
   * do upload. Assim uma duplicata nunca chega a gastar banda nem deixa
   * arquivo órfão no bucket.
   *
   * Isso só é possível porque o CHECK `provas_arquivo_exige_hash` permite hash
   * sem path: é exatamente o estado "reservei, estou subindo".
   */
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

    // Reivindica. `arquivo_path: null` deixa a linha no estado transitório
    // "hash sem arquivo" — e, no caso de substituição, evita que a prova aponte
    // para um arquivo que está sendo sobrescrito neste instante.
    aoMudarFase?.('enviando');
    const { error: erroClaim } = await this.supabase.client
      .from('provas')
      .update({ arquivo_hash: hash, arquivo_path: null, gabarito_path: null })
      .eq('id', prova.id);

    if (erroClaim) {
      if (erroClaim.code === HASH_DUPLICADO) throw new Error(MSG_DUPLICADO);
      throw new Error(`Não foi possível reservar o arquivo: ${erroClaim.message}`);
    }

    // A partir daqui, qualquer falha precisa liberar a reserva — senão a prova
    // ficaria segurando um hash sem ter arquivo, bloqueando o próprio reenvio.
    try {
      const pdfPath = caminhoPdf(prova.concurso_id, prova.id);
      await this.subir(pdfPath, pdf);

      // DECISÃO CONSCIENTE, não esquecimento: se o gabarito falhar aqui, o PDF
      // principal já está no bucket e a reserva será liberada pelo catch. A
      // prova volta a "só metadados" com um objeto solto no Storage.
      //
      // Fica assim de propósito. O caminho é determinístico, então a próxima
      // tentativa sobrescreve o mesmo objeto: é inconsistência por instantes,
      // não vazamento. Torná-lo transacional exigiria upload em duas fases ou
      // limpeza compensatória, complexidade que este caso não paga.
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

  /** O que o CASCADE leva junto ao excluir uma prova. */
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

    // O CASCADE do banco não alcança o Storage: sem isto, o PDF ficaria órfão
    // no bucket para sempre. Falha aqui não desfaz a exclusão — a linha já foi.
    const caminhos = [prova.arquivo_path, prova.gabarito_path].filter(
      (c): c is string => c !== null,
    );
    if (caminhos.length > 0) await this.supabase.provasPdf.remove(caminhos);
  }

  /**
   * Dispara a extração.
   *
   * O texto é extraído AQUI, no navegador, e enviado à função — pdf.js não
   * cabe no orçamento de CPU do Edge Runtime (medido: ~2,4s para 16 páginas).
   *
   * A retentativa passa por este mesmo caminho: relê o PDF do bucket e extrai
   * de novo. Não há reupload, e não existe cópia do texto no banco — o PDF é o
   * artefato durável, o texto é derivado e descartável.
   */
  async processar(prova: Prova, aoMudarFase?: (fase: FaseProcessamento) => void): Promise<void> {
    if (!prova.arquivo_path) throw new Error('A prova não tem PDF anexado.');

    aoMudarFase?.('baixando');
    const pdf = await this.baixar(prova.arquivo_path);
    const gabarito = prova.gabarito_path ? await this.baixar(prova.gabarito_path) : null;

    aoMudarFase?.('extraindo');
    const texto = await extrairTextoPdf(pdf);
    const textoGabarito = gabarito ? await extrairTextoPdf(gabarito) : undefined;

    aoMudarFase?.('processando');
    const { error } = await this.supabase.client.functions.invoke('processar-prova', {
      body: { prova_id: prova.id, texto, texto_gabarito: textoGabarito },
    });

    // O erro detalhado fica em `provas.erro_msg`, gravado pela própria função;
    // a tela recarrega e mostra de lá.
    if (error) throw new Error(`Falha ao processar: ${error.message}`);
  }

  /**
   * Devolve uma prova travada em 'processando' ao estado de erro, para poder
   * ser reprocessada ou ter o PDF trocado.
   *
   * O CHECK do banco exige `processando_desde` nulo fora de 'processando', e é
   * justamente zerar o carimbo que reabre o caminho.
   */
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

  /** URL temporária para conferir o PDF anexado. O bucket é privado. */
  async urlTemporaria(caminho: string, segundos = 60): Promise<string> {
    const { data, error } = await this.supabase.provasPdf.createSignedUrl(caminho, segundos);
    if (error || !data) throw new Error(`Não foi possível abrir o arquivo: ${error?.message}`);
    return data.signedUrl;
  }

  /**
   * O `.neq` é essencial: sem ele, uma prova que já reservou este hash — por
   * exemplo depois de um upload interrompido — bateria no próprio registro e o
   * app se auto-bloquearia, impedindo justamente a retentativa.
   */
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
    // upsert: o caminho é determinístico, então retentar sobrescreve o mesmo
    // objeto em vez de acumular lixo no bucket.
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
