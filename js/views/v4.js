// View 4: the whole stopping-distance surface d(v, mu) at the current reaction time, in 3D.
import { stopping, RANGES } from "../stopping.js";
import { COLORS, segmented, $ } from "../ui.js";
import * as S from "../state.js";

const Plotly = window.Plotly;
const SPEEDS = Array.from({ length: 61 }, (_, i) => 20 + i);                 // 20..80 mph
const MUS = Array.from({ length: 81 }, (_, i) => +(0.10 + i * 0.01).toFixed(2)); // 0.10..0.90
const Z_MAX = 2500;
const CAMERAS = {
  orbit: { eye: { x: 1.6, y: 1.6, z: 0.9 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: -0.12 } },
  top: { eye: { x: 0.0001, y: 0, z: 2.5 }, up: { x: 0, y: 1, z: 0 }, center: { x: 0, y: 0, z: 0 } },
  side: { eye: { x: 2.5, y: 0, z: 0.15 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: -0.1 } },
};

export function initV4() {
  let showSlice = true, cam = "orbit";
  const el = $("#surface");

  function traces(st) {
    const z = MUS.map((mu) => SPEEDS.map((v) => stopping(v, mu, st.tr).total));
    const surface = {
      type: "surface", x: SPEEDS, y: MUS, z, cmin: 0, cmax: Z_MAX,
      colorscale: "YlOrRd", reversescale: true, showscale: true,
      colorbar: { title: { text: "feet", side: "right" }, len: 0.6, thickness: 12, x: 1.0 },
      contours: { z: { show: true, usecolormap: false, color: "rgba(0,0,0,0.25)", start: 0, end: Z_MAX, size: 250, width: 1 } },
      hovertemplate: "speed %{x} mph<br>μ %{y:.2f}<br>stopping distance <b>%{z:.0f} ft</b><extra></extra>",
      lighting: { ambient: 0.75, diffuse: 0.6, specular: 0.05 },
      opacity: 0.97, name: "d(v, μ)",
    };
    const out = [surface];
    if (showSlice) {
      const line = MUS.map((mu) => stopping(st.mph, mu, st.tr).total);
      out.push({
        type: "scatter3d", mode: "lines", x: MUS.map(() => st.mph), y: MUS, z: line.map((d) => d + 8),
        line: { color: "#111", width: 7 }, hoverinfo: "skip", name: `View 3 speed, ${st.mph} mph`,
      });
      const pts = [["dry", st.muDry], ["wet", st.muWet]];
      out.push({
        type: "scatter3d", mode: "markers+text", x: pts.map(() => st.mph), y: pts.map((p) => p[1]),
        z: pts.map((p) => stopping(st.mph, p[1], st.tr).total + 30),
        marker: { size: 6, color: pts.map((p) => COLORS[p[0]]), line: { color: "#fff", width: 2 } },
        text: pts.map((p) => `${p[0]} ${Math.round(stopping(st.mph, p[1], st.tr).total)} ft`),
        textposition: "top center", textfont: { size: 12, color: "#111" },
        hovertemplate: "%{text}<br>speed %{x} mph, μ %{y:.2f}<extra></extra>", name: "View 3 roads",
      });
    }
    return out;
  }

  function layout() {
    return {
      margin: { l: 0, r: 0, t: 0, b: 0 }, paper_bgcolor: "#fcfcfb", showlegend: false,
      font: { family: "-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", size: 12, color: "#52514e" },
      scene: {
        xaxis: { title: { text: "speed (mph)" }, range: RANGES.mph, gridcolor: "#e4e2dc" },
        yaxis: { title: { text: "friction μ (dimensionless)" }, range: [0.10, 0.90], gridcolor: "#e4e2dc" },
        zaxis: { title: { text: "stopping distance (ft)" }, range: [0, Z_MAX], gridcolor: "#e4e2dc" },
        aspectmode: "manual", aspectratio: { x: 1.15, y: 1.0, z: 0.75 },
        camera: CAMERAS[cam],
      },
    };
  }

  const config = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ["toImage", "resetCameraLastSave3d"] };

  function draw(st, patch) {
    $("#v4tr").value = st.tr; $("#v4trOut").textContent = `${st.tr.toFixed(1)} s`;
    if (!el.dataset.ready) {
      Plotly.newPlot(el, traces(st), layout(), config);
      el.dataset.ready = "1";
      el.on("plotly_hover", (ev) => {
        const p = ev.points[0];
        if (p.data.type === "surface") {
          $("#v4read").innerHTML = `speed ${p.x} mph · μ ${(+p.y).toFixed(2)} · t<sub>r</sub> ${S.get().tr.toFixed(1)} s · <b>${Math.round(p.z)} ft to stop</b>`;
        }
      });
    } else {
      // keep the reader's camera when only the data changes
      const l = layout();
      l.scene.camera = el._fullLayout?.scene?.camera || l.scene.camera;
      Plotly.react(el, traces(st), l, config);
    }
  }

  function setCamera(k) { cam = k; Plotly.relayout(el, { "scene.camera": CAMERAS[k] }); }
  const seg = segmented("#v4cam", setCamera);
  $("#v4tr").addEventListener("input", (e) => S.set({ tr: +e.target.value }));
  $("#v4slice").addEventListener("change", (e) => { showSlice = e.target.checked; draw(S.get()); });
  function reset() {
    showSlice = true; $("#v4slice").checked = true; seg.set("orbit", false); cam = "orbit";
    S.set({ tr: 1.5 });
    Plotly.relayout(el, { "scene.camera": CAMERAS.orbit });
    $("#v4read").textContent = "Hover the surface: speed, friction and stopping distance at that point.";
  }
  $("#v4reset").addEventListener("click", reset);
  S.subscribe((st, patch) => {
    if (["mph", "muDry", "muWet", "tr"].some((k) => k in patch)) draw(st, patch);
  });
  draw(S.get());
  return { reset };
}
