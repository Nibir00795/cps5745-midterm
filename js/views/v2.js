// View 2: the data audit. Coverage by month, Severity as defined, missing values by field.
import { COLORS, CLASS_LABEL, fmtInt, fmtPct, showTip, hideTip, segmented, svgIn, $ } from "../ui.js";

const d3 = window.d3;

const FIELD_DEF = {
  "Weather_Condition": "weather reported at the nearest airport station; drives the rain / dry split",
  "Sunrise_Sunset": "Day or Night from the sun's position at the crash time and place",
  "Visibility(mi)": "visibility in miles at the station; secondary evidence only",
  "Precipitation(in)": "precipitation amount in inches; audited, never used to classify, never read as zero when missing",
  "Start_Time": "local start time of the incident",
  "Severity": "impact on traffic, 1 (short delay) to 4 (long delay); not injury",
  "State": "US state",
};
const SEV_DEF = { 1: "least impact on traffic, a short delay", 2: "intermediate delay (the authors define only the two ends of the scale)", 3: "intermediate delay (the authors define only the two ends of the scale)", 4: "most impact on traffic, a long delay" };

export function initV2(audit) {
  let mode = "count";
  const N = audit.rows_read;
  const months = Object.entries(audit.by_month).map(([k, v]) => ({ k, d: new Date(`${k}-01T00:00:00`), v }));
  const sev = Object.entries(audit.severity).map(([k, v]) => ({ k: +k, v }));
  const fields = ["Weather_Condition", "Sunrise_Sunset", "Visibility(mi)", "Precipitation(in)", "Start_Time", "Severity"]
    .map((f) => ({ f, v: audit.null_rows[f] }));
  fields.push({ f: "Vehicle-miles driven", v: N, absent: true });

  // mapping table
  $("#v2map").innerHTML = "<tr><th>Weather_Condition</th><th>class</th><th>reports</th></tr>" +
    audit.weather_mapping.slice(0, 15).map((r) => `<tr><td>${r.value}</td><td>${CLASS_LABEL[r.class]}</td><td class="n">${fmtInt(r.rows)}</td></tr>`).join("");

  const fmtVal = (v) => (mode === "count" ? fmtInt(v) : fmtPct(v / N, v / N < 0.001 ? 3 : 1));

  function panelA() {
    const W = 420, H = 260, M = { t: 10, r: 8, b: 34, l: 48 };
    const svg = svgIn("#v2a", W, H);
    const x = d3.scaleTime().domain([d3.min(months, (m) => m.d), d3.timeMonth.offset(d3.max(months, (m) => m.d), 1)]).range([M.l, W - M.r]);
    const val = (m) => (mode === "count" ? m.v : m.v / N);
    const y = d3.scaleLinear().domain([0, d3.max(months, val) * 1.1]).nice().range([H - M.b, M.t]);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - M.l - M.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(mode === "count" ? d3.format("~s") : d3.format(".1%")));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`).call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")).tickSizeOuter(0));
    const bw = (W - M.l - M.r) / months.length - 1;
    svg.append("g").attr("fill", COLORS.accent).selectAll("rect").data(months).join("rect")
      .attr("x", (m) => x(m.d)).attr("width", Math.max(1, bw)).attr("y", (m) => y(val(m))).attr("height", (m) => y(0) - y(val(m)))
      .on("mousemove", (e, m) => { const t = `<b>${m.k}</b><br>${fmtInt(m.v)} reports<br><span class="k">share of all</span> ${fmtPct(m.v / N, 2)}`; showTip(e, t); $("#v2read").innerHTML = `${m.k}: ${fmtInt(m.v)} reports, ${fmtPct(m.v / N, 2)} of the dataset. Coverage changes with the reporting feeds, not only with crashes.`; })
      .on("mouseleave", hideTip);
    svg.append("text").attr("class", "axlabel").attr("x", M.l).attr("y", H - 4).text(mode === "count" ? "reports per month" : "share of all reports, per month");
  }

  function panelB() {
    const W = 250, H = 260, M = { t: 18, r: 8, b: 34, l: 44 };
    const svg = svgIn("#v2b", W, H);
    const x = d3.scaleBand().domain(sev.map((s) => s.k)).range([M.l, W - M.r]).padding(0.25);
    const val = (s) => (mode === "count" ? s.v : s.v / N);
    const y = d3.scaleLinear().domain([0, d3.max(sev, val) * 1.12]).nice().range([H - M.b, M.t]);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(mode === "count" ? d3.format("~s") : d3.format(".0%")));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`).call(d3.axisBottom(x).tickSizeOuter(0));
    svg.append("g").attr("fill", COLORS.accent).selectAll("rect").data(sev).join("rect")
      .attr("x", (s) => x(s.k)).attr("width", x.bandwidth()).attr("y", (s) => y(val(s))).attr("height", (s) => y(0) - y(val(s))).attr("rx", 3)
      .on("mousemove", (e, s) => { showTip(e, `<b>Severity ${s.k}</b><br>${SEV_DEF[s.k]}<br>${fmtInt(s.v)} reports, ${fmtPct(s.v / N)}`); $("#v2read").innerHTML = `Severity ${s.k} (${SEV_DEF[s.k]}): ${fmtInt(s.v)} reports, ${fmtPct(s.v / N)}. This is delay, not injury.`; })
      .on("mouseleave", hideTip);
    svg.append("g").selectAll("text").data(sev).join("text").attr("class", "lbl muted").attr("text-anchor", "middle")
      .attr("x", (s) => x(s.k) + x.bandwidth() / 2).attr("y", (s) => y(val(s)) - 4).text((s) => (mode === "count" ? d3.format(".2~s")(s.v) : fmtPct(s.v / N, 0)));
    svg.append("text").attr("class", "axlabel").attr("x", M.l).attr("y", H - 4).text("Severity class");
  }

  function panelC() {
    const W = 330, H = 260, M = { t: 6, r: 52, b: 30, l: 118 };
    const svg = svgIn("#v2c", W, H);
    const y = d3.scaleBand().domain(fields.map((f) => f.f)).range([M.t, H - M.b]).padding(0.28);
    const val = (f) => (mode === "count" ? f.v : f.v / N);
    const x = d3.scaleLinear().domain([0, mode === "count" ? N : 1]).range([M.l, W - M.r]);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`).call(d3.axisBottom(x).ticks(3).tickFormat(mode === "count" ? d3.format("~s") : d3.format(".0%")));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();
    svg.append("g").selectAll("rect").data(fields).join("rect")
      .attr("x", M.l).attr("y", (f) => y(f.f)).attr("height", y.bandwidth()).attr("width", (f) => Math.max(1, x(val(f)) - M.l)).attr("rx", 2)
      .attr("fill", (f) => (f.absent ? COLORS.alert : COLORS.accent)).attr("opacity", (f) => (f.absent ? 0.85 : 1))
      .on("mousemove", (e, f) => {
        const def = f.absent ? "not a column in this dataset: every row lacks it" : FIELD_DEF[f.f];
        showTip(e, `<b>${f.f}</b><br>${def}<br>missing in ${fmtInt(f.v)} of ${fmtInt(N)} rows (${fmtPct(f.v / N)})`);
        $("#v2read").innerHTML = `${f.f}: missing in ${fmtInt(f.v)} rows (${fmtPct(f.v / N)}). ${def}.`;
      })
      .on("mouseleave", hideTip);
    svg.append("g").selectAll("text").data(fields).join("text").attr("class", "lbl muted")
      .attr("x", (f) => x(val(f)) + 4).attr("y", (f) => y(f.f) + y.bandwidth() / 2 + 4)
      .text((f) => (f.absent ? "100%" : fmtPct(f.v / N, f.v / N < 0.01 ? 1 : 0)));
    svg.append("text").attr("class", "lbl inv").attr("font-size", 11).attr("x", M.l + 6).attr("y", y("Vehicle-miles driven") + y.bandwidth() / 2 + 4).text("the denominator: not a column");
  }

  function draw() { panelA(); panelB(); panelC(); }
  const seg = segmented("#v2mode", (k) => { mode = k; draw(); });
  function reset() { mode = "count"; seg.set("count", false); draw(); $("#v2read").textContent = "Hover any bar for its count, share and definition."; }
  $("#v2reset").addEventListener("click", reset);
  draw();
  return { reset, redraw: draw };
}
