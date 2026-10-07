// View 5: four conditions ranked by the model (top, feet) and by the record (bottom, percent).
// Two panels, two scales, one shared categorical axis. Never one axis for feet and percent.
import { stopping } from "../stopping.js";
import { COLORS, fmtInt, fmtPct, showTip, hideTip, segmented, svgIn, hatchDefs, $ } from "../ui.js";
import * as S from "../state.js";

const d3 = window.d3;
const W = 900, H = 430, M = { t: 26, r: 20, b: 40, l: 120 };
const TOP = [M.t, 200], BOT = [252, H - M.b];

export function initV5(conditions) {
  const C = [
    { k: "dry_day", w: "dry", night: false, label: "dry · day" },
    { k: "dry_night", w: "dry", night: true, label: "dry · night" },
    { k: "wet_day", w: "wet", night: false, label: "rain · day" },
    { k: "wet_night", w: "wet", night: true, label: "rain · night" },
  ];
  const n = conditions.n_wet_dry;
  C.forEach((c) => { c.count = conditions.cells[c.k]; c.share = c.count / n; });
  $("#v5held").textContent = fmtInt(conditions.held_out.frozen + conditions.held_out.ambiguous);

  let filter = "all";
  const svg = svgIn("#v5viz", W, H);
  hatchDefs(svg);
  const x = d3.scaleBand().domain(C.map((c) => c.k)).range([M.l, W - M.r]).padding(0.3);
  const yTop = d3.scaleLinear().domain([0, 900]).range([TOP[1], TOP[0]]);
  const yBot = d3.scaleLinear().domain([0, 0.7]).range([BOT[1], BOT[0]]);
  const fill = (c) => (c.night ? `url(#hatch-${c.w})` : COLORS[c.w]);

  svg.append("g").attr("class", "grid").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(yTop).ticks(4).tickSize(-(W - M.l - M.r)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(yTop).ticks(4).tickFormat((d) => `${d} ft`));
  svg.append("g").attr("class", "grid").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(yBot).ticks(4).tickSize(-(W - M.l - M.r)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(yBot).ticks(4).tickFormat(d3.format(".0%")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${BOT[1]})`).call(d3.axisBottom(x).tickFormat((k) => C.find((c) => c.k === k).label).tickSizeOuter(0));
  svg.append("text").attr("class", "axlabel").attr("x", 8).attr("y", (TOP[0] + TOP[1]) / 2).text("MODEL").attr("font-weight", 700);
  svg.append("text").attr("class", "axlabel").attr("x", 8).attr("y", (TOP[0] + TOP[1]) / 2 + 16).text("stopping distance");
  svg.append("text").attr("class", "axlabel").attr("x", 8).attr("y", (BOT[0] + BOT[1]) / 2).text("RECORD").attr("font-weight", 700);
  svg.append("text").attr("class", "axlabel").attr("x", 8).attr("y", (BOT[0] + BOT[1]) / 2 + 16).text("share of reports");
  const capTop = svg.append("text").attr("class", "lbl muted").attr("x", M.l).attr("y", TOP[0] - 10);
  svg.append("text").attr("class", "lbl muted").attr("x", M.l).attr("y", BOT[0] - 12)
    .text(`The record: share of ${fmtInt(n)} reports with known weather and daylight (does not move)`);
  svg.append("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", 226).attr("y2", 226).attr("stroke", "#dedcd4");

  const gTop = svg.append("g"), gBot = svg.append("g"), gTxt = svg.append("g"), gHit = svg.append("g");

  function draw(st) {
    C.forEach((c) => {
      const mu = c.w === "dry" ? st.muDry : st.muWet;
      const tr = st.tr + (c.night ? st.nightExtraTr : 0);
      Object.assign(c, { mu, tr, d: stopping(st.mph, mu, tr).total });
    });
    const on = (c) => filter === "all" || (filter === "day" ? !c.night : c.night);
    const op = (c) => (on(c) ? 1 : 0.18);
    capTop.text(`The model at ${st.mph} mph, reaction ${st.tr.toFixed(1)} s by day and ${(st.tr + st.nightExtraTr).toFixed(1)} s at night (moves with View 3)`);
    const clampTop = (d) => Math.min(d, 900);
    gTop.selectAll("rect").data(C).join("rect").attr("x", (c) => x(c.k)).attr("width", x.bandwidth()).attr("rx", 3)
      .attr("y", (c) => yTop(clampTop(c.d))).attr("height", (c) => yTop(0) - yTop(clampTop(c.d))).attr("fill", fill).attr("opacity", op);
    gBot.selectAll("rect").data(C).join("rect").attr("x", (c) => x(c.k)).attr("width", x.bandwidth()).attr("rx", 3)
      .attr("y", (c) => yBot(c.share)).attr("height", (c) => yBot(0) - yBot(c.share)).attr("fill", fill).attr("opacity", op);
    const labels = [
      ...C.map((c) => ({ x: x(c.k) + x.bandwidth() / 2, y: yTop(clampTop(c.d)) - 6, t: c.d > 900 ? `${Math.round(c.d)} ft (off scale)` : `${Math.round(c.d)} ft`, c })),
      ...C.map((c) => ({ x: x(c.k) + x.bandwidth() / 2, y: yBot(c.share) - 6, t: fmtPct(c.share), c })),
    ];
    gTxt.selectAll("text").data(labels).join("text").attr("class", "lbl").attr("text-anchor", "middle")
      .attr("x", (l) => l.x).attr("y", (l) => l.y).text((l) => l.t).attr("opacity", (l) => op(l.c));

    gHit.selectAll("rect").data(C).join("rect").attr("class", "hit").attr("x", (c) => x(c.k)).attr("width", x.bandwidth())
      .attr("y", TOP[0]).attr("height", BOT[1] - TOP[0])
      .on("mousemove", (e, c) => {
        const line = `${c.label}: modelled ${Math.round(c.d)} ft (μ ${c.mu.toFixed(2)}, t<sub>r</sub> ${c.tr.toFixed(1)} s) · ${fmtPct(c.share)} of reports · ${fmtInt(c.count)} crashes`;
        showTip(e, `<b>${c.label}</b><br><span class="k">model</span> ${Math.round(c.d)} ft to stop<br><span class="k">record</span> ${fmtPct(c.share)} of reports<br><span class="k">count</span> ${fmtInt(c.count)}`);
        $("#v5read").innerHTML = line;
      })
      .on("mouseleave", hideTip);

    const shown = C.filter(on);
    const worstModel = d3.greatest(shown, (c) => c.d), mostReports = d3.greatest(shown, (c) => c.share);
    if (!$("#v5read").dataset.hovered) {
      $("#v5read").innerHTML = `Model: <b>${worstModel.label}</b> takes longest to stop (${Math.round(worstModel.d)} ft). ` +
        `Record: <b>${mostReports.label}</b> has the most reports (${fmtPct(mostReports.share)}). Both are true. They cannot both be about risk.`;
    }
  }

  $("#v5night").textContent = S.get().nightExtraTr.toFixed(1);
  const seg = segmented("#v5filter", (k) => { filter = k; draw(S.get()); });
  function reset() { filter = "all"; seg.set("all", false); draw(S.get()); }
  $("#v5reset").addEventListener("click", reset);
  S.subscribe(draw);
  draw(S.get());
  return { reset };
}
