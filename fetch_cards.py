#!/usr/bin/env python3
"""
DCR Hub — Racecards (GB + IE, today)
Writes cards.json with meetings -> races -> runners.
Works with The Racing API using Basic/Standard plan.
"""

import os, sys, json, datetime, hashlib
from typing import Dict, Any, List, Optional
import requests

BASE = (os.getenv("RACING_API_BASE") or "https://api.theracingapi.com").rstrip("/")
USER = os.getenv("RACING_API_USER")
PASS = os.getenv("RACING_API_PASS")

TODAY = datetime.date.today().isoformat()  # YYYY-MM-DD
COUNTRIES = "GB,IE"
OUTFILE = "cards.json"
TIMEOUT = 25

def sha1(s: str) -> str:
    import hashlib as _h
    return _h.sha1(s.encode("utf-8")).hexdigest()

def get_json(url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    r = requests.get(url, auth=(USER, PASS), params=params, timeout=TIMEOUT)
    if not r.ok:
        raise RuntimeError(f"HTTP {r.status_code} for {r.url} -> {r.text[:250]}")
    try:
        return r.json()
    except Exception:
        raise RuntimeError(f"Non-JSON from {r.url}: {r.text[:250]}")

def _first(*vals):
    for v in vals:
        if isinstance(v, str) and v.strip():
            return v
        if v and not isinstance(v, str):
            return v
    return ""

# ---- 1) Find meetings for today (GB/IE) with adaptive params ----
def fetch_meetings_list() -> List[Dict[str, Any]]:
    base_params_day = [
        {"on": TODAY}, {"date": TODAY}, {"meeting_date": TODAY}, {"day": TODAY},
    ]
    base_params_range = [
        {"from": TODAY, "to": TODAY},
        {"dateFrom": TODAY, "dateTo": TODAY},
        {"start_date": TODAY, "end_date": TODAY},
        {"startDate": TODAY, "endDate": TODAY},
    ]
    country_keys = ["countries", "countrycodes", "countryCodes", "country"]

    def with_country(p):
        outs = []
        for ck in country_keys:
            q = dict(p); q[ck] = COUNTRIES
            outs.append(q)
        return outs

    paths = ["/v1/meetings", "/meetings", "/v1/stages", "/stages"]
    last_err = None
    for path in paths:
        url = f"{BASE}{path}"
        # day params first
        for p in base_params_day:
            for params in with_country(p):
                try:
                    print(f"➡️  meetings {url} {params}")
                    data = get_json(url, params)
                    meetings = data.get("meetings") or data.get("stages") or data
                    if isinstance(meetings, list):
                        return meetings
                except Exception as e:
                    last_err = e
        # range second
        for p in base_params_range:
            for params in with_country(p):
                try:
                    print(f"➡️  meetings {url} {params}")
                    data = get_json(url, params)
                    meetings = data.get("meetings") or data.get("stages") or data
                    if isinstance(meetings, list):
                        return meetings
                except Exception as e:
                    last_err = e
    raise RuntimeError(f"No meetings endpoint worked. Last error: {last_err}")

# ---- 2) For each meeting, fetch its races (and runners) ----
def fetch_races_for_meeting(mid: str) -> List[Dict[str, Any]]:
    # try /meetings/{id}/races, /stages/{id}, /races?meeting_id=...
    candidate_urls = [
        f"{BASE}/v1/meetings/{mid}/races",
        f"{BASE}/meetings/{mid}/races",
        f"{BASE}/v1/stages/{mid}",
        f"{BASE}/stages/{mid}",
        f"{BASE}/v1/races",
        f"{BASE}/races",
    ]
    for url in candidate_urls:
        try:
            params = {}
            if url.endswith("/races") and "meetings/" not in url and "stages/" not in url:
                # if querying /races flat, pass meeting_id
                params = {"meeting_id": mid, "stage_id": mid, "meetingId": mid}
            print(f"➡️  races {url} {params}")
            data = get_json(url, params)
            # shapes:
            #  - {races:[...]}
            #  - {events:[...]} (stage detail)
            #  - [...list...]
            races = data.get("races") or data.get("events") or data
            if isinstance(races, list):
                return races
        except Exception as e:
            print(f"✖️  races fetch failed: {e}")
            continue
    return []

def normalize(meetings_raw: List[Dict[str, Any]]) -> Dict[str, Any]:
    out_meetings = []

    for m in meetings_raw:
        mid = _first(m.get("id"), m.get("uuid"), m.get("meeting_id"), m.get("stage_id"))
        course = _first(m.get("course"), m.get("venue"), m.get("name"))
        if not mid or not course:
            continue

        races_raw = fetch_races_for_meeting(str(mid))
        races_out = []
        for r in races_raw:
            off = _first(r.get("off_time"), r.get("time"), r.get("scheduled_time"))
            title = _first(r.get("name"), r.get("race_title"), r.get("title"))

            runners = r.get("runners") or r.get("entrants") or r.get("horses") or []
            rr = []
            for e in runners:
                rr.append({
                    "no": _first(e.get("number"), e.get("cloth"), e.get("saddlecloth")),
                    "horse": _first(e.get("horse_name"), e.get("name")),
                    "jockey": _first(e.get("jockey_name"), e.get("jockey")),
                    "trainer": _first(e.get("trainer_name"), e.get("trainer")),
                    "age": _first(e.get("age"), ""),
                    "weight": _first(e.get("weight"), e.get("weight_carried")),
                    "draw": _first(e.get("draw"), e.get("stall")),
                    "odds": _first(e.get("odds"), e.get("forecast_sp"), e.get("sp")),
                })

            races_out.append({
                "off_time": off or "",
                "race_title": title or "",
                "runners": rr,
            })

        out_meetings.append({
            "meeting_date": TODAY,
            "course": course,
            "races": races_out,
        })

    return {
        "updated_at": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "meetings": out_meetings
    }

def main():
    if not USER or not PASS:
        raise RuntimeError("Missing credentials: set RACING_API_USER and RACING_API_PASS.")
    meetings = fetch_meetings_list()
    payload = normalize(meetings)
    new_blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    new_hash = sha1(new_blob)
    old_blob = ""
    if os.path.exists(OUTFILE):
        with open(OUTFILE, "r", encoding="utf-8") as f:
            old_blob = f.read()
    if sha1(old_blob) != new_hash:
        with open(OUTFILE, "w", encoding="utf-8") as f:
            f.write(new_blob)
        print(f"✅ Wrote {OUTFILE} with {len(payload['meetings'])} meetings.")
    else:
        print("No changes (cards.json unchanged).")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("❌ ERROR:", e, file=sys.stderr); sys.exit(1)
