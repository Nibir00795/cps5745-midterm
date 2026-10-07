// One shared state object. Views read from it and subscribe to it; they never talk to each
// other directly, so a slider in View 3 reaches Views 4 and 5 without either knowing about it.
import { DEFAULTS } from "./stopping.js";

const initial = () => ({
  // model parameters (Views 3, 4, 5)
  mph: DEFAULTS.mph,
  muDry: DEFAULTS.muDry,
  muWet: DEFAULTS.muWet,
  tr: DEFAULTS.tr,
  nightExtraTr: DEFAULTS.nightExtraTr,
});

let state = initial();
const subs = new Set();

export const get = () => state;
export function set(patch) {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn(state, patch));
}
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function resetModel() { set(initial()); }
