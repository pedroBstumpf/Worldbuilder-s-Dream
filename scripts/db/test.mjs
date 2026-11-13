// pnpm db:test — roda os testes pgTAP de supabase/tests sem Docker (ADR-0014).
//
// Cada arquivo *.test.sql roda numa transação própria, precedido por supabase/tests/_helpers.sql,
// e a transação é sempre desfeita no fim: nada do que os testes criam fica no banco.
//
// Banco: DB_TEST_URL (no .env, nunca commitado). Na máquina de desenvolvimento é o projeto
// wbdream-dev (string do Session pooler); no CI, o Supabase local do runner.
// Opcional: DB_TEST_CA = caminho do certificado do Supabase (Database › SSL Configuration),
// para verificar o servidor na conexão TLS.
//
// Uso: pnpm db:test [trecho-do-nome-do-arquivo ...]

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const TESTS_DIR = 'supabase/tests';
const HELPERS = join(TESTS_DIR, '_helpers.sql');

const url = process.env.DB_TEST_URL;
if (!url) {
  process.stderr.write(
    'DB_TEST_URL não definido. Copie o .env.example para .env e preencha a string do Session pooler do wbdream-dev.\n',
  );
  process.exit(2);
}

async function sslOptions(connectionString) {
  const { hostname } = new URL(connectionString);
  if (hostname === '127.0.0.1' || hostname === 'localhost') return false;
  const caPath = process.env.DB_TEST_CA;
  if (caPath) return { ca: await readFile(caPath, 'utf8') };
  process.stderr.write(
    'Aviso: conexão TLS sem verificar o certificado (defina DB_TEST_CA para verificar).\n',
  );
  return { rejectUnauthorized: false };
}

/** Linhas TAP devolvidas pelas consultas do arquivo (a primeira coluna de cada linha). */
function tapLines(results) {
  const list = Array.isArray(results) ? results : [results];
  const lines = [];
  for (const result of list) {
    for (const row of result.rows ?? []) {
      const value = Object.values(row)[0];
      if (typeof value === 'string') lines.push(...value.split('\n'));
    }
  }
  return lines;
}

function summarize(lines) {
  const planLine = lines.find((line) => /^1\.\.\d+$/.test(line));
  const planned = planLine ? Number(planLine.slice(3)) : null;
  const ran = lines.filter((line) => /^(not )?ok \d+/.test(line)).length;
  const failed = lines.filter((line) => /^not ok \d+/.test(line)).length;
  const ok = failed === 0 && planned !== null && planned === ran;
  return { planned, ran, failed, ok };
}

async function runFile(file, helpersSql, ssl) {
  const sql = await readFile(join(TESTS_DIR, file), 'utf8');
  const client = new pg.Client({ connectionString: url, ssl });
  await client.connect();
  try {
    await client.query('begin');
    const lines = tapLines(await client.query(`${helpersSql}\n${sql}`));
    return { lines, ...summarize(lines) };
  } catch (error) {
    return { lines: [`# erro: ${error.message}`], planned: null, ran: 0, failed: 1, ok: false };
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}

const filters = process.argv.slice(2);
const files = (await readdir(TESTS_DIR))
  .filter((file) => file.endsWith('.test.sql'))
  .filter((file) => filters.length === 0 || filters.some((part) => file.includes(part)))
  .sort();

const helpersSql = await readFile(HELPERS, 'utf8');
const ssl = await sslOptions(url);

let allOk = files.length > 0;
for (const file of files) {
  const result = await runFile(file, helpersSql, ssl);
  const failures = result.lines.filter((line) => line.startsWith('not ok') || line.startsWith('#'));
  const status = result.ok ? 'ok' : 'FALHOU';
  process.stdout.write(`${status.padEnd(6)} ${file} (${result.ran}/${result.planned ?? '?'})\n`);
  if (!result.ok) {
    for (const line of failures) process.stdout.write(`       ${line}\n`);
    allOk = false;
  }
}

if (files.length === 0) process.stdout.write('Nenhum arquivo de teste encontrado.\n');
process.exit(allOk ? 0 : 1);
