import { describe, expect, it } from 'vitest';

import { bytesParaHex, calcularSha256 } from './hash-arquivo';

describe('bytesParaHex', () => {
  it('emite hex minúsculo com dois dígitos por byte', () => {
    expect(bytesParaHex(new Uint8Array([0, 15, 16, 255]).buffer)).toBe('000f10ff');
  });
});

describe('calcularSha256', () => {
  it('produz o hash conhecido de "abc"', async () => {
    expect(await calcularSha256(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('sai no formato que o banco e o Zod esperam', async () => {
    expect(await calcularSha256(new Blob(['conteudo']))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('muda com qualquer alteração no conteúdo', async () => {
    const a = await calcularSha256(new Blob(['%PDF-1.4 prova A']));
    const b = await calcularSha256(new Blob(['%PDF-1.4 prova B']));
    expect(a).not.toBe(b);
  });

  it('é estável para o mesmo conteúdo — é isso que a dedupe usa', async () => {
    const a = await calcularSha256(new Blob(['%PDF-1.4 mesma prova']));
    const b = await calcularSha256(new Blob(['%PDF-1.4 mesma prova']));
    expect(a).toBe(b);
  });
});
