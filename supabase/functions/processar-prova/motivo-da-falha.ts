// Trechos longos e contínuos de alfabeto de credencial não têm por que aparecer
// numa mensagem de erro. Não é que o provedor costume ecoar a chave — é que o
// corpo é texto de terceiro que acaba gravado em provas.erro_msg e, de lá, sai
// no backup em JSON. O que não se controla, não se guarda.
const PARECE_CREDENCIAL = /[A-Za-z0-9_-]{24,}/g;

export function omitirCredenciais(texto: string): string {
  return texto.replace(PARECE_CREDENCIAL, '[omitido]');
}

/**
 * O corpo de erro da API não é recado para quem está revisando uma prova. Cada
 * falha vira uma frase que diz o que fazer; o status fica no fim, para depurar
 * sem poluir.
 *
 * `provedor` é o elo da cadeia que falhou ("gemini:gemini-flash-latest"), e não
 * mais um nome fixo: com Mistral ou Groq no ar, dizer "o Gemini falhou" mandaria
 * procurar o problema no lugar errado.
 */
export function motivoDaFalha(status: number, corpo: string, provedor?: string): string {
  const detalhe = `(HTTP ${status})`;
  const quem = provedor ? `O provedor ${provedor}` : 'O provedor de extração';
  const qual = provedor ? ` "${provedor}"` : '';

  // 599 é código nosso: não houve resposta dentro do tempo. Diagnóstico bem
  // diferente de "o serviço recusou por carga" — aqui o pedido provavelmente é
  // grande demais para caber numa chamada só.
  // 597 e 598 também são códigos nossos: o elo respondeu, mas não com o que foi
  // pedido. São os desfechos típicos de modelo gratuito que ignora o formato.
  if (status === 597) {
    return `${quem} cortou a resposta no limite de tokens. A prova precisa ser processada em partes. ${detalhe}`;
  }
  if (status === 598) {
    return `${quem} respondeu fora do formato JSON combinado — ${corpo}. Modelos pequenos costumam ignorar o formato pedido. ${detalhe}`;
  }
  if (status === 599) {
    return `${quem} não respondeu dentro do tempo da função. Costuma ser prova grande demais para uma chamada só. ${detalhe}`;
  }
  if (status === 502 || status === 503 || status === 500 || status === 504) {
    return `${quem} está sobrecarregado agora. Tente processar de novo em alguns minutos. ${detalhe}`;
  }
  if (status === 429) {
    return `A cota de${qual} se esgotou. Espere a renovação ou revise o limite da chave. ${detalhe}`;
  }
  if (status === 401 || status === 403) {
    return `A chave de${qual} foi recusada. Confira o segredo correspondente na Edge Function. ${detalhe}`;
  }
  // O 404 nomeia o elo porque é o que se conserta: modelo aposentado ou
  // indisponível para esta chave.
  if (status === 404) {
    return `O modelo${qual} não existe ou não está disponível para esta chave. Ajuste o segredo EXTRACAO_CADEIA. ${detalhe}`;
  }
  if (status === 400) {
    return `${quem} recusou o pedido — normalmente é prova longa demais para uma chamada só. ${detalhe}`;
  }

  // Status inesperado: aí o corpo ajuda mais do que atrapalha, mas curto e sem
  // nada que se pareça com credencial.
  const resumo = omitirCredenciais(corpo.replace(/\s+/g, ' ')).slice(0, 160);
  return `${quem} falhou ${detalhe}: ${resumo}`;
}
