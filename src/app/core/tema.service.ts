import { effect, Injectable, signal } from '@angular/core';

export type Tema = 'claro' | 'escuro';

const CHAVE = 'conquest:tema';

/**
 * Preferência de tema.
 *
 * **É a ÚNICA coisa que o app guarda no `localStorage`** — uma string, `claro`
 * ou `escuro`. Nenhum dado de acervo, nenhuma resposta, nada que o backup do
 * passo 11 precise conhecer. O projeto evitou storage local o tempo todo por
 * ser fonte durável fora do banco; aqui não é dado, é preferência de UI, e a
 * pior perda possível é voltar ao tema padrão.
 *
 * Não segue `prefers-color-scheme` de propósito: o modo escuro aqui é escolha
 * de quem estuda à noite, não consequência do horário do sistema operacional.
 * Seguir o SO tiraria a decisão de quem a tomou.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  readonly tema = signal<Tema>(ler());

  constructor() {
    // O atributo no <html> é o que os papéis de `styles.css` observam; o
    // localStorage é só o que faz a escolha sobreviver ao recarregamento.
    effect(() => {
      const tema = this.tema();
      document.documentElement.dataset['tema'] = tema;
      try {
        localStorage.setItem(CHAVE, tema);
      } catch {
        // Storage bloqueado (aba privada, política do navegador): o tema vale
        // para esta sessão e só não sobrevive ao reload. Não é motivo para
        // quebrar a tela.
      }
    });
  }

  alternar(): void {
    this.tema.update((t) => (t === 'claro' ? 'escuro' : 'claro'));
  }
}

function ler(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : 'claro';
  } catch {
    return 'claro';
  }
}
