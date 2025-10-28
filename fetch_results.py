#!/usr/bin/env python3
"""
DCR Hub – results fetcher for The Racing API (GB + IE)

- Auth: HTTP Basic (username/password) via repo secrets
- Pulls today's results for GB/IE
- Extracts 1st, 2nd, 3rd finishers per race
- Writes compact results.json at repo root
"""

import os, sys, json, datetime, hashlib
from typing import Any, Dict, List, Optional
import requests

# ------------------ Config ------------------
BASE = (os.getenv("RACING_API_BASE") or "https://api.theracingapi.com").rstrip("/")
USER = os.getenv("RACING_API_USER")
PASS = os.getenv("RACING_API_PASS")

# Use UTC date (what the API typically expects). Change if you want local/UK.
TODAY = datetime.date.today().isoformat()  # YYYY-MM-DD
COUNTRIES = "GB,IE"
OUTFILE = "results.json"
TIMEOUT = 25

# ------------------ Helpers ------------------
def sha1(s: str) -> str:
    import hashlib as _hash
    return _hash.sha1(s.encode("utf-8")).hexdigest()

def get_json(url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """GET JSON with Basic Auth; raise with context if non-2xx."""
    try:
        r = requests.get(url, auth=(USER, PASS), params=params, timeout=TIMEOUT)
        ct = r.headers.get("content-type", "")
        if not r.ok:
            raise RuntimeError(f"HTTP {r.status_code} for {r.url} (content-type={ct}) -> {r.text[:250]}")
        try:
            return r.json()
        except Exception:
            # Surface first 250 chars to help debugging
            raise RuntimeError(f"Non-JSON response from {r.url}: {r.text[:250]}")
    except requests.RequestException as e:
        raise RuntimeError(f"Network error calling {url}: {e}") from e

def norm_int_pos(pos: Any) -> Optional[int]:
    """Turn '1', '1=', 1 -> 1 ; anything else -> None."""
    if pos is None:
        return None
    s = str(pos).strip()
    if s.endswith("="):
        s = s[:-1]
    try:
        return int(s)
    except ValueError:
        return None

def first_nonempty(*vals):
    for v in vals:
        if isinstance(v, str) and v.strip():
            return v
        if v and not isinstance(v, str):
            return v
    return ""

# ------------------ Core ------------------
def fetch_meetings() -> Dict[str, Any]:
    """
    Try common results endpoints for the basic plan.
    Adjust/lock to the one that returns data for your account after first success.
    """
    params = {"date": TODAY, "countries": COUNTRIES}
    candidate_paths = [
        "/results",
        "/v1/results",          # fallback if versioned
        "/races/results",       # rare, but try once
    ]
    last_err = None
    for path in candidate_paths:
        url = f"{BASE}{path}"
        print(f"➡️  Trying {url} with {params}")
        try:
            data = get_json(url, params=params)
            # Must have either 'meetings' or 'races' to be useful
            if "meetings" in data or "races" in data or isinstance(data, list):
                print(f"✔️  OK from {url}")
                return data
            else:
                print(f"ℹ️  Response schema from {url} didn't include 'meetings' or 'races'. Keys: {list(data.keys())}")
                last_err = RuntimeError("Unexpected schema")
        except Exception as e:
            print(f"❌ {e}")
            last_err = e
    raise RuntimeError(f"No usable results endpoint. Last error: {last_err}")

def extract_races(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Transform provider response -> normalized list of race dicts:
    {
      meeting_date, course, off_time, race_title,
      finishers: { "1": {...}, "2": {...}, "3": {...} }
    }
    """
    out: List[Dict[str, Any]] = []

    def add_race(course: str, race: Dict[str, Any]):
        title = first_nonempty(race.get("name"), race.get("race_title"), race.get("title"))
        off_time = first_nonempty(race.get("off_time"), race.get("scheduled_time"), race.get("time"))
        entrants = race.get("entrants") or race.get("runners") or race.get("horses") or []
        podium = {1: None, 2: None, 3: None}

        for e in entrants:
            pos = norm_int_pos(e.get("finish_position") or e.get("position") or e.get("result"))
            if pos in (1, 2, 3) and podium[pos] is None:
                podium[pos] = {
                    "horse": first_nonempty(e.get("horse_name"), e.get("name")),
                    "jockey": first_nonempty(e.get("jockey_name"), e.get("jockey")),
                    "trainer": first_nonempty(e.get("trainer_name"), e.get("trainer")),
                    "sp": first_nonempty(e.get("sp"), e.get("starting_price"), e.get("price")),
                }

        out.append({
            "meeting_date": TODAY,
            "course": course or "",
            "off_time": off_time or "",
            "race_title": title or "",
            "finishers": {"1": podium[1], "2": podium[2], "3": podium[3]},
        })

    # Common shape: { meetings: [ {course, races:[...]}, ... ] }
    if isinstance(payload, dict) and "meetings" in payload:
        for m in payload.get("meetings", []):
            course = first_nonempty(m.get("course"), m.get("venue"), m.get("name"))
            races = m.get("races") or []
            for r in races:
                add_race(course, r)
        return out

    # Some APIs flatten: { races: [ {...} ] } with course embedded
    if isinstance(payload, dict) and "races" in payload:
        for r in payload.get("races", []):
            course = first_nonempty(r.get("course"), r.get("venue"), r.get("track"))
            add_race(course, r)
        return out

    # Rare: list at top-level
    if isinstance(payload, list):
        for r in payload:
            course = first_nonempty(r.get("course"), r.get("venue"), r.get("track"))
            add_race(course, r)
        return out

    # If we get here, schema is unknown:
    raise RuntimeError(f"Unexpected response shape: {type(payload)} keys={list(payload.keys()) if isinstance(payload, dict) else 'n/a'}")

def main():
    if not USER or not PASS:
        raise RuntimeError("Missing credentials: set RACING_API_USER and RACING_API_PASS (repo secrets).")

    payload = fetch_meetings()
    races = extract_races(payload)

    result = {
        "updated_at": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "races": races,
    }

    new_blob = json.dumps(result, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    new_hash = sha1(new_blob)

    old_blob = ""
    if os.path.exists(OUTFILE):
        with open(OUTFILE, "r", encoding="utf-8") as f:
            old_blob = f.read()

    if sha1(old_blob) != new_hash:
        with open(OUTFILE, "w", encoding="utf-8") as f:
            f.write(new_blob)
        print(f"✅ Wrote {OUTFILE} with {len(races)} races.")
    else:
        print("No changes (results.json unchanged).")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("❌ ERROR:", e, file=sys.stderr)
        sys.exit(1)

