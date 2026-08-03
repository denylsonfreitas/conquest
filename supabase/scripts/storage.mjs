#!/usr/bin/env node
/**
 * Reconciliação do Storage — e a faxina, que é a mesma lógica com o filtro
 * relaxado.
 *
 *   node supabase/scripts/storage.mjs varrer [--minutos=N] [--aplicar]
 *   node supabase/scripts/storage.mjs zerar  [--aplicar]
 *
 * Por que varredura e não gancho no delete: o acervo é apagado por caminhos
 * que um gancho não cobre — o CASCADE de concurso, os scripts de reset, psql
 * na mão. Gancho vale do cano onde foi instalado; a varredura compara o que
 * EXISTE com o que TEM DONO, então cobre todo caminho e ainda limpa o que já
 * acumulou. O preço é o lixo viver até a varredura rodar.
 *
 * Apaga pela API de Storage, nunca por SQL em `storage.objects`. A tabela é só
 * o metadado: apagar a linha direto deixaria os bytes no backend e sumiria com
 * o órfão do inventário — trocaria lixo visível por lixo invisível.
 *
 * Por padrão só relata. Nada é apagado sem `--aplicar`.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const BUCKETS = ['provas-pdf', 'questao-imagens'];

/**
 * Carência antes de considerar um objeto órfão.
 *
 * No passo 4 o arquivo sobe ANTES de a linha da prova apontar para ele. Uma
 * varredura rodando nessa janela apagaria um upload que estava a um instante
 * de ganhar dono. Errar para o lado de esperar é barato; para o outro, não.
 */
const CARENCIA_PADRAO = 30;

const args = process.argv.slice(2);
const comando = args[0];
const aplicar = args.includes('--aplicar');
const minutos = Number(
  args.find((a) => a.startsWith('--minutos='))?.split('=')[1] ?? CARENCIA_PADRAO,
);

function ambiente() {
  const env = readFileSync('src/environments/environment.development.ts', 'utf8');
  const achar = (chave) => env.match(new RegExp(`${chave}:\\s*'([^']+)'`))?.[1];
  return { url: achar('supabaseUrl'), chave: achar('supabaseAnonKey') };
}

async function conectar() {
  const { url, chave } = ambiente();
  const sb = createClient(url, chave);
  const { error } = await sb.auth.signInWithPassword({
    email: process.env.CONQUEST_EMAIL ?? 'eu@local.test',
    password: process.env.CONQUEST_SENHA ?? 'conquest',
  });
  if (error) throw new Error(`login: ${error.message}`);
  return sb;
}

/** Lista recursivamente: os caminhos são `{id}/{arquivo}`, dois níveis. */
async function listarObjetos(sb, bucket) {
  const raiz = await sb.storage.from(bucket).list('', { limit: 1000 });
  if (raiz.error) throw new Error(`${bucket}: ${raiz.error.message}`);

  const objetos = [];
  for (const entrada of raiz.data ?? []) {
    // Pasta: o Storage devolve pastas sem id.
    if (entrada.id === null) {
      const dentro = await sb.storage.from(bucket).list(entrada.name, { limit: 1000 });
      if (dentro.error) throw new Error(`${bucket}/${entrada.name}: ${dentro.error.message}`);
      for (const arquivo of dentro.data ?? []) {
        objetos.push({
          caminho: `${entrada.name}/${arquivo.name}`,
          criadoEm: new Date(arquivo.created_at ?? arquivo.updated_at ?? 0),
          bytes: Number(arquivo.metadata?.size ?? 0),
        });
      }
    } else {
      objetos.push({
        caminho: entrada.name,
        criadoEm: new Date(entrada.created_at ?? 0),
        bytes: Number(entrada.metadata?.size ?? 0),
      });
    }
  }
  return objetos;
}

/** Os caminhos que TÊM dono, lidos das tabelas. */
async function caminhosVivos(sb) {
  const provas = await sb.from('provas').select('arquivo_path, gabarito_path');
  if (provas.error) throw new Error(`provas: ${provas.error.message}`);

  const questoes = await sb.from('questoes').select('imagem_path').not('imagem_path', 'is', null);
  if (questoes.error) throw new Error(`questoes: ${questoes.error.message}`);

  return {
    'provas-pdf': new Set(
      provas.data.flatMap((p) => [p.arquivo_path, p.gabarito_path]).filter(Boolean),
    ),
    'questao-imagens': new Set(questoes.data.map((q) => q.imagem_path)),
  };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

async function apagar(sb, bucket, caminhos) {
  if (caminhos.length === 0) return;
  // A API remove metadado E bytes; SQL em storage.objects removeria só o
  // primeiro.
  const { error } = await sb.storage.from(bucket).remove(caminhos);
  if (error) throw new Error(`remover em ${bucket}: ${error.message}`);
}

async function varrer(sb) {
  const vivos = await caminhosVivos(sb);
  const limite = new Date(Date.now() - minutos * 60_000);
  let total = 0;
  let bytes = 0;

  console.log(`carência: ${minutos} min (objetos mais novos são poupados)\n`);

  for (const bucket of BUCKETS) {
    const objetos = await listarObjetos(sb, bucket);
    const orfaos = objetos.filter((o) => !vivos[bucket].has(o.caminho));
    const novos = orfaos.filter((o) => o.criadoEm > limite);
    const alvos = orfaos.filter((o) => o.criadoEm <= limite);

    console.log(
      `${bucket}: ${objetos.length} objetos · ${orfaos.length} órfãos` +
        (novos.length ? ` · ${novos.length} poupados pela carência` : ''),
    );
    for (const o of alvos)
      console.log(`  ${aplicar ? 'apagando' : 'apagaria'}  ${o.caminho}  ${kb(o.bytes)}`);
    for (const o of novos) console.log(`  poupado   ${o.caminho}  (${o.criadoEm.toISOString()})`);

    if (aplicar)
      await apagar(
        sb,
        bucket,
        alvos.map((o) => o.caminho),
      );
    total += alvos.length;
    bytes += alvos.reduce((s, o) => s + o.bytes, 0);
  }

  console.log(`\n${aplicar ? 'apagados' : 'apagaria'}: ${total} objetos · ${kb(bytes)}`);
  if (!aplicar && total > 0) console.log('(rode de novo com --aplicar para executar)');
}

async function zerar(sb) {
  // ORDEM: buckets primeiro, tabelas depois. O contrário produziria órfãos no
  // próprio ato de limpar — o CASCADE apaga linha, não arquivo.
  console.log('1. esvaziando os buckets\n');
  for (const bucket of BUCKETS) {
    const objetos = await listarObjetos(sb, bucket);
    console.log(`${bucket}: ${objetos.length} objetos`);
    for (const o of objetos)
      console.log(`  ${aplicar ? 'apagando' : 'apagaria'}  ${o.caminho}  ${kb(o.bytes)}`);
    if (aplicar)
      await apagar(
        sb,
        bucket,
        objetos.map((o) => o.caminho),
      );
  }

  console.log('\n2. apagando o acervo (a fundação fica: bancas, matérias, usuário)\n');
  // Explícito, de baixo para cima, mesmo com o CASCADE dando conta: a ordem
  // documenta a dependência e o resultado não depende de configuração de FK.
  const tabelas = ['respostas', 'questoes', 'provas', 'concursos'];
  for (const tabela of tabelas) {
    const { count } = await sb.from(tabela).select('id', { count: 'exact', head: true });
    console.log(`${tabela}: ${count} linhas ${aplicar ? '— apagando' : '— apagaria'}`);
    if (aplicar) {
      const { error } = await sb.from(tabela).delete().not('id', 'is', null);
      if (error) throw new Error(`apagar ${tabela}: ${error.message}`);
    }
  }

  if (aplicar) await conferir(sb);
  else console.log('\n(rode de novo com --aplicar para executar)');
}

async function conferir(sb) {
  console.log('\n3. conferindo\n');
  for (const tabela of ['concursos', 'provas', 'questoes', 'respostas', 'bancas', 'materias']) {
    const { count } = await sb.from(tabela).select('id', { count: 'exact', head: true });
    console.log(`${tabela.padEnd(10)} ${count}`);
  }
  for (const bucket of BUCKETS) {
    const objetos = await listarObjetos(sb, bucket);
    console.log(`${bucket.padEnd(16)} ${objetos.length} objetos`);
  }
}

const comandos = { varrer, zerar, conferir };

if (!comandos[comando]) {
  console.error('uso: storage.mjs <varrer|zerar|conferir> [--minutos=N] [--aplicar]');
  process.exit(1);
}

const sb = await conectar();
await comandos[comando](sb);
