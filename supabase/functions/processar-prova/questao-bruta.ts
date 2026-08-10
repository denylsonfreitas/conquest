export interface QuestaoBruta {
  numero: number;
  materia: string | null;
  enunciado: string;
  alternativas: { letra: string; texto: string }[];
  gabarito: string | null;
  tipo: 'multipla_escolha' | 'certo_errado';
  tem_imagem: boolean;
  incerto: boolean;
}
