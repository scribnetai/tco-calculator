/* TCO Calculator — year-by-year total cost of ownership, current vs proposed. */
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
function fmt$(n) {
  const neg = n < 0, a = Math.abs(n);
  const s = a >= 1e6 ? "$" + (a/1e6).toFixed(2) + "M"
        : a >= 1e3 ? "$" + (a/1e3).toFixed(a >= 1e5 ? 0 : 1) + "k"
        : "$" + a.toFixed(0);
  return (neg ? "-" : "") + s;
}
const fmtPct = (n) => (n*100).toFixed(1) + "%";

/* ---------- field definitions (per scenario) ---------- */
const FIELDS = [
  { sec: "One-time costs" },
  { k: "hardware",  label: "Hardware capex", unit: "$", def: 0 },
  { k: "hwRefresh", label: "Hardware refresh in year", unit: "0 = none", def: 0, int: true },
  { k: "swOnce",    label: "Software licenses (one-time)", unit: "$", def: 0 },
  { k: "migration", label: "Migration & professional services", unit: "$", def: 0 },
  { sec: "Annual recurring" },
  { k: "swAnnual",    label: "Software / subscription", unit: "$/yr", def: 0 },
  { k: "support",     label: "Maintenance & support", unit: "$/yr", def: 0 },
  { k: "powerKw",     label: "Power draw", unit: "kW", def: 0 },
  { k: "pue",         label: "PUE", unit: "×", def: 1.6 },
  { k: "facilities",  label: "Facilities / colo", unit: "$/yr", def: 0 },
  { k: "adminHrs",    label: "Admin time", unit: "hrs/wk", def: 0 },
  { k: "loadedRate",  label: "Loaded labor rate", unit: "$/hr", def: 95 },
  { k: "downtime",    label: "Downtime / risk cost", unit: "$/yr", def: 0 },
  { k: "otherAnnual", label: "Other annual", unit: "$/yr", def: 0 },
];

function blankScenario(name) {
  const o = { name };
  for (const f of FIELDS) if (f.k) o[f.k] = f.def;
  return o;
}
let S = {
  g: { horizon: 5, discount: 8, uplift: 3, kwh: 0.18 },
  cur: blankScenario("Current state"),
  pro: blankScenario("Proposed"),
};
let activeScen = "cur";

/* ---------- math ---------- */
function compute(key) {
  const sc = S[key], g = S.g;
  const H = g.horizon, r = g.discount / 100, u = g.uplift / 100;
  const powerAnnual = sc.powerKw * 8760 * g.kwh * sc.pue;
  const adminAnnual = sc.adminHrs * 52 * sc.loadedRate;
  const base = sc.swAnnual + sc.support + powerAnnual + sc.facilities + adminAnnual + sc.downtime + sc.otherAnnual;
  const years = [];
  let cum = 0, cumDisc = 0;
  for (let y = 1; y <= H; y++) {
    let once = 0;
    if (y === 1) once += sc.hardware + sc.swOnce + sc.migration;
    if (sc.hwRefresh === y) once += sc.hardware;
    const annual = base * Math.pow(1 + u, y - 1);
    const total = once + annual;
    const disc = total / Math.pow(1 + r, y);
    cum += total; cumDisc += disc;
    years.push({ y, once, annual, total, disc, cum, cumDisc });
  }
  return { years, tco: cum, npv: cumDisc, powerAnnual, adminAnnual, base,
           onceY1: sc.hardware + sc.swOnce + sc.migration };
}

function breakevenYear(a, b) {
  for (let i = 0; i < a.years.length; i++)
    if (b.years[i].cum <= a.years[i].cum) return i + 1;
  return null;
}

/* ---------- findings ---------- */
function buildFindings(A, B) {
  const F = [];
  const H = S.g.horizon;
  const savings = A.tco - B.tco;
  const savPct = A.tco > 0 ? savings / A.tco : 0;
  const npvSav = A.npv - B.npv;
  const be = breakevenYear(A, B);

  F.push({ t: `${savings >= 0 ? "Saves" : "Costs extra"} ${fmt$(Math.abs(savings))} over ${H} years`,
    d: `That's ${savings >= 0 ? "a" : "a negative"} ${fmtPct(Math.abs(savPct))} swing on a ${fmt$(A.tco)} current-state TCO — about ${fmt$(savings / H)} per year on average.` });

  if (be) F.push({ t: `Breakeven in year ${be}`,
    d: be === 1 ? "The proposal is cheaper from day one — lead with that."
      : `Cumulative proposed spend drops below current-state in year ${be}. Everything after that is pure savings.` });
  else F.push({ t: "No breakeven inside the horizon", warn: true,
    d: `The proposal never catches up within ${H} years on cost alone. The deal needs a non-cost driver — risk, capability, or EOL pressure — or cheaper inputs.` });

  const art = /^(8|11|18)/.test(String(S.g.discount)) ? "an" : "a";
  F.push({ t: `Risk-adjusted value: ${fmt$(npvSav)} NPV`,
    d: `At ${art} ${S.g.discount}% cost of capital, the discounted savings are ${fmt$(npvSav)}. Finance teams think in NPV — bring this number, not just the sticker total.` });

  // biggest cost driver in current
  const c = S.cur;
  const drivers = [
    ["Maintenance & support", c.support], ["Software / subscription", c.swAnnual],
    ["Hardware capex", c.hardware], ["Admin labor", A.adminAnnual],
    ["Power", A.powerAnnual], ["Downtime / risk", c.downtime], ["Facilities", c.facilities],
  ].sort((x, y) => y[1] - x[1]);
  F.push({ t: `Biggest current-state cost: ${drivers[0][0]} at ${fmt$(drivers[0][1] * (drivers[0][0]==="Hardware capex" ? 1 : H))}`,
    d: drivers[0][0] === "Hardware capex"
      ? "Capex dominates — the refresh conversation is really a financing conversation."
      : `Recurring spend dominates. ${fmtPct((A.base * H) / A.tco)} of current TCO is opex you pay every year whether you refresh or not.` });

  const fte = c.adminHrs / 40;
  if (c.adminHrs > 0) F.push({ t: `${fte.toFixed(2)} FTE tied up in admin (${fmt$(A.adminAnnual)}/yr)`,
    d: `Proposed needs ${S.pro.adminHrs} hrs/wk. That's the staffing delta to put in front of the hiring manager, not just finance.` });

  const kwhDelta = (c.powerKw - S.pro.powerKw) * 8760 * c.pue;
  if (c.powerKw > 0 || S.pro.powerKw > 0) F.push({ t: `Power delta: ${fmt$(A.powerAnnual - B.powerAnnual)}/yr`,
    d: kwhDelta > 0 ? `~${Math.round(kwhDelta).toLocaleString()} fewer kWh per year. Sustainability teams love this slide.`
      : "The proposal draws more power — make sure the facilities line reflects it." });

  const upfrontDelta = B.onceY1 - A.onceY1;
  F.push({ t: `Year-1 cash outlay ${upfrontDelta >= 0 ? "increases" : "drops"} by ${fmt$(Math.abs(upfrontDelta))}`,
    d: upfrontDelta > 0
      ? "Capex goes up before savings arrive — that's the CFO objection to pre-handle. Pair it with the breakeven year."
      : "Lower day-one spend and lower run-rate: the rare proposal that's cheaper on both axes." });

  if (S.pro.migration > 0) {
    const y1sav = A.years[0].total - B.years[0].total;
    F.push({ t: `Migration (${fmt$(S.pro.migration)}) is ${y1sav !== 0 ? fmtPct(Math.abs(S.pro.migration / y1sav)) : "—"} of the year-1 swing`,
      d: "Migration is the line customers cut first. Defend it as the price of the savings, not overhead." });
  }

  // uplift sensitivity on current
  const hi = JSON.parse(JSON.stringify(S));
  hi.g.uplift += 2;
  const Ahi = computeWith(hi, "cur");
  F.push({ t: `Uplift sensitivity: +2 pts adds ${fmt$(Ahi.tco - A.tco)} to current TCO`,
    d: `At ${S.g.uplift}% uplift the model may be conservative — support renewals rarely get cheaper. Stress-test this in the room.` });

  if (c.hwRefresh > 0 && c.hwRefresh <= H) F.push({ t: `Current hardware refresh lands in year ${c.hwRefresh}`,
    d: "That refresh capex is doing a lot of work in the current-state total. If the customer would really sweat the asset longer, say so — honesty here builds trust." });

  F.push({ t: "This is a model, not a quote", warn: true,
    d: "Every output traces back to assumptions typed above. Validate hardware, licensing, and services against real distributor quotes before anything customer-facing." });
  return F;
}
// compute() against an arbitrary state (for sensitivity)
function computeWith(state, key) {
  const keep = S; S = state;
  const out = compute(key);
  S = keep; return out;
}

/* ---------- rendering ---------- */
function renderScenarioFields() {
  const host = $("scenario-fields");
  host.innerHTML = FIELDS.map((f) => f.sec
    ? `<div class="fsec">${esc(f.sec)}</div>`
    : `<div class="fld"><label>${esc(f.label)} <span class="unit">${esc(f.unit)}</span></label>
       <input type="number" data-k="${f.k}" value="${S[activeScen][f.k]}" min="0" step="any"></div>`).join("");
  host.querySelectorAll("input[data-k]").forEach((inp) =>
    inp.addEventListener("input", () => {
      const k = inp.dataset.k;
      const f = FIELDS.find((x) => x.k === k);
      let v = parseFloat(inp.value);
      if (!isFinite(v) || v < 0) v = 0;
      if (f.int) v = Math.round(v);
      S[activeScen][k] = v;
      scheduleAutosave(); render();
    }));
  $("s-name").value = S[activeScen].name;
  $("tab-current").textContent = S.cur.name || "Current state";
  $("tab-proposed").textContent = S.pro.name || "Proposed";
}

function render() {
  const A = compute("cur"), B = compute("pro");
  const H = S.g.horizon;
  const savings = A.tco - B.tco, savPct = A.tco > 0 ? savings / A.tco : 0;
  const be = breakevenYear(A, B);

  $("lg-cur").textContent = S.cur.name || "Current";
  $("lg-pro").textContent = S.pro.name || "Proposed";

  $("kpis").innerHTML = `
    <div class="kpi"><div class="k">${esc(S.cur.name)} TCO</div><div class="v">${fmt$(A.tco)}</div><div class="s">${H}-yr undiscounted</div></div>
    <div class="kpi"><div class="k">${esc(S.pro.name)} TCO</div><div class="v">${fmt$(B.tco)}</div><div class="s">${H}-yr undiscounted</div></div>
    <div class="kpi ${savings >= 0 ? "good" : ""}"><div class="k">Total savings</div><div class="v">${fmt$(savings)}</div><div class="s">${fmtPct(savPct)} of current TCO</div></div>
    <div class="kpi"><div class="k">NPV savings</div><div class="v">${fmt$(A.npv - B.npv)}</div><div class="s">@ ${S.g.discount}% discount</div></div>
    <div class="kpi ${be ? "good" : ""}"><div class="k">Breakeven</div><div class="v">${be ? "Year " + be : "—"}</div><div class="s">${be ? "cumulative crossover" : "none in horizon"}</div></div>
    <div class="kpi"><div class="k">Avg annual savings</div><div class="v">${fmt$(savings / H)}</div><div class="s">per year</div></div>`;

  // year table
  let rows = `<tr><th>Year</th><th>${esc(S.cur.name)}</th><th>${esc(S.pro.name)}</th><th>Annual savings</th><th>Cumulative savings</th></tr>`;
  for (let i = 0; i < H; i++) {
    const a = A.years[i], b = B.years[i];
    const ann = a.total - b.total, cumS = a.cum - b.cum;
    rows += `<tr><td>${a.y}</td><td>${fmt$(a.total)}</td><td>${fmt$(b.total)}</td>
      <td class="${ann >= 0 ? "pos" : "neg"}">${fmt$(ann)}</td>
      <td class="${cumS >= 0 ? "pos" : "neg"}">${fmt$(cumS)}</td></tr>`;
  }
  rows += `<tr class="total"><td>Total</td><td>${fmt$(A.tco)}</td><td>${fmt$(B.tco)}</td><td></td>
    <td class="${savings >= 0 ? "pos" : "neg"}">${fmt$(savings)}</td></tr>`;
  $("year-table").innerHTML = rows;

  $("findings").innerHTML = buildFindings(A, B).map((f) =>
    `<div class="finding${f.warn ? " warn" : ""}"><h4>${esc(f.t)}</h4><p>${esc(f.d)}</p></div>`).join("");

  drawChart(A, B);
}

function drawChart(A, B) {
  const cv = $("tco-chart"), ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, Hh = cv.clientHeight;
  cv.width = W * dpr; cv.height = Hh * dpr; ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, Hh);
  const padL = 64, padR = 14, padT = 14, padB = 30;
  const maxV = Math.max(A.years[A.years.length-1].cum, B.years[B.years.length-1].cum, 1);
  const X = (i) => padL + (i / (A.years.length - 1 || 1)) * (W - padL - padR);
  const Y = (v) => padT + (1 - v / maxV) * (Hh - padT - padB);
  // gridlines + y labels
  ctx.strokeStyle = "#1e2a4a"; ctx.fillStyle = "#8b98b8"; ctx.font = "11px Outfit, sans-serif";
  ctx.textAlign = "right";
  for (let gLine = 0; gLine <= 4; gLine++) {
    const v = maxV * gLine / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(fmt$(v), padL - 8, y + 4);
  }
  ctx.textAlign = "center";
  A.years.forEach((yr, i) => ctx.fillText("Y" + yr.y, X(i), Hh - 10));
  // savings area (where B < A)
  ctx.beginPath();
  A.years.forEach((yr, i) => i ? ctx.lineTo(X(i), Y(yr.cum)) : ctx.moveTo(X(0), Y(yr.cum)));
  for (let i = B.years.length - 1; i >= 0; i--) ctx.lineTo(X(i), Y(B.years[i].cum));
  ctx.closePath(); ctx.fillStyle = "rgba(52,211,153,.12)"; ctx.fill();
  const line = (years, color) => {
    ctx.beginPath();
    years.forEach((yr, i) => i ? ctx.lineTo(X(i), Y(yr.cum)) : ctx.moveTo(X(0), Y(yr.cum)));
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
    years.forEach((yr, i) => { ctx.beginPath(); ctx.arc(X(i), Y(yr.cum), 3.5, 0, 7); ctx.fillStyle = color; ctx.fill(); });
  };
  line(A.years, "#2f9be8"); line(B.years, "#7c5cf6");
  // breakeven marker
  const be = breakevenYear(A, B);
  if (be) {
    const i = be - 1, x = X(i), y = Y(B.years[i].cum);
    ctx.strokeStyle = "#34d399"; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Hh - padB); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#34d399"; ctx.textAlign = "left";
    ctx.fillText("breakeven", x + 6, y - 8);
  }
}

/* ---------- report ---------- */
function downloadReport() {
  const A = compute("cur"), B = compute("pro"), H = S.g.horizon;
  const savings = A.tco - B.tco, be = breakevenYear(A, B);
  const row = (l, v) => `<tr><td>${esc(l)}</td><td>${esc(v)}</td></tr>`;
  const scenTable = (key, R) => {
    const sc = S[key];
    let h = `<h3>${esc(sc.name)}</h3><table>`;
    for (const f of FIELDS) {
      if (f.sec) { h += `</table><h4>${esc(f.sec)}</h4><table>`; continue; }
      let v = sc[f.k];
      if (["hardware","swOnce","migration","swAnnual","support","facilities","downtime","otherAnnual"].includes(f.k)) v = fmt$(v);
      else if (f.k === "powerKw") v = v + " kW";
      else if (f.k === "pue") v = v + "×";
      else if (f.k === "adminHrs") v = v + " hrs/wk";
      else if (f.k === "loadedRate") v = "$" + v + "/hr";
      else if (f.k === "hwRefresh") v = v === 0 ? "none" : "year " + v;
      h += row(f.label + " (" + f.unit + ")", v);
    }
    return h + `</table><p><b>${H}-year TCO: ${fmt$(R.tco)}</b> · NPV @ ${S.g.discount}%: ${fmt$(R.npv)}</p>`;
  };
  let yrRows = "";
  for (let i = 0; i < H; i++) {
    const a = A.years[i], b = B.years[i];
    yrRows += `<tr><td>${a.y}</td><td>${fmt$(a.total)}</td><td>${fmt$(b.total)}</td><td>${fmt$(a.total - b.total)}</td><td>${fmt$(a.cum - b.cum)}</td></tr>`;
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TCO Report — ${esc(S.cur.name)} vs ${esc(S.pro.name)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#111}
h1{font-size:1.6rem}h2{margin-top:2em;border-bottom:2px solid #ddd;padding-bottom:6px}h4{margin:1.2em 0 .4em;color:#555}
table{border-collapse:collapse;width:100%;margin:.6em 0}td,th{border:1px solid #ddd;padding:8px 10px;text-align:left;font-size:.92rem}
th{background:#f4f4f4}.kpis{display:flex;gap:12px;flex-wrap:wrap}.kpi{border:1px solid #ddd;border-radius:8px;padding:12px 16px;min-width:150px}
.kpi b{font-size:1.3rem}.finding{border-left:3px solid #2f9be8;background:#f8fafc;padding:10px 14px;margin:8px 0}
.warn{border-left-color:#d97706}.fine{color:#666;font-size:.85rem;margin-top:2em}</style></head><body>
<h1>TCO Report: ${esc(S.cur.name)} vs ${esc(S.pro.name)}</h1>
<p>Generated ${new Date().toISOString().slice(0,10)} · Horizon ${H} years · Discount ${S.g.discount}% · Uplift ${S.g.uplift}%/yr · Power $${S.g.kwh}/kWh</p>
<div class="kpis">
<div class="kpi">${esc(S.cur.name)} TCO<br><b>${fmt$(A.tco)}</b></div>
<div class="kpi">${esc(S.pro.name)} TCO<br><b>${fmt$(B.tco)}</b></div>
<div class="kpi">Savings<br><b>${fmt$(savings)}</b></div>
<div class="kpi">Breakeven<br><b>${be ? "Year " + be : "None in horizon"}</b></div></div>
<h2>Year-by-year</h2><table><tr><th>Year</th><th>${esc(S.cur.name)}</th><th>${esc(S.pro.name)}</th><th>Annual savings</th><th>Cumulative savings</th></tr>${yrRows}</table>
<h2>Findings</h2>${buildFindings(A,B).map(f=>`<div class="finding${f.warn?" warn":""}"><b>${esc(f.t)}</b><br>${esc(f.d)}</div>`).join("")}
<h2>Inputs</h2>${scenTable("cur", A)}${scenTable("pro", B)}
<p class="fine">Model, not a quote. Outputs trace back to the assumptions above — validate hardware, licensing, and services pricing against real distributor quotes before anything customer-facing.</p>
</body></html>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  a.download = "tco-report.html"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Report downloaded.");
}

/* ---------- projects ---------- */
const LS_P = "tco-projects", LS_A = "tco-autosave";
const loadLS = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const saveLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let saveTimer = null;
function scheduleAutosave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveLS(LS_A, S), 800); }

function refreshProjList() {
  const p = loadLS(LS_P) || {};
  const sel = $("proj-select");
  sel.innerHTML = `<option value="">Saved projects…</option>` + Object.keys(p).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
}
function applyState(ns) {
  S = ns; activeScen = "cur";
  $("g-horizon").value = S.g.horizon; $("g-discount").value = S.g.discount;
  $("g-uplift").value = S.g.uplift; $("g-kwh").value = S.g.kwh;
  renderScenarioFields(); render();
}
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(t._h); t._h = setTimeout(() => t.style.display = "none", 2600);
}

/* ---------- demo / reset ---------- */
function loadDemo() {
  S = {
    g: { horizon: 5, discount: 8, uplift: 3, kwh: 0.18 },
    cur: Object.assign(blankScenario("Legacy 3-tier"), {
      hardware: 240000, hwRefresh: 4, swOnce: 60000, migration: 0,
      swAnnual: 45000, support: 78000, powerKw: 14, pue: 1.6, facilities: 24000,
      adminHrs: 10, loadedRate: 95, downtime: 40000, otherAnnual: 8000 }),
    pro: Object.assign(blankScenario("HCI refresh"), {
      hardware: 260000, hwRefresh: 0, swOnce: 0, migration: 45000,
      swAnnual: 110000, support: 35000, powerKw: 8, pue: 1.6, facilities: 18000,
      adminHrs: 4, loadedRate: 95, downtime: 10000, otherAnnual: 5000 }),
  };
  applyState(S); scheduleAutosave(); toast("Demo data loaded.");
}
function resetAll() {
  if (!confirm("Clear everything and start over?")) return;
  S = { g: { horizon: 5, discount: 8, uplift: 3, kwh: 0.18 },
        cur: blankScenario("Current state"), pro: blankScenario("Proposed") };
  localStorage.removeItem(LS_A);
  applyState(S); toast("Started over.");
}

/* ---------- view nav ---------- */
function openApp() {
  $("landing").style.display = "none"; $("appview").style.display = "block";
  window.scrollTo(0, 0); render(); drawChart(compute("cur"), compute("pro"));
}
function showLanding(hash) {
  $("appview").style.display = "none"; $("landing").style.display = "block";
  if (hash) setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" }), 50);
  else window.scrollTo(0, 0);
}

/* ---------- wire up ---------- */
document.querySelectorAll("nav.site a").forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const mode = a.dataset.nav, hash = a.getAttribute("href");
    if (mode === "app") { if ($("appview").style.display !== "block") openApp(); $("calculator").scrollIntoView({ behavior: "smooth" }); }
    else showLanding(hash);
  }));
$("brand-home").addEventListener("click", (e) => { e.preventDefault(); showLanding(); });
$("cta-open").addEventListener("click", openApp);
$("cta-demo").addEventListener("click", () => { openApp(); loadDemo(); });
$("btn-back").addEventListener("click", () => showLanding());

[["g-horizon","horizon",true],["g-discount","discount"],["g-uplift","uplift"],["g-kwh","kwh"]].forEach(([id, k, isSel]) => {
  $(id).addEventListener(isSel ? "change" : "input", () => {
    S.g[k] = num($(id).value); scheduleAutosave(); render();
  });
});

$("s-name").addEventListener("input", () => {
  S[activeScen].name = $("s-name").value; scheduleAutosave(); render();
  $("tab-" + (activeScen === "cur" ? "current" : "proposed")).textContent = S[activeScen].name || (activeScen === "cur" ? "Current state" : "Proposed");
});
document.querySelectorAll(".scen-tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".scen-tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    activeScen = t.dataset.s === "current" ? "cur" : "pro";
    renderScenarioFields();
  }));

$("btn-demo").addEventListener("click", loadDemo);
$("btn-reset").addEventListener("click", resetAll);
$("btn-report").addEventListener("click", downloadReport);
$("btn-save").addEventListener("click", () => {
  const name = prompt("Project name:", S.cur.name + " vs " + S.pro.name);
  if (!name) return;
  const p = loadLS(LS_P) || {}; p[name] = S; saveLS(LS_P, p);
  refreshProjList(); $("proj-select").value = name; toast(`Saved "${name}".`);
});
$("proj-select").addEventListener("change", (e) => {
  const p = loadLS(LS_P) || {};
  if (e.target.value && p[e.target.value]) { applyState(p[e.target.value]); scheduleAutosave(); toast(`Loaded "${e.target.value}".`); }
});
$("btn-export").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "tco-calculator", v: 1, state: S }, null, 2)], { type: "application/json" }));
  a.download = "tco-project.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast("Project exported.");
});
$("btn-import").addEventListener("click", () => $("file-import").click());
$("file-import").addEventListener("change", (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      const st = d.state || d;
      if (!st.g || !st.cur || !st.pro) throw new Error("bad shape");
      applyState(st); scheduleAutosave(); toast("Project imported.");
    } catch { toast("That file isn't a TCO project."); }
  };
  r.readAsText(f); e.target.value = "";
});

window.addEventListener("resize", () => { if ($("appview").style.display === "block") drawChart(compute("cur"), compute("pro")); });

/* changelog */
fetch("CHANGELOG.md", { cache: "no-store" })
  .then((r) => { if (!r.ok) throw 0; return r.text(); })
  .then((md) => {
    let html = "", inList = false;
    const close = () => { if (inList) { html += "</ul>"; inList = false; } };
    for (const line of md.split("\n")) {
      if (line.startsWith("## ")) { close(); html += `<h3>${esc(line.slice(3).trim())}</h3>`; }
      else if (line.startsWith("- ")) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${esc(line.slice(2).trim())}</li>`; }
    }
    close();
    $("changelog-body").innerHTML = html || "<p>No entries yet.</p>";
  })
  .catch(() => { $("changelog-body").innerHTML = "<p>Changelog unavailable.</p>"; });

/* init */
(function init() {
  const auto = loadLS(LS_A);
  if (auto && auto.g && auto.cur && auto.pro) {
    S = auto;
    setTimeout(() => toast("Restored your last session."), 600);
  }
  $("g-horizon").value = S.g.horizon; $("g-discount").value = S.g.discount;
  $("g-uplift").value = S.g.uplift; $("g-kwh").value = S.g.kwh;
  renderScenarioFields(); refreshProjList();
})();
