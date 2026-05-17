"""
One-time script to download MBTA LAMP data and build historical baselines JSON.

Usage:
    pip install pandas pyarrow requests
    python scripts/process-lamp-data.py

Output: data/gl-historical-baselines.json

Schema written matches HistoricalBaseline in types/mbta.ts:
  stopId, directionId, hour, dayOfWeek, avgDelayMinutes, p75DelayMinutes, sampleSize
"""
import json
import os
import sys

import pandas as pd
import requests

GL_ROUTES = {"Green-B", "Green-C", "Green-D", "Green-E"}

GL_STOPS = [
    "place-lech", "place-spmnl", "place-north", "place-haecl", "place-gover",
    "place-pktrm", "place-boyls", "place-armnl", "place-coecl", "place-hymnl",
    "place-kencl",
    # B
    "place-bland", "place-buest", "place-bucen", "place-amory", "place-babck",
    "place-brico", "place-harvd", "place-grigg", "place-allsn", "place-wrnst",
    "place-wascm", "place-sthld", "place-chswk", "place-chill", "place-sougr", "place-lake",
    # C
    "place-smary", "place-hwsst", "place-kntst", "place-stpul", "place-cool",
    "place-sumav", "place-bndhl", "place-fbkst", "place-bcnwa", "place-tapst",
    "place-denrd", "place-engav", "place-clmnl",
    # D
    "place-fenwy", "place-longw", "place-brkhl", "place-brkvi", "place-bcnfd",
    "place-rsmnl", "place-chhil", "place-newto", "place-newtn", "place-eliot",
    "place-waban", "place-woodl", "place-river",
    # E
    "place-prmnl", "place-symcl", "place-nuniv", "place-mfa", "place-lngmd",
    "place-brgfd", "place-fenwd", "place-mispk", "place-rvrwy", "place-bckhl", "place-hsmnl",
    # GLX
    "place-gilmn", "place-esomr", "place-union", "place-mdftf", "place-ball",
    "place-magno",
]

LAMP_BASE = "https://performancedata.mbta.com/lamp/gtfs_archive"
YEARS = [2023, 2024, 2025]

def download_parquet(year: int) -> pd.DataFrame | None:
    url = f"{LAMP_BASE}/{year}/travel_times.parquet"
    local = f"/tmp/lamp_travel_times_{year}.parquet"

    if os.path.exists(local):
        print(f"  Using cached {local}")
    else:
        print(f"  Downloading {url} …")
        r = requests.get(url, stream=True, timeout=300)
        if r.status_code != 200:
            print(f"  WARNING: got {r.status_code} for {year}, skipping")
            return None
        with open(local, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)

    try:
        df = pd.read_parquet(
            local,
            filters=[("route_id", "in", list(GL_ROUTES))],
        )
        print(f"  {year}: {len(df):,} rows")
        return df
    except Exception as e:
        print(f"  WARNING: could not read {local}: {e}")
        return None


def main():
    dfs = []
    for year in YEARS:
        df = download_parquet(year)
        if df is not None:
            dfs.append(df)

    if not dfs:
        print("ERROR: no data downloaded — check your network and LAMP URL.")
        sys.exit(1)

    df = pd.concat(dfs, ignore_index=True)
    print(f"Total rows: {len(df):,}")
    print(f"Columns: {list(df.columns)}")

    # LAMP column names vary slightly by year — normalise
    col_map = {}
    for col in df.columns:
        lc = col.lower()
        if "from_stop" in lc:
            col_map[col] = "from_stop_id"
        elif "direction" in lc:
            col_map[col] = "direction_id"
        elif "dep_dt" in lc or "departure_time" in lc:
            col_map[col] = "dep_dt"
        elif "travel_time_sec" in lc and "scheduled" not in lc:
            col_map[col] = "travel_time_sec"
        elif "scheduled" in lc and "time" in lc:
            col_map[col] = "scheduled_tt_sec"
    df = df.rename(columns=col_map)

    required = {"from_stop_id", "direction_id", "dep_dt", "travel_time_sec", "scheduled_tt_sec"}
    missing = required - set(df.columns)
    if missing:
        print(f"ERROR: missing columns after normalisation: {missing}")
        print("Available columns:", list(df.columns))
        sys.exit(1)

    df["dep_dt"] = pd.to_datetime(df["dep_dt"], utc=True, errors="coerce")
    df = df.dropna(subset=["dep_dt"])
    df["hour"] = df["dep_dt"].dt.hour
    df["day_of_week"] = df["dep_dt"].dt.dayofweek  # 0=Mon … 6=Sun; convert to 0=Sun below
    # Shift so 0=Sun matches JS Date.getDay()
    df["day_of_week"] = (df["day_of_week"] + 1) % 7

    df["travel_time_sec"] = pd.to_numeric(df["travel_time_sec"], errors="coerce")
    df["scheduled_tt_sec"] = pd.to_numeric(df["scheduled_tt_sec"], errors="coerce")
    df = df.dropna(subset=["travel_time_sec", "scheduled_tt_sec"])
    df["delay_minutes"] = (df["travel_time_sec"] - df["scheduled_tt_sec"]) / 60

    df = df[df["from_stop_id"].isin(GL_STOPS)]

    agg = (
        df.groupby(["from_stop_id", "direction_id", "hour", "day_of_week"])["delay_minutes"]
        .agg(
            avg_delay="mean",
            p75_delay=lambda x: x.quantile(0.75),
            sample_size="count",
        )
        .reset_index()
    )

    records = []
    for _, row in agg.iterrows():
        records.append({
            "stopId": row["from_stop_id"],
            "directionId": int(row["direction_id"]),
            "hour": int(row["hour"]),
            "dayOfWeek": int(row["day_of_week"]),
            "avgDelayMinutes": round(float(row["avg_delay"]), 1),
            "p75DelayMinutes": round(float(row["p75_delay"]), 1),
            "sampleSize": int(row["sample_size"]),
        })

    os.makedirs("data", exist_ok=True)
    output_path = "data/gl-historical-baselines.json"
    with open(output_path, "w") as f:
        json.dump(records, f, indent=2)

    print(f"\nWrote {len(records):,} baseline records to {output_path}")


if __name__ == "__main__":
    main()
