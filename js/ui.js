// Small shared helpers: tooltip, formatting, segmented controls, responsive sizing.
const d3 = window.d3;

export const COLORS = {
  dry: "#2a78d6", wet: "#eb6834", frozen: "#1baf7a", ambiguous: "#b7b5ad",
  day: "#eda100", night: "#4a3aa7", react: "#c9c7c0", ink: "#0b0b0b", ink2: "#52514e",
  grid: "#ecebe6", accent: "#1f3a4d", alert: "#b3261e",
};
export const CLASS_LABEL = { dry: "dry", wet: "rain", frozen: "snow / ice", ambiguous: "precip. type unknown" };

export const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
export const fmtPct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
export const $ = (sel) => document.querySelector(sel);

// ---------- tooltip ----------
const tip = () => document.getElementById("tip");
export function showTip(evt, html) {
  const t = tip();
  t.innerHTML = html;
  t.style.opacity = 1;
  const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
  t.style.left = `${x}px`; t.style.top = `${y}px`;
}
export function hideTip() { tip().style.opacity = 0; }

// ---------- segmented control ----------
export function segmented(sel, onChange) {
  const root = document.querySelector(sel);
  const buttons = [...root.querySelectorAll("button")];
  const api = {
    value: buttons.find((b) => b.classList.contains("on"))?.dataset.k,
    set(k, fire = true) {
      buttons.forEach((b) => {
        b.classList.toggle("on", b.dataset.k === k);
        b.setAttribute("aria-pressed", b.dataset.k === k);
      });
      api.value = k;
      if (fire) onChange(k);
    },
  };
  buttons.forEach((b) => b.addEventListener("click", () => api.set(b.dataset.k)));
  api.set(api.value, false);
  return api;
}

// ---------- svg scaffold with a viewBox, so charts scale with their container ----------
export function svgIn(container, width, height) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  d3.select(el).selectAll("svg").remove();
  return d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
}
export const widthOf = (sel) => Math.max(320, (document.querySelector(sel)?.clientWidth || 900));

// Hatch pattern for "night", added once per svg.
export function hatchDefs(svg) {
  const defs = svg.append("defs");
  for (const [key, col] of Object.entries(COLORS)) {
    const p = defs.append("pattern").attr("id", `hatch-${key}`).attr("patternUnits", "userSpaceOnUse")
      .attr("width", 6).attr("height", 6).attr("patternTransform", "rotate(45)");
    p.append("rect").attr("width", 6).attr("height", 6).attr("fill", col);
    p.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 6)
      .attr("stroke", "rgba(255,255,255,0.7)").attr("stroke-width", 2.2);
  }
  return defs;
}

export function legend(sel, items) {
  document.querySelector(sel).innerHTML = items.map(([col, label, hatch]) =>
    `<span><i style="background-color:${col}" class="${hatch ? "hatch" : ""}"></i>${label}</span>`).join("");
}

// Run fn on resize, debounced.
export function onResize(fn) {
  let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(fn, 150); });
}
