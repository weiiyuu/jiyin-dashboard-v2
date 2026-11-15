import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9223;
const evidenceDir = resolve("docs/evidence/stage5_3");
const profileDir = "/private/tmp/jiyin-stage53-chrome-profile-20261115";
mkdirSync(evidenceDir, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-sync",
  "--disable-features=OptimizationHints,MediaRouter,AutofillServerCommunication",
  "about:blank",
], { stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function devtools(path, options) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { return await fetch(`http://127.0.0.1:${port}${path}`, options); } catch { await delay(100); }
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolveOpen, reject) => {
      this.socket.addEventListener("open", resolveOpen, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { resolve: resolveSend, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

async function run() {
  const targetResponse = await devtools("/json/new?http://localhost:3000/history/processing", { method: "PUT" });
  const target = await targetResponse.json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const viewport = (width) => cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const screenshot = async (fileName) => {
    const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
    writeFileSync(resolve(evidenceDir, fileName), Buffer.from(result.data, "base64"));
  };
  const metrics = () => evaluate(`(() => {
    const panels=[...document.querySelectorAll('.operation-analysis-sections>.panel')].map((panel)=>{const rect=panel.getBoundingClientRect();return {title:panel.querySelector('h2')?.textContent,width:Math.round(rect.width),left:Math.round(rect.left),right:Math.round(rect.right)};});
    const main=document.querySelector('.operation-analysis-page')?.getBoundingClientRect();
    return {innerWidth,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,main:{left:Math.round(main?.left??0),right:Math.round(main?.right??0),width:Math.round(main?.width??0)},panels,chartOverflow:[...document.querySelectorAll('.chart-box')].some((box)=>box.scrollWidth>box.clientWidth+1)};
  })()`);

  await viewport(1366);
  await waitFor("document.readyState === 'complete'", "initial page");
  await waitFor("document.querySelectorAll('.empty-state strong').length === 3", "hydrated empty chart state");
  const empty = await evaluate(`(() => ({selected:document.querySelectorAll('.machine-pills input:checked').length,prompts:[...document.querySelectorAll('.empty-state strong')].map((node)=>node.textContent),queryDisabled:document.querySelector('button.primary')?.disabled}))()`);
  await screenshot("01-empty-1366.png");

  await evaluate(`(() => {
    const set=(label,value)=>{const input=document.querySelector('[aria-label="'+label+'"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
    set('開始日期','2025-06-01');set('結束日期','2025-06-01');
    document.querySelectorAll('.machine-pills input').forEach((input)=>input.click());
    [...document.querySelectorAll('button')].find((button)=>button.textContent.includes('套用分析條件')).click();
  })()`);
  await waitFor("document.querySelectorAll('[data-chart=operation-ranking] .rank-button').length === 8", "range charts");
  const rangeBefore = await evaluate(`(() => ({rank:document.querySelectorAll('.rank-button').length,legend:document.querySelectorAll('.interactive-legend button').length,points:document.querySelectorAll('[data-chart=operation-trend] circle').length,shareCards:document.querySelectorAll('.operation-share-card').length,selected:document.querySelectorAll('.machine-pills input:checked').length}))()`);
  await evaluate("document.querySelector('.rank-button').click()");
  await delay(80);
  const highlighted = await evaluate("document.querySelectorAll('.rank-button.is-highlighted').length");
  await evaluate("document.querySelector('.rank-button').click()");
  await delay(80);
  const highlightCancelled = await evaluate("document.querySelectorAll('.rank-button.is-highlighted').length");
  await evaluate("document.querySelector('.interactive-legend button').click()");
  await delay(80);
  const legendHidden = await evaluate(`(() => ({muted:document.querySelectorAll('.interactive-legend button.is-muted').length,points:document.querySelectorAll('[data-chart=operation-trend] circle').length,selected:document.querySelectorAll('.machine-pills input:checked').length,shareCards:document.querySelectorAll('.operation-share-card').length}))()`);
  await evaluate("document.querySelector('.interactive-legend button').click()");
  await delay(80);
  const rangeInteraction = { ...rangeBefore, highlighted, highlightCancelled, legendHidden };
  const rangeLayouts = {};
  for (const width of [1280, 1366, 1440]) { await viewport(width); await delay(80); rangeLayouts[width] = await metrics(); }
  await viewport(1366);
  await screenshot("02-range-eight-machines-1366.png");

  await evaluate(`(() => { [...document.querySelectorAll('button')].find((button)=>button.textContent.trim()==='同期比較').click(); })()`);
  await delay(100);
  await evaluate(`(() => {
    const set=(label,value)=>{const input=document.querySelector('[aria-label="'+label+'"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
    set('期間 A','2025-06-01');set('期間 B','2025-06-08');
    document.querySelectorAll('.machine-pills input').forEach((input)=>input.click());
    [...document.querySelectorAll('button')].find((button)=>button.textContent.includes('比較兩個期間')).click();
  })()`);
  await waitFor("document.querySelectorAll('.compare-rank-button').length === 8", "comparison charts");
  await evaluate(`(() => { [...document.querySelectorAll('button')].find((button)=>button.textContent.trim()==='單一機台').click(); [...document.querySelectorAll('button')].find((button)=>button.textContent.trim()==='分機台').click(); })()`);
  await delay(100);
  const compareInteraction = await evaluate(`(() => ({rank:document.querySelectorAll('.compare-rank-button').length,points:document.querySelectorAll('[data-chart=operation-trend] circle').length,machineSelect:Boolean(document.querySelector('[aria-label="趨勢機台"]')),shareBars:document.querySelectorAll('.operation-share-bar').length,selected:document.querySelectorAll('.machine-pills input:checked').length}))()`);
  const compareLayouts = {};
  for (const width of [1280, 1366, 1440]) { await viewport(width); await delay(80); compareLayouts[width] = await metrics(); }
  await viewport(1366);
  await screenshot("03-compare-eight-machines-1366.png");
  cdp.close();
  return { empty, rangeInteraction, compareInteraction, rangeLayouts, compareLayouts, evidenceDir };
}

try {
  console.log(JSON.stringify(await run(), null, 2));
} finally {
  chrome.kill("SIGTERM");
}
