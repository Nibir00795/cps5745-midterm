// The verification suite from the proposal (Section 5.1), run against the same stopping.js the
// browser loads.   node checks/check_model.mjs
import { stopping, reactionFt, brakingFt, muFromDecel, barGeometry, relativeRates,
         rateRatioInterval, MPH_TO_FTPS, G_FTPS2 } from "../js/stopping.js";

let failed = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(name, ok, detail) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failed++;
}

// Numerical check: the worked example in the report.
const dry = stopping(60, 0.70, 1.5), wet = stopping(60, 0.40, 1.5);
check("60 mph = 88 ft/s", near(60 * MPH_TO_FTPS, 88, 1e-9), `${60 * MPH_TO_FTPS}`);
check("reaction term 60 mph, 1.5 s = 132 ft", near(dry.reaction, 132, 1e-9), dry.reaction.toFixed(3));
check("braking term 60 mph, mu 0.70 = 88^2/(2*0.70*32.174) = 171.9 ft",
      near(dry.braking, 88 * 88 / (2 * 0.70 * G_FTPS2), 1e-9) && near(dry.braking, 171.9, 0.05), dry.braking.toFixed(2));
check("dry total 304 ft", Math.round(dry.total) === 304, dry.total.toFixed(2));
check("wet total 433 ft", Math.round(wet.total) === 433, wet.total.toFixed(2));
check("wet minus dry = 129 ft", Math.round(wet.total - dry.total) === 129, (wet.total - dry.total).toFixed(2));
check("doubling speed quadruples braking", near(brakingFt(60, 0.7) / brakingFt(30, 0.7), 4, 1e-12));

// External check: AASHTO stopping sight distance, 60 mph, t_r 2.5 s, a = 3.4 m/s^2 -> 570 ft published.
const mu = muFromDecel(3.4);
const aashto = stopping(60, mu, 2.5).total;
check("AASHTO deceleration 3.4 m/s^2 -> mu = 0.347", near(mu, 0.347, 0.0005), mu.toFixed(4));
check("AASHTO 60 mph within 1% of published 570 ft", Math.abs(aashto - 570) / 570 < 0.01,
      `${aashto.toFixed(1)} ft, ${(100 * (aashto - 570) / 570).toFixed(2)}%`);

// Boundary cases.
const z = stopping(0, 0.7, 1.5);
check("boundary v = 0: both terms exactly zero", z.reaction === 0 && z.braking === 0 && z.total === 0);
check("boundary v = 0 with mu = 0: still zero, not NaN", stopping(0, 0, 1.5).total === 0);
check("boundary mu -> 0: braking is Infinity", brakingFt(60, 0) === Infinity);
const g = barGeometry(stopping(60, 0, 1.5).total, 800);
check("boundary mu -> 0: bar clamps to the axis and says so",
      g.drawn === 800 && g.clipped && g.label === "does not stop within the visible road");
check("boundary mu = 0.10 at 80 mph: finite, clamped on an 800 ft axis",
      Number.isFinite(stopping(80, 0.1, 1.5).total) && barGeometry(stopping(80, 0.1, 1.5).total, 800).clipped);
const t0 = stopping(60, 0.7, 0);
check("boundary t_r = 0: total equals braking term exactly", t0.reaction === 0 && t0.total === t0.braking);
check("no NaN anywhere on the slider grid", (() => {
  for (let v = 20; v <= 80; v += 1) for (let m = 0.10; m <= 0.901; m += 0.01) for (let t = 0.5; t <= 2.51; t += 0.1) {
    const s = stopping(v, m, t); if (!Number.isFinite(s.total)) return false;
  } return true; })());

// Exposure arithmetic (Views 6 and 7).
check("rates equal exactly when exposure share = crash share", near(relativeRates(0.08, 0.08).ratio, 1, 1e-12));
check("exposure below crash share -> condition worse per mile", relativeRates(0.08, 0.05).ratio > 1);
check("exposure above crash share -> condition better per mile", relativeRates(0.08, 0.12).ratio < 1);
check("boundary exposure -> 0: condition rate is Infinity (view must clamp)", relativeRates(0.08, 0).cond === Infinity);
const iv = rateRatioInterval(0.3, 0.22, 0.25, 0.28);
check("interval ordered lo <= mid <= hi", iv.lo <= iv.mid && iv.mid <= iv.hi, JSON.stringify(iv));
// worked example: 30% of crashes at night, 25% of miles at night -> (0.30/0.25)/(0.70/0.75) = 1.2857
check("night worked example: 30% of crashes on 25% of miles = 1.29x per mile",
      near(relativeRates(0.30, 0.25).ratio, 1.2857, 0.0001), relativeRates(0.30, 0.25).ratio.toFixed(4));

console.log(failed ? `\n${failed} FAILED` : "\nall model checks passed");
process.exit(failed ? 1 : 0);
