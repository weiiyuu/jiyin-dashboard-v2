import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const phase = process.argv[2];
if (!phase || !["before", "after"].includes(phase)) throw new Error("Usage: node scripts/stage53-typography-browser-audit.mjs <before|after>");

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = phase === "before" ? 9225 : 9226;
const evidenceDir = resolve(`docs/evidence/stage5_3_uat_ux/${phase}`);
const profileDir = `/private/tmp/jiyin-stage53-typography-${phase}-20261115`;
const pages = [
  ["home", "/"],
  ["imports", "/imports"],
  ["operation", "/history/processing"],
  ["events", "/history/events"],
  ["machines", "/monitoring/machines"],
  ["environment", "/monitoring/environment"],
  ["settings", "/settings/api"],
];
const widths = [1280, 1366, 1440];
mkdirSync(evidenceDir, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
  "--disable-component-update", "--disable-sync",
  "--disable-features=OptimizationHints,MediaRouter,AutofillServerCommunication", "about:blank",
], { stdio: "ignore" });
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function devtools(path, options) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { return await fetch(`http://127.0.0.1:${port}${path}`, options); } catch { await delay(100); }
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url); this.nextId = 1; this.pending = new Map();
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data); if (!message.id) return;
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id); if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
    });
  }
  async open() { await new Promise((resolveOpen, reject) => { this.socket.addEventListener("open", resolveOpen, { once: true }); this.socket.addEventListener("error", reject, { once: true }); }); }
  send(method, params = {}) { const id = this.nextId++; return new Promise((resolveSend, reject) => { this.pending.set(id, { resolve: resolveSend, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  close() { this.socket.close(); }
}

async function run() {
  const response = await devtools("/json/new?http://localhost:3000", { method: "PUT" });
  const target = await response.json();
  const cdp = new Cdp(target.webSocketDebuggerUrl); await cdp.open(); await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
  const evaluate = async (expression) => { const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
  const waitReady = async () => { for (let attempt = 0; attempt < 100; attempt += 1) { if (await evaluate("document.readyState==='complete' && Boolean(document.body)")) return; await delay(100); } throw new Error("Page did not become ready"); };
  const viewport = (width) => cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  const screenshot = async (fileName) => {
    await delay(160); const layout = await cdp.send("Page.getLayoutMetrics"); const { width, height } = layout.cssContentSize;
    const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
    writeFileSync(resolve(evidenceDir, fileName), Buffer.from(result.data, "base64"));
  };
  const audit = () => evaluate(`(() => {
    const visible=(element)=>{const style=getComputedStyle(element);const rect=element.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>0&&rect.height>0;};
    const textElements=[...document.querySelectorAll('body *')].filter((element)=>visible(element)&&[...element.childNodes].some((node)=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim()));
    const records=textElements.map((element)=>({tag:element.tagName.toLowerCase(),className:String(element.className||'').slice(0,100),text:element.textContent.trim().replace(/\\s+/g,' ').slice(0,90),fontSize:Number.parseFloat(getComputedStyle(element).fontSize),lineHeight:getComputedStyle(element).lineHeight}));
    const clipped=[...document.querySelectorAll('body *')].filter((element)=>visible(element)&&(element.scrollWidth>element.clientWidth+1||element.scrollHeight>element.clientHeight+1)).filter((element)=>!['auto','scroll'].includes(getComputedStyle(element).overflowX)&&!['auto','scroll'].includes(getComputedStyle(element).overflowY)).slice(0,20).map((element)=>({className:String(element.className||'').slice(0,100),text:element.textContent.trim().replace(/\\s+/g,' ').slice(0,90),client:[element.clientWidth,element.clientHeight],scroll:[element.scrollWidth,element.scrollHeight]}));
    const sizes={};records.forEach((record)=>{sizes[record.fontSize]=(sizes[record.fontSize]||0)+1;});
    return {title:document.title,innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,visibleTextCount:records.length,below14:records.filter((record)=>record.fontSize<14).length,below16:records.filter((record)=>record.fontSize<16).length,fontSizes:sizes,smallSamples:records.filter((record)=>record.fontSize<14).slice(0,18),clipped};
  })()`);
  const results = {};
  for (const width of widths) {
    results[width] = {};
    await viewport(width);
    for (const [name, path] of pages) {
      await cdp.send("Page.navigate", { url: `http://localhost:3000${path}` }); await waitReady(); await delay(180);
      results[width][name] = await audit();
      if (width === 1366 || ["home", "imports", "operation"].includes(name)) await screenshot(`${name}-${width}.png`);
    }
  }
  cdp.close();
  writeFileSync(resolve(evidenceDir, "metrics.json"), `${JSON.stringify({ phase, browser: "Google Chrome headless", zoom: "100%", results }, null, 2)}\n`);
  return { phase, evidenceDir, summary: Object.fromEntries(widths.map((width) => [width, Object.fromEntries(pages.map(([name]) => [name, { bodyOverflow: results[width][name].bodyOverflow, below14: results[width][name].below14, below16: results[width][name].below16, clipped: results[width][name].clipped.length }]))])) };
}

try { console.log(JSON.stringify(await run(), null, 2)); } finally { chrome.kill("SIGTERM"); }
