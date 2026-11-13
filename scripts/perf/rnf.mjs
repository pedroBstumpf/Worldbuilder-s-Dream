// Mede os requisitos não funcionais RNF-01 a RNF-04 (docs/01) para o marco da demo (F1-07).
// Resultados registrados no docs/10 › Marco de apresentação ao cliente.
//
//   RNF-01  fps do mapa com 300 tokens visíveis andando (play e slider)
//   RNF-02  tempo de `MapEngine.setTime` por quadro (posições recalculadas)
//   RNF-03  capa interativa em banda larga (build otimizado, cache vazio)
//   RNF-04  fps e duração das transições do livro; tempo até a tela depois de Esc
//
// Uso:
//   pnpm start                       # em outro terminal: RNF-01 e RNF-02 usam o servidor de dev
//   pnpm perf:rnf                    # gera um build otimizado (modo local) para RNF-03 e RNF-04
//   pnpm perf:rnf -- --headed        # janela visível (GPU de verdade; headless usa SwiftShader)
//   pnpm perf:rnf -- --only=03,04    # só alguns requisitos
//   BASE_URL=http://localhost:4300 pnpm perf:rnf
//
// O build de produção não roda sem o Supabase (Fase 2): o RNF-03 usa `-c development` com
// `--optimization`, que é o mesmo bundle com os adaptadores locais (um pouco maior). O
// tamanho do bundle de produção vem de `pnpm build && node scripts/ci/check-bundle.mjs`.
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { makePng } from '../../e2e/support/png.ts';
import { BOOK_STRINGS } from '../../src/app/core/strings/book.strings.ts';
import { WORLD_STRINGS } from '../../src/app/core/strings/world.strings.ts';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4200';
const HEADED = process.argv.includes('--headed');
const ONLY = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',');
const wants = (id) => !ONLY || ONLY.includes(id);
const CPU_RATES = [1, 4];
const SECONDS = 4;
const TOKENS = 300;
const LOAD_RUNS = 5;
const STATIC_PORT = 4310;
/** "Banda larga": 20 Mbit/s para baixo, 5 para cima, 40 ms de ida e volta. */
const BROADBAND = {
  offline: false,
  latency: 40,
  downloadThroughput: (20 * 1024 * 1024) / 8,
  uploadThroughput: (5 * 1024 * 1024) / 8,
};

const { cover, library, createWorld } = BOOK_STRINGS;
const fmt = (ms) => ms.toFixed(1);

// ── Quadros ──────────────────────────────────────────────────────────────────────────────

/** Instala no `window` um coletor de quadros por rAF; `__wdFrames.stop()` devolve as durações. */
function installFrameCollector() {
  const frames = [];
  let last = performance.now();
  let running = true;
  const tick = (now) => {
    frames.push(now - last);
    last = now;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__wdFrames = {
    stop: () => {
      running = false;
      return frames;
    },
  };
}

function stats(frames) {
  const sorted = [...frames].sort((a, b) => a - b);
  const total = frames.reduce((sum, ms) => sum + ms, 0);
  return {
    fps: total > 0 ? (frames.length / total) * 1000 : 0,
    p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    worst: sorted.at(-1) ?? 0,
    long: frames.length ? (frames.filter((ms) => ms > 1000 / 30).length / frames.length) * 100 : 0,
  };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

// ── Build otimizado e servidor estático ──────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function buildOptimized() {
  const out = join(tmpdir(), 'wd-perf-build');
  console.error(`Gerando build otimizado em modo local em ${out}…`);
  // Um só comando (o pnpm no Windows é um .cmd e precisa do shell).
  const command =
    'pnpm ng build -c development --optimization --output-hashing=all --no-source-map ' +
    `"--output-path=${out}"`;
  const result = spawnSync(command, { stdio: ['ignore', 'ignore', 'inherit'], shell: true });
  if (result.status !== 0) throw new Error('falha no build otimizado');
  return join(out, 'browser');
}

/** Serve `root` com fallback para index.html (rotas do Angular). */
function serve(root, port) {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    let file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(root, 'index.html');
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// ── Passos na interface ──────────────────────────────────────────────────────────────────

const focusedHeading = (page, name) =>
  page.waitForFunction(
    (name) => {
      const el = document.activeElement;
      return el?.tagName === 'H1' && el.textContent?.trim() === name ? performance.now() : null;
    },
    name,
    { polling: 'raf', timeout: 30_000 },
  );

async function signIn(page) {
  await page.getByRole('button', { name: cover.signIn }).click();
  await focusedHeading(page, library.heading);
}

async function openCreateDialog(page, name) {
  await page.getByRole('button', { name: /Criar (primeiro|novo) mundo/ }).click();
  const dialog = page.getByRole('dialog', { name: createWorld.title });
  await dialog.getByLabel(createWorld.name).fill(name);
  return dialog.getByRole('button', { name: createWorld.create });
}

// ── RNF-03: capa interativa ──────────────────────────────────────────────────────────────

/** Marca quando o botão "Entrar com Google" existe, está visível e habilitado. */
function watchCoverReady(label) {
  const ready = () =>
    [...document.querySelectorAll('button')].some(
      (b) => b.textContent?.includes(label) && !b.disabled && b.offsetParent !== null,
    );
  const observer = new MutationObserver(() => {
    if (ready()) {
      window.__wdCoverReady = performance.now();
      observer.disconnect();
    }
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true });
  window.__wdLcp = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__wdLcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
}

async function measureCover(browser, url) {
  // Carga de aquecimento, descartada: a primeira leitura dos arquivos recém-gerados pelo
  // servidor local chegou a levar 10 s e não diz nada sobre a rede.
  const warmUp = await browser.newPage();
  await warmUp.goto(url, { waitUntil: 'load' });
  await warmUp.close();
  console.log('\n## RNF-03 · Capa interativa (banda larga 20 Mbit/s, 40 ms, cache vazio)\n');
  console.log(
    '| CPU | capa interativa, mediana (ms) | pior (ms) | LCP, mediana (ms) | transferido (kB) |',
  );
  console.log(
    '|-----|-------------------------------|-----------|-------------------|------------------|',
  );
  for (const rate of CPU_RATES) {
    const ready = [];
    const lcp = [];
    let bytes = 0;
    for (let i = 0; i < LOAD_RUNS; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', BROADBAND);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      let transferred = 0;
      cdp.on('Network.loadingFinished', (event) => (transferred += event.encodedDataLength));
      await page.addInitScript(watchCoverReady, cover.signIn);
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__wdCoverReady, null, { timeout: 30_000 });
      await page.waitForTimeout(500);
      ready.push(await page.evaluate(() => window.__wdCoverReady));
      lcp.push(await page.evaluate(() => window.__wdLcp));
      bytes = transferred;
      await context.close();
    }
    console.log(
      `| ${rate}× | ${fmt(median(ready))} | ${fmt(Math.max(...ready))} | ` +
        `${fmt(median(lcp))} | ${(bytes / 1024).toFixed(0)} |`,
    );
  }
}

// ── RNF-04: transições do livro ──────────────────────────────────────────────────────────

/** Roda uma transição: quadros e duração do clique até o foco no título de chegada. */
async function transition(page, act, arrival, { skip = false } = {}) {
  await page.evaluate(installFrameCollector);
  await page.evaluate(() => {
    window.__wdLongTasks = [];
    window.__wdLongObserver?.disconnect();
    window.__wdLongObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__wdLongTasks.push(entry.duration);
    });
    window.__wdLongObserver.observe({ type: 'longtask' });
    window.__wdStart = performance.now();
  });
  await act();
  let escAt = null;
  if (skip) {
    await page.waitForTimeout(150);
    escAt = await page.evaluate(() => performance.now());
    await page.keyboard.press('Escape');
  }
  const end = await (await focusedHeading(page, arrival)).jsonValue();
  const frames = await page.evaluate(() => window.__wdFrames.stop());
  const { start, longest } = await page.evaluate(() => ({
    start: window.__wdStart,
    longest: Math.max(0, ...window.__wdLongTasks),
  }));
  return { ...stats(frames), duration: end - start, afterEsc: escAt ? end - escAt : null, longest };
}

async function measureBook(browser, url) {
  console.log('\n## RNF-04 · Transições do livro (build otimizado)\n');
  console.log(
    '| CPU | Transição | duração (ms) | fps médio | p95 (ms) | pior quadro (ms) | maior tarefa longa (ms) |',
  );
  console.log(
    '|-----|-----------|--------------|-----------|----------|------------------|-------------------------|',
  );
  const skips = [];
  for (const rate of CPU_RATES) {
    for (const skip of [false, true]) {
      // Contexto novo: sessão vazia, sem a versão curta herdada de uma medição anterior.
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.goto(url);
      await page.getByRole('button', { name: cover.signIn }).waitFor();
      await page.waitForTimeout(500);
      const run = async (label, act, arrival) => {
        const r = await transition(page, act, arrival, { skip });
        if (skip) skips.push({ rate, label, afterEsc: r.afterEsc });
        else {
          console.log(
            `| ${rate}× | ${label} | ${fmt(r.duration)} | ${r.fps.toFixed(1)} | ${fmt(r.p95)} | ` +
              `${fmt(r.worst)} | ${fmt(r.longest)} |`,
          );
        }
      };
      await run(
        'abrir o livro',
        () => page.getByRole('button', { name: cover.signIn }).click(),
        library.heading,
      );
      const create = await openCreateDialog(page, `Medição ${rate}×`);
      await run('virar a página até o mapa', () => create.click(), `Medição ${rate}×`);
      await page.waitForTimeout(500);
      await run(
        'voltar ao livro',
        () => page.getByRole('button', { name: WORLD_STRINGS.backToLibrary }).click(),
        library.heading,
      );
      await run(
        'fechar o livro',
        () => page.getByRole('button', { name: library.signOut }).click(),
        cover.title,
      );
      await context.close();
    }
  }
  console.log('\nPulando com Esc 150 ms depois do início:\n');
  console.log('| CPU | Transição | do Esc à tela (ms) |');
  console.log('|-----|-----------|--------------------|');
  for (const s of skips) console.log(`| ${s.rate}× | ${s.label} | ${fmt(s.afterEsc)} |`);
}

// ── RNF-01 e RNF-02: mapa com 300 tokens ─────────────────────────────────────────────────

/** Grava `count` tokens com uma posição no início e outra no fim do mundo, dentro da imagem. */
function seedTokens({ worldId, mapId, count, width, height, endTick }) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('worldbuilders-dream');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['mapTokens', 'tokenKeyframes'], 'readwrite');
      const now = new Date().toISOString();
      const inside = (size) => size * (0.1 + Math.random() * 0.8);
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
        for (const tick of [0, endTick]) {
          tx.objectStore('tokenKeyframes').add({
            id: crypto.randomUUID(),
            worldId,
            tokenId,
            tick,
            x: inside(width),
            y: inside(height),
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

/** Cronometra cada `setTime` do motor (só no servidor de dev, que expõe `window.ng`). */
function timeEngine() {
  const canvas = document.querySelector('wd-map-canvas');
  const engine = window.ng?.getComponent(canvas)?.engine?.();
  if (!engine) throw new Error('motor não encontrado: rode contra o servidor de dev');
  const original = engine.setTime.bind(engine);
  window.__wdSetTime = [];
  engine.setTime = (tick, instant) => {
    const start = performance.now();
    original(tick, instant);
    window.__wdSetTime.push(performance.now() - start);
  };
}

async function measureMap(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(BASE_URL);
  await signIn(page);
  await (await openCreateDialog(page, `Desempenho ${new Date().toISOString()}`)).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Escolher arquivo' }).click();
  const [width, height] = [2048, 1536];
  await (
    await chooser
  ).setFiles({ name: 'rnf.png', mimeType: 'image/png', buffer: makePng(width, height) });
  await page.waitForURL(/\?map=/, { timeout: 60_000 });
  const slider = page.getByRole('slider', { name: /Instante/ });
  await slider.waitFor();
  const endTick = Number(await slider.getAttribute('aria-valuemax'));
  const url = new URL(page.url());
  await page.evaluate(seedTokens, {
    worldId: url.pathname.split('/')[2],
    mapId: url.searchParams.get('map'),
    count: TOKENS,
    width,
    height,
    endTick,
  });
  await page.reload();
  await page.locator('wd-map-canvas [role="application"]:not([aria-busy])').waitFor();
  await page.waitForTimeout(1500);
  const listed = await page.locator('nav[aria-label="Tokens no mapa agora"] li').count();
  await page.evaluate(timeEngine);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

  console.log(`\n## RNF-01 e RNF-02 · Mapa com ${TOKENS} tokens (${listed} na lista acessível)\n`);
  console.log(
    '| CPU | Cenário | fps médio | p95 do quadro (ms) | quadros > 33 ms | setTime p50 (ms) | setTime p95 (ms) | setTime pior (ms) |',
  );
  console.log(
    '|-----|---------|-----------|--------------------|-----------------|------------------|------------------|-------------------|',
  );
  const play = page.getByRole('button', { name: 'Reproduzir', exact: true });
  const pause = page.getByRole('button', { name: 'Pausar', exact: true });
  const track = await page.locator('wd-timeline-bar section').boundingBox();
  for (const rate of CPU_RATES) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    for (const scenario of ['play', 'slider']) {
      await slider.focus();
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);
      await page.evaluate(() => (window.__wdSetTime = []));
      await page.evaluate(installFrameCollector);
      if (scenario === 'play') {
        await play.click();
        await page.waitForTimeout(SECONDS * 1000);
        await pause.click();
      } else {
        // Arrasta o cursor da linha do tempo de um lado a outro.
        const box = await slider.boundingBox();
        const y = box.y + box.height / 2;
        await page.mouse.move(box.x + box.width / 2, y);
        await page.mouse.down();
        const end = Date.now() + SECONDS * 1000;
        for (let i = 0; Date.now() < end; i++) {
          const f = (Math.sin(i / 20) + 1) / 2;
          await page.mouse.move(track.x + track.width * (0.15 + 0.7 * f), y);
        }
        await page.mouse.up();
      }
      const frames = stats(await page.evaluate(() => window.__wdFrames.stop()));
      const samples = await page.evaluate(() => window.__wdSetTime);
      const set = stats(samples);
      console.log(
        `| ${rate}× | ${scenario} | ${frames.fps.toFixed(1)} | ${fmt(frames.p95)} | ` +
          `${frames.long.toFixed(1)}% | ${fmt(set.p50)} | ${fmt(set.p95)} | ${fmt(set.worst)} |`,
      );
    }
  }
  await page.close();
}

// ── Execução ─────────────────────────────────────────────────────────────────────────────

// Sem estas flags, o Chrome reduz o rAF a 1 Hz quando a janela (--headed) fica encoberta.
const browser = await chromium.launch({
  headless: !HEADED,
  args: [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});
console.log(`Navegador: Chromium ${browser.version()} (${HEADED ? 'com janela' : 'headless'})`);
console.log(`Data: ${new Date().toISOString().slice(0, 10)}`);

if (wants('01') || wants('02')) await measureMap(browser);
if (wants('03') || wants('04')) {
  const root = buildOptimized();
  const server = await serve(root, STATIC_PORT);
  const url = `http://localhost:${STATIC_PORT}/`;
  if (wants('03')) await measureCover(browser, url);
  if (wants('04')) await measureBook(browser, url);
  server.close();
}
await browser.close();
