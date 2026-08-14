import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { casarGabarito } from './casar-gabarito.ts';
import { cabecalhosCors } from './cors.ts';
import { extrairQuestoes } from './extrair-questoes.ts';
import { BancaConhecida, identificarConcurso, SugestaoConcurso } from './identificar-concurso.ts';
import { identificarProva, normalizar } from './identificar-prova.ts';
import { Descarte, montarQuestoes } from './montar-questoes.ts';
import { prepararTexto } from './preparar-texto.ts';

Deno.serve(async (req: Request) => {
  // Lido por requisição, e não uma vez no arranque, para trocar a variável no
  // painel valer sem esperar a instância reciclar.
  const cors = cabecalhosCors(Deno.env.get('ORIGEM_PERMITIDA'), req.headers.get('Origin'));

  const responder = (status: number, corpo: unknown): Response =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let provaId: string | undefined;

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return responder(401, { erro: 'Não autenticado.' });
    const { data: usuario } = await admin.auth.getUser(token);
    if (!usuario?.user) return responder(401, { erro: 'Sessão inválida.' });

    // Estar autenticado não basta: esta função gasta cota paga do Gemini, então
    // quem não é o dono para aqui, mesmo que tenha conseguido criar uma conta.
    const { data: dono } = await admin
      .from('dono')
      .select('id')
      .eq('id', usuario.user.id)
      .maybeSingle();
    if (!dono) return responder(403, { erro: 'Sem permissão.' });

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

async function marcarErro(admin: SupabaseClient, provaId: string, erro: string): Promise<void> {
  await admin
    .from('provas')
    .update({ status: 'erro', erro_msg: erro, processando_desde: null })
    .eq('id', provaId);
}

interface Resultado {
  gravadas: number;
  descartadas: number;
  motivos_descarte?: Descarte[];
  gabarito_aplicado: boolean;
  motivo_gabarito?: string;
  sugestao_concurso?: SugestaoConcurso;
}

interface TextoDoCliente {
  texto?: string;
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

  const textoProva = prepararTexto(recebido.texto);

  const brutas = await extrairQuestoes(textoProva);
  if (brutas.length === 0) throw new Error('Nenhuma questão reconhecida no PDF.');

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

  // O texto da prova nomeia a banca e repete o órgão em toda página. Sai daqui
  // como sugestão: quem aplica ao concurso é a revisão, porque o órgão é
  // palpite e errar em silêncio contaminaria filtro e estatística.
  const sugestaoConcurso = identificarConcurso(textoProva, await carregarBancas(admin));

  if (validas.length > 0) {
    const { error: erroInsert } = await admin.from('questoes').insert(validas);
    if (erroInsert) throw new Error(`Falha ao gravar as questões: ${erroInsert.message}`);
  }

  const avisos = [
    ...descartadas.map((d) => `Questão ${d.numero} não entrou — ${d.motivo}`),
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
    motivos_descarte: descartadas.length > 0 ? descartadas : undefined,
    gabarito_aplicado: respostas !== null,
    motivo_gabarito: motivoGabarito,
    sugestao_concurso: sugestaoConcurso,
  };
}

async function carregarBancas(admin: SupabaseClient): Promise<BancaConhecida[]> {
  const { data } = await admin.from('bancas').select('id, nome');
  return (data ?? []) as BancaConhecida[];
}

async function carregarMaterias(admin: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await admin.from('materias').select('id, nome');
  return new Map((data ?? []).map((m: { id: string; nome: string }) => [normalizar(m.nome), m.id]));
}
