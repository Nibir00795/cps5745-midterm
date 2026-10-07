// View 6: the missing denominator. The reader sets the exposure share; the rates follow.
import { relativeRates } from "../stopping.js";
import { COLORS, fmtPct, segmented, svgIn, legend, $ } from "../ui.js";

const d3 = window.d3;
const W = 900, H = 380, M = { t: 24, r: 24, b: 50, l: 70 };
const Y_MAX = 4;
const DEFAULT_E = 12; // percent

export function initV6(conditions) {
  const modes = {
    wet: { s: conditions.wet_share, cond: "rain", base: "dry", cc: COLORS.wet, bc: COLORS.dry },
    night: { s: conditions.night_share, cond: "night", base: "day", cc: COLORS.night, bc: COLORS.day },
  };
  let mode = "wet", e = DEFAULT_E;

  const svg = svgIn("#v6viz", W, H);
  const x = d3.scaleLinear().domain([0, 50]).range([M.l, W - M.r]);
  const y = d3.scaleLinear().domain([0, Y_MAX]).range([H - M.b, M.t]);
  svg.append("g").attr("class", "grid").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(y).ticks(8).tickSize(-(W - M.l - M.r)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(y).ticks(8).tickFormat((d) => `${d}×`));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`).call(d3.axisBottom(x).ticks(10).tickFormat((d) => `${d}%`).tickSizeOuter(0));
  const xlab = svg.append("text").attr("class", "axlabel").attr("x", (M.l + W - M.r) / 2).attr("y", H - 10).attr("text-anchor", "middle");
  svg.append("text").attr("class", "axlabel").attr("transform", "rotate(-90)").attr("x", -(H - M.b + M.t) / 2).attr("y", 18).attr("text-anchor", "middle")
    .text("crashes per mile, relative to the average");
  svg.append("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y(1)).attr("y2", y(1)).attr("stroke", "#9a988f").attr("stroke-dasharray", "4 3");

  const gClamp = svg.append("g"), gRegions = svg.append("g"), gLines = svg.append("g"), gMark = svg.append("g");

  function draw() {
    const m = modes[mode];
    legend("#v6legend", [[m.cc, `${m.cond}: its share of crashes ÷ its share of miles`], [m.bc, `${m.base}: the same for the rest`]]);
    $("#v6cond").textContent = m.cond;
    xlab.text(`assumed share of vehicle-miles driven in ${m.cond} (%). This number is not in the dataset.`);
    const es = d3.range(0.25, 50.01, 0.25);
    const pts = es.map((p) => ({ p, ...relativeRates(m.s, p / 100) }));
    const line = (key) => d3.line().defined((d) => Number.isFinite(d[key]) && d[key] <= Y_MAX).x((d) => x(d.p)).y((d) => y(d[key]));
    gLines.selectAll("path").data([["cond", m.cc], ["base", m.bc]]).join("path")
      .attr("fill", "none").attr("stroke", (d) => d[1]).attr("stroke-width", 2.5)
      .attr("d", (d) => line(d[0])(pts));

    // clamp: where the condition's rate exceeds the chart, label instead of drawing an asymptote
    const eClamp = 100 * m.s / Y_MAX; // s/e = Y_MAX
    gClamp.selectAll("*").remove();
    gClamp.append("rect").attr("x", x(0)).attr("width", Math.max(0, x(eClamp) - x(0))).attr("y", M.t).attr("height", H - M.b - M.t)
      .attr("fill", "#f2e6e4");
    gClamp.append("text").attr("class", "warnlbl").attr("font-size", 11).attr("x", x(eClamp) + 6).attr("y", M.t + 14)
      .text(`below ${eClamp.toFixed(1)}%: rate above ${Y_MAX}×, dividing by almost nothing (not drawn)`);

    const cross = 100 * m.s;
    gRegions.selectAll("*").remove();
    gRegions.append("line").attr("x1", x(cross)).attr("x2", x(cross)).attr("y1", M.t + 22).attr("y2", H - M.b).attr("stroke", "#111").attr("stroke-dasharray", "3 3");
    gRegions.append("text").attr("class", "lbl").attr("x", x(cross) + 6).attr("y", y(2.6))
      .text(`they cross at ${cross.toFixed(1)}%, the ${m.cond} share of crashes`);
    gRegions.append("text").attr("class", "lbl muted").attr("text-anchor", "end").attr("x", x(cross) - 8).attr("y", H - M.b - 10).text(`← ${m.cond} worse per mile`);
    gRegions.append("text").attr("class", "lbl muted").attr("x", x(cross) + 8).attr("y", H - M.b - 10).text(`${m.base} worse per mile →`);

    const r = relativeRates(m.s, e / 100);
    gMark.selectAll("*").remove();
    gMark.append("line").attr("x1", x(e)).attr("x2", x(e)).attr("y1", M.t).attr("y2", H - M.b).attr("stroke", COLORS.accent).attr("stroke-width", 2);
    for (const [k, c] of [["cond", m.cc], ["base", m.bc]]) {
      if (r[k] <= Y_MAX) gMark.append("circle").attr("cx", x(e)).attr("cy", y(r[k])).attr("r", 6).attr("fill", c).attr("stroke", "#fff").attr("stroke-width", 2);
    }
    $("#v6e").value = e; $("#v6eOut").textContent = `${e.toFixed(1)}%`;
    const worse = r.ratio > 1 ? m.cond : m.base;
    $("#v6read").innerHTML = `${m.cond} is ${fmtPct(m.s)} of crashes. If it were ${e.toFixed(1)}% of miles: ` +
      `${m.cond} ${r.cond.toFixed(2)}× average, ${m.base} ${r.base.toFixed(2)}× average, so <b>${worse} is ${(r.ratio > 1 ? r.ratio : 1 / r.ratio).toFixed(2)}× worse per mile</b>. ` +
      `Same crashes, different assumption, ${r.ratio > 1 ? "a ranking the record hides" : "the record's ranking"}.`;
  }

  const seg = segmented("#v6mode", (k) => { mode = k; draw(); });
  $("#v6e").addEventListener("input", (ev) => { e = +ev.target.value; draw(); });
  function reset() { mode = "wet"; seg.set("wet", false); e = DEFAULT_E; draw(); }
  $("#v6reset").addEventListener("click", reset);
  draw();
  return { reset };
}
