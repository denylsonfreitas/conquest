#!/usr/bin/env node
// O CLI do Supabase para Windows vem sem assinatura digital, e o Smart App
// Control do Windows 11 bloqueia executável sem assinatura — o Node traduz esse
// bloqueio como um enigmático `spawnSync ... UNKNOWN` (errno -4094).
//
// A saída é rodar o binário Linux do CLI dentro do WSL2. O daemon do Docker é o
// mesmo (integração WSL do Docker Desktop), então os containers e as portas
// continuam iguais para quem está do lado do Windows.
//
// Este wrapper repassa os argumentos e traduz o diretório atual para o caminho
// equivalente no WSL, para que `supabase` ache o supabase/config.toml.
import { spawnSync } from 'node:child_process';

const DISTRO = process.env.SUPABASE_WSL_DISTRO ?? 'Ubuntu';
const USUARIO = process.env.SUPABASE_WSL_USER ?? 'root';

// C:\dev\conquest -> /mnt/c/dev/conquest
function caminhoWsl(caminho) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(caminho);
  if (!m) throw new Error(`caminho inesperado: ${caminho}`);
  return `/mnt/${m[1].toLowerCase()}/${m[2].replaceAll('\\', '/')}`;
}

const resultado = spawnSync(
  'wsl.exe',
  ['-d', DISTRO, '-u', USUARIO, '--cd', caminhoWsl(process.cwd()), '--', 'supabase', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    // Sem isto o wsl.exe escreve as próprias mensagens em UTF-16LE, o que
    // corromperia a saída redirecionada do `gen types`.
    env: { ...process.env, WSL_UTF8: '1' },
  },
);

if (resultado.error) {
  const dica =
    resultado.error.code === 'ENOENT'
      ? 'wsl.exe não encontrado — o WSL2 está instalado?'
      : resultado.error.message;
  console.error(`supabase via WSL falhou: ${dica}`);
  process.exit(1);
}

process.exit(resultado.status ?? 1);
