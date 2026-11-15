import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9224;
const baseUrl = process.env.STAGE53_BASE_URL ?? "http://localhost:3000";
const evidenceDir = resolve("docs/evidence/stage5_3_uat_round2");
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
  const targetResponse = await devtools(`/json/new?${baseUrl}/history/processing`, { method: "PUT" });
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
  const axisGeometry = () => evaluate(`(() => { const svg=document.querySelector('[data-chart=operation-trend] svg'); const title=[...svg.querySelectorAll('.chart-axis-title')].find((node)=>node.textContent==='加工時間'); const ticks=[...svg.querySelectorAll('.chart-axis-label')].filter((node)=>node.textContent.includes('小時')&&node.getAttribute('text-anchor')==='end'); const a=title.getBoundingClientRect(); const boxes=ticks.map((node)=>node.getBoundingClientRect()); const overlap=boxes.some((b)=>!(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom)); return {overlap,title:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},ticks:boxes.map((b)=>({left:b.left,right:b.right,top:b.top,bottom:b.bottom})),minimumGap:Math.min(...boxes.map((b)=>b.left-a.right))}; })()`);
  const pointGeometry = () => evaluate(`(() => ({series:[...document.querySelectorAll('[data-chart=operation-trend] .trend-series')].map((series)=>{const points=[...series.querySelectorAll('circle')];return {first:points[0]&&{width:points[0].getBoundingClientRect().width,height:points[0].getBoundingClientRect().height,className:points[0].getAttribute('class'),dash:getComputedStyle(points[0]).strokeDasharray},last:points.at(-1)&&{width:points.at(-1).getBoundingClientRect().width,height:points.at(-1).getBoundingClientRect().height,className:points.at(-1).getAttribute('class'),dash:getComputedStyle(points.at(-1)).strokeDasharray}}})}))()`);
  const trendTooltipGeometry = () => evaluate(`(() => {const tip=document.querySelector('.trend-tooltip');const r=tip.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,withinViewport:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,overflowX:tip.scrollWidth>tip.clientWidth+1,rows:tip.querySelectorAll('.trend-tooltip-row').length,dates:[...tip.querySelectorAll('.trend-tooltip-date')].map((node)=>({text:node.textContent,width:node.getBoundingClientRect().width,scrollWidth:node.scrollWidth}))};})()`);
  const shareTooltipGeometry = () => evaluate(`(() => {const tip=document.querySelector('.share-tooltip');const r=tip.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,withinViewport:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,overflowX:tip.scrollWidth>tip.clientWidth+1,stateRows:tip.querySelectorAll('.share-tooltip-state').length,text:tip.textContent};})()`);

  await viewport(1366); await waitFor("document.readyState === 'complete'", "initial page"); await waitFor("document.querySelectorAll('.empty-state strong').length === 3", "empty chart state"); await waitFor("document.querySelector('.range-filter-field .control')?.getBoundingClientRect().height>=49 && getComputedStyle(document.querySelector('.range-filters')).display==='grid'", "UAT styles loaded");
  const empty = await evaluate(`(() => ({titles:[...document.querySelectorAll('.operation-analysis-sections>.panel h2')].map((node)=>node.textContent),selected:document.querySelectorAll('.machine-pills input:checked').length,queryDisabled:document.querySelector('button.primary')?.disabled}))()`);
  const filterAlignment = await evaluate(`(() => {const rows=[...document.querySelectorAll('.range-filter-field')].map((field)=>{const label=field.querySelector('label').getBoundingClientRect();const control=field.querySelector('.control,.button').getBoundingClientRect();const help=field.querySelector('.field-help').getBoundingClientRect();return {labelTop:label.top,controlTop:control.top,controlBottom:control.bottom,controlHeight:control.height,helpTop:help.top};});const spread=(key)=>Math.max(...rows.map((row)=>row[key]))-Math.min(...rows.map((row)=>row[key]));return {rows,labelTopSpread:spread('labelTop'),controlTopSpread:spread('controlTop'),controlBottomSpread:spread('controlBottom'),controlHeightSpread:spread('controlHeight')};})()`);
  await screenshot("01-filter-alignment-fixed-1366.png");

  await setControl("開始日期", "2025-06-01"); await setControl("結束日期", "2025-06-01"); await chooseMachines(["A1", "A2", "A4"]);
  await submit("套用分析條件", "document.querySelectorAll('[data-chart=operation-ranking] .ranking-v2-row').length===3");
  const axisRange30 = await axisGeometry();
  const shareLabelGap = await evaluate(`(() => {const rows=[...document.querySelectorAll('[data-chart=operation-share] [data-share-row]')].map((row)=>{const label=row.querySelector('.operation-share-label').getBoundingClientRect();const bar=row.querySelector('.operation-share-stack').getBoundingClientRect();return {label:row.querySelector('.operation-share-label').textContent,gap:bar.left-label.right,barWidth:bar.width};});return rows;})()`);
  const range30 = await evaluate(`(() => { const percentages=[...document.querySelectorAll('.operation-share-segment b')]; return {titles:[...document.querySelectorAll('.operation-analysis-sections>.panel h2')].slice(-3).map((node)=>node.textContent),bars:document.querySelectorAll('.ranking-solid-bar').length,points:document.querySelectorAll('[data-chart=operation-trend] circle').length,tooltipZones:document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length,shareRows:document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length,shareLegends:document.querySelectorAll('[data-chart=operation-share] .operation-share-legend').length,axis:[...document.querySelectorAll('[data-chart=operation-trend] .chart-axis-label')].map((node)=>node.textContent),ranking:[...document.querySelectorAll('.ranking-duration')].map((node)=>node.textContent),shares:[...document.querySelectorAll('[data-share-row]')].map((node)=>node.getAttribute('aria-label')),selected:document.querySelectorAll('.machine-pills input:checked').length,dashedLines:document.querySelectorAll('[data-chart=operation-trend] polyline[stroke-dasharray]').length,percentageStyles:percentages.map((node)=>({text:node.textContent,fontSize:getComputedStyle(node).fontSize,color:getComputedStyle(node).color,fontWeight:getComputedStyle(node).fontWeight}))}; })()`);
  await evaluate("document.querySelector('[data-chart=operation-trend] [data-tooltip-zone]').focus()"); await waitFor("Boolean(document.querySelector('.trend-tooltip'))", "overlap tooltip");
  const overlapTooltip = await evaluate("document.querySelector('.trend-tooltip')?.textContent");
  await screenshot("02-trend-y-axis-fixed-1366.png");
  await screenshot("03-machine-label-gap-fixed-1366.png");
  await evaluate("document.activeElement.blur()");
  await evaluate("document.querySelector('.trend-legend button').focus()"); await delay(80);
  const focusedSeries = await evaluate("document.querySelectorAll('.trend-series.is-dimmed').length");
  await evaluate("document.querySelector('.trend-legend button').click()"); await delay(80);
  const hiddenSeries = await evaluate(`(() => ({muted:document.querySelectorAll('.trend-legend button.is-muted').length,selected:document.querySelectorAll('.machine-pills input:checked').length}))()`);
  await evaluate("document.querySelector('.trend-legend button.is-muted').click(); document.activeElement.blur()"); await delay(80);

  await setControl("資料粒度", "60m"); await submit("套用分析條件", "document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length===24");
  const axisRange60 = await axisGeometry();
  const range60 = await evaluate(`(() => ({points:document.querySelectorAll('[data-chart=operation-trend] circle').length,tooltipZones:document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length,has24:[...document.querySelectorAll('[data-chart=operation-trend] text')].some((node)=>node.textContent==='24:00'),ranking:[...document.querySelectorAll('.ranking-duration')].map((node)=>node.textContent),shares:[...document.querySelectorAll('[data-share-row]')].map((node)=>node.getAttribute('aria-label'))}))()`);
  await screenshot("03-range-60-1366.png");

  await setControl("開始日期", "2025-06-02"); await setControl("結束日期", "2025-06-02"); await chooseMachines(["A2", "A3"]);
  await submit("套用分析條件", "document.querySelectorAll('[data-chart=operation-ranking] .ranking-v2-row').length===2");
  const missingMachine = await evaluate(`(() => ({ranking:[...document.querySelectorAll('.ranking-duration')].map((node)=>node.textContent),unavailable:[...document.querySelectorAll('.operation-share-unavailable')].map((node)=>node.textContent),fakeBars:document.querySelectorAll('[data-share-row="A3"] .operation-share-segment').length}))()`);
  await screenshot("03b-range-missing-machine-1366.png");

  await setControl("開始日期", "2025-06-01"); await setControl("結束日期", "2025-06-05"); await chooseMachines(["A1", "A2", "B4"]);
  const multiDayGrain = await evaluate(`(() => { const control=document.querySelector('[aria-label="資料粒度"]'); return {value:control?.value,disabled:control?.disabled,option:control?.selectedOptions[0]?.textContent,help:control?.closest('.field')?.textContent,notice:document.querySelector('.notice')?.textContent}; })()`);
  await submit("套用分析條件", "document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length===5");
  const axisRangeMulti = await axisGeometry();
  await clickText("整體占比"); await waitFor("document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length===1", "overall share");
  const rangeLayouts = {};
  for (const width of [1280, 1366, 1440]) { await viewport(width); await delay(120); rangeLayouts[width] = await metrics(); await screenshot(`04-range-multi-total-${width}.png`); }

  await viewport(1366); await clickText("同期比較"); await delay(120); await setControl("期間 A", "2025-06-01"); await setControl("期間 B", "2025-06-08"); await chooseMachines(["A1", "A2", "A4"]);
  await submit("比較兩個期間", "document.querySelectorAll('[data-chart=comparison-ranking] .comparison-v2-row').length===3");
  const axisCompareDay = await axisGeometry();
  const compareDay = await evaluate(`(() => ({titles:[...document.querySelectorAll('.operation-analysis-sections>.panel h2')].slice(-3).map((node)=>node.textContent),rankRows:document.querySelectorAll('.comparison-v2-row').length,trendZones:document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length,shareRows:document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length,selected:document.querySelectorAll('.machine-pills input:checked').length}))()`);
  await evaluate("document.querySelector('.comparison-v2-row').click()"); await delay(80);
  const comparisonHighlight = await evaluate(`(() => ({highlighted:document.querySelectorAll('.comparison-v2-row.is-highlighted').length,selected:document.querySelectorAll('.machine-pills input:checked').length,shareRows:document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length}))()`);
  await evaluate(`(() => {const zones=[...document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]')];zones[12].scrollIntoView({block:'center'});zones[12].focus();})()`); await waitFor("Boolean(document.querySelector('.trend-tooltip'))", "day comparison tooltip"); await delay(100);
  const trendTooltipDay = await trendTooltipGeometry();
  await screenshot("05-comparison-trend-tooltip-day-fixed-1366.png");
  await evaluate("document.activeElement.blur()");
  await clickText("單機趨勢"); await waitFor("Boolean(document.querySelector('[aria-label=\"檢視機台\"]'))", "single-machine selector"); await clickText("各機台占比"); await waitFor("document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length===6", "machine comparison shares");
  const localModes = await evaluate(`(() => ({machineSelector:document.querySelector('[aria-label="檢視機台"]')?.value,shareRows:document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length,selected:document.querySelectorAll('.machine-pills input:checked').length}))()`);
  await screenshot("06-compare-day-single-machine-share-1366.png");

  await setControl("比較類型", "week"); await delay(80); await setControl("期間 A", "2025-06-01"); await setControl("期間 B", "2025-06-08");
  const weekGuidance = await evaluate(`(() => ({option:document.querySelector('[aria-label="比較類型"]')?.selectedOptions[0]?.textContent,labels:[...document.querySelectorAll('.compare-filters label')].map((node)=>node.textContent),help:document.querySelector('.comparison-guidance')?.textContent,ranges:[...document.querySelectorAll('.comparison-range-preview span')].map((node)=>node.textContent)}))()`);
  await submit("比較兩個期間", "document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length===7");
  const axisCompareWeek = await axisGeometry();
  const endpointNormal = await pointGeometry();
  await evaluate(`(() => {const zones=[...document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]')];zones.at(-1).scrollIntoView({block:'center'});zones.at(-1).focus();})()`); await waitFor("Boolean(document.querySelector('.trend-tooltip'))", "last comparison point focus"); await delay(100);
  const endpointFocused = await pointGeometry();
  await screenshot("04-comparison-last-dot-fixed-1366.png");
  await evaluate(`(() => {const zones=[...document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]')];zones[2].focus();})()`); await delay(100);
  const trendTooltipWeek = await trendTooltipGeometry();
  const compareWeek = await evaluate(`(() => ({axis:[...document.querySelectorAll('[data-chart=operation-trend] .chart-axis-label')].map((node)=>node.textContent),zones:document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length,dashedLines:document.querySelectorAll('[data-chart=operation-trend] polyline[stroke-dasharray]').length}))()`);
  await screenshot("05-comparison-trend-tooltip-week-fixed-1366.png");
  await evaluate("document.activeElement.blur()");
  await clickText("整體占比"); await waitFor("document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length===2", "overall comparison shares");
  await evaluate(`(() => {const row=document.querySelector('[data-chart=operation-share] [data-share-row]');row.scrollIntoView({block:'center'});row.focus();})()`); await waitFor("Boolean(document.querySelector('.share-tooltip'))", "overall share tooltip"); await delay(120);
  const shareTooltipOverall = await shareTooltipGeometry();
  await screenshot("06-comparison-share-tooltip-overall-fixed-1366.png");
  await evaluate("document.activeElement.blur()"); await clickText("各機台占比"); await waitFor("document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length===6", "per-machine comparison shares");
  await evaluate(`(() => {const rows=[...document.querySelectorAll('[data-chart=operation-share] [data-share-row]')];rows.at(-1).scrollIntoView({block:'center'});rows.at(-1).focus();})()`); await waitFor("Boolean(document.querySelector('.share-tooltip'))", "machine share tooltip"); await delay(120);
  const shareTooltipMachine = await shareTooltipGeometry();
  await screenshot("06-comparison-share-tooltip-machine-fixed-1366.png");
  await evaluate("document.activeElement.blur()");

  await setControl("比較類型", "month"); await waitFor("document.querySelector('[aria-label=\"期間 A\"]')?.type==='month'", "month controls"); await setControl("期間 A", "2025-06"); await setControl("期間 B", "2025-07"); await waitFor("document.querySelector('button.primary')?.disabled===false", "month comparison ready"); await submit("比較兩個期間", "document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length===31");
  const axisCompareMonth = await axisGeometry();
  await evaluate(`(() => {const zones=[...document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]')];zones[15].scrollIntoView({block:'center'});zones[15].focus();})()`); await waitFor("Boolean(document.querySelector('.trend-tooltip'))", "month comparison tooltip"); await delay(100);
  const trendTooltipMonth = await trendTooltipGeometry();
  const responsiveTrendTooltips = {};
  for (const width of [1280, 1366, 1440]) { await viewport(width); await delay(100); responsiveTrendTooltips[width] = await trendTooltipGeometry(); }
  await viewport(1366); await delay(80);
  await screenshot("05-comparison-trend-tooltip-month-fixed-1366.png");
  await evaluate("document.activeElement.blur()");
  await clickText("整體占比"); await waitFor("document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length===2", "month overall comparison shares");
  await evaluate(`(() => {const row=document.querySelector('[data-chart=operation-share] [data-share-row]');row.scrollIntoView({block:'center'});row.focus();})()`); await waitFor("Boolean(document.querySelector('.share-tooltip'))", "responsive overall share tooltip"); await delay(100);
  const responsiveOverallShareTooltips = {};
  for (const width of [1280, 1366, 1440]) { await viewport(width); await delay(100); responsiveOverallShareTooltips[width] = await shareTooltipGeometry(); }
  await viewport(1366); await evaluate("document.activeElement.blur()"); await clickText("各機台占比"); await waitFor("document.querySelectorAll('[data-chart=operation-share] [data-share-row]').length===6", "month machine comparison shares");
  await evaluate(`(() => {const rows=[...document.querySelectorAll('[data-chart=operation-share] [data-share-row]')];rows.at(-1).scrollIntoView({block:'center'});rows.at(-1).focus();})()`); await waitFor("Boolean(document.querySelector('.share-tooltip'))", "responsive machine share tooltip"); await delay(100);
  const responsiveMachineShareTooltips = {};
  for (const width of [1280, 1366, 1440]) { await viewport(width); await delay(100); responsiveMachineShareTooltips[width] = await shareTooltipGeometry(); }
  await viewport(1366); await evaluate("document.activeElement.blur()");
  const compareMonth = await evaluate(`(() => ({axis:[...document.querySelectorAll('[data-chart=operation-trend] .chart-axis-label')].map((node)=>node.textContent),zones:document.querySelectorAll('[data-chart=operation-trend] [data-tooltip-zone]').length,unit:[...document.querySelectorAll('.value-axis-title')].map((node)=>node.textContent)}))()`);
  const compareLayouts = {};
  for (const width of [1280, 1366, 1440]) { await viewport(width); await delay(120); compareLayouts[width] = await metrics(); }
  await viewport(1366);
  cdp.close();
  return { empty, filterAlignment, range30, axisGeometry:{range30:axisRange30,range60:axisRange60,rangeMulti:axisRangeMulti,compareDay:axisCompareDay,compareWeek:axisCompareWeek,compareMonth:axisCompareMonth}, shareLabelGap, overlapTooltip, legendInteraction: { focusedSeries, hiddenSeries }, range60: { ...range60, totalsAndSharesUnchanged: JSON.stringify(range30.ranking)===JSON.stringify(range60.ranking)&&JSON.stringify(range30.shares)===JSON.stringify(range60.shares) }, missingMachine, multiDayGrain, rangeLayouts, compareDay, comparisonHighlight, localModes, weekGuidance, endpointNormal, endpointFocused, trendTooltips:{day:trendTooltipDay,week:trendTooltipWeek,month:trendTooltipMonth}, shareTooltips:{overall:shareTooltipOverall,machine:shareTooltipMachine}, responsiveTooltips:{trend:responsiveTrendTooltips,overallShare:responsiveOverallShareTooltips,machineShare:responsiveMachineShareTooltips}, compareWeek, compareMonth, compareLayouts, evidenceDir };
}

try {
  const result = await run();
  writeFileSync(resolve(evidenceDir,"metrics.json"),`${JSON.stringify(result,null,2)}\n`);
  if (result.range30.dashedLines !== 0 || result.compareWeek.dashedLines !== 0) throw new Error("趨勢折線仍含虛線樣式");
  if (!result.range30.percentageStyles.length || result.range30.percentageStyles.some((item) => Number.parseFloat(item.fontSize) < 15 || item.color !== "rgb(33, 17, 22)")) throw new Error("燈號占比數字對比或字級未達標");
  if (result.multiDayGrain.value !== "daily" || !result.multiDayGrain.disabled || !result.multiDayGrain.notice?.includes("已切換為每日粒度")) throw new Error("跨日粒度控制未鎖定每日");
  if (!result.weekGuidance.ranges.includes("期間 A2025/06/01 – 2025/06/07") || !result.weekGuidance.ranges.includes("期間 B2025/06/08 – 2025/06/14")) throw new Error("週對週完整日期範圍未顯示");
  if (Math.max(result.filterAlignment.labelTopSpread,result.filterAlignment.controlTopSpread,result.filterAlignment.controlBottomSpread,result.filterAlignment.controlHeightSpread)>1) throw new Error("篩選欄位未對齊");
  if (Object.values(result.axisGeometry).some((item)=>item.overlap||item.minimumGap<6)) throw new Error("Y 軸標題與刻度仍重疊");
  if (result.shareLabelGap.some((item)=>item.gap>20)) throw new Error("機台名稱與占比長條間距過大");
  const endpointStates=[result.endpointNormal,result.endpointFocused].flatMap((state)=>state.series.flatMap((series)=>[series.first,series.last]));
  if (endpointStates.some((point)=>Math.abs(point.width-point.height)>.5||point.dash!=="none")) throw new Error("折線首尾資料點形狀異常");
  if (Object.values(result.trendTooltips).some((tip)=>!tip.withinViewport||tip.overflowX||tip.rows!==2||tip.dates.some((date)=>date.scrollWidth>date.width+1))) throw new Error("同期趨勢 Tooltip 仍有溢位或異常換行");
  if (Object.values(result.shareTooltips).some((tip)=>!tip.withinViewport||tip.overflowX||tip.stateRows!==3)) throw new Error("燈號占比 Tooltip 仍有溢位或內容不完整");
  if (Object.values(result.responsiveTooltips).flatMap((group)=>Object.values(group)).some((tip)=>!tip.withinViewport||tip.overflowX)) throw new Error("1280/1366/1440 Tooltip 邊界驗證失敗");
  console.log(JSON.stringify(result, null, 2));
} finally { chrome.kill("SIGTERM"); }
