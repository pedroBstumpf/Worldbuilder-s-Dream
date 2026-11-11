// Mede os quadros da prova de conceito do livro (F0-07, ADR-0011) no Chromium do
// Playwright, com a CPU normal e desacelerada (máquina fraca simulada).
//
// Uso (com `pnpm start` rodando):
//   pnpm perf:book                  # headless
//   pnpm perf:book -- --headed      # janela visível (usa a GPU de verdade)
//   BASE_URL=http://localhost:4300 pnpm perf:book
//
// Imprime uma tabela em Markdown com a mediana de RUNS execuções por cenário.
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4200';
const HEADED = process.argv.includes('--headed');
const RUNS = 3;
const CPU_RATES = [1, 4, 6];
const VARIANTS = [
  { id: 'rigid', label: 'Rígida (um plano)' },
  { id: 'curl', label: 'Curvada (faixas)' },
];
const PHASES = ['unclasping', 'opening', 'turning'];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const waitState = (page, state) =>
  page.waitForFunction(
    (expected) => document.querySelector('[data-testid=poc-state]')?.textContent === expected,
    state,
    { timeout: 30_000 },
  );

async function runOnce(page, variant) {
  await page.goto(`${BASE_URL}/dev/livro`);
  await page.getByLabel('Completas').check();
  await page.getByLabel(variant.label).check();
  await page.getByRole('button', { name: 'Entrar (simulado)' }).click();
  await waitState(page, 'open');
  await page.getByRole('button', { name: 'Abrir mundo' }).click();
  await waitState(page, 'turned');
  return page
    .getByTestId('poc-result')
    .evaluateAll((rows) =>
      rows.map((row) => ({ phase: row.dataset.phase, ...JSON.parse(row.dataset.stats) })),
    );
}

async function renderer(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'desconhecido';
  });
}

const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);

await page.goto(`${BASE_URL}/dev/livro`);
console.log(`Navegador: Chromium ${browser.version()} (${HEADED ? 'com janela' : 'headless'})`);
console.log(`Renderizador: ${await renderer(page)}\n`);
console.log(
  '| CPU | Virada | Etapa | fps médio | p95 (ms) | pior quadro (ms) | quadros longos | 1º quadro (ms) |',
);
console.log(
  '|-----|--------|-------|-----------|----------|------------------|----------------|----------------|',
);

for (const rate of CPU_RATES) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  for (const variant of VARIANTS) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await runOnce(page, variant));
    for (const phase of PHASES) {
      // A abertura não depende da variante: só a primeira linha de cada CPU a mostra.
      if (phase !== 'turning' && variant.id !== VARIANTS[0].id) continue;
      const rows = runs.map((run) => run.find((row) => row.phase === phase)).filter(Boolean);
      const col = (key) => median(rows.map((row) => row[key])).toFixed(1);
      const worst = Math.max(...rows.map((row) => row.worstFrameMs)).toFixed(1);
      const label = phase === 'turning' ? variant.id : '—';
      console.log(
        `| ${rate}× | ${label} | ${phase} | ${col('avgFps')} | ${col('p95FrameMs')} | ${worst} | ` +
          `${col('longFramePct')}% | ${col('firstFrameMs')} |`,
      );
    }
  }
}

await browser.close();
