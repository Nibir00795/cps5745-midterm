// View 1: reported crashes by hour of day, stacked by weather class, revealed hour by hour.
import { COLORS, CLASS_LABEL, fmtInt, fmtPct, showTip, hideTip, segmented, svgIn, legend, $ } from "../ui.js";

const d3 = window.d3;
const W = 900, H = 360, M = { t: 18, r: 16, b: 46, l: 70 };
const ORDER = ["dry", "wet", "frozen", "ambiguous"];

export function initV1(byhour) {
  const hours = d3.range(24);
  const total = (c, h) => byhour.counts[c].Day[h] + byhour.counts[c].Night[h];
  const nightShare = hours.map((h) => {
    const n = ORDER.reduce((s, c) => s + byhour.counts[c].Night[h], 0);
    const a = ORDER.reduce((s, c) => s + total(c, h), 0);
    return n / a;
  });
  const rows = hours.map((h) => {
    const r = { h };
    ORDER.forEach((c) => (r[c] = total(c, h)));
    r.all = ORDER.reduce((s, c) => s + r[c], 0);
    return r;
  });
  const grand = d3.sum(rows, (r) => r.all);
  const nDay = ORDER.reduce((s, c) => s + d3.sum(byhour.counts[c].Day), 0);

  let filter = "all", upto = 23, timer = null;

  legend("#v1legend", ORDER.map((c) => [COLORS[c], CLASS_LABEL[c]]));
  const excl = byhour.n_excluded;
  $("#v1excl").textContent = Object.entries(excl).map(([k, v]) => `${fmtInt(v)} ${k.replaceAll("_", " ")}`).join("; ");

  const svg = svgIn("#v1viz", W, H);
  const x = d3.scaleBand().domain(hours).range([M.l, W - M.r]).paddingInner(0.18);
  const y = d3.scaleLinear().range([H - M.b, M.t]);
  const gNight = svg.append("g");
  const gGrid = svg.append("g").attr("class", "grid").attr("transform", `translate(${M.l},0)`);
  const gBars = svg.append("g");
  const gLabels = svg.append("g");
  const gx = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`);
  const gy = svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`);
  svg.append("text").attr("class", "axlabel").attr("x", (M.l + W - M.r) / 2).attr("y", H - 8)
    .attr("text-anchor", "middle").text("hour of day the crash started (local time)");
  const ylab = svg.append("text").attr("class", "axlabel").attr("transform", "rotate(-90)")
    .attr("x", -(H - M.b + M.t) / 2).attr("y", 16).attr("text-anchor", "middle");
  const hits = svg.append("g");

  gNight.selectAll("rect").data(hours).join("rect")
    .attr("x", (h) => x(h) - x.step() * x.paddingInner() / 2).attr("width", x.step())
    .attr("y", M.t).attr("height", H - M.b - M.t)
    .attr("fill", COLORS.night).attr("opacity", (h) => (nightShare[h] > 0.5 ? 0.07 : 0));
  gx.call(d3.axisBottom(x).tickValues(hours.filter((h) => h % 2 === 0)).tickFormat((h) => `${String(h).padStart(2, "0")}:00`).tickSizeOuter(0));

  function keys() { return filter === "all" ? ORDER : [filter]; }

  function draw() {
    const ks = keys();
    const max = d3.max(rows, (r) => d3.sum(ks, (k) => r[k]));
    y.domain([0, max * 1.08]).nice();
    gy.call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("~s")));
    gGrid.call(d3.axisLeft(y).ticks(6).tickSize(-(W - M.l - M.r)).tickFormat(""));
    ylab.text(filter === "all" ? "reported crashes (all weather)" : `reported crashes (${CLASS_LABEL[filter]})`);

    const stack = d3.stack().keys(ks)(rows);
    gBars.selectAll("g.layer").data(stack, (d) => d.key).join("g").attr("class", "layer")
      .attr("fill", (d) => COLORS[d.key])
      .selectAll("rect").data((d) => d.map((v, i) => ({ v, h: i, key: d.key })))
      .join("rect")
      .attr("x", (d) => x(d.h)).attr("width", x.bandwidth())
      .attr("y", (d) => y(d.v[1])).attr("height", (d) => Math.max(0, y(d.v[0]) - y(d.v[1]) - (d.v[1] > d.v[0] ? 1 : 0)))
      .attr("rx", 2)
      .attr("opacity", (d) => (d.h <= upto ? 1 : 0));

    // direct label on the tallest revealed bar, never on every bar
    const revealed = rows.filter((r) => r.h <= upto);
    const peak = d3.greatest(revealed, (r) => d3.sum(ks, (k) => r[k]));
    gLabels.selectAll("text").data(peak ? [peak] : []).join("text").attr("class", "lbl")
      .attr("x", (r) => x(r.h) + x.bandwidth() / 2).attr("y", (r) => y(d3.sum(ks, (k) => r[k])) - 6)
      .attr("text-anchor", "middle").text((r) => fmtInt(d3.sum(ks, (k) => r[k])));

    hits.selectAll("rect").data(rows).join("rect").attr("class", "hit")
      .attr("x", (r) => x(r.h) - x.step() * x.paddingInner() / 2).attr("width", x.step())
      .attr("y", M.t).attr("height", H - M.b - M.t)
      .on("mousemove", (evt, r) => { if (r.h <= upto) { showTip(evt, tipHtml(r)); $("#v1read").innerHTML = lineHtml(r); } })
      .on("mouseleave", hideTip);

    $("#v1hour").value = upto;
    $("#v1hourOut").textContent = `${String(upto).padStart(2, "0")}:00`;
    if (upto === 23 && !timer) $("#v1read").innerHTML = summary();
  }

  const tipHtml = (r) => `<b>${String(r.h).padStart(2, "0")}:00 to ${String(r.h).padStart(2, "0")}:59</b><br>` +
    ORDER.map((c) => `<span class="k">${CLASS_LABEL[c]}</span> ${fmtInt(r[c])}`).join("<br>") +
    `<br><span class="k">total</span> <b>${fmtInt(r.all)}</b><br><span class="k">after sunset</span> ${fmtPct(nightShare[r.h], 0)}`;
  const lineHtml = (r) => `${String(r.h).padStart(2, "0")}:00 · dry ${fmtInt(r.dry)} · rain ${fmtInt(r.wet)} · snow/ice ${fmtInt(r.frozen)} · total ${fmtInt(r.all)} reports · ${fmtPct(nightShare[r.h], 0)} after sunset`;
  function summary() {
    const dry = d3.sum(rows, (r) => r.dry);
    return `All 24 hours: ${fmtInt(grand)} reports. <b>${fmtPct(dry / grand)} in dry weather</b>, ` +
      `${fmtPct(d3.sum(rows, (r) => r.wet) / grand)} in rain. <b>${fmtPct(nDay / grand)} in daylight.</b> ` +
      `Read as risk, clear daytime driving looks like the danger.`;
  }

  function stop() { clearInterval(timer); timer = null; $("#v1play").textContent = "▶ Play"; $("#v1play").setAttribute("aria-label", "Play"); }
  function play() {
    if (upto >= 23) upto = -1;
    $("#v1play").textContent = "❚❚ Pause"; $("#v1play").setAttribute("aria-label", "Pause");
    timer = setInterval(() => {
      upto += 1; draw();
      if (upto >= 23) { stop(); draw(); }
    }, 400);
  }
  $("#v1play").addEventListener("click", () => (timer ? stop() : play()));
  $("#v1step").addEventListener("click", () => { stop(); upto = upto >= 23 ? 0 : upto + 1; draw(); });
  $("#v1hour").addEventListener("input", (e) => { stop(); upto = +e.target.value; draw(); });
  const seg = segmented("#v1filter", (k) => { filter = k; draw(); });
  function reset() { stop(); filter = "all"; seg.set("all", false); upto = 23; draw(); $("#v1read").innerHTML = summary(); }
  $("#v1reset").addEventListener("click", reset);

  // Start before the reveal, so the reader presses play rather than seeing the answer first.
  upto = -1; draw(); $("#v1read").textContent = "Press play to reveal the day hour by hour, or drag the hour slider. Hover any bar for exact counts.";
  $("#v1hourOut").textContent = "--:--";
  return { reset };
}
