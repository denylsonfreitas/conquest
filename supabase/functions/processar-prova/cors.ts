const CABECALHOS_FIXOS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

// O cabeçalho Origin que o navegador envia nunca tem barra final. Configurar a
// origem com barra fazia a comparação exata do CORS falhar com uma mensagem que
// não diz onde está o erro, então a barra é aparada dos dois lados.
function semBarraFinal(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function origensPermitidas(configurado: string | undefined): string[] {
  return (configurado ?? '')
    .split(',')
    .map(semBarraFinal)
    .filter((o) => o.length > 0);
}

export function cabecalhosCors(
  configurado: string | undefined,
  origemDaRequisicao: string | null,
): Record<string, string> {
  const permitidas = origensPermitidas(configurado);

  // Sem configuração, libera só o desenvolvimento local, onde a porta muda a
  // cada ferramenta. Antes isto devolvia "*" para qualquer origem: dizia-se que
  // em produção a variável era obrigatória, mas nada garantia isso — perder o
  // segredo num restore desligava a proteção sem nenhum sinal. Agora a falta de
  // configuração falha fechada para tudo que não seja a máquina de quem edita.
  if (permitidas.length === 0) {
    const origem = semBarraFinal(origemDaRequisicao ?? '');
    return {
      ...CABECALHOS_FIXOS,
      'Access-Control-Allow-Origin': ehLocal(origem) ? origem : 'null',
    };
  }

  const origem = semBarraFinal(origemDaRequisicao ?? '');
  const casada = permitidas.find((p) => p === origem);

  // Sem casar, devolve a primeira permitida: o navegador compara, vê que difere
  // da origem da chamada e bloqueia. Devolver a origem do chamador aqui seria
  // liberar qualquer site.
  return { ...CABECALHOS_FIXOS, 'Access-Control-Allow-Origin': casada ?? permitidas[0] };
}

// localhost e 127.0.0.1 em qualquer porta: é o que o `ng serve` e o Supabase
// local usam. Qualquer outra coisa precisa estar em ORIGEM_PERMITIDA.
function ehLocal(origem: string): boolean {
  if (origem.length === 0) return false;
  try {
    const { hostname } = new URL(origem);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}
