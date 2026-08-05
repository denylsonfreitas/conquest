import { effect, Injectable, signal } from '@angular/core';

export type Tema = 'claro' | 'escuro';

const CHAVE = 'conquest:tema';

@Injectable({ providedIn: 'root' })
export class TemaService {
  readonly tema = signal<Tema>(ler());

  constructor() {
    effect(() => {
      const tema = this.tema();
      document.documentElement.dataset['tema'] = tema;
      try {
        localStorage.setItem(CHAVE, tema);
      } catch {
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
