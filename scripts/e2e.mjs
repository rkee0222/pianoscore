// Headless E2E for the fully client-side app. Spawns a detached static server
// for frontend/dist, then drives the built app with the agent-browser CLI.
// The app has no server of its own; this static host exists only for the test.
import { spawn, execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 4173;
const base = `http://127.0.0.1:${PORT}/`;
const session = 'sf-e2e';

const server = spawn('node', [join(here, 'static-server.mjs')], {
  env: { ...process.env, E2E_PORT: String(PORT) },
  stdio: 'ignore',
  detached: true,
});

const ab = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8' }).trim();
// agent-browser `eval` prints the JSON-encoded result (strings come back quoted),
// so unwrap it to get the underlying primitive.
const evalJs = (expr) => {
  const raw = ab('eval', expr);
  try { return JSON.parse(raw); } catch { return raw; }
};
const clickJs = (selector) => ab('eval', `document.querySelector(${JSON.stringify(selector)}).click()`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' :: ' + detail : ''}`); };

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try { const r = await fetch(base); if (r.ok) return; } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('static server did not start');
}

(async () => {
  try {
    await waitForServer();

    ab('open', base);
    await sleep(1800);

    // 1) In-browser example analysis (no server, no network call).
    clickJs('.text-button');
    await sleep(6500);
    const heading = evalJs("document.querySelector('.correction h2')?.textContent || ''");
    check('correction screen reached', heading.includes('인식 결과 보정'), heading);
    const measures = evalJs("document.querySelectorAll('.correction tbody tr').length");
    check('measures detected in-browser', measures >= 8, `measures=${measures}`);
    const note = evalJs("/완전 오프라인 브라우저 분석/.test(document.body.innerText)");
    check('client-detect note shown', note === true);

    // 2) Enter performance view.
    clickJs('.correction-head .primary');
    await sleep(1500);
    check('performance view active', evalJs("!!document.querySelector('.player')") === true);

    // 3) Play: allow for the 3s countdown, then confirm the clock + scroll moved.
    clickJs('.play');
    await sleep(8000);
    const progress = Number(evalJs("document.querySelector('.progress-row input')?.value ?? '0'"));
    const scrollTop = Number(evalJs("document.querySelector('.score-viewport')?.scrollTop ?? 0"));
    check('playback clock advanced', progress > 0.5, `progress=${progress}`);
    check('auto-scroll moved', scrollTop > 0, `scrollTop=${scrollTop}`);

    // 4) Pause holds position.
    clickJs('.play');
    await sleep(300);
    const p1 = evalJs("document.querySelector('.progress-row input').value");
    await sleep(1200);
    const p2 = evalJs("document.querySelector('.progress-row input').value");
    check('pause holds position', p1 === p2, `p1=${p1} p2=${p2}`);

    // 5) Confirm the score persisted to IndexedDB (offline-durable storage).
    clickJs('.brand');
    await sleep(800);
    const stored = evalJs(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('scoreflow',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const all=await new Promise((res,rej)=>{const rq=db.transaction('scores').objectStore('scores').getAll();rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error)});return !!(all.length && all[0].pages[0].dataUrl.startsWith('data:image'))})()`);
    check('score persisted with embedded image', stored === true);

    // 6) TRUE offline reopen: fully shut down the static host, wait for the
    //    service worker to be active, then reload with no server reachable.
    for (let i = 0; i < 30; i += 1) {
      if (evalJs("navigator.serviceWorker?.controller ? 'ready':'no'") === 'ready') break;
      await sleep(300);
    }
    check('service worker controlling page', evalJs("!!navigator.serviceWorker?.controller") === true);
    try { process.kill(-server.pid); } catch { /* ignore */ }
    await sleep(800);
    const serverDown = await fetch(base).then(() => false).catch(() => true);
    check('static host is actually down', serverDown === true);
    ab('reload');
    await sleep(2800);
    check('reopens with no server (offline shell)', evalJs("/오프라인 보관함/.test(document.body.innerText)") === true);
    check('offline reopen shows saved score', evalJs("/scoreflow-example/.test(document.body.innerText)") === true);
    ab('eval', "[...document.querySelectorAll('.score-open')][0]?.click()");
    await sleep(1200);
    check('saved score plays with no server', evalJs("!!document.querySelector('.player')") === true);
  } catch (e) {
    check(`exception: ${e.message}`, false);
  } finally {
    try { ab('close'); } catch { /* ignore */ }
    try { process.kill(-server.pid); } catch { /* ignore */ }
    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} checks passed`);
    process.exit(passed === results.length && results.length > 0 ? 0 : 1);
  }
})();
