// Garante que o build de produção nunca usa o modo local (AGENTS.md, docs/10).
// Confere a substituição de environment.ts no angular.json e o arquivo de produção.
import { readFileSync } from 'node:fs';

const DEV_FILE = 'src/environments/environment.ts';
const PROD_FILE = 'src/environments/environment.production.ts';

const fail = (message) => {
  console.error(`✖ dataSource: ${message}`);
  process.exit(1);
};

const angular = JSON.parse(readFileSync('angular.json', 'utf8'));
const projects = Object.values(angular.projects ?? {});
if (projects.length === 0) fail('nenhum projeto no angular.json');

for (const project of projects) {
  const replacements = project.architect?.build?.configurations?.production?.fileReplacements ?? [];
  const ok = replacements.some((r) => r.replace === DEV_FILE && r.with === PROD_FILE);
  if (!ok) fail(`a configuração production precisa substituir ${DEV_FILE} por ${PROD_FILE}`);
}

const prod = readFileSync(PROD_FILE, 'utf8');
if (!/dataSource:\s*'supabase'/.test(prod) || /dataSource:\s*'local'/.test(prod)) {
  fail(`${PROD_FILE} deve declarar dataSource: 'supabase'`);
}

console.log("✔ dataSource: o build de produção usa 'supabase'");
