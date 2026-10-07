#!/usr/bin/env python3
"""
Write a synthetic CSV with the US Accidents March 2023 schema (46 columns) for testing
prep.py without the 3 GB file. TEST DATA ONLY: never used for any figure in the project.

It deliberately includes the cases prep.py must handle:
  * both Start_Time formats in the release (with and without nanoseconds)
  * missing Weather_Condition, missing Sunrise_Sunset, unparseable Start_Time
  * "N/A Precipitation", "Light Freezing Rain", "Thunder in the Vicinity", "Snow Showers"
  * missing Precipitation(in) on wet rows (must stay missing, never become zero)

    python3 checks/make_synthetic.py out.csv 200000
"""
import sys
import numpy as np
import pandas as pd

COLUMNS = ["ID", "Source", "Severity", "Start_Time", "End_Time", "Start_Lat", "Start_Lng",
           "End_Lat", "End_Lng", "Distance(mi)", "Description", "Street", "City", "County",
           "State", "Zipcode", "Country", "Timezone", "Airport_Code", "Weather_Timestamp",
           "Temperature(F)", "Wind_Chill(F)", "Humidity(%)", "Pressure(in)", "Visibility(mi)",
           "Wind_Direction", "Wind_Speed(mph)", "Precipitation(in)", "Weather_Condition",
           "Amenity", "Bump", "Crossing", "Give_Way", "Junction", "No_Exit", "Railway",
           "Roundabout", "Station", "Stop", "Traffic_Calming", "Traffic_Signal", "Turning_Loop",
           "Sunrise_Sunset", "Civil_Twilight", "Nautical_Twilight", "Astronomical_Twilight"]
assert len(COLUMNS) == 46

DRY = ["Fair", "Clear", "Mostly Cloudy", "Partly Cloudy", "Cloudy", "Overcast", "Haze", "Fog",
       "Mist", "Thunder in the Vicinity", "Smoke", "Scattered Clouds"]
WET = ["Light Rain", "Rain", "Heavy Rain", "Light Drizzle", "Thunderstorms and Rain",
       "T-Storm", "Light Rain with Thunder", "Rain Shower", "Heavy T-Storm / Windy"]
FROZEN = ["Light Snow", "Snow", "Light Freezing Rain", "Snow Showers", "Wintry Mix", "Sleet"]
AMBIG = ["N/A Precipitation"]


def main(path, n, seed=5745):
    rng = np.random.default_rng(seed)
    w = np.array([1, .7, .6, .6, .8, 1.5, 3, 5, 5.5, 4, 3.6, 3.8, 4,
                  4.2, 4.8, 5.8, 6.4, 6.6, 5, 3.6, 2.8, 2.3, 1.8, 1.3])
    hour = rng.choice(24, size=n, p=w / w.sum())
    days = rng.integers(0, 2600, size=n)
    base = pd.Timestamp("2016-02-08") + pd.to_timedelta(days, unit="D") + pd.to_timedelta(hour, unit="h") \
        + pd.to_timedelta(rng.integers(0, 3600, size=n), unit="s")
    st = base.strftime("%Y-%m-%d %H:%M:%S").to_numpy().astype(object)
    nano = rng.random(n) < 0.15
    st[nano] = [s + ".000000000" for s in st[nano]]
    st[rng.random(n) < 0.0005] = "not a time"

    kind = rng.choice(4, size=n, p=[0.88, 0.075, 0.035, 0.01])
    wc = np.empty(n, dtype=object)
    for k, pool in enumerate([DRY, WET, FROZEN, AMBIG]):
        m = kind == k
        wc[m] = rng.choice(pool, size=m.sum())
    wc[rng.random(n) < 0.022] = None

    night = (hour < 6) | (hour >= 19)
    ss = np.where(night, "Night", "Day").astype(object)
    ss[rng.random(n) < 0.003] = None

    precip = np.where(kind == 1, rng.gamma(1.2, 0.05, n), 0.0).astype(object)
    precip[rng.random(n) < 0.29] = None          # large missing share, like the real file

    df = pd.DataFrame({c: [None] * n for c in COLUMNS})
    df["ID"] = [f"A-{i + 1}" for i in range(n)]
    df["Source"] = "Source1"
    df["Severity"] = rng.choice([1, 2, 3, 4], size=n, p=[0.01, 0.80, 0.16, 0.03])
    df["Start_Time"] = st
    df["Weather_Condition"] = wc
    df["Sunrise_Sunset"] = ss
    df["Visibility(mi)"] = np.where(kind == 0, 10.0, rng.uniform(0.2, 10, n)).round(1)
    df["Precipitation(in)"] = precip
    df["State"] = rng.choice(["CA", "FL", "TX", "SC", "NY", "NJ", "PA", "OH"], size=n)
    df["Country"] = "US"
    df.to_csv(path, index=False)
    print(f"wrote {n:,} synthetic rows to {path}")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 200_000)
