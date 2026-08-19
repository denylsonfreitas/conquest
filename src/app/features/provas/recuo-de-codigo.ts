// Comparação que ignora espaçamento: é assim que uma linha reconstruída da
// geometria é reconhecida como a mesma linha que o extractText produziu.
function chave(linha: string): string {
  return linha.replace(/\s+/g, ' ').trim();
}

/**
 * Devolve as linhas do texto com o recuo dos blocos de código restaurado.
 *
 * A troca é TUDO OU NADA por bloco: ou o bloco inteiro casa, linha a linha, ou
 * ele é ignorado e o texto segue como estava. Emendar pela metade produziria um
 * código pior que o sem recuo, e o texto é o mesmo de que dependem o casamento
 * do gabarito e a extração das questões — só o espaçamento interno muda.
 */
export function aplicarRecuoDeCodigo(
  linhas: readonly string[],
  blocos: readonly (readonly string[])[],
): string[] {
  const saida = [...linhas];
  let procurarDe = 0;

  for (const bloco of blocos) {
    if (bloco.length === 0) continue;

    const posicao = acharBloco(saida, bloco, procurarDe);
    if (posicao === -1) continue;

    for (let i = 0; i < bloco.length; i++) saida[posicao + i] = bloco[i];
    procurarDe = posicao + bloco.length;
  }

  return saida;
}

function acharBloco(linhas: readonly string[], bloco: readonly string[], de: number): number {
  const primeira = chave(bloco[0]);
  if (primeira === '') return -1;

  for (let i = de; i <= linhas.length - bloco.length; i++) {
    if (chave(linhas[i]) !== primeira) continue;
    if (bloco.every((l, k) => chave(linhas[i + k]) === chave(l))) return i;
  }
  return -1;
}
