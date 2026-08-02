import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { QuestaoNovaSchema } from '../../../src/app/shared/schema.ts';
import { casarGabarito } from './casar-gabarito.ts';
import { extrairQuestoes, QuestaoBruta } from './extrair-questoes.ts';
import { identificarProva, normalizar } from './identificar-prova.ts';
import { prepararTexto } from './preparar-texto.ts';

/**
 * Edge Function de extração — o coração do write-side (docs/02).
 *
 * Fluxo: PDF do Storage → texto (sem marca d'água) → LLM estrutura → casa
 * gabarito → valida com Zod → grava rascunhos → prova em aguardando_revisao.
 *
 * Invariante de estado: a prova NUNCA fica presa em 'processando'. Todo
 * caminho de saída — sucesso ou falha — reescreve o status e zera
 * `processando_desde`. O que o try/catch não cobre (timeout, OOM, deploy) é
 * coberto pelo carimbo, que permite a UI destravar.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    // service_role: a função grava sem sessão de usuário. Ignora RLS por
    // design, e por isso NUNCA pode sair daqui (docs/04).
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let provaId: string | undefined;

  try {
    // Só usuário autenticado dispara processamento; a função não é pública.
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return responder(401, { erro: 'Não autenticado.' });
    const { data: usuario } = await admin.auth.getUser(token);
    if (!usuario?.user) return responder(401, { erro: 'Sessão inválida.' });

    const corpo = await req.json();
    provaId = corpo.prova_id;
    if (!provaId) return responder(400, { erro: 'prova_id é obrigatório.' });

    const resultado = await processar(admin, provaId, {
      texto: corpo.texto,
      textoGabarito: corpo.texto_gabarito,
    });
    return responder(200, resultado);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Erro inesperado no processamento.';
    if (provaId) await marcarErro(admin, provaId, mensagem);
    return responder(500, { erro: mensagem });
  }
});

function responder(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

async function marcarErro(admin: SupabaseClient, provaId: string, erro: string): Promise<void> {
  // O CHECK do banco exige processando_desde nulo fora de 'processando'.
  await admin
    .from('provas')
    .update({ status: 'erro', erro_msg: erro, processando_desde: null })
    .eq('id', provaId);
}

interface Resultado {
  gravadas: number;
  descartadas: number;
  gabarito_aplicado: boolean;
  motivo_gabarito?: string;
}

/**
 * Texto já extraído pelo cliente.
 *
 * MEDIDO: extrair 16 páginas com pdf.js custa ~2,4s de CPU, e o Edge Runtime
 * corta bem antes disso ("CPU time hard limit reached"). O navegador não tem
 * esse limite e já lê o arquivo para calcular o hash, então extrair lá é de
 * graça.
 *
 * A garantia de privacidade não depende de quem extraiu: `garantirSemMarcaDagua`
 * roda aqui, no servidor, antes de qualquer chamada ao LLM.
 */
interface TextoDoCliente {
  /** Texto bruto da prova, como o pdf.js devolveu. Obrigatório. */
  texto?: string;
  /** Texto bruto do gabarito, se houver PDF separado. */
  textoGabarito?: string;
}

async function processar(
  admin: SupabaseClient,
  provaId: string,
  recebido: TextoDoCliente,
): Promise<Resultado> {
  const { data: prova, error } = await admin
    .from('provas')
    .select('id, concurso_id, status, arquivo_path, gabarito_path')
    .eq('id', provaId)
    .single();

  if (error || !prova) throw new Error('Prova não encontrada.');
  if (!prova.arquivo_path) throw new Error('A prova não tem PDF anexado.');
  if (prova.status === 'processando') throw new Error('A prova já está sendo processada.');
  if (!recebido.texto) throw new Error('O texto extraído da prova não foi enviado.');

  // Reprocessar apaga as questões anteriores: a extração é idempotente por
  // reconstrução, não por merge. Merge deixaria órfãs de uma extração antiga.
  await admin.from('questoes').delete().eq('prova_id', provaId);

  await admin
    .from('provas')
    .update({
      status: 'processando',
      processando_desde: new Date().toISOString(),
      erro_msg: null,
      total_questoes: null,
    })
    .eq('id', provaId);

  // Ordem inegociável: limpa a marca d'água, confere que sobrou conteúdo e
  // confere que nada escapou — só então o texto pode tocar a API do LLM.
  const textoProva = prepararTexto(recebido.texto);

  const brutas = await extrairQuestoes(textoProva);
  if (brutas.length === 0) throw new Error('Nenhuma questão reconhecida no PDF.');

  // --- gabarito --------------------------------------------------------------
  // Decisão: falha aqui NÃO interrompe. O texto das questões é o trabalho caro e
  // não depende do gabarito; sem ele as questões entram sinalizadas.
  let respostas: ReadonlyMap<number, string> | null = null;
  let motivoGabarito: string | undefined;

  if (recebido.textoGabarito) {
    try {
      const casamento = casarGabarito(
        prepararTexto(recebido.textoGabarito),
        identificarProva(textoProva),
        brutas.length,
      );
      if (casamento.aplicavel) respostas = casamento.respostas;
      else motivoGabarito = casamento.motivo;
    } catch (e) {
      motivoGabarito = `Falha ao ler o gabarito: ${e instanceof Error ? e.message : e}`;
    }
  } else {
    motivoGabarito = 'Nenhum PDF de gabarito anexado.';
  }

  const materias = await carregarMaterias(admin);
  const { validas, descartadas } = montarQuestoes(brutas, provaId, respostas, materias);

  if (validas.length > 0) {
    const { error: erroInsert } = await admin.from('questoes').insert(validas);
    if (erroInsert) throw new Error(`Falha ao gravar as questões: ${erroInsert.message}`);
  }

  // Nada some em silêncio: o que não pôde virar linha vai para erro_msg.
  const avisos = [
    descartadas.length > 0
      ? `${descartadas.length} questão(ões) descartada(s) na extração: nº ${descartadas.join(', ')}.`
      : null,
    motivoGabarito ? `Gabarito não aplicado — ${motivoGabarito}` : null,
  ].filter(Boolean);

  await admin
    .from('provas')
    .update({
      status: 'aguardando_revisao',
      processando_desde: null,
      total_questoes: validas.length,
      erro_msg: avisos.length > 0 ? avisos.join(' ') : null,
    })
    .eq('id', provaId);

  return {
    gravadas: validas.length,
    descartadas: descartadas.length,
    gabarito_aplicado: respostas !== null,
    motivo_gabarito: motivoGabarito,
  };
}

/** Matérias canônicas indexadas por nome normalizado, para casar o palpite do LLM. */
async function carregarMaterias(admin: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await admin.from('materias').select('id, nome');
  return new Map((data ?? []).map((m: { id: string; nome: string }) => [normalizar(m.nome), m.id]));
}

function montarQuestoes(
  brutas: QuestaoBruta[],
  provaId: string,
  respostas: ReadonlyMap<number, string> | null,
  materias: Map<string, string>,
) {
  const validas: unknown[] = [];
  const descartadas: number[] = [];

  for (const bruta of brutas) {
    // O gabarito casado tem prioridade sobre o que o LLM achou: ele vem do
    // documento oficial da banca, o outro é leitura de texto.
    const gabarito = respostas?.get(bruta.numero) ?? bruta.gabarito ?? null;
    const materiaId = bruta.materia ? (materias.get(normalizar(bruta.materia)) ?? null) : null;

    const candidata = {
      prova_id: provaId,
      numero: bruta.numero,
      materia_id: materiaId,
      // A matéria sugerida que não casou com a lista canônica vira assunto,
      // para a revisão não perder a informação do LLM.
      assunto: bruta.materia && !materiaId ? bruta.materia : null,
      enunciado: bruta.enunciado,
      alternativas: bruta.alternativas,
      gabarito,
      tipo: bruta.tipo,
      tem_imagem: bruta.tem_imagem,
      // Sinaliza o que a revisão precisa olhar: o LLM duvidou, o gabarito não
      // casou, ou a matéria não bateu com a lista canônica.
      incerto: bruta.incerto || gabarito === null || materiaId === null,
      anulada: false,
      revisada: false,
    };

    const validacao = QuestaoNovaSchema.safeParse(candidata);
    if (validacao.success) validas.push(validacao.data);
    else descartadas.push(bruta.numero);
  }

  return { validas, descartadas };
}
