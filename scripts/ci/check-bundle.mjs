// Verificações do bundle de produção (rodar depois de `pnpm build`):
// 1. orçamento inicial de 300 kB em gzip (docs/04 › Desempenho);
// 2. nenhum segredo do Supabase no dist/ (docs/09 › Autorização).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const INITIAL_BUDGET_KB = 300;
const TEXT_FILE = /\.(?:html|js|mjs|css|json|txt|map|svg|webmanifest)$/;

const errors = [];

const distRoot = 'dist';
const browserDir = existsSync(distRoot)
  ? readdirSync(distRoot)
      .map((name) => join(distRoot, name, 'browser'))
      .find((dir) => existsSync(join(dir, 'index.html')))
  : undefined;
if (!browserDir) {
  console.error(
    '✖ bundle: dist/<projeto>/browser/index.html não encontrado; rode `pnpm build` antes.',
  );
  process.exit(1);
}

// 1. Orçamento inicial: arquivos locais que o index.html carrega na abertura.
const indexHtml = readFileSync(join(browserDir, 'index.html'), 'utf8');
const initialFiles = new Set();
for (const tag of indexHtml.match(/<(?:script|link)\b[^>]*>/g) ?? []) {
  const isScript = tag.startsWith('<script');
  const isLoadedLink = /rel="(?:stylesheet|modulepreload)"/.test(tag);
  if (!isScript && !isLoadedLink) continue;
  const url = /(?:src|href)="([^"]+)"/.exec(tag)?.[1];
  if (url && !/^(?:[a-z]+:)?\/\//i.test(url)) initialFiles.add(url.replace(/^\//, ''));
}

let initialGzip = 0;
for (const file of initialFiles) {
  const size = gzipSync(readFileSync(join(browserDir, file))).length;
  initialGzip += size;
  console.log(`  ${file}: ${(size / 1024).toFixed(1)} kB gzip`);
}
const initialKb = initialGzip / 1024;
if (initialKb > INITIAL_BUDGET_KB) {
  errors.push(
    `carga inicial de ${initialKb.toFixed(1)} kB gzip passa do limite de ${INITIAL_BUDGET_KB} kB`,
  );
} else {
  console.log(
    `✔ bundle: carga inicial ${initialKb.toFixed(1)} kB gzip (limite ${INITIAL_BUDGET_KB} kB)`,
  );
}

// 2. Segredos: chave secreta nova (sb_secret_), JWT com papel service_role, valor da variável.
const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
const JWT = /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g;

const isServiceRoleJwt = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
};

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

for (const file of walk(join(distRoot)).filter((path) => TEXT_FILE.test(path))) {
  const content = readFileSync(file, 'utf8');
  if (content.includes('sb_secret_'))
    errors.push(`${file} contém uma chave secreta do Supabase (sb_secret_)`);
  if ((content.match(JWT) ?? []).some(isServiceRoleJwt)) {
    errors.push(`${file} contém um JWT com papel service_role`);
  }
  if (serviceRoleKey && content.includes(serviceRoleKey)) {
    errors.push(`${file} contém o valor de SUPABASE_SERVICE_ROLE_KEY`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`✖ bundle: ${error}`);
  process.exit(1);
}
console.log('✔ bundle: nenhum segredo encontrado no dist/');
