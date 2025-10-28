import os, json, requests, datetime, hashlib, sys

BASE = os.getenv("RACING_API_BASE", "https://api.theracingapi.com").rstrip("/")
USER = os.getenv("RACING_API_USER")
PASS = os.getenv("RACING_API_PASS")

TODAY = datetime.date.today().isoformat()
OUTFILE = "results.json"
TIMEOUT = 25

def sha1(s: str) -> str:
    import hashlib
    return hashlib.sha1(s.encode("utf-8")).hexdigest()

def get_json(url, params=None):
    r = requests.get(url, auth=(USER, PASS), params=params, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def fetch_results():
    params = {"date": TODAY, "countries": "GB,IE"}
    url = f"{BASE}/results"

    print(f"Fetching: {url}")
    data = get_json(url, params=params)

    races_out = []
    for meeting in data.get("meetings", []):
        course = meeting.get("course") or meeting.get("venue") or ""
        for race in meeting.get("races", []):
            title = race.get("name") or race.get("race_title") or ""
            off_time = race.get("off_time") or race.get("scheduled_time") or ""
            entrants = race.get("entrants") or race.get("runners") or []
            podium = {1: None, 2: None, 3: None}

            for e in entrants:
                pos = e.get("finish_position") or e.get("position")
                try:
                    pos = int(str(pos).replace("=", "").strip())
                except:
                    pos = None
                if pos in (1, 2, 3) and podium[pos] is None:
                    podium[pos] = {
                        "horse": e.get("horse_name") or e.get("name"),
                        "jockey": e.get("jockey_name") or e.get("jockey"),
                        "trainer": e.get("trainer_name") or e.get("trainer"),
                        "sp": e.get("sp") or e.get("starting_price"),
                    }

            races_out.append({
                "meeting_date": TODAY,
                "course": course,
                "off_time": off_time,
                "race_title": title,
                "finishers": {
                    "1": podium[1],
                    "2": podium[2],
                    "3": podium[3],
                },
            })
    return races_out

def main():
    races = fetch_results()
    payload = {
        "updated_at": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "races": races
    }

    new_blob = json.dumps(payload, indent=2, ensure_ascii=False)
    new_hash = sha1(new_blob)

    old_blob = ""
    if os.path.exists(OUTFILE):
        with open(OUTFILE, "r", encoding="utf-8") as f:
            old_blob = f.read()

    if sha1(old_blob) != new_hash:
        with open(OUTFILE, "w", encoding="utf-8") as f:
            f.write(new_blob)
        print(f"✅ results.json updated ({len(races)} races).")
    else:
        print("No new results — unchanged.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("❌ ERROR:", e)
        sys.exit(1)
