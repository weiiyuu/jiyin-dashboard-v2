import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9224;
const evidenceDir = resolve("docs/evidence/stage5_3_uat_ux/functional");
const profileDir = `/private/tmp/jiyin-stage53-v2-chrome-profile-${process.pid}`;
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
  async open() { if (this.socket.readyState === WebSocket.OPEN) return; await new Promise((resolveOpen, reject) => { this.socket.addEventListener("open", resolveOpen, { once: true }); this.socket.addEventListener("error", reject, { once: true }); }); }
  send(method, params = {}) { const id = this.nextId++; return new Promise((resolveSend, reject) => { this.pending.set(id, { resolve: resolveSend, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  close() { this.socket.close(); }
}

async function run() {
  const targetResponse = await devtools("/json/new?http://localhost:3000/history/processing", { method: "PUT" });
  const target = await targetResponse.json();
  const cdp = new Cdp(target.webSocketDebuggerUrl); await cdp.open(); await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
  const evaluate = async (expression) => { const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
  const viewport = (width) => cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  const waitFor = async (expression, label) => { for (let attempt = 0; attempt < 120; attempt += 1) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out waiting for ${label}`); };
  const screenshot = async (fileName) => {
    await delay(180);
    const layout = await cdp.send("Page.getLayoutMetrics");
    const { width, height } = layout.cssContentSize;
    const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
    writeFileSync(resolve(evidenceDir, fileName), Buffer.from(result.data, "base64"));
  };
  const metrics = () => evaluate(`(() => { const panels=[...document.querySelectorAll('.operation-analysis-sections>.panel')].map((panel)=>{const rect=panel.getBoundingClientRect();return {title:panel.querySelector('h2')?.textContent,width:Math.round(rect.width),left:Math.round(rect.left),right:Math.round(rect.right)};}); const main=document.querySelector('.operation-analysis-page')?.getBoundingClientRect(); return {innerWidth,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,main:{left:Math.round(main?.left??0),right:Math.round(main?.right??0),width:Math.round(main?.width??0)},panels,chartOverflow:[...document.querySelectorAll('.chart-box')].some((box)=>box.scrollWidth>box.clientWidth+1)}; })()`);
  const setControl = (label, value) => evaluate(`(() => { const input=document.querySelector('[aria-label="${label}"]'); const proto=input instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype; const setter=Object.getOwnPropertyDescriptor(proto,'value').set; setter.call(input,'${value}'); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const clickText = (text) => evaluate(`(() => { const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.trim()==='${text}'); if(!button) throw new Error('Missing button: ${text}'); button.click(); })()`);
  const chooseMachines = (ids) => evaluate(`(() => { const ids=${JSON.stringify(ids)}; document.querySelectorAll('.check-pill').forEach((label)=>{const input=label.querySelector('input'); const wanted=ids.includes(label.textContent.trim()); if(input.checked!==wanted) input.click();}); })()`);
  const submit = (text, selector) => evaluate(`(() => { const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.includes('${text}')); if(!button) throw new Error('Missing submit'); button.click(); })()`).then(() => waitFor(selector, text));

  await viewport(1366); await waitFor("document.readyState === 'complete'", "initial page"); await waitFor("document.querySelectorAll('.empty-state strong').length === 3", "empty chart state");
  const empty = await evaluate(`(() => ({titles:[...document.querySelectorAll('.operation-analysis-sections>.panel h2')].map((node)=>node.textContent),selected:document.querySelectorAll('.machine-pills input:checked').length,queryDisabled:document.querySelector('button.primary')?.disabled}))()`);
  await screenshot("01-empty-1366.png");

  await setControl("開始日期", "2025-06-01"); await setControl("結束日期", "2025-06-01"); await chooseMachines(["A1", "A2", "A4"]);
  await submit("套用分析條件", "document.querySelectorAll('[data-chart=operation-ranking] .ranking-v2-row').length===3");
  const range30 = await evaluate(`(() => { const percentages=[...document.querySelectorAll('.operation-share-segment b')]; return {titles:[...document.querySelectorAll('.operation-analysis-sections>.panel h2')].slice(-3).map((node)=>node.textContent),bars:document.querySelectorAll('.ranking-solid-bar').length,points:document.querySelectorAll('[data-chart=operation-trend] circle').length,tooltipZones:document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length,shareRows:document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length,shareLegends:document.querySelectorAll('[data-chart=operation-share] .operation-share-legend').length,axis:[...document.querySelectorAll('[data-chart=operation-trend] .chart-axis-label')].map((node)=>node.textContent),ranking:[...document.querySelectorAll('.ranking-duration')].map((node)=>node.textContent),shares:[...document.querySelectorAll('[data-share-row]')].map((node)=>node.getAttribute('aria-label')),selected:document.querySelectorAll('.machine-pills input:checked').length,dashedLines:document.querySelectorAll('[data-chart=operation-trend] polyline[stroke-dasharray]').length,percentageStyles:percentages.map((node)=>({text:node.textContent,fontSize:getComputedStyle(node).fontSize,color:getComputedStyle(node).color,fontWeight:getComputedStyle(node).fontWeight}))}; })()`);
  await evaluate("document.querySelector('[data-chart=operation-trend] [data-tooltip-zone]').focus()"); await waitFor("Boolean(document.querySelector('.trend-tooltip'))", "overlap tooltip");
  const overlapTooltip = await evaluate("document.querySelector('.trend-tooltip')?.textContent");
  await screenshot("02-range-30-overlap-tooltip-1366.png");
  await evaluate("document.activeElement.blur()");
  await evaluate("document.querySelector('.trend-legend button').focus()"); await delay(80);
  const focusedSeries = await evaluate("document.querySelectorAll('.trend-series.is-dimmed').length");
  await evaluate("document.querySelector('.trend-legend button').click()"); await delay(80);
  const hiddenSeries = await evaluate(`(() => ({muted:document.querySelectorAll('.trend-legend button.is-muted').length,selected:document.querySelectorAll('.machine-pills input:checked').length}))()`);
  await evaluate("document.querySelector('.trend-legend button.is-muted').click(); document.activeElement.blur()"); await delay(80);

  await setControl("資料粒度", "60m"); await submit("套用分析條件", "document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length===24");
  const range60 = await evaluate(`(() => ({points:document.querySelectorAll('[data-chart=operation-trend] circle').length,tooltipZones:document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length,has24:[...document.querySelectorAll('[data-chart=operation-trend] text')].some((node)=>node.textContent==='24:00'),ranking:[...document.querySelectorAll('.ranking-duration')].map((node)=>node.textContent),shares:[...document.querySelectorAll('[data-share-row]')].map((node)=>node.getAttribute('aria-label'))}))()`);
  await screenshot("03-range-60-1366.png");

  await setControl("開始日期", "2025-06-02"); await setControl("結束日期", "2025-06-02"); await chooseMachines(["A2", "A3"]);
  await submit("套用分析條件", "document.querySelectorAll('[data-chart=operation-ranking] .ranking-v2-row').length===2");
  const missingMachine = await evaluate(`(() => ({ranking:[...document.querySelectorAll('.ranking-duration')].map((node)=>node.textContent),unavailable:[...document.querySelectorAll('.operation-share-unavailable')].map((node)=>node.textContent),fakeBars:document.querySelectorAll('[data-share-row="A3"] .operation-share-segment').length}))()`);
  await screenshot("03b-range-missing-machine-1366.png");

  await setControl("開始日期", "2025-06-01"); await setControl("結束日期", "2025-06-05"); await chooseMachines(["A1", "A2", "B4"]);
  const multiDayGrain = await evaluate(`(() => { const control=document.querySelector('[aria-label="資料粒度"]'); return {value:control?.value,disabled:control?.disabled,option:control?.selectedOptions[0]?.textContent,help:control?.closest('.field')?.textContent,notice:document.querySelector('.notice')?.textContent}; })()`);
  await submit("套用分析條件", "document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length===5");
  await clickText("整體占比"); await waitFor("document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length===1", "overall share");
  const rangeLayouts = {};
  for (const width of [1280, 1366, 1440]) { await viewport(width); await delay(120); rangeLayouts[width] = await metrics(); await screenshot(`04-range-multi-total-${width}.png`); }

  await viewport(1366); await clickText("同期比較"); await delay(120); await setControl("期間 A", "2025-06-01"); await setControl("期間 B", "2025-06-08"); await chooseMachines(["A1", "A2", "A4"]);
  await submit("比較兩個期間", "document.querySelectorAll('[data-chart=comparison-ranking] .comparison-v2-row').length===3");
  const compareDay = await evaluate(`(() => ({titles:[...document.querySelectorAll('.operation-analysis-sections>.panel h2')].slice(-3).map((node)=>node.textContent),rankRows:document.querySelectorAll('.comparison-v2-row').length,trendZones:document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length,shareRows:document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length,selected:document.querySelectorAll('.machine-pills input:checked').length}))()`);
  await evaluate("document.querySelector('.comparison-v2-row').click()"); await delay(80);
  const comparisonHighlight = await evaluate(`(() => ({highlighted:document.querySelectorAll('.comparison-v2-row.is-highlighted').length,selected:document.querySelectorAll('.machine-pills input:checked').length,shareRows:document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length}))()`);
  await screenshot("05-compare-day-overall-1366.png");
  await clickText("單機趨勢"); await waitFor("Boolean(document.querySelector('[aria-label=\"檢視機台\"]'))", "single-machine selector"); await clickText("各機台占比"); await waitFor("document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length===6", "machine comparison shares");
  const localModes = await evaluate(`(() => ({machineSelector:document.querySelector('[aria-label="檢視機台"]')?.value,shareRows:document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length,selected:document.querySelectorAll('.machine-pills input:checked').length}))()`);
  await screenshot("06-compare-day-single-machine-share-1366.png");

  await setControl("比較類型", "week"); await delay(80); await setControl("期間 A", "2025-06-01"); await setControl("期間 B", "2025-06-08");
  const weekGuidance = await evaluate(`(() => ({option:document.querySelector('[aria-label="比較類型"]')?.selectedOptions[0]?.textContent,labels:[...document.querySelectorAll('.compare-filters label')].map((node)=>node.textContent),help:document.querySelector('.comparison-guidance')?.textContent,ranges:[...document.querySelectorAll('.comparison-range-preview span')].map((node)=>node.textContent)}))()`);
  await submit("比較兩個期間", "document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length===7");
  const compareWeek = await evaluate(`(() => ({axis:[...document.querySelectorAll('[data-chart=operation-trend] .chart-axis-label')].map((node)=>node.textContent),zones:document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length,dashedLines:document.querySelectorAll('[data-chart=operation-trend] polyline[stroke-dasharray]').length}))()`);
  await screenshot("07-compare-week-1366.png");

  await setControl("比較類型", "month"); await delay(80); await setControl("期間 A", "2025-02"); await setControl("期間 B", "2025-03"); await submit("比較兩個期間", "document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length===31");
  const compareMonth = await evaluate(`(() => ({axis:[...document.querySelectorAll('[data-chart=operation-trend] .chart-axis-label')].map((node)=>node.textContent),zones:document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length,unit:[...document.querySelectorAll('.value-axis-title')].map((node)=>node.textContent)}))()`);
  const compareLayouts = {};
  for (const width of [1280, 1366, 1440]) { await viewport(width); await delay(120); compareLayouts[width] = await metrics(); }
  await viewport(1366); await screenshot("08-compare-month-1366.png");
  cdp.close();
  return { empty, range30, overlapTooltip, legendInteraction: { focusedSeries, hiddenSeries }, range60: { ...range60, totalsAndSharesUnchanged: JSON.stringify(range30.ranking)===JSON.stringify(range60.ranking)&&JSON.stringify(range30.shares)===JSON.stringify(range60.shares) }, missingMachine, multiDayGrain, rangeLayouts, compareDay, comparisonHighlight, localModes, weekGuidance, compareWeek, compareMonth, compareLayouts, evidenceDir };
}

try {
  const result = await run();
  if (result.range30.dashedLines !== 0 || result.compareWeek.dashedLines !== 0) throw new Error("趨勢折線仍含虛線樣式");
  if (!result.range30.percentageStyles.length || result.range30.percentageStyles.some((item) => Number.parseFloat(item.fontSize) < 15 || item.color !== "rgb(33, 17, 22)")) throw new Error("燈號占比數字對比或字級未達標");
  if (result.multiDayGrain.value !== "daily" || !result.multiDayGrain.disabled || !result.multiDayGrain.notice?.includes("已切換為每日粒度")) throw new Error("跨日粒度控制未鎖定每日");
  if (!result.weekGuidance.ranges.includes("期間 A2025/06/01 – 2025/06/07") || !result.weekGuidance.ranges.includes("期間 B2025/06/08 – 2025/06/14")) throw new Error("週對週完整日期範圍未顯示");
  console.log(JSON.stringify(result, null, 2));
} finally { chrome.kill("SIGTERM"); }
