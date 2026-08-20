import { describe, expect, it } from 'vitest';

import { cabecalhosCors, origensPermitidas } from './cors.ts';

const origem = (configurado: string | undefined, requisicao: string | null) =>
  cabecalhosCors(configurado, requisicao)['Access-Control-Allow-Origin'];

const SITE = 'https://conquest-dzq.pages.dev';

describe('cabecalhosCors', () => {
  it('a barra final na configuração não quebra o casamento — foi o bug do primeiro deploy', () => {
    expect(origem(`${SITE}/`, SITE)).toBe(SITE);
  });

  it('casa a origem exata quando configurada sem barra', () => {
    expect(origem(SITE, SITE)).toBe(SITE);
  });

  it('sem configuração, libera só a máquina local', () => {
    expect(origem(undefined, 'http://localhost:4200')).toBe('http://localhost:4200');
    expect(origem(undefined, 'http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
  });

  it('sem configuração, um site na internet NÃO é liberado', () => {
    // Antes isto devolvia "*": perder ORIGEM_PERMITIDA num restore desligava a
    // proteção sem nenhum sinal. A falta de configuração precisa falhar fechada.
    expect(origem(undefined, SITE)).toBe('null');
    expect(origem(undefined, 'https://site-do-atacante.com')).toBe('null');
    expect(origem('', SITE)).toBe('null');
  });

  it('origem estranha NÃO é devolvida — devolver seria liberar qualquer site', () => {
    expect(origem(SITE, 'https://site-do-atacante.com')).toBe(SITE);
  });

  it('requisição sem Origin não vira curinga', () => {
    expect(origem(SITE, null)).toBe(SITE);
  });

  it('aceita mais de uma origem, para conviver com domínio próprio e .pages.dev', () => {
    const dois = `${SITE}, https://conquest.meudominio.com.br/`;
    expect(origem(dois, 'https://conquest.meudominio.com.br')).toBe(
      'https://conquest.meudominio.com.br',
    );
    expect(origem(dois, SITE)).toBe(SITE);
  });

  it('sempre varia por Origin, senão o cache serviria a origem de outro', () => {
    expect(cabecalhosCors(SITE, SITE)['Vary']).toBe('Origin');
  });

  it('origensPermitidas apara espaço e barra e descarta vazio', () => {
    expect(origensPermitidas(' https://a.com/ , , https://b.com//  ')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});
