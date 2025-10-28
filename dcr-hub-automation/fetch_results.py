"""
fetch_results.py
- Builds data/results.json using an upstream CSV/JSON and provider templates.
- Designed for GitHub Actions. Commits the updated JSON back to the repo.
"""
import os, json, csv, re, sys, io, urllib.request, yaml, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
OUTPUT_PATH = ROOT.parent / "data" / "results.json"  # expects repo layout with site at root or /docs
PROVIDERS_FILE = ROOT / "providers.yaml"

# Environment variables:
# SOURCE_CSV_URL  — optional; if set, a CSV with columns: meeting_date,course,off_time,race_number,race_title,horse,position,sp,note,handicap
# FALLBACK_FILE   — optional; local CSV path (useful for testing)
# OUTPUT_PATH     — optional; override output JSON path (relative to repo root)
# COURSE_ALIASES  — optional; JSON mapping for course name normalization

def slugify(txt):
    s = re.sub(r"[^a-zA-Z0-9\s-]", "", str(txt)).strip().lower()
    s = re.sub(r"[\s_]+", "-", s)
    return s

def hhmm(off_time):
    # Accepts "14:10" or "1410"
    if not off_time: return ""
    m = re.match(r"^(\d{1,2}):(\d{2})$", str(off_time))
    if m:
        return f"{int(m.group(1)):02d}{m.group(2)}"
    m = re.match(r"^(\d{3,4})$", str(off_time))
    if m:
        return m.group(1).zfill(4)
    return ""

def load_providers(path):
    with open(path, "r") as f:
        return yaml.safe_load(f)["providers"]

def fetch_source_rows():
    # Try SOURCE_CSV_URL, then FALLBACK_FILE
    url = os.getenv("SOURCE_CSV_URL", "").strip()
    local = os.getenv("FALLBACK_FILE", "").strip()
    rows = []
    if url:
        with urllib.request.urlopen(url, timeout=20) as resp:
            data = resp.read().decode("utf-8")
            reader = csv.DictReader(io.StringIO(data))
            rows = list(reader)
    elif local and os.path.exists(local):
        with open(local, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
    else:
        # Minimal mock if nothing provided
        rows = [{
            "meeting_date":"2025-10-27",
            "course":"Newbury",
            "off_time":"14:10",
            "race_number":"3",
            "race_title":"Handicap (Class 3)",
            "horse":"Sample Runner",
            "position":"1st",
            "sp":"4/1",
            "note":"Sectional upgrade; found plenty.",
            "handicap":"true"
        }]
    return rows

def normalize_course(name, aliases_json):
    if not name: return ""
    if aliases_json:
        try:
            mapping = json.loads(aliases_json)
            if name in mapping:
                return mapping[name]
        except Exception:
            pass
    return name

def build_replay_links(row, providers):
    links = []
    for p in providers:
        template = p.get("replay_url_template")
        if not template: 
            continue
        url = template.format(
            meeting_date=row["meeting_date"],
            course_slug=slugify(row["course"]),
            off_time_hhmm=hhmm(row["off_time"]),
            race_number=row.get("race_number") or ""
        )
        links.append({"label": p.get("label", p["key"]), "url": url})
    return links

def main():
    providers = load_providers(PROVIDERS_FILE)
    rows = fetch_source_rows()
    aliases = os.getenv("COURSE_ALIASES", "")

    races = []
    for r in rows:
        course = normalize_course(r.get("course",""), aliases)
        race = {
            "meeting_date": r.get("meeting_date",""),
            "course": course,
            "off_time": r.get("off_time",""),
            "race_number": r.get("race_number",""),
            "race_title": r.get("race_title",""),
            "horse": r.get("horse",""),
            "position": r.get("position",""),
            "sp": r.get("sp",""),
            "note": r.get("note",""),
            "handicap": str(r.get("handicap","")).lower() in ("1","true","yes","y"),
        }
        race["replay_links"] = build_replay_links(race, providers)
        races.append(race)

    payload = {
        "updated_at": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "races": races
    }

    out = os.getenv("OUTPUT_PATH", "")
    output_path = pathlib.Path(out) if out else OUTPUT_PATH
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    print(f"Wrote {output_path} with {len(races)} races.")

if __name__ == "__main__":
    main()
