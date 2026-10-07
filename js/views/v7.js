// View 7: counts versus rates once an outside exposure estimate is supplied, with its uncertainty.
import { rateRatioInterval } from "../stopping.js";
import { COLORS, fmtPct, showTip, hideTip, segmented, svgIn, legend, hatchDefs, $ } from "../ui.js";

const d3 = window.d3;
const W = 900, H = 360, M = { t: 30, r: 24, b: 54, l: 74 };

export function initV7(conditions, exposure) {
  let measure = "count", cmp = "night";

  function model(k) {
    const ex = exposure[k];
    const s = k === "night" ? conditions.night_share : conditions.wet_share;
    const iv = rateRatioInterval(s, ex.exposure_lo, ex.exposure_mid, ex.exposure_hi);
    const bars = [
      { id: "base", label: ex.baseline_label, color: k === "night" ? COLORS.day : COLORS.dry,
        count: 1 - s, rate: 1, note: `the baseline: rates are expressed relative to ${ex.baseline_label}` },
      { id: "cond", label: ex.label, color: k === "night" ? COLORS.night : COLORS.wet,
        count: s, rate: iv.mid, lo: iv.lo, hi: iv.hi,
        note: `${fmtPct(s)} of crashes on ${fmtPct(ex.exposure_mid)} of ${k === "night" ? "miles" : "wet-pavement hours"} (range ${fmtPct(ex.exposure_lo)} to ${fmtPct(ex.exposure_hi)}). ${ex.interval_note}`,
        source: ex.sources.map((x) => x.short).join("; ") },
    ];
    if (k === "wet" && ex.independent_check) {
      const q = ex.independent_check;
      bars.push({ id: "meta", label: "rain, exposure measured directly", color: COLORS.wet, hatch: true,
        count: null, rate: q.rate_ratio_mid, lo: q.rate_ratio_lo, hi: q.rate_ratio_hi, note: q.note, source: q.short });
    }
    return { s, iv, ex, bars };
  }

  const svg = svgIn("#v7viz", W, H);
  hatchDefs(svg);
  const x = d3.scaleBand().range([M.l, W - M.r]).padding(0.35);
  const y = d3.scaleLinear().range([H - M.b, M.t]);
  const gGrid = svg.append("g").attr("class", "grid").attr("transform", `translate(${M.l},0)`);
  const gy = svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`);
  const gx = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`);
  const ylab = svg.append("text").attr("class", "axlabel").attr("transform", "rotate(-90)").attr("x", -(H - M.b + M.t) / 2).attr("y", 18).attr("text-anchor", "middle");
  const one = svg.append("line").attr("stroke", "#9a988f").attr("stroke-dasharray", "4 3").attr("x1", M.l).attr("x2", W - M.r);
  const gBars = svg.append("g"), gErr = svg.append("g"), gTxt = svg.append("g");

  function draw(animate = true) {
    const md = model(cmp);
    const bars = md.bars.filter((b) => measure === "rate" || b.count !== null);
    x.domain(bars.map((b) => b.id));
    const ymax = measure === "count" ? 1 : Math.max(2.4, d3.max(bars, (b) => b.hi ?? b.rate) * 1.12);
    y.domain([0, ymax]).nice();
    const t = svg.transition().duration(animate ? 750 : 0);
    gGrid.transition(t).call(d3.axisLeft(y).ticks(6).tickSize(-(W - M.l - M.r)).tickFormat(""));
    gy.transition(t).call(d3.axisLeft(y).ticks(6).tickFormat(measure === "count" ? d3.format(".0%") : (d) => `${d}×`));
    gx.call(d3.axisBottom(x).tickFormat((id) => bars.find((b) => b.id === id).label).tickSizeOuter(0));
    ylab.text(measure === "count" ? "share of reported crashes (this dataset)" : `crashes per mile, relative to ${md.ex.baseline_label}`);
    one.transition(t).attr("y1", y(1)).attr("y2", y(1)).attr("opacity", measure === "rate" ? 1 : 0);
    legend("#v7legend", [[bars[0].color, bars[0].label], [bars[1].color, bars[1].label], ...(bars[2] ? [[bars[2].color, bars[2].label, true]] : [])]);

    const val = (b) => (measure === "count" ? b.count : b.rate);
    gBars.selectAll("rect").data(bars, (b) => b.id).join(
      (en) => en.append("rect").attr("y", y(0)).attr("height", 0),
      (up) => up, (ex) => ex.remove())
      .attr("x", (b) => x(b.id)).attr("width", x.bandwidth()).attr("rx", 3)
      .attr("fill", (b) => (b.hatch ? "url(#hatch-wet)" : b.color))
      .on("mousemove", (e, b) => {
        showTip(e, `<b>${b.label}</b><br>${measure === "count" ? `${fmtPct(b.count)} of reports` : `${b.rate.toFixed(2)}× ${md.ex.baseline_label} per mile`}${b.lo ? `<br><span class="k">range</span> ${b.lo.toFixed(2)} to ${b.hi.toFixed(2)}×` : ""}<br><span class="k">${b.note}</span>${b.source ? `<br><span class="k">source:</span> ${b.source}` : ""}`);
        $("#v7read").innerHTML = `${b.label}: ${measure === "count" ? `${fmtPct(b.count)} of reports` : `${b.rate.toFixed(2)}× per mile${b.lo ? ` (range ${b.lo.toFixed(2)} to ${b.hi.toFixed(2)})` : ""}`}. ${b.source ? `Source: ${b.source}.` : ""}`;
      })
      .on("mouseleave", hideTip)
      .transition(t).attr("y", (b) => y(val(b))).attr("height", (b) => y(0) - y(val(b)));

    const errs = measure === "rate" ? bars.filter((b) => b.lo !== undefined) : [];
    const cx = (b) => x(b.id) + x.bandwidth() / 2;
    gErr.selectAll("g").data(errs, (b) => b.id).join((en) => {
      const g = en.append("g").attr("stroke", "#111").attr("stroke-width", 1.6);
      g.append("line").attr("class", "v"); g.append("line").attr("class", "a"); g.append("line").attr("class", "b");
      return g;
    }).call((g) => {
      g.select(".v").attr("x1", cx).attr("x2", cx).attr("y1", (b) => y(b.lo)).attr("y2", (b) => y(b.hi));
      g.select(".a").attr("x1", (b) => cx(b) - 9).attr("x2", (b) => cx(b) + 9).attr("y1", (b) => y(b.lo)).attr("y2", (b) => y(b.lo));
      g.select(".b").attr("x1", (b) => cx(b) - 9).attr("x2", (b) => cx(b) + 9).attr("y1", (b) => y(b.hi)).attr("y2", (b) => y(b.hi));
    });

    gTxt.selectAll("text").data(bars, (b) => b.id).join("text").attr("class", "lbl").attr("text-anchor", "middle")
      .attr("x", (b) => cx(b) + (measure === "rate" && b.lo ? 30 : 0))
      .transition(t).attr("y", (b) => y(val(b)) - 8)
      .text((b) => (measure === "count" ? fmtPct(b.count) : `${b.rate.toFixed(2)}×`));

    if (!$("#v7read").matches(":hover")) $("#v7read").innerHTML = verdict(md);
  }

  function verdict(md) {
    const c = md.bars[1];
    if (measure === "count") return `Counts: ${md.ex.baseline_label} has ${fmtPct(md.bars[0].count)} of reports, ${md.ex.label} ${fmtPct(c.count)}. Switch to crashes per mile.`;
    const settled = c.lo > 1 || c.hi < 1;
    const dir = c.rate > 1 ? "worse" : "better";
    return `Per mile, ${md.ex.label} is ${c.rate.toFixed(2)}× ${md.ex.baseline_label} (range ${c.lo.toFixed(2)} to ${c.hi.toFixed(2)}): ` +
      (settled ? (md.bars[2] ? `with this denominator ${md.ex.label} looks ${dir} per mile across the whole range.` : `<b>${md.ex.label} is ${dir} per mile across the whole range.</b>`)
               : `<b>the range crosses 1, so this estimate cannot rank them.</b>`) +
      (md.bars[2] ? ` But a meta-analysis that measured exposure directly finds ${md.bars[2].rate.toFixed(2)}× (${md.bars[2].lo.toFixed(2)} to ${md.bars[2].hi.toFixed(2)}). ` +
        `<b>The two denominators point opposite ways, so the honest answer for rain is: not settled by this data.</b>` : "");
  }

  // the headline in the view's text, computed from the data rather than written in advance
  const n = model("night").bars[1], w = model("wet");
  const wetDir = w.bars[1].hi < 1 ? "safer" : w.bars[1].lo > 1 ? "more dangerous" : "no different";
  $("#v7claim").innerHTML = `With 25% of miles at night, night comes out ${n.rate.toFixed(2)}× worse per mile, and the whole range agrees. ` +
    `Rain does not settle: Harwood's wet-pavement hours make rain look ${wetDir} per mile (${w.bars[1].rate.toFixed(2)}×), while studies that measured exposure directly find rain about 1.7× worse. The crashes are the same; the denominators disagree.`;
  $("#v7limits").innerHTML = `<b>What this cannot tell you.</b> These are reported incidents relayed by traffic feeds, not a census, and coverage varies by state and year (View 2). ` +
    `Weather comes from the nearest station at report time, so local showers can be missed. Wet-pavement hours are not wet vehicle-miles: people drive less in rain, and the road stays wet after rain stops, which pushes the published rain estimate and this dataset's rain definition apart. ` +
    `Night is the Sunrise_Sunset flag; the 25% figure counts hours of darkness. Severity is traffic delay, so none of this says anything about injury. The question every safety statistic needs is the one in the title: per what?`;

  const segM = segmented("#v7mode", (k) => { measure = k; draw(); });
  const segC = segmented("#v7cmp", (k) => { cmp = k; draw(false); });
  function reset() { measure = "count"; cmp = "night"; segM.set("count", false); segC.set("night", false); draw(false); }
  $("#v7reset").addEventListener("click", reset);
  draw(false);
  return { reset };
}
