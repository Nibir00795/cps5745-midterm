// View 3: stopping distance as reaction + braking, dry versus wet, on one fixed axis in feet.
import { stopping, barGeometry } from "../stopping.js";
import { COLORS, showTip, hideTip, svgIn, $ } from "../ui.js";
import * as S from "../state.js";

const d3 = window.d3;
const W = 900, H = 230, M = { t: 34, r: 30, b: 44, l: 150 };
const AXIS_MAX = 800; // ft. Fixed, so moving a slider never rescales the comparison.

export function initV3() {
  const svg = svgIn("#v3viz", W, H);
  const x = d3.scaleLinear().domain([0, AXIS_MAX]).range([M.l, W - M.r]);
  const y = d3.scaleBand().domain(["dry", "wet"]).range([M.t, H - M.b]).padding(0.32);
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${H - M.b})`)
    .call(d3.axisBottom(x).ticks(8).tickSize(-(H - M.b - M.t)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`)
    .call(d3.axisBottom(x).ticks(8).tickFormat((d) => `${d}`).tickSizeOuter(0));
  svg.append("text").attr("class", "axlabel").attr("x", (M.l + W - M.r) / 2).attr("y", H - 8).attr("text-anchor", "middle")
    .text("distance travelled from the moment the hazard appears (feet)");
  // a reference length the audience can picture
  svg.append("line").attr("x1", x(300)).attr("x2", x(300)).attr("y1", M.t - 14).attr("y2", H - M.b).attr("stroke", "#b9b7b0").attr("stroke-dasharray", "2 3");
  svg.append("text").attr("class", "lbl muted").attr("x", x(300)).attr("y", M.t - 18).attr("text-anchor", "middle").attr("font-size", 11).text("300 ft: one football field");

  const rowLabels = svg.append("g");
  const gBars = svg.append("g");
  const gText = svg.append("g");
  const gDiff = svg.append("g");

  function draw(st) {
    const rows = [
      { k: "dry", mu: st.muDry, ...stopping(st.mph, st.muDry, st.tr) },
      { k: "wet", mu: st.muWet, ...stopping(st.mph, st.muWet, st.tr) },
    ];
    rowLabels.selectAll("text").data(rows).join("text").attr("class", "lbl").attr("text-anchor", "end")
      .attr("x", M.l - 10).attr("y", (r) => y(r.k) + y.bandwidth() / 2 + 4)
      .text((r) => `${r.k === "dry" ? "dry road" : "wet road"}, μ = ${r.mu.toFixed(2)}`);

    const segs = rows.flatMap((r) => {
      const re = barGeometry(r.reaction, AXIS_MAX);
      const tot = barGeometry(r.total, AXIS_MAX);
      return [
        { r, part: "reaction", x0: 0, x1: re.drawn, len: r.reaction, fill: COLORS.react },
        { r, part: "braking", x0: re.drawn, x1: tot.drawn, len: r.braking, fill: COLORS[r.k], clipped: tot.clipped },
      ];
    });
    gBars.selectAll("rect").data(segs).join("rect")
      .attr("y", (s) => y(s.r.k)).attr("height", y.bandwidth()).attr("rx", 3)
      .attr("x", (s) => x(s.x0)).attr("width", (s) => Math.max(0, x(s.x1) - x(s.x0) - (s.part === "reaction" ? 2 : 0)))
      .attr("fill", (s) => s.fill)
      .on("mousemove", (e, s) => {
        const f = s.part === "reaction" ? `v·t<sub>r</sub> = ${(st.mph * 5280 / 3600).toFixed(1)} ft/s × ${st.tr.toFixed(1)} s`
          : `v²/(2μg) = ${(st.mph * 5280 / 3600).toFixed(1)}² / (2 × ${s.r.mu.toFixed(2)} × 32.174)`;
        showTip(e, `<b>${s.part} distance, ${s.r.k} road</b><br>${f}<br><b>${Math.round(s.len)} ft</b>`);
      })
      .on("mouseleave", hideTip);

    const labels = segs.filter((s) => x(s.x1) - x(s.x0) > 46 && !s.clipped).map((s) => ({
      x: (s.x0 + s.x1) / 2, y: y(s.r.k) + y.bandwidth() / 2 + 4, t: `${Math.round(s.len)} ft`, inv: s.part === "braking" }));
    const ends = rows.map((r) => {
      const g = barGeometry(r.total, AXIS_MAX);
      return { x: g.drawn, y: y(r.k) + y.bandwidth() / 2 + 4, t: g.clipped ? `${g.label} ▸` : `${Math.round(r.total)} ft total`, end: true, warn: g.clipped };
    });
    gText.selectAll("text").data([...labels, ...ends]).join("text")
      .attr("class", (d) => (d.end ? (d.warn ? "lbl inv" : "lbl") : d.inv ? "lbl inv" : "lbl muted"))
      .attr("text-anchor", (d) => (d.end ? (d.warn ? "end" : "start") : "middle"))
      .attr("x", (d) => x(d.x) + (d.end ? (d.warn ? -8 : 6) : 0)).attr("y", (d) => d.y).text((d) => d.t);

    const diff = rows[1].total - rows[0].total;
    const fin = Number.isFinite(diff);
    gDiff.selectAll("*").remove();
    if (fin && rows[0].total < AXIS_MAX) {
      gDiff.append("line").attr("x1", x(rows[0].total)).attr("x2", x(rows[0].total))
        .attr("y1", y("dry")).attr("y2", y("wet") + y.bandwidth()).attr("stroke", COLORS.ink).attr("stroke-dasharray", "3 3");
    }

    $("#v3mph").value = st.mph; $("#v3mphOut").textContent = `${st.mph} mph`;
    $("#v3muDry").value = st.muDry; $("#v3muDryOut").textContent = st.muDry.toFixed(2);
    $("#v3muWet").value = st.muWet; $("#v3muWetOut").textContent = st.muWet.toFixed(2);
    $("#v3tr").value = st.tr; $("#v3trOut").textContent = `${st.tr.toFixed(1)} s`;
    const v = st.mph * 5280 / 3600;
    $("#v3read").innerHTML = `v = ${st.mph} mph = ${v.toFixed(1)} ft/s · reaction ${Math.round(rows[0].reaction)} ft · ` +
      `braking dry ${Math.round(rows[0].braking)} ft, wet ${Math.round(rows[1].braking)} ft · ` +
      (fin ? `<b>same driver, same car: the wet road needs ${Math.round(Math.abs(diff))} ft ${diff >= 0 ? "more" : "less"}</b>` : "");
  }

  const bind = (id, key, parse = Number) => $(id).addEventListener("input", (e) => S.set({ [key]: parse(e.target.value) }));
  bind("#v3mph", "mph"); bind("#v3muDry", "muDry"); bind("#v3muWet", "muWet"); bind("#v3tr", "tr");
  $("#v3reset").addEventListener("click", () => S.resetModel());
  S.subscribe(draw);
  draw(S.get());
  return { reset: () => S.resetModel() };
}
