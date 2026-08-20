export interface QuestaoBruta {
  numero: number;
  materia: string | null;
  enunciado: string;
  alternativas: { letra: string; texto: string }[];
  gabarito: string | null;
  tipo: 'multipla_escolha' | 'certo_errado';
  tem_imagem: boolean;
  incerto: boolean;
  // Marca que a questão depende de um texto que não está no enunciado.
  tem_texto_base?: boolean;
  // Id LOCAL do texto dentro desta extração, não uuid: o modelo numera os
  // textos que encontrou e aponta para eles. Null quando ele sabe que existe um
  // texto mas não soube dizer qual — e é esse caso que a revisão resolve.
  texto_base?: string | null;
}

export interface TextoBaseBruto {
  id_local: string;
  titulo: string | null;
  conteudo: string;
  fonte: string | null;
}

export interface ExtracaoBruta {
  textos: TextoBaseBruto[];
  questoes: QuestaoBruta[];
  // Preenchido quando a prova foi extraída em lotes e algum deles falhou:
  // as demais questões valem, e o que faltou precisa estar dito em algum
  // lugar — senão a prova entra incompleta sem ninguém notar.
  avisos?: string[];
}
