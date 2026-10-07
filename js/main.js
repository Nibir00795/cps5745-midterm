// Entry point: load the prepared data, start the seven views, wire the global controls.
import { initV1 } from "./views/v1.js";
import { initV2 } from "./views/v2.js";
import { initV3 } from "./views/v3.js";
import { initV4 } from "./views/v4.js";
import { initV5 } from "./views/v5.js";
import { initV6 } from "./views/v6.js";
import { initV7 } from "./views/v7.js";
import { fmtInt, onResize, $ } from "./ui.js";

const d3 = window.d3;

async function main() {
  const [byhour, audit, conditions, log, exposure] = await Promise.all(
    ["byhour", "audit", "conditions", "prep_log", "exposure"].map((n) => d3.json(`data/${n}.json`)));

  // Never let test data pass for the real thing.
  if (log.input !== "US_Accidents_March23.csv" || !log.integrity_matches_cited_release) {
    const b = $("#dataBanner");
    b.hidden = false;
    b.textContent = `Test data: these figures come from ${log.input}, not the cited US Accidents release. Run prep/prep.py on the real file before reading any number here.`;
  }

  $("#aboutPrep").innerHTML = `Prepared by <code>prep/prep.py</code> from <code>${log.input}</code>: ${fmtInt(log.rows_read)} rows read, ` +
    `${fmtInt(log.rows_in_tables)} in the tables, ${fmtInt(Object.values(log.rows_excluded).reduce((a, b) => a + b, 0))} excluded for a missing field and counted, ` +
    `start times ${log.start_time_min?.slice(0, 10)} to ${log.start_time_max?.slice(0, 10)}. Row conservation ${log.row_conservation ? "passed" : "FAILED"}; ` +
    `match with the cited release ${log.integrity_matches_cited_release ? "passed" : "did not pass"}. File SHA-256 <code>${(log.sha256 || "").slice(0, 16)}…</code>.`;
  const src = [...exposure.night.sources, ...exposure.wet.sources, exposure.wet.independent_check, exposure.fhwa_weather];
  $("#aboutSources").innerHTML = src.map((s) => `<li>${s.short}${s.url ? ` · <a href="${s.url}">link</a>` : ""}</li>`).join("");

  const views = [initV1(byhour), initV2(audit), initV3(), initV4(), initV5(conditions), initV6(conditions), initV7(conditions, exposure)];
  $("#resetAll").addEventListener("click", () => views.forEach((v) => v.reset()));
  onResize(() => views[1].redraw && views[1].redraw());

  // highlight the view in the nav as the reader scrolls
  const links = [...document.querySelectorAll(".top nav a")];
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${en.target.id}`));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("section.view, #about").forEach((s) => io.observe(s));
}

main().catch((err) => {
  const b = $("#dataBanner");
  b.hidden = false;
  b.textContent = `Could not load the data files (${err.message}). Serve this folder over HTTP, for example: python3 -m http.server 8000`;
  console.error(err);
});
