# Counting Is Not Risk: Rain, Darkness and the Missing Denominator

A seven-view dynamic explainer built for CPS 5745 (Interactive Information Visualization, Kean University, Fall 2026) by Md Jonayed Hossain Chowdhury.

Most of the 7.7 million crashes in the US Accidents dataset happen in clear weather and in daylight. The stopping-distance physics says rain and darkness are worse. The views set the count against the mechanism and show that the disagreement comes from a number the dataset does not contain: how much driving happens in each condition.

## Run it

The site is static files. It needs an HTTP server because it uses ES modules and loads JSON.

```
python3 -m http.server 8000
# open http://localhost:8000
```

D3 v7 and the Plotly 3D bundle are vendored in `lib/`, so the page works offline.

## Rebuild the data from the source

1. Download `US_Accidents_March23.csv` from https://www.kaggle.com/datasets/sobhanmoosavi/us-accidents (CC BY-NC-SA 4.0) and put it in `data/raw/`. It is about 3 GB and is not committed.
2. Run:

```
python3 prep/prep.py
```

This reads the file in 500,000-row chunks, using only the eight columns the project needs, and writes `data/byhour.json`, `data/audit.json`, `data/conditions.json` and `data/prep_log.json`. It takes about 30 seconds on a laptop. The script stops if the row count or date range does not match the cited release.

The run used for the submitted figures:

| | |
|---|---|
| rows read | 7,728,394 |
| rows in the tables | 7,534,613 |
| excluded and counted | 173,459 missing `Weather_Condition`, 20,322 missing `Sunrise_Sunset` |
| start times | 2016-01-14 to 2023-03-31 |
| SHA-256 | `e3e9f962e3e2289db1bdce91623abbcf9ba4d7bfc1adb091c8aeee6c2639d204` |
| row conservation | passed, per chunk and overall |

## Checks

```
node checks/check_model.mjs                 # model: worked example, AASHTO check, boundary cases (22 checks)
python3 checks/make_synthetic.py s.csv 200000
python3 prep/prep.py --csv s.csv --allow-mismatch
python3 checks/check_prep.py s.csv          # recounts every table cell a second way (21 checks)
```

Run `prep/prep.py` again on the real file after the synthetic test, because the synthetic run overwrites `data/*.json` and the page then shows a "test data" banner.

## Files

| path | what it is |
|---|---|
| `index.html`, `css/style.css` | the page |
| `js/stopping.js` | the model, d = v·t_r + v²/(2μg), and the exposure arithmetic; no DOM, shared with the checks |
| `js/state.js` | shared state, so View 3's sliders drive Views 4 and 5 |
| `js/views/v1.js` … `v7.js` | one module per view |
| `prep/prep.py` | data preparation |
| `prep/weather_terms.json` | the explicit weather classification; edit it and rerun prep to change what counts as rain |
| `data/exposure.json` | outside exposure estimates with their sources (not from the dataset) |
| `checks/` | the verification suite |

## Sources

- Moosavi, Samavatian, Parthasarathy and Ramnath. A Countrywide Traffic Accident Dataset (2019), and Accident Risk Prediction based on Heterogeneous Sparse Data (2019). Data: https://www.kaggle.com/datasets/sobhanmoosavi/us-accidents
- AASHTO, A Policy on Geometric Design of Highways and Streets: stopping sight distance, 2.5 s reaction, 3.4 m/s² deceleration.
- FHWA, Proven Safety Countermeasures: Lighting (FHWA-SA-21-050): 25% of vehicle-miles at night.
- Varghese and Shankar, NHTSA DOT HS 810 637 (2007): about 25% of travel during darkness.
- Harwood, Blackburn, Kibler and Kulakowski, Estimation of Wet Pavement Exposure from Available Weather Records, TRR 1172 (1988).
- Qiu and Nixon, Effects of Adverse Weather on Traffic Crashes: Systematic Review and Meta-Analysis, TRR 2055 (2008).
- FHWA Road Weather Management Program, How Do Weather Events Impact Roads? (2019 to 2023 averages).

## AI assistance

Built with Claude (Anthropic) as a coding and writing assistant. Every figure on the page comes from `prep/prep.py` run on the real file or from the cited sources in `data/exposure.json`; the model and pipeline are covered by the checks above, which were run and passed.
