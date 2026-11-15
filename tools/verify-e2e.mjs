import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(THIS_DIR, '..');
const PREVIEW_PORT = Number(process.env.SPUD_E2E_PORT || 4173);
const BASE_URL = `http://127.0.0.1:${PREVIEW_PORT}`;
const TELEMETRY_URL = `${BASE_URL}/?telemetry=1`;

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Chrome executable not found. Set CHROME_PATH or install Chrome. Checked: ${candidates.join(', ')}`,
  );
}

const CHROME_PATH = findChromeExecutable();
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function assert(cond, message) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('Chrome debugger disconnected'));
      this.pending.clear();
    });
  }

  async connect() {
    await new Promise((resolvePromise, reject) => {
      this.ws.addEventListener('open', resolvePromise, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          if (msg.error) entry.reject(new Error(`CDP ${entry.method}: ${msg.error.message}`));
          else entry.resolve(msg.result);
        }
      } else if (msg.method) {
        const handlers = this.listeners.get(msg.method) || [];
        for (const h of handlers) h(msg.params || {});
      }
    });
  }

  on(method, handler) {
    const arr = this.listeners.get(method) || [];
    arr.push(handler);
    this.listeners.set(method, arr);
  }

  async send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return await new Promise((resolvePromise, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Chrome debugger is not connected'));
        return;
      }
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome debugger command timed out: ${method}`));
      }, 10000);
      this.pending.set(id, {
        method,
        resolve: (result) => { clearTimeout(timeout); resolvePromise(result); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      });
      this.ws.send(payload);
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async close() {
    this.ws.close();
  }
}

async function waitFor(fn, label, timeoutMs = 15000, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const val = await fn();
      if (val) return val;
    } catch (err) {
      lastErr = err;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}${lastErr ? `: ${lastErr.message}` : ''}`);
}

async function launchChromePass({ autoplayAllowed, viewport }) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'spud-cdp-'));
  const args = [
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-gpu-sandbox',
    `--window-size=${viewport.width},${viewport.height}`,
  ];
  if (autoplayAllowed) {
    args.push('--autoplay-policy=no-user-gesture-required');
  }
  const proc = spawn(CHROME_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let targets;
  try {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      try {
        const debugPort = readFileSync(join(userDataDir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
        const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
        if (res.ok) {
          const list = await res.json();
          const pageTarget = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
          if (pageTarget) {
            targets = pageTarget;
            break;
          }
        }
      } catch {
        // retry
      }
      await sleep(150);
    }
    if (!targets) throw new Error('Chrome CDP target did not appear');

    const cdp = new CDPClient(targets.webSocketDebuggerUrl);
    await cdp.connect();

    const errors = {
      consoleErrors: [],
      pageErrors: [],
      failedLocalRequests: [],
      applyDebugLogs: [],
      requestedUrls: [],
    };

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const reqUrls = new Map();
    cdp.on('Network.requestWillBeSent', (p) => {
      reqUrls.set(p.requestId, p.request.url);
      if (p.request.url.startsWith(BASE_URL)) {
        errors.requestedUrls.push(p.request.url);
      }
    });
    cdp.on('Network.responseReceived', (p) => {
      if (p.response.status >= 400 && p.response.url.startsWith(BASE_URL)) {
        errors.failedLocalRequests.push(`${p.response.status} ${p.response.url}`);
      }
    });
    cdp.on('Network.loadingFailed', (p) => {
      const url = reqUrls.get(p.requestId) || '';
      const isMediaAbort = p.errorText === 'net::ERR_ABORTED' && /\.(mp4|ogg|webm|mp3)(\?|$)/i.test(url);
      if (url.startsWith(BASE_URL) && !isMediaAbort) {
        errors.failedLocalRequests.push(`FAILED ${url}: ${p.errorText}`);
      }
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      const text = (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (text.includes('apply-debug')) {
        errors.applyDebugLogs.push(text);
      }
      if (p.type === 'error') {
        errors.consoleErrors.push(text);
      }
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
      errors.pageErrors.push(p.exceptionDetails?.text || JSON.stringify(p.exceptionDetails));
    });

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.isMobile ? 2 : 1,
      mobile: Boolean(viewport.isMobile),
    });

    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (() => {
          const tracked = [];
          const OrigAudio = window.Audio;
          window.__audioSpy = tracked;
          window.Audio = function(src) {
            const audio = new OrigAudio(src);
            const rec = {
              src: src || '',
              playCalls: 0,
              pauseCalls: 0,
              playTimestamps: [],
              get volume() { return audio.volume; },
              get paused() { return audio.paused; },
              get currentSrc() { return audio.currentSrc || audio.src; },
            };
            const origPlay = audio.play.bind(audio);
            const origPause = audio.pause.bind(audio);
            audio.play = function() {
              rec.playCalls += 1;
              rec.playTimestamps.push(performance.now());
              return origPlay();
            };
            audio.pause = function() {
              rec.pauseCalls += 1;
              return origPause();
            };
            tracked.push(rec);
            return audio;
          };
          window.Audio.prototype = OrigAudio.prototype;
        })();
      `,
    });

    return {
      cdp,
      errors,
      cleanup: async () => {
        try {
          await cdp.close();
        } catch {
          // ignore
        }
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        await sleep(300);
        try {
          rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        } catch {
          // ignore locked temp file on Windows
        }
      },
    };
  } catch (err) {
    try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    throw err;
  }
}

async function clickSelector(cdp, selector) {
  const rect = await cdp.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el || el.hidden || el.disabled) return null;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
  assert(rect && rect.w > 0 && rect.h > 0, `Expected visible clickable selector: ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
}

function vkFor(key) {
  if (key.length === 1) return key.toUpperCase().charCodeAt(0);
  if (key === 'ArrowDown') return 40;
  if (key === 'ArrowUp') return 38;
  if (key === 'ArrowLeft') return 37;
  if (key === 'ArrowRight') return 39;
  if (key === 'Escape') return 27;
  if (key === 'Enter') return 13;
  return 0;
}

async function pressKey(cdp, key, code, holdMs = 0) {
  const vk = vkFor(key);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
  if (holdMs > 0) await sleep(holdMs);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
}

async function walkToOpeningPoint(cdp, x, y) {
  for (const [axis, target, backward, forward] of [
    ['x', x, 'a', 'd'], ['y', y, 'w', 's'],
  ]) {
    const pos = () => cdp.eval(`window.__spudTelemetry().player.${axis}`);
    const start = await pos();
    if (Math.abs(start - target) <= 5) continue;
    const sign = Math.sign(target - start);
    const key = sign < 0 ? backward : forward;
    const code = `Key${key.toUpperCase()}`;
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vkFor(key) });
    try {
      await waitFor(async () => (target - await pos()) * sign <= 5, `manual movement toward ${axis}=${target}`, 13000, 30);
    } finally {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vkFor(key) });
    }
  }
}

async function walkAlongGuide(cdp, checkExpr, label, timeoutMs = 24000) {
  const deadline = Date.now() + timeoutMs;
  const held = new Set();
  const setKeys = async (want) => {
    for (const k of [...held]) {
      if (!want.includes(k)) {
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vkFor(k) });
        held.delete(k);
      }
    }
    for (const k of want) {
      if (!held.has(k)) {
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: vkFor(k) });
        held.add(k);
      }
    }
  };
  let lastPos = null;
  let stalledTicks = 0;
  try {
    while (Date.now() < deadline) {
      const state = await cdp.eval(`(() => {
        const done = (${checkExpr});
        if (done) return { done };
        const t = window.__spudTelemetry?.();
        if (!t?.player || !t?.guide?.path?.length) return { nav: null };
        const p = t.player;
        const candidates = t.guide.path.length > 1 ? t.guide.path.slice(1) : t.guide.path;
        const wp = candidates.find((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) > 10) || candidates[candidates.length - 1];
        return {
          p,
          center: t.guide.path[0],
          nav: { dx: wp.x - p.x, dy: wp.y - p.y },
        };
      })()`);
      if (state?.done) return state.done;
      const nav = state?.nav;
      if (nav && state?.p) {
        if (lastPos && Math.hypot(state.p.x - lastPos.x, state.p.y - lastPos.y) < 1.5) stalledTicks += 1;
        else stalledTicks = 0;
        lastPos = state.p;
        const targetVec = stalledTicks >= 2 && state.center
          ? { dx: state.center.x - state.p.x, dy: state.center.y - state.p.y }
          : nav;
        const keys = [];
        const threshold = stalledTicks >= 2 ? 0.5 : 3;
        if (targetVec.dx < -threshold) keys.push('ArrowLeft');
        else if (targetVec.dx > threshold) keys.push('ArrowRight');
        if (targetVec.dy < -threshold) keys.push('ArrowUp');
        else if (targetVec.dy > threshold) keys.push('ArrowDown');
        await setKeys(keys);
      } else {
        await setKeys([]);
      }
      await sleep(200);
    }
    const diag = await cdp.eval(`(() => { const t = window.__spudTelemetry?.(); return { room: t?.room, player: t?.player, guide: t?.guide }; })()`);
    throw new Error(`Timed out waiting for: ${label} (${JSON.stringify(diag)})`);
  } finally {
    await setKeys([]);
  }
}

function assertErrorsClean(errors, passName) {
  assert(errors.consoleErrors.length === 0, `[${passName}] consoleErrors: ${errors.consoleErrors.join('; ')}`);
  assert(errors.pageErrors.length === 0, `[${passName}] pageErrors: ${errors.pageErrors.join('; ')}`);
  assert(errors.failedLocalRequests.length === 0, `[${passName}] failedLocalRequests: ${errors.failedLocalRequests.join('; ')}`);
  assert(errors.applyDebugLogs.length === 0, `[${passName}] applyDebugLogs: ${errors.applyDebugLogs.join('; ')}`);
}

async function runPass1() {
  console.log('\n=== PASS 1A: Intro Original Audio -> Fade -> Menu Music Crossfade + Telemetry Security + PWA ===');
  const p1a = await launchChromePass({
    autoplayAllowed: true,
    viewport: { width: 1440, height: 900, isMobile: false },
  });
  try {
    const { cdp, errors } = p1a;
    await cdp.send('Page.navigate', { url: BASE_URL });

    const splashPlaying = await waitFor(() => cdp.eval(`(() => {
      const s = document.body.dataset.screen;
      const v = document.querySelector('.opening-video');
      if (s !== 'splash' || !v) return null;
      if (v.readyState < 2 || v.paused) return null;
      const menuAudios = (window.__audioSpy || []).filter((a) => a.src.includes('intro-theme.ogg'));
      const activePlays = menuAudios.reduce((n, a) => n + (a.paused ? 0 : 1), 0);
      return {
        screen: s,
        muted: v.muted,
        volume: v.volume,
        currentTime: v.currentTime,
        duration: v.duration,
        menuPlayingCount: activePlays,
        telemetryExposed: typeof window.__spudTelemetry !== 'undefined',
      };
    })()`), 'splash video playing unmuted');

    assert(splashPlaying.muted === false, `Expected unmuted intro video when autoplay permitted, got muted=${splashPlaying.muted}`);
    assert(splashPlaying.volume > 0.3, `Expected audible video volume, got ${splashPlaying.volume}`);
    assert(splashPlaying.menuPlayingCount === 0, 'Main menu music must NOT play on top of intro video start');
    assert(splashPlaying.telemetryExposed === false, 'window.__spudTelemetry must NOT be exposed in production without ?telemetry=1');
    console.log('Splash initial playback & prod telemetry gate OK:', splashPlaying);

    const pwaRes = await cdp.eval(`(async () => {
      const m = await fetch('/manifest.webmanifest');
      const sw = await fetch('/sw.js');
      const manifest = await m.json();
      return {
        manifestStatus: m.status,
        swStatus: sw.status,
        shortName: manifest.short_name,
        hasManifestLink: Boolean(document.querySelector('link[rel="manifest"]')),
      };
    })()`);
    assert(pwaRes.manifestStatus === 200 && pwaRes.swStatus === 200 && pwaRes.hasManifestLink && pwaRes.shortName === 'Spudnaut',
      `Expected valid PWA manifest & service worker: ${JSON.stringify(pwaRes)}`);

    let sawVolumeFade = false;
    let sawFadeClass = false;
    await waitFor(async () => {
      const snap = await cdp.eval(`(() => {
        const s = document.body.dataset.screen;
        const sec = document.querySelector('.screen-splash');
        const v = document.querySelector('.opening-video');
        const menuAudios = (window.__audioSpy || []).filter((a) => a.src.includes('intro-theme.ogg'));
        return {
          screen: s,
          hasFadeClass: Boolean(sec?.classList.contains('is-fading')),
          vol: v ? v.volume : null,
          t: v ? v.currentTime : null,
          dur: v ? v.duration : null,
          menuPlays: menuAudios.reduce((n, a) => n + a.playCalls, 0),
          menuVol: menuAudios[0]?.volume ?? 0,
          menuPaused: menuAudios[0]?.paused ?? true,
        };
      })()`);
      if (snap.vol !== null && snap.dur && (snap.dur - snap.t) < 0.9 && snap.vol < splashPlaying.volume) {
        sawVolumeFade = true;
      }
      if (snap.hasFadeClass) sawFadeClass = true;
      if (snap.screen === 'menu') {
        assert(snap.menuPlays >= 1 && !snap.menuPaused, `Expected menu music playing on menu transition: ${JSON.stringify(snap)}`);
        return snap;
      }
      return null;
    }, 'natural splash end -> menu transition', 10000, 120);

    assert(sawVolumeFade, 'Expected splash video audio volume to fade out smoothly near end');
    assert(sawFadeClass, 'Expected .screen-splash.is-fading visual fade near end');

    await sleep(900);
    const menuVolAfter = await cdp.eval(`(() => {
      const a = (window.__audioSpy || []).find((x) => x.src.includes('intro-theme.ogg'));
      return a ? { volume: a.volume, paused: a.paused } : null;
    })()`);
    assert(menuVolAfter && !menuVolAfter.paused && menuVolAfter.volume > 0.25, `Menu music should fade up: ${JSON.stringify(menuVolAfter)}`);
    console.log('Pass 1A natural transition & PWA check OK:', { sawVolumeFade, sawFadeClass, menuVolAfter });
    assertErrorsClean(errors, 'Pass 1A');
  } finally {
    await p1a.cleanup();
  }

  console.log('\n=== PASS 1B: Autoplay Fallback, Save Export, TrainingScene Isolation & WebP Habitat Checks ===');
  const p1b = await launchChromePass({
    autoplayAllowed: false,
    viewport: { width: 1440, height: 900, isMobile: false },
  });
  try {
    const { cdp, errors } = p1b;
    await cdp.send('Page.navigate', { url: TELEMETRY_URL });

    const fallbackState = await waitFor(() => cdp.eval(`(() => {
      if (document.body.dataset.screen !== 'splash') return null;
      const v = document.querySelector('.opening-video');
      const hint = document.querySelector('.intro-audio-hint');
      if (!v || !hint) return null;
      if (!v.paused && v.readyState >= 2) {
        return { muted: v.muted, hintHidden: hint.hidden };
      }
      return null;
    })()`), 'splash autoplay or fallback ready');

    if (fallbackState.muted) {
      assert(fallbackState.hintHidden === false, 'Expected .intro-audio-hint visible when muted fallback triggers');
      await clickSelector(cdp, '.intro-audio-hint');
      await sleep(100);
      const afterUnmute = await cdp.eval(`(() => {
        const v = document.querySelector('.opening-video');
        const hint = document.querySelector('.intro-audio-hint');
        const menuAudios = (window.__audioSpy || []).filter((a) => a.src.includes('intro-theme.ogg'));
        return {
          muted: v?.muted,
          hintHidden: hint?.hidden,
          menuPlayingCount: menuAudios.reduce((n, a) => n + (a.paused ? 0 : 1), 0),
        };
      })()`);
      assert(afterUnmute.muted === false && afterUnmute.hintHidden === true, `Expected audio unmuted after hint click: ${JSON.stringify(afterUnmute)}`);
      assert(afterUnmute.menuPlayingCount === 0, 'Clicking splash unmute hint must NOT start menu music early!');
    }

    await clickSelector(cdp, '.intro-skip');
    await waitFor(() => cdp.eval(`(() => {
      if (document.body.dataset.screen !== 'menu') return null;
      const a = (window.__audioSpy || []).find((x) => x.src.includes('intro-theme.ogg'));
      return a && !a.paused ? { screen: 'menu' } : null;
    })()`), 'menu screen & music after skip');

    // Settings -> test Save Export JSON recovery control cleanly -> back to menu.
    await clickSelector(cdp, '[data-menu="options"]');
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'options'`), 'options screen');
    await clickSelector(cdp, '.design-extra-settings summary');
    await clickSelector(cdp, '[data-export-save]');
    const exportStatus = await waitFor(() => cdp.eval(`(() => {
      const txt = document.querySelector('#opt-recovery-status')?.textContent?.trim() || '';
      return txt.includes('exported') ? txt : null;
    })()`), 'save export status feedback');
    console.log('Options Export JSON OK:', exportStatus);
    await clickSelector(cdp, '[data-options-back]');
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'menu' && Boolean(document.querySelector('.spud-options-overlay')?.hidden)`), 'back to menu');

    // Enter Training Deck via Story skip -> verify TrainingScene runs cleanly WITHOUT loading any Surface TMJ/PNG assets!
    await clickSelector(cdp, '[data-menu="training"]');
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'story'`), 'story intro');
    await clickSelector(cdp, '[data-story-skip]');
    const trainingSnap = await waitFor(() => cdp.eval(`(() => {
      const t = window.__spudTelemetry?.();
      return t && t.ready && t.activeMode === 'training' ? t : null;
    })()`), 'TrainingScene ready', 20000);
    assert(trainingSnap.activeMode === 'training', `Expected TrainingScene activeMode, got ${trainingSnap.activeMode}`);

    const surfaceLeakUrls = errors.requestedUrls.filter((u) => (
      u.includes('spudnaut-station.tmj')
      || u.includes('floor-plan.png')
      || u.includes('objects-sheet.png')
      || u.includes('/assets/maps/figma/layers/')
      || u.includes('spudnaut-station.webp')
    ));
    assert(surfaceLeakUrls.length === 0, `Surface assets must NOT load during TrainingScene: ${surfaceLeakUrls.join(', ')}`);
    console.log('TrainingScene asset isolation OK (0 Surface asset requests before Surface mission).');

    await clickSelector(cdp, '[data-training-exit]');
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'menu'`), 'menu after training exit');

    // Open Play -> play-intro video -> Traveller loadout -> Cadet 3-shift check -> Habitat -> check Moon hero & Launch check.
    await clickSelector(cdp, '[data-menu="play"]');
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'play-intro' && Boolean(document.querySelector('.intro-skip'))`), 'play intro video');
    await clickSelector(cdp, '.intro-skip');
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'lobby' && Boolean(document.querySelector('[data-specialist="traveller"]'))`), 'lobby traveller specialist');
    const bannerWidths = [];
    for (const specialist of ['repairman', 'farmer', 'traveller', 'researcher']) {
      const spriteName = specialist === 'traveller' ? 'explorer' : specialist;
      const ribbon = await waitFor(() => cdp.eval(`(() => {
        const sprite = document.querySelector('#loadout-hero-stage .spud-sprite-strip');
        const banner = document.querySelector('#loadout-class-banner');
        if (!sprite?.complete || !sprite.naturalWidth || !sprite.src.includes(${JSON.stringify(spriteName)})) return null;
        return { width: banner.offsetWidth, label: banner.textContent.trim().toLowerCase() };
      })()`), `${specialist} sprite and class ribbon`);
      assert(ribbon.label === specialist, 'the class ribbon follows the selected sprite');
      bannerWidths.push(ribbon.width);
      await clickSelector(cdp, '[data-specialist-next]');
    }
    assert(bannerWidths[1] < bannerWidths[3], 'the ribbon grows to fit longer names');
    for (const direction of ['prev', 'next']) {
      const hit = await cdp.eval(`(() => {
        const button = document.querySelector('[data-specialist-${direction}]');
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return rect.width >= 44 && rect.height >= 44 && button.contains(target);
      })()`);
      assert(hit, `the ${direction} carousel arrow has an unobstructed touch target`);
    }
    await clickSelector(cdp, '[data-specialist-prev]');
    await waitFor(() => cdp.eval(`document.querySelector('#loadout-class-banner').textContent.trim() === 'RESEARCHER'`), 'previous arrow wraps to Researcher');
    await pressKey(cdp, 'ArrowRight', 'ArrowRight');
    await waitFor(() => cdp.eval(`document.querySelector('#loadout-class-banner').textContent.trim() === 'REPAIRMAN'`), 'keyboard right wraps to Repairman');
    await clickSelector(cdp, '[data-color="red"]');
    await waitFor(() => cdp.eval(`document.querySelector('#loadout-hero-stage .spud-sprite-strip')?.src.includes('repairman-red')`), 'orange and red Repairman use the shared sprite preview');
    assert(await cdp.eval(`Boolean(document.querySelector('[data-lobby-back].spud-back-button .spud-back-arrow'))`), 'loadout uses the shared Back design');
    await clickSelector(cdp, '[data-difficulty="cadet"]');
    await clickSelector(cdp, '[data-lobby-next]');
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('.spud-habitat-hero-img'))`), 'habitat screen ready');
    assert(await cdp.eval(`Boolean(document.querySelector('[data-habitat-back].spud-back-button .spud-back-arrow'))`), 'habitat uses the shared Back design');
    await clickSelector(cdp, '[data-habitat-back]');
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('[data-lobby-next]'))`), 'habitat Back returns to loadout');
    await clickSelector(cdp, '[data-lobby-next]');
    const moonHero = await waitFor(() => cdp.eval(`(() => {
      const img = document.querySelector('.spud-habitat-hero-img');
      const src = img?.getAttribute('src') || '';
      return img && img.complete && img.naturalWidth > 0 && src.includes('design/moon.webp') ? src : null;
    })()`), 'Moon habitat hero loaded');
    await clickSelector(cdp, '[data-habitat-next]');
    const launchSummary = await waitFor(() => cdp.eval(`(() => {
      const txt = document.querySelector('#screen-root')?.textContent || '';
      return txt.includes('3 SHIFTS') && txt.includes('4 CORE') ? { ok: true } : null;
    })()`), 'Launch check displays 3 SHIFTS and 4 CORE metrics');
    console.log('Moon habitat & Cadet 3-shift Flight Check verified:', { moonHero, launchSummary });

    assertErrorsClean(errors, 'Pass 1B');
  } finally {
    await p1b.cleanup();
  }
}

async function enterMissionDay01(cdp, specialist = 'traveller', options = {}) {
  if (!options.alreadyOnMenu) {
    await cdp.send('Page.navigate', { url: TELEMETRY_URL });
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'splash'`), 'splash');
    await clickSelector(cdp, '.intro-skip');
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'menu'`), 'menu');
  }
  await clickSelector(cdp, '[data-menu="play"]');
  await waitFor(() => cdp.eval(`document.body.dataset.screen === 'play-intro' && Boolean(document.querySelector('.intro-skip'))`), 'play intro video');
  await clickSelector(cdp, '.intro-skip');
  await waitFor(() => cdp.eval(`document.body.dataset.screen === 'lobby' && Boolean(document.querySelector('[data-specialist]'))`), 'lobby');
  const specialistOrder = ['repairman', 'farmer', 'traveller', 'researcher'];
  const active = await cdp.eval(`document.querySelector('[data-specialist][aria-pressed=true]').dataset.specialist`);
  const steps = (specialistOrder.indexOf(specialist) - specialistOrder.indexOf(active) + specialistOrder.length) % specialistOrder.length;
  for (let step = 0; step < steps; step += 1) await clickSelector(cdp, '[data-specialist-next]');
  if (options.difficulty) {
    await clickSelector(cdp, `[data-difficulty="${options.difficulty}"]`);
  }
  await clickSelector(cdp, '[data-lobby-next]');
  await waitFor(() => cdp.eval(`Boolean(document.querySelector('[data-habitat-next]'))`), 'habitat screen');
  await clickSelector(cdp, '[data-habitat-next]');
  await waitFor(() => cdp.eval(`Boolean(document.querySelector('[data-launch-begin]'))`), 'launch check screen');
  await clickSelector(cdp, '[data-launch-begin]');
  await waitFor(() => cdp.eval(`document.body.dataset.screen === 'launch' && Boolean(document.querySelector('.intro-skip'))`), 'launch flight deck');
  await clickSelector(cdp, '.intro-skip');
  await waitFor(() => cdp.eval(`(() => {
    const t = window.__spudTelemetry?.();
    return t?.ready && t.room === 'Landing Pad' && t.frozen && !document.querySelector('#station-blackout').hidden
      && document.querySelector('.spud-commander-model img')?.naturalWidth > 0;
  })()`), 'Commander briefing and blackout at the Landing Pad', 20000);
  assert(await cdp.eval(`window.__spudTelemetry().guide === null && document.querySelector('#hud-special-alert').hidden`),
    'opening blackout has neither a path line nor an emergency warning');
  await clickSelector(cdp, '.has-commander [data-dialogue-next]');
  await waitFor(() => cdp.eval(`!window.__spudTelemetry?.()?.frozen`), 'blackout player movement enabled');
  for (const [x, y] of [[1696, 906], [896, 906], [896, 400], [856, 400]]) {
    await walkToOpeningPoint(cdp, x, y);
  }
  await waitFor(() => cdp.eval(`document.querySelector('[data-action="use"]')?.dataset.targetName.includes('Restore Station Power')`), 'reactor power switch in range');
  await clickSelector(cdp, '[data-action="use"]');
  await waitFor(() => cdp.eval(`document.querySelector('#station-blackout').hidden && Boolean(document.querySelector('.spud-dialogue-task-spotlight'))`),
    'restored vision and spotlight on Tasks');
  await clickSelector(cdp, '.has-commander [data-dialogue-next]');
  await waitFor(() => cdp.eval(`Boolean(document.querySelector('.shift-planner[open]:not([inert])'))`), 'day 01 shift planner');
  const layout = await cdp.eval(`(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      left: rect('.hud-top-left'),
      right: rect('.hud-top-right'),
      tasksBtn: rect('.hud-left-rail [data-action="tasks"]'),
      statusBtn: rect('.hud-left-rail [data-action="status"]'),
      hasBottomBars: Boolean(document.querySelector('#hud-status-bars')),
      hasQuickTasks: Boolean(document.querySelector('#hud-quick-tasks')),
      hasTopTaskCard: Boolean(document.querySelector('.hud-top-left .hud-task-card')),
      hasShiftMeta: Boolean(document.querySelector('.hud-shift-meta')),
      hasInteractionPrompt: Boolean(document.querySelector('#interaction-prompt')),
      hasDayClock: Boolean(document.querySelector('#day-clock')),
      planningTimer: document.querySelector('#planning-timer')?.textContent?.trim() || '',
      width: innerWidth, height: innerHeight,
    };
  })()`);
  assert(layout.left.top < layout.height / 2 && layout.left.left < layout.width / 2, 'upper-left rail');
  assert(layout.right.top < layout.height / 2 && layout.right.right > layout.width / 2, 'upper-right map and settings');
  assert(layout.statusBtn.top > layout.tasksBtn.top, 'status button positioned lower than tasks button');
  assert(!layout.hasBottomBars && !layout.hasQuickTasks && !layout.hasTopTaskCard, 'top task summary, 3 quick tasks, and bottom status bars removed');
  assert(!layout.hasShiftMeta && !layout.hasInteractionPrompt && !layout.hasDayClock, 'shift meta pills, gameplay clock, and interaction prompt removed');
  assert(layout.planningTimer.startsWith('PICK IN '), 'card selection timer visible in shift planner');
  assert(await cdp.eval(`document.querySelectorAll('[data-offer]').length === 6
    && document.querySelectorAll('#planning-status-bars meter').length === 4`), 'six offers and four preview meters');
  console.log('HUD layout, card selection timer, four gauges, and six assignment offers verified.');

  await startPlannedShift(cdp, { ...options, expectHudBriefing: true });
}

async function startPlannedShift(cdp, options = {}) {
  await cdp.eval(`(() => {
    const allOffers = Array.from(document.querySelectorAll('.shift-planner [data-offer]'));
    const taskPlan = ${JSON.stringify(options.tasks ?? [])};
    const offers = taskPlan.length
      ? taskPlan.map(id => allOffers.find(button => button.dataset.offer === id))
      : allOffers.slice(0, 3);
    if (offers.some(button => !button)) {
      throw new Error('Unavailable planned task. Requested ' + taskPlan.join(', ') + '. Offered ' + allOffers.map(button => button.dataset.offer).join(', '));
    }
    for (const btn of offers) btn.click();
  })()`);
  await waitFor(() => cdp.eval(`(() => {
    const c = document.querySelector('[data-planning-confirm]');
    return c && !c.disabled;
  })()`), 'planning confirm enabled');
  await clickSelector(cdp, '[data-planning-confirm]');

  if (options.expectHudBriefing) {
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('[data-dialogue-key="T"]'))`), 'Commander asks for T');
    await pressKey(cdp, 'v', 'KeyV');
    await pressKey(cdp, 'Escape', 'Escape');
    await cdp.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true }))`);
    assert(await cdp.eval(`Boolean(document.querySelector('[data-dialogue-key="T"]'))
      && document.querySelector('#hud-drawer-panel').hidden`), 'wrong key, Escape, and synthetic T cannot advance the briefing');
    await pressKey(cdp, 't', 'KeyT');
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('[data-dialogue-key="V"]'))
      && Boolean(document.querySelector('#hud-drawer-panel[data-mode="tasks"]:not([hidden])'))
      && document.querySelectorAll('#hud-tasks-list .hud-task-card-item').length === 3`), 'T opens the three chosen tasks');
    await pressKey(cdp, 't', 'KeyT');
    assert(await cdp.eval(`Boolean(document.querySelector('[data-dialogue-key="V"]'))`), 'pressing T again does not complete the Status step');
    await cdp.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', bubbles: true }))`);
    assert(await cdp.eval(`Boolean(document.querySelector('[data-dialogue-key="V"]'))
      && Boolean(document.querySelector('#hud-drawer-panel[data-mode="tasks"]:not([hidden])'))`), 'synthetic V cannot open Status');
    await pressKey(cdp, 'v', 'KeyV');
    await waitFor(() => cdp.eval(`(() => {
      const drawer = document.querySelector('#hud-drawer-panel[data-mode="status"]:not([hidden])');
      const highlight = document.querySelector('#modal-root .spud-dialogue-task-spotlight');
      const line = document.querySelector('.dialogue-line')?.textContent;
      if (!drawer || !highlight || !line?.includes('Life, Power, Research, and Farm')
        || document.querySelector('[data-dialogue-key]') || drawer.querySelectorAll('.hud-status-card').length !== 4) return false;
      const panel = drawer.getBoundingClientRect();
      const spot = highlight.getBoundingClientRect();
      return spot.left <= panel.left && spot.right >= panel.right && spot.top <= panel.top && spot.bottom >= panel.bottom;
    })()`), 'V reveals the final line and highlights all four Status readings');
    await clickSelector(cdp, '#modal-root [data-dialogue-next]');
    await pressKey(cdp, 'Escape', 'Escape');
    await pressKey(cdp, 'm', 'KeyM');
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('.station-map-dialog[open]'))`), 'M opens the map after the briefing');
    await pressKey(cdp, 'Escape', 'Escape');
  }

  await waitFor(() => cdp.eval(`(() => {
    const t = window.__spudTelemetry?.();
    return t && t.ready && t.activeMode === 'surface' && !t.frozen ? t : null;
  })()`), 'surface station ready', 20000).catch(async error => {
    console.error(await cdp.eval(`({ telemetry: window.__spudTelemetry?.(), fallback: document.querySelector('#scene-fallback')?.textContent,
      modal: document.querySelector('#modal-root')?.textContent })`));
    throw error;
  });
}

function insideBounds(x, y, b) {
  return x >= b.x - 1 && x <= b.x + b.width + 1 && y >= b.y - 1 && y <= b.y + b.height + 1;
}

async function solveActiveMinigame(cdp) {
  await waitFor(() => cdp.eval(`Boolean(document.querySelector('.spud-console-tablet #task-body'))`), 'assignment minigame');
  await cdp.eval(`document.querySelector('#minigame-tip:not([hidden]) [data-minigame-ready]')?.click();`);
  const kindInfo = await cdp.eval(`(() => {
    const host = document.querySelector('#task-body');
    if (host.querySelector('.wiring-board')) return 'wiring';
    if (host.querySelector('.signal-grid')) return 'signal';
    if (host.querySelector('[data-pipe-piece]')) return 'pipes';
    if (host.querySelector('[data-load-folder]')) return 'folders';
    if (host.querySelector('[data-grow-light]')) return 'grow-plant';
    if (host.querySelector('[data-circuit-slider]')) return 'circuit-slider';
    if (host.querySelector('[data-power-switch]')) return 'power-switches';
    if (host.querySelector('input[type=range]')) return 'slider';
    if (host.querySelector('.assignment-grid')) return 'tiles';
    return 'unknown';
  })()`);

  if (kindInfo === 'pipes') {
    await cdp.eval(`document.querySelectorAll('[data-pipe-piece]').forEach(button => {
      for (let i = 0; i < 4 && !button.classList.contains('is-aligned'); i++) button.click();
    }); document.querySelector('[data-run-water]').click();`);
  } else if (kindInfo === 'folders') {
    await cdp.eval(`document.querySelectorAll('[data-load-folder]').forEach(button => button.click()); document.querySelector('[data-send-folders]').click();`);
  } else if (kindInfo === 'grow-plant') {
    await clickSelector(cdp, '[data-grow-light]');
  } else if (kindInfo === 'circuit-slider') {
    await cdp.eval(`(() => {
      const slider = document.querySelector('[data-circuit-slider]');
      slider.value = slider.getAttribute('aria-label').match(/\\d+/)[0];
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-lock-slider]').click();
    })()`);
  } else if (kindInfo === 'power-switches') {
    await cdp.eval(`document.querySelectorAll('[data-power-switch]:not(.is-matched)').forEach(button => button.click()); document.querySelector('[data-reset-switches]').click();`);
  } else if (kindInfo === 'slider') {
    await cdp.eval(`for (let turn = 0; turn < 6; turn += 1) {
      const slider = document.querySelector('#task-body input[type=range]:not(:disabled)');
      if (!slider) break;
      slider.value = parseInt(slider.closest('label').style.getPropertyValue('--target'), 10);
      slider.dispatchEvent(new Event('change'));
    }`);
  } else if (kindInfo === 'tiles') {
    await cdp.eval(`document.querySelectorAll('#task-body .assignment-grid button').forEach(button => button.click());`);
  } else if (kindInfo === 'signal') {
    await cdp.eval(`document.querySelector('.assignment-watch').click();`);
    const pattern = [];
    for (let cue = 0; cue < 4; cue += 1) {
      const pad = await waitFor(() => cdp.eval(`(() => {
        const pads = [...document.querySelectorAll('.signal-grid button')];
        const index = pads.findIndex(button => button.classList.contains('is-flashing'));
        return index >= 0 && !${JSON.stringify(pattern)}.includes(index) ? { index } : null;
      })()`), 'signal pattern cue');
      pattern.push(pad.index);
    }
    await waitFor(() => cdp.eval(`document.querySelector('.assignment-game-status').textContent.includes('Your turn')`), 'signal pattern ready');
    await cdp.eval(`(() => {
      const pads = document.querySelectorAll('.signal-grid button');
      ${JSON.stringify(pattern)}.forEach(index => pads[index].click());
    })()`);
  }

  else if (kindInfo === 'wiring') {
    await cdp.eval(`(() => {
      const left = Array.from(document.querySelectorAll('#task-body .wire-node.left'));
      const right = Array.from(document.querySelectorAll('#task-body .wire-node.right'));
      for (const l of left) {
        const col = l.style.getPropertyValue('--wire');
        const match = right.find((r) => r.style.getPropertyValue('--wire') === col && !r.classList.contains('matched'));
        if (match) {
          l.click();
          match.click();
        }
      }
    })()`);
  }

  await waitFor(() => cdp.eval(`Boolean(document.querySelector('.task-result-card [data-result-continue]'))`), `task result card (${kindInfo})`, 8000);
  await clickSelector(cdp, '.task-result-card [data-result-continue]');
}

async function finishAssignedTasks(cdp, { waitForBunk = false } = {}) {
  for (let taskIdx = 0; taskIdx < 6; taskIdx += 1) {
    if (await cdp.eval(`Boolean(document.querySelector('.earth-report-full'))`)) break;
    const isTasksOpen = await cdp.eval(`document.querySelector('[data-action="tasks"]')?.getAttribute('aria-expanded') === 'true'`);
    if (!isTasksOpen) {
      await clickSelector(cdp, '[data-action="tasks"]');
    }
    const nextTask = await cdp.eval(`(() => {
      const btn = document.querySelector('#hud-tasks-list [data-drawer-walk-task]:not([disabled])');
      if (!btn) return null;
      return {
        id: btn.dataset.drawerWalkTask,
        title: (btn.querySelector('.hud-task-item-title')?.textContent || '').trim(),
      };
    })()`);
    if (!nextTask) break;
    await clickSelector(cdp, `#hud-tasks-list [data-drawer-walk-task="${nextTask.id}"]`);

    await walkAlongGuide(cdp, `((expected) => {
      const btn = document.querySelector('[data-action="use"]');
      if (!btn || btn.disabled) return null;
      const targetName = (btn.dataset.targetName || '').toUpperCase();
      if (expected.id.startsWith('emergency-')) {
        return targetName.includes('DAMAGED') || targetName.includes('JUNCTION') || targetName.includes('SEAM') || targetName.includes('ARRAY') || targetName.includes('CONDUIT') ? targetName : null;
      }
      if (expected.title && !targetName.includes(expected.title.toUpperCase())) return null;
      return btn.dataset.targetName || 'ready';
    })(${JSON.stringify(nextTask)})`, `arrived at task ${nextTask.id} (${nextTask.title})`, 32000)
      .catch(async error => {
        console.error(await cdp.eval(`({ player: window.__spudTelemetry?.()?.player, targetName: document.querySelector('[data-action="use"]')?.dataset.targetName,
          toast: document.querySelector('#toast')?.textContent, drawer: document.querySelector('[data-action=tasks]')?.getAttribute('aria-expanded') })`));
        throw error;
      });

    await clickSelector(cdp, '[data-action="use"]');
    if (nextTask.id.startsWith('emergency-')) {
      assert(await cdp.eval(`document.querySelector('#hud')?.classList.contains('is-red-alert')`), 'red-alert blackout active during emergency');
      await waitFor(() => cdp.eval(`document.querySelector('.dialogue-line')?.textContent.includes('huge cloud came from the Sun')`),
        'Commander explains the Sun Cloud on first arrival at the airlock');
      assert(await cdp.eval(`(() => {
        const t = window.__spudTelemetry();
        return t.room === 'Landing Pad' && document.querySelector('#hud-special-alert-text').textContent === 'Sun Cloud'
          && !document.querySelector('[data-disaster-tool]');
      })()`), 'only the airlock has the Sun Cloud repair and Commander speaks before the cards');
      await clickSelector(cdp, '.has-commander [data-dialogue-next]');
      await waitFor(() => cdp.eval(`Boolean(document.querySelector('.disaster-card'))`), 'damaged area repair modal');
      const { type, id } = await cdp.eval(`JSON.parse(localStorage.getItem('spudnaut-cooperative-trial-save-v8')).activeTrial.donkiReport`);
      assert(type === 'CME' && id === 'e2e-cme', 'later shift has a separate DONKI emergency');
      assert(await cdp.eval(`Array.from(document.querySelectorAll('[data-disaster-tool] strong'), card => card.textContent).join(',') === 'Power Wrench,Shield Patch,Sensor Fixer'`),
        'emergency panel offers the three kid-friendly repair cards');
      await clickSelector(cdp, '[data-disaster-tool="power"]');
      await waitFor(() => cdp.eval(`Boolean(document.querySelector('.emergency-rewind'))`), 'wrong card rewinds a later emergency');
      await waitFor(() => cdp.eval(`!document.querySelector('.emergency-rewind') && window.__spudTelemetry()?.guide?.isEmergency`), 'red route returns after rewind');
      await walkAlongGuide(cdp, `document.querySelector('[data-action="use"]:enabled')?.dataset.targetName.includes('Airlock Shield')`, 'revisit the airlock repair', 32000);
      await clickSelector(cdp, '[data-action="use"]');
      await waitFor(() => cdp.eval(`Boolean(document.querySelector('[data-disaster-tool="life"]'))
        && !document.querySelector('.has-commander')`), 'revisited repair goes straight to the cards');
      await clickSelector(cdp, '[data-disaster-tool="life"]');
      await waitFor(() => cdp.eval(`!document.querySelector('#hud')?.classList.contains('is-red-alert')`), 'red-alert clears after repair');
      const repair = await cdp.eval(`(() => {
        const trial = JSON.parse(localStorage.getItem('spudnaut-cooperative-trial-save-v8')).activeTrial;
        return { pending: trial.pendingDisaster, completed: trial.completed, accusation: Boolean(document.querySelector('[data-culprit-guess]')) };
      })()`);
      assert(!repair.pending && repair.completed.includes(nextTask.id) && !repair.accusation,
        `expected repair to be completed and saved immediately: ${JSON.stringify(repair)}`);
      console.log(`Repaired ${type} space-weather damage (${nextTask.id}).`);
    } else {
      await solveActiveMinigame(cdp);
      console.log(`Completed ${nextTask.title}.`);
    }
  }

  if (waitForBunk) {
    assert(await cdp.eval(`(() => {
      const trial = JSON.parse(localStorage.getItem('spudnaut-cooperative-trial-save-v8')).activeTrial;
      return trial.completed.length === 3 && trial.phase === 'playing' && trial.eventId === 'station-blackout';
    })()`), 'Day 1 ends only after the Crew Bunk interaction');
    await pressKey(cdp, 'Escape', 'Escape');
    return;
  }

  const reportReached = await waitFor(() => cdp.eval(`(() => {
    const report = document.querySelector('.earth-report-full');
    if (!report) return null;
    return {
      title: report.querySelector('#report-screen-title')?.textContent?.trim(),
      doneBadges: report.querySelectorAll('.report-task .is-done').length,
      totalBadges: report.querySelectorAll('.report-task').length,
    };
  })()`), 'Shift Telemetry Report after completed tasks', 8000);
  assert(reportReached.doneBadges >= 3 && reportReached.doneBadges === reportReached.totalBadges,
    `Expected all assigned task badges completed on report: ${JSON.stringify(reportReached)}`);
  await waitFor(() => cdp.eval(`Boolean(document.querySelector('#modal-root [data-dialogue-next]'))`), 'Commander celebrates finishing all tasks');
  while (await cdp.eval(`Boolean(document.querySelector('#modal-root [data-dialogue-next]'))`)) {
    await clickSelector(cdp, '#modal-root [data-dialogue-next]');
  }
}

async function playGuidedEmergency(cdp) {
  await clickSelector(cdp, '[data-action="map"]');
  await waitFor(() => cdp.eval(`Boolean(document.querySelector('.station-map-dialog[open] [data-map-walk-label="Crew Bunk"]'))`), 'crew bunk marker');
  await clickSelector(cdp, '[data-map-walk-label="Crew Bunk"]');
  await walkAlongGuide(cdp, `document.querySelector('[data-action="use"]')?.dataset.targetName.includes('Rest Until Day 2')`, 'crew bunk', 32000);
  await clickSelector(cdp, '[data-action="use"]');
  await waitFor(() => cdp.eval(`Boolean(document.querySelector('[data-bed-confirm]'))`), 'Crew Bunk rest confirmation');
  await clickSelector(cdp, '[data-bed-confirm]');
  await waitFor(() => cdp.eval(`document.querySelector('.spud-dialogue-backdrop.is-guide-briefing')
    && window.__spudTelemetry()?.guide?.isEmergency && window.__spudTelemetry().guide.path.length > 0
    && !document.querySelector('#hud-special-alert').hidden
    && document.querySelector('#hud-special-alert-text').textContent === 'Sun Flash'
    && !document.querySelector('[data-disaster-tool]')`),
    'Day 2 guided emergency briefing and highlighted route');
  await clickSelector(cdp, '.has-commander [data-dialogue-next]');
  await walkAlongGuide(cdp, `document.querySelector('[data-action="use"]')?.dataset.targetName.includes('Power Box')`, 'guided solar flare repair', 40000);
  await clickSelector(cdp, '[data-action="use"]');
  await waitFor(() => cdp.eval(`document.querySelector('.dialogue-line')?.textContent.includes('bright flash came from the Sun')`), 'Commander explains the Sun Flash');
  await clickSelector(cdp, '.has-commander [data-dialogue-next]');
  await waitFor(() => cdp.eval(`document.querySelectorAll('[data-disaster-tool]').length === 3
    && document.querySelector('.disaster-warning a')?.href.endsWith('/49453/-1')`), 'three repair cards and DONKI source');
  await clickSelector(cdp, '[data-disaster-tool="life"]');
  await waitFor(() => cdp.eval(`document.querySelector('.disaster-clue[role="status"]')?.textContent.includes('try another tool')
    && !document.querySelector('.emergency-rewind')`), 'wrong repair card allows a retry in place');
  await clickSelector(cdp, '[data-disaster-tool="power"]');
  await waitFor(() => cdp.eval(`document.querySelector('.dialogue-line')?.textContent.includes('Moon hero')
    && document.querySelector('#hud-special-alert').hidden`), 'Commander congratulates the player and emergency clears');
  await clickSelector(cdp, '.has-commander [data-dialogue-next]');
}

async function runPass2() {
  console.log('\n=== PASS 2: Tutorial Walkthrough, Patrols, EVA Hazard + Life Drain, Modal Freeze & Full Day 01 Report ===');
  const p2 = await launchChromePass({
    autoplayAllowed: true,
    viewport: { width: 1440, height: 900, isMobile: false },
  });
  try {
    const { cdp, errors } = p2;
    // Seed a repeatable successful roll, and provide a test fixture without using NASA quota.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      const originalFetch = window.fetch;
      window.fetch = (resource, init) => {
        const url = String(resource);
        if (!url.startsWith('https://ccmc.gsfc.nasa.gov/DONKI-API/get/') && !url.startsWith('https://api.nasa.gov/DONKI/')) return originalFetch(resource, init);
        return Promise.resolve(Response.json(url.includes('/FLR?')
          ? [{ flrID: 'e2e-flare', beginTime: '2026-11-14T07:33Z', classType: 'M1.7', link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/FLR/49453/-1' }]
          : url.includes('/CME?') ? [{ activityID: 'e2e-cme', startTime: '2026-11-13T01:48Z' }] : []));
      };
      crypto.getRandomValues = array => { array.fill(7); return array; };
    ` });
    await enterMissionDay01(cdp, 'researcher', {
      difficulty: 'cadet', testRewind: true, tasks: ['upload-admin', 'grow-light-balance', 'med-pipes'],
    });

    const stationCrew = ['chip', 'pip', 'rover', 'tater'];
    // Sample the station crew over ~4.2 seconds (14 x 300ms).
    const samples = [];
    for (let i = 0; i < 14; i += 1) {
      const snap = await cdp.eval(`window.__spudTelemetry?.()`);
      const crewIds = snap?.crew?.map(npc => npc.id).sort();
      assert(crewIds?.join(',') === stationCrew.join(','), `Expected the four station NPCs, got ${crewIds}`);
      for (const npc of snap.crew) {
        assert(npc.patrolBounds, `Missing patrolBounds for ${npc.id}`);
        assert(
          insideBounds(npc.x, npc.feetY, npc.patrolBounds),
          `NPC ${npc.id} left patrolBounds! pos=(${npc.x.toFixed(1)}, ${npc.feetY.toFixed(1)}), bounds=${JSON.stringify(npc.patrolBounds)}`,
        );
      }
      const rover = snap.crew.find((c) => c.id === 'rover');
      assert(rover && rover.helmeted === true, 'Rover must wear sealed EVA helmet in Landing Pad staging');
      assert(rover.x >= 1460 && rover.x <= 1940 && rover.feetY >= 1370 && rover.feetY < 1760, `Rover must be staged inside Landing Pad: ${JSON.stringify(rover)}`);
      samples.push(snap);
      await sleep(300);
    }

    let maxTotalTravel = 0;
    const travelById = {};
    for (const id of stationCrew) {
      let travel = 0;
      for (let i = 1; i < samples.length; i += 1) {
        const prev = samples[i - 1].crew.find((c) => c.id === id);
        const curr = samples[i].crew.find((c) => c.id === id);
        travel += Math.hypot(curr.x - prev.x, curr.y - prev.y);
      }
      travelById[id] = Math.round(travel);
      maxTotalTravel = Math.max(maxTotalTravel, travel);
    }
    assert(maxTotalTravel >= 8, `Expected crew NPCs to actively patrol inside their rooms, travelById=${JSON.stringify(travelById)}`);
    console.log('Crew patrol distance (px, all inside room bounds):', travelById);

    // Verify Tasks & Status vertical rail expands to the right with progress & 4 systems.
    await clickSelector(cdp, '[data-action="tasks"]');
    const tasksExpand = await waitFor(() => cdp.eval(`(() => {
      const panel = document.querySelector('#hud-drawer-panel[data-mode="tasks"]:not([hidden])');
      const rail = document.querySelector('.hud-left-rail');
      if (!panel || !rail) return null;
      const p = panel.getBoundingClientRect();
      const r = rail.getBoundingClientRect();
      return {
        panelLeft: p.left,
        railRight: r.right,
        taskLabel: document.querySelector('#task-label')?.textContent?.trim(),
        taskCards: document.querySelectorAll('#hud-tasks-list .hud-task-card-item').length,
        emergencyCards: document.querySelectorAll('#hud-tasks-list .hud-task-card-item.is-emergency').length,
      };
    })()`), 'tasks drawer expanded to the right');
    assert(tasksExpand.panelLeft >= tasksExpand.railRight - 2
      && tasksExpand.taskCards === 3
      && tasksExpand.emergencyCards === 0
      && tasksExpand.taskLabel === '0 / 3',
      `Tasks drawer must show the three selected Day 1 assignments: ${JSON.stringify(tasksExpand)}`);

    await clickSelector(cdp, '[data-action="status"]');
    const statusExpand = await waitFor(() => cdp.eval(`(() => {
      const panel = document.querySelector('#hud-drawer-panel[data-mode="status"]:not([hidden])');
      const rail = document.querySelector('.hud-left-rail');
      if (!panel || !rail) return null;
      const p = panel.getBoundingClientRect();
      const r = rail.getBoundingClientRect();
      const names = Array.from(document.querySelectorAll('#hud-systems .hud-status-card-head')).map(el => el.textContent.trim().toUpperCase());
      return { panelLeft: p.left, railRight: r.right, names };
    })()`), 'status drawer expanded to the right');
    assert(statusExpand.panelLeft >= statusExpand.railRight - 2
      && ['LIFE', 'POWER', 'RESEARCH', 'FARM'].every(n => statusExpand.names.includes(n)),
      `Status drawer must expand to the right with Life, Power, Research, Farm: ${JSON.stringify(statusExpand)}`);
    await clickSelector(cdp, '[data-action="status"]');

    await clickSelector(cdp, '[data-action="map"]');
    await waitFor(() => cdp.eval(`(() => {
      const art = document.querySelector('.game-map-dialog[open] .spud-map-art');
      return art?.complete && art.naturalWidth > 0;
    })()`), 'updated station map artwork loads');
    await clickSelector(cdp, '[data-map-walk-label="Researcher Room"]');
    await walkAlongGuide(cdp, `(() => {
      const t = window.__spudTelemetry?.();
      return t?.room === 'Researcher Room' && Math.abs(t.player.x - 1616) <= 36
        && Math.abs(t.player.y - 282) <= 36;
    })()`, 'guided walk reaches the research workbench', 24000);

    // The workbench collision starts at the y=288 tile edge.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await pressKey(cdp, 'ArrowUp', 'ArrowUp', 450);
      const player = await cdp.eval(`window.__spudTelemetry?.()?.player`);
      assert(player?.y >= 277 && player?.y <= 280,
        `Player passed through or stopped short of the workbench: ${JSON.stringify(player)}`);
    }
    console.log('Researcher Room route and repeated workbench collision verified.');

    // Map guidance to Landing Pad -> verify auto helmet seal.
    await clickSelector(cdp, '[data-action="map"]');
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('.game-map-dialog[open]'))`), 'map dialog open');
    await clickSelector(cdp, '[data-map-walk-label="Landing Pad"]');

    await walkAlongGuide(cdp, `(() => {
      const room = document.querySelector('#hud-room')?.textContent?.trim();
      const helmet = document.querySelector('#hud-helmet-label')?.textContent?.trim();
      const t = window.__spudTelemetry?.();
      return room === 'LANDING PAD' && helmet === 'EVA: SEALED' && t?.player?.helmeted ? { room, helmet } : null;
    })()`, 'player walks into Landing Pad and auto-seals helmet', 24000);

    // Push south against the sealed Landing Pad bulkhead: player must NOT phase onto the exterior apron.
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await sleep(1600);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    const bulkheadCheck = await cdp.eval(`(() => {
      const t = window.__spudTelemetry?.();
      return { y: t?.player?.y, room: document.querySelector('#hud-room')?.textContent?.trim() };
    })()`);
    assert(typeof bulkheadCheck.y === 'number' && bulkheadCheck.y < 1776 && bulkheadCheck.room !== 'EXTERIOR PAD',
      `Sealed bulkhead must block walking onto exterior apron: ${JSON.stringify(bulkheadCheck)}`);
    console.log('Landing Pad bulkhead collision holds:', bulkheadCheck);

    // Open Status drawer briefly to capture current Life reading before unsealing outdoors.
    const readLifeMetric = async () => cdp.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('#hud-systems .system-bar'));
      for (const card of cards) {
        const text = card.querySelector('.hud-status-card-detail')?.textContent || '';
        const match = text.match(/Life\\s+(\\d+)/i);
        if (match) return Number(match[1]);
      }
      return null;
    })()`);
    const lifeBefore = await readLifeMetric();
    await pressKey(cdp, 'g', 'KeyG');
    const hazardVisible = await waitFor(() => cdp.eval(`(() => {
      const warn = document.querySelector('#hud-eva-warning');
      const btn = document.querySelector('#hud-helmet-btn');
      return warn && !warn.hidden && btn?.classList.contains('is-hazard') ? true : null;
    })()`), 'unsealed EVA vacuum hazard banner');
    assert(hazardVisible, 'Expected #hud-eva-warning banner when unsealing outdoors');
    await sleep(1650);
    const lifeAfter = await readLifeMetric();
    assert(typeof lifeBefore === 'number' && typeof lifeAfter === 'number' && lifeAfter < lifeBefore,
      `Expected Life to drain while unsealed outdoors (before=${lifeBefore}, after=${lifeAfter})`);
    await pressKey(cdp, 'g', 'KeyG');
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('#hud-eva-warning')?.hidden)`), 'EVA hazard banner clears on re-seal');
    console.log(`EVA hazard warning + Life drain verified (Life ${lifeBefore} -> ${lifeAfter}, cleared cleanly on re-seal).`);

    // Walk toward Rover outdoors & open dialogue -> check inert + zero drift.
    let roverPromptReady = null;
    for (let step = 0; step < 30; step += 1) {
      roverPromptReady = await cdp.eval(`(() => {
        const btn = document.querySelector('[data-action="use"]');
        const name = (btn?.dataset.targetName || '').toUpperCase();
        return btn && !btn.disabled && name.includes('ROVER') ? btn.dataset.targetName.trim() : null;
      })()`);
      if (roverPromptReady) break;
      const delta = await cdp.eval(`(() => {
        const t = window.__spudTelemetry?.();
        const p = t.player;
        const r = t.crew.find((c) => c.id === 'rover');
        return { dx: r.x - p.x, dy: r.y - p.y };
      })()`);
      const k = Math.abs(delta.dx) >= Math.abs(delta.dy)
        ? (delta.dx > 0 ? ['ArrowRight', 39] : ['ArrowLeft', 37])
        : (delta.dy > 0 ? ['ArrowDown', 40] : ['ArrowUp', 38]);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k[0], code: k[0], windowsVirtualKeyCode: k[1] });
      await sleep(180);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k[0], code: k[0], windowsVirtualKeyCode: k[1] });
    }
    assert(roverPromptReady, 'Expected Rover interaction prompt within 30 steps outdoors');
    await clickSelector(cdp, '[data-action="use"]');

    const dlg = await waitFor(() => cdp.eval(`(() => {
      const card = document.querySelector('.spud-dialogue-arcade');
      const img = card?.querySelector('img');
      const telemetry = window.__spudTelemetry?.();
      if (!card || !img?.complete || !img.naturalWidth || !telemetry?.frozen) return null;
      return {
        speaker: card.querySelector('h2')?.textContent?.trim(),
        imgSrc: img.getAttribute('src'),
        imgLoaded: img.complete && img.naturalWidth > 0,
        hudInert: document.querySelector('#hud')?.inert,
        sceneInert: document.querySelector('#scene-shell')?.inert,
        telemetry,
      };
    })()`), 'Rover dialogue open');

    assert(dlg.speaker === 'Rover', `Expected Rover dialogue, got ${dlg.speaker}`);
    assert(dlg.imgSrc === '/assets/ui/spudnaut/portrait-traveller.png' && dlg.imgLoaded, `Expected loaded Rover traveller portrait: ${JSON.stringify(dlg)}`);
    assert(dlg.hudInert === true && dlg.sceneInert === true, 'HUD and SceneShell must be inert during modal');
    assert(dlg.telemetry.frozen === true, 'Scene telemetry must report frozen=true while modal open');

    const freezeBefore = dlg.telemetry.crew;
    await sleep(650);
    const freezeAfter = await cdp.eval(`window.__spudTelemetry?.()?.crew`);
    let maxModalDelta = 0;
    for (const beforeNpc of freezeBefore) {
      const afterNpc = freezeAfter.find((n) => n.id === beforeNpc.id);
      maxModalDelta = Math.max(maxModalDelta, Math.hypot(afterNpc.x - beforeNpc.x, afterNpc.y - beforeNpc.y));
    }
    assert(maxModalDelta < 0.01, `Crew NPCs moved ${maxModalDelta}px during open modal!`);
    for (let page = 0; page < 5; page += 1) {
      const hasNext = await cdp.eval(`Boolean(document.querySelector('.spud-dialogue-arcade [data-dialogue-next]'))`);
      if (!hasNext) break;
      const closeSize = await cdp.eval(`(() => {
        const close = document.querySelector('[data-dialogue-next][aria-label="Close dialogue"]');
        const rect = close?.getBoundingClientRect();
        return rect ? { width: rect.width, height: rect.height } : null;
      })()`);
      if (closeSize) {
        assert(closeSize.width >= 124 && closeSize.width <= 144 && closeSize.height >= 44, 'dialogue Close stays compact with a usable tap target');
      }
      await clickSelector(cdp, '.spud-dialogue-arcade [data-dialogue-next]');
      await sleep(80);
    }
    await waitFor(() => cdp.eval(`document.querySelector('#modal-root')?.childElementCount === 0 && !window.__spudTelemetry?.()?.frozen`), 'Rover dialogue closed');

    await finishAssignedTasks(cdp, { waitForBunk: true });
    assert(await cdp.eval(`JSON.parse(localStorage.getItem('spudnaut-cooperative-trial-save-v8')).activeTrial.checkpoint.reason === 'after-task'`), 'task checkpoint persisted');
    await playGuidedEmergency(cdp);
    for (let day = 2; day <= 3; day += 1) {
      if (day > 2) await clickSelector(cdp, '[data-report-next]');
      await waitFor(() => cdp.eval(`Boolean(document.querySelector('.shift-planner[open]'))`), 'next shift planner');
      assert(await cdp.eval(`!document.querySelector('#commander-tutorial-popover')`), 'landing tutorial stays complete');
      const offered = await cdp.eval(`Array.from(document.querySelectorAll('[data-offer]'), card => card.dataset.offer)`);
      const seen = await cdp.eval(`JSON.parse(localStorage.getItem('spudnaut-cooperative-trial-save-v8')).activeTrial.reports.flatMap(report => report.completedTasks)`);
      const tasks = [...offered.filter(id => !seen.includes(id)), ...offered.filter(id => seen.includes(id))].slice(0, 3);
      await startPlannedShift(cdp, { tasks });
      await finishAssignedTasks(cdp);
    }
    await clickSelector(cdp, '[data-report-next]');
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('.homecoming'))`), 'return to Earth cinematic');
    await clickSelector(cdp, '[data-skip-homecoming]');
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('[data-end-retry]'))`), 'Golden Potato Medal awarded');
    await clickSelector(cdp, '[data-end-menu]');
    const final = await cdp.eval(`JSON.parse(localStorage.getItem('spudnaut-cooperative-trial-save-v8'))`);
    assert(final.medals === 1 && final.games === 1 && final.activeTrial === null, 'completion and medal saved once');
    assert(final.seenMinigames.length >= 6, 'minigame progress carried across shifts');
    assert(['landing', 'power-restored', 'tasks', 'status', 'status-review', 'red-route', 'FLR', 'CME']
      .every(id => final.seenCommanderBriefings.filter(seen => seen === id).length === 1),
      'opening steps and first encounters are saved once across shifts');
    console.log('All three Cadet shifts, Commander praise, and persisted Golden Potato Medal verified.');

    assertErrorsClean(errors, 'Pass 2');
  } finally {
    await p2.cleanup();
  }
}

async function runPass3() {
  console.log('\n=== PASS 3: Mobile 390x844 Layout, Responsive UI, Drawers, Dialogs & Abort Flow ===');
  const p3 = await launchChromePass({
    autoplayAllowed: true,
    viewport: { width: 390, height: 844, isMobile: true },
  });
  try {
    const { cdp, errors } = p3;
    const assertNoHorizontalOverflow = async (label) => {
      const metrics = await cdp.eval(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`);
      assert(metrics.sw <= metrics.iw + 2, `[${label}] Horizontal overflow on 390px mobile: scrollWidth=${metrics.sw}, innerWidth=${metrics.iw}`);
    };

    await cdp.send('Page.navigate', { url: TELEMETRY_URL });
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'splash'`), 'mobile splash');
    await assertNoHorizontalOverflow('Splash');
    await clickSelector(cdp, '.intro-skip');
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'menu'`), 'mobile menu');
    await assertNoHorizontalOverflow('Menu');

    await enterMissionDay01(cdp, 'farmer', { alreadyOnMenu: true, difficulty: 'crew', skipTutorial: true });
    await assertNoHorizontalOverflow('Mission HUD 390x844');
    await waitFor(() => cdp.eval(`(() => {
      const sprites = ['.hud-profile-plate', '#hud-portrait img', '.hud-radar-topology', '.hud-settings-btn img'];
      return sprites.every(selector => document.querySelector(selector)?.naturalWidth > 0)
        && Boolean(document.querySelector('.hud-left-rail [data-action="tasks"]'))
        && Boolean(document.querySelector('.hud-left-rail [data-action="status"]'));
    })()`), 'mobile HUD artwork loads');

    await clickSelector(cdp, '[data-action="tasks"]');
    await waitFor(() => cdp.eval(`document.querySelector('[data-action="tasks"]')?.getAttribute('aria-expanded') === 'true'`), 'tasks drawer expanded');
    await assertNoHorizontalOverflow('Tasks Drawer 390x844');
    assert(await cdp.eval(`document.querySelector('#hud-drawer-panel').getBoundingClientRect().left
      >= document.querySelector('.hud-left-rail').getBoundingClientRect().right - 2`), 'mobile Tasks drawer opens to the right');

    await clickSelector(cdp, '[data-action="help"]');
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('.game-help-dialog[open]'))`), 'mobile help open');
    await pressKey(cdp, 'Escape', 'Escape');
    await waitFor(() => cdp.eval(`document.querySelector('#modal-root')?.childElementCount === 0`), 'mobile help closed');

    await clickSelector(cdp, '[data-action="status"]');
    await waitFor(() => cdp.eval(`document.querySelector('[data-action="status"]')?.getAttribute('aria-expanded') === 'true'`), 'status drawer expanded');
    await assertNoHorizontalOverflow('Status Drawer 390x844');
    assert(await cdp.eval(`Boolean(document.querySelector('#hud-drawer-panel[data-mode="status"]')
      && document.querySelectorAll('#hud-systems .hud-status-card').length === 4)`), 'status monitor has four live readings');
    await pressKey(cdp, 'Escape', 'Escape');

    await clickSelector(cdp, '[data-action="map"]');
    await waitFor(() => cdp.eval(`document.querySelector('.station-map-dialog[open] .station-map-porthole .spud-map-art')
      ?.naturalWidth > 0`), 'mobile station map open');
    await pressKey(cdp, 'Escape', 'Escape');
    await waitFor(() => cdp.eval(`document.querySelector('#modal-root')?.childElementCount === 0`), 'mobile map closed');

    await clickSelector(cdp, '[data-action="options"]');
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'options'`), 'in-game options');
    await assertNoHorizontalOverflow('Options 390x844');
    assert(await cdp.eval(`!document.querySelector('#scene-shell').hidden && document.querySelector('#hud').hidden
      && Boolean(document.querySelector('.ingame-options-screen #opt-volume'))`), 'settings overlay preserves the scene and exposes SFX');
    await clickSelector(cdp, '[data-game-return]');
    await waitFor(() => cdp.eval(`!document.querySelector('#hud').hidden && !window.__spudTelemetry?.()?.frozen`), 'mobile resumes gameplay');
    await clickSelector(cdp, '[data-action="options"]');
    await clickSelector(cdp, '[data-abort-mission]');
    await waitFor(() => cdp.eval(`Boolean(document.querySelector('.mission-abort-dialog[open] [data-confirm-accept]'))`), 'abort confirmation dialog');
    await clickSelector(cdp, '.mission-abort-dialog [data-confirm-accept]');
    await waitFor(() => cdp.eval(`document.body.dataset.screen === 'menu'`), 'returned to menu after abort');
    console.log('Pass 3 mobile layout, drawers, dialogs & abort mission OK!');

    assertErrorsClean(errors, 'Pass 3');
  } finally {
    await p3.cleanup();
  }
}

async function main() {
  const preview = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PREVIEW_PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: REPO_DIR, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    await waitForHttp(BASE_URL);
    console.log(`Vite preview listening at ${BASE_URL}`);
    await runPass1();
    await runPass2();
    await runPass3();
    console.log('\nALL 3 LIVE CHROME CDP VERIFICATION PASSES SUCCEEDED WITH ZERO ERRORS.');
  } finally {
    try {
      preview.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
}

await main();
