export type TipoBloco = 'prosa' | 'codigo';

export interface BlocoEnunciado {
  readonly tipo: TipoBloco;
  readonly texto: string;
}

const CERCA = /^\s*```[a-zA-Z0-9+#-]*\s*$/;

export function partirEmBlocos(texto: string): BlocoEnunciado[] {
  const linhas = texto.split('\n');
  const blocos: BlocoEnunciado[] = [];

  let acumulado: string[] = [];
  let dentroDeCodigo = false;

  const fechar = () => {
    const conteudo = dentroDeCodigo ? acumulado.join('\n') : acumulado.join('\n').trim();
    if (conteudo.length > 0) {
      blocos.push({ tipo: dentroDeCodigo ? 'codigo' : 'prosa', texto: conteudo });
    }
    acumulado = [];
  };

  for (const linha of linhas) {
    if (CERCA.test(linha)) {
      fechar();
      dentroDeCodigo = !dentroDeCodigo;
      continue;
    }
    acumulado.push(linha);
  }

  fechar();
  return blocos;
}

export function temCodigo(texto: string): boolean {
  return partirEmBlocos(texto).some((b) => b.tipo === 'codigo');
}
