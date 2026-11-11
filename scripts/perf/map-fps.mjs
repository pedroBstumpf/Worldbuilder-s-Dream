// Mede os quadros do mapa (F1-01, ADR-0004): imagem de 8192 × 8192 px e 500 tokens, com
// pan e zoom, no Chromium do Playwright, com a CPU normal e desacelerada.
//
// Uso (com `pnpm start` rodando):
//   pnpm perf:map                   # headless (WebGL por software, SwiftShader)
//   pnpm perf:map -- --headed       # janela visível (usa a GPU de verdade)
//   BASE_URL=http://localhost:4300 pnpm perf:map
//   SHOT=cena.png pnpm perf:map     # também salva uma captura da cena
//
// Usa a interface real (sem página /dev): entra no modo demonstração, cria um mundo,
// importa a imagem e grava os tokens direto no IndexedDB local antes de recarregar.
import { chromium } from '@playwright/test';
import { makePng } from '../../e2e/support/png.ts';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4200';
const HEADED = process.argv.includes('--headed');
const SIDE = 8192;
const TOKENS = 500;
const CPU_RATES = [1, 4];
const SCENARIOS = ['parado', 'pan', 'zoom'];
const SECONDS = 4;

/** Coleta a duração dos quadros por `seconds` segundos, com rAF, dentro da página. */
function collectFrames(seconds) {
  return new Promise((resolve) => {
    const frames = [];
    let last = performance.now();
    const end = last + seconds * 1000;
    const tick = (now) => {
      frames.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else resolve(frames);
    };
    requestAnimationFrame(tick);
  });
}

function stats(frames) {
  const sorted = [...frames].sort((a, b) => a - b);
  const total = frames.reduce((sum, ms) => sum + ms, 0);
  return {
    fps: (frames.length / total) * 1000,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    worst: sorted.at(-1) ?? 0,
    long: (frames.filter((ms) => ms > 1000 / 30).length / frames.length) * 100,
  };
}

/** Grava `count` tokens com dois keyframes cada, espalhados pelo mapa. */
function seedTokens({ worldId, mapId, count, side }) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('worldbuilders-dream');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['mapTokens', 'tokenKeyframes'], 'readwrite');
      const now = new Date().toISOString();
      for (let i = 0; i < count; i++) {
        const tokenId = crypto.randomUUID();
        tx.objectStore('mapTokens').add({
          id: tokenId,
          worldId,
          mapId,
          entityId: crypto.randomUUID(),
          eventId: null,
          size: 1,
          style: {},
          createdAt: now,
        });
        for (const tick of [0, 525600]) {
          tx.objectStore('tokenKeyframes').add({
            id: crypto.randomUUID(),
            worldId,
            tokenId,
            tick,
            x: Math.random() * side,
            y: Math.random() * side,
            visible: true,
            interpolation: 'linear',
            note: null,
            updatedAt: now,
          });
        }
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function drive(page, scenario) {
  const { width, height } = page.viewportSize();
  const cx = width / 2;
  const cy = height / 2;
  const frames = page.evaluate(collectFrames, SECONDS);
  const end = Date.now() + SECONDS * 1000 - 200;
  if (scenario === 'pan') {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; Date.now() < end; i++) {
      await page.mouse.move(cx + Math.sin(i / 8) * 250, cy + Math.cos(i / 8) * 150);
    }
    await page.mouse.up();
  } else if (scenario === 'zoom') {
    await page.mouse.move(cx, cy);
    for (let i = 0; Date.now() < end; i++) {
      await page.mouse.wheel(0, i % 40 < 20 ? -120 : 120);
      await page.waitForTimeout(16);
    }
  }
  return stats(await frames);
}

const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);

console.error(`Gerando PNG de ${SIDE} × ${SIDE} px…`);
const png = makePng(SIDE, SIDE);

await page.goto(BASE_URL);
await page.getByRole('button', { name: 'Entrar com Google' }).click();
await page.getByRole('button', { name: /Criar (primeiro|novo) mundo/ }).click();
const dialog = page.getByRole('dialog');
await dialog.getByLabel('Nome').fill(`Desempenho ${new Date().toISOString()}`);
await dialog.getByRole('button', { name: 'Criar mundo' }).click();

const chooser = page.waitForEvent('filechooser');
await page.getByRole('button', { name: 'Escolher arquivo' }).click();
const importStart = Date.now();
await (await chooser).setFiles({ name: 'desempenho.png', mimeType: 'image/png', buffer: png });
await page.getByRole('application').waitFor({ timeout: 120_000 });
await page.waitForURL(/\?map=/);
const importMs = Date.now() - importStart;
await page.getByRole('status').waitFor({ state: 'detached', timeout: 120_000 });

const url = new URL(page.url());
const worldId = url.pathname.split('/')[2];
const mapId = url.searchParams.get('map');
await page.evaluate(seedTokens, { worldId, mapId, count: TOKENS, side: SIDE });
await page.reload();
await page.getByRole('application').waitFor();
await page.waitForTimeout(1500);
// SHOT=arquivo.png guarda uma captura da cena medida (para conferir os tokens).
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'desconhecido';
});

console.log(`Navegador: Chromium ${browser.version()} (${HEADED ? 'com janela' : 'headless'})`);
console.log(`Renderizador: ${renderer}`);
console.log(`Importação de ${SIDE} px (decodificar, WebP, miniatura, cena): ${importMs} ms\n`);
console.log(`| CPU | Cenário | fps médio | p95 (ms) | pior quadro (ms) | quadros > 33 ms |`);
console.log(`|-----|---------|-----------|----------|------------------|-----------------|`);
for (const rate of CPU_RATES) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  for (const scenario of SCENARIOS) {
    const s = await drive(page, scenario);
    console.log(
      `| ${rate}× | ${scenario} | ${s.fps.toFixed(1)} | ${s.p95.toFixed(1)} | ` +
        `${s.worst.toFixed(1)} | ${s.long.toFixed(1)}% |`,
    );
  }
}

await browser.close();
