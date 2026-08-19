// As funções rodam em Deno, mas os testes rodam no vitest do Angular, que
// type-checa os arquivos alcançados pelos specs. Sem esta declaração, todo spec
// que tocasse um módulo com Deno.env quebrava o build dos testes — já aconteceu
// três vezes, sempre com o mesmo diagnóstico.
//
// Declara só o que as funções usam. O runtime real traz o resto.
declare const Deno: {
  env: { get(nome: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
