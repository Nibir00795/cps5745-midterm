// stopping.js: the stopping-distance model and the exposure arithmetic.
// Pure functions only, no DOM, so the same file runs in the browser and in checks/check_model.mjs.
//
//   d = v * t_r  +  v^2 / (2 * mu * g)
//       reaction    braking
//
// Simulation, not measurement. Assumptions (shown on screen in View 3): constant deceleration
// for the whole stop, level road, one braking input and no steering, a single reaction time.

export const G_FTPS2 = 32.174;            // gravitational acceleration, ft/s^2
export const MPH_TO_FTPS = 5280 / 3600;   // 1 mph = 1.4667 ft/s

export const DEFAULTS = Object.freeze({
  mph: 60,
  muDry: 0.70,       // dry asphalt, typical
  muWet: 0.40,       // wet asphalt, typical
  tr: 1.5,           // perception-reaction time, s
  nightExtraTr: 0.5, // assumed extra reaction time at night, s (View 5)
});

export const RANGES = Object.freeze({
  mph: [20, 80],
  mu: [0.10, 0.90],
  tr: [0.5, 2.5],
});

export function reactionFt(mph, tr) {
  return mph * MPH_TO_FTPS * tr;
}

// Returns Infinity when mu <= 0: the car never stops. Callers must clamp before drawing.
export function brakingFt(mph, mu) {
  const v = mph * MPH_TO_FTPS;
  if (v === 0) return 0;
  if (!(mu > 0)) return Infinity;
  return (v * v) / (2 * mu * G_FTPS2);
}

export function stopping(mph, mu, tr) {
  const reaction = reactionFt(mph, tr);
  const braking = brakingFt(mph, mu);
  return { reaction, braking, total: reaction + braking };
}

// Deceleration a (ft/s^2) <-> friction mu, for checking against AASHTO's 3.4 m/s^2.
export function muFromDecel(aMs2) {
  return (aMs2 / 0.3048) / G_FTPS2;
}

// How a bar of this length is drawn on an axis that ends at axisMax.
// Never returns Infinity or NaN as a length (proposal, boundary case 2).
export function barGeometry(lengthFt, axisMax) {
  if (!Number.isFinite(lengthFt)) {
    return { drawn: axisMax, clipped: true, label: "does not stop within the visible road" };
  }
  if (lengthFt > axisMax) {
    return { drawn: axisMax, clipped: true, label: `${Math.round(lengthFt)} ft, beyond the visible road` };
  }
  return { drawn: Math.max(0, lengthFt), clipped: false, label: `${Math.round(lengthFt)} ft` };
}

// ---------- exposure arithmetic (Views 6 and 7) ----------
// s = condition's share of crashes, e = condition's share of vehicle-miles (exposure).
// Crash rate relative to the average rate: condition s/e, baseline (1-s)/(1-e).
// They are equal exactly when e = s.

export function relativeRates(s, e) {
  const cond = e > 0 ? s / e : Infinity;
  const base = e < 1 ? (1 - s) / (1 - e) : Infinity;
  return { cond, base, ratio: cond / base };
}

// Rate ratio (condition per mile / baseline per mile) for an exposure interval [eLo, eHi].
// The ratio falls as e rises, so the high exposure gives the low ratio.
export function rateRatioInterval(s, eLo, eMid, eHi) {
  return {
    lo: relativeRates(s, eHi).ratio,
    mid: relativeRates(s, eMid).ratio,
    hi: relativeRates(s, eLo).ratio,
  };
}

export const fmtFt = (x) => (Number.isFinite(x) ? `${Math.round(x).toLocaleString("en-US")} ft` : "never stops");
