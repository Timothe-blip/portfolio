"""Liest den öffentlichen Google-Kalender (ICS) und schreibt nur die belegten Tage
nach media/availability.json – ohne Titel oder Details. Läuft automatisch per GitHub Action."""
import json, re, sys, urllib.request
from datetime import date, datetime, timedelta, timezone

CAL = "0e80dbcfe5a7d05493688315afb7419580078471e5282cd5516ba92c7fcc1b4f@group.calendar.google.com"
URL = f"https://calendar.google.com/calendar/ical/{CAL.replace('@', '%40')}/public/basic.ics"
OUT = sys.argv[1] if len(sys.argv) > 1 else "media/availability.json"


def parse_day(line):
    val = line.split(":", 1)[1].strip()
    d = date(int(val[:4]), int(val[4:6]), int(val[6:8]))
    return d, "T" in val  # (Datum, hat Uhrzeit)


def main():
    raw = urllib.request.urlopen(URL, timeout=30).read().decode("utf-8")
    raw = re.sub(r"\r?\n[ \t]", "", raw)  # gefaltete Zeilen zusammenfügen
    today = datetime.now(timezone.utc).date()
    lo, hi = today - timedelta(days=40), today + timedelta(days=400)
    busy = set()
    for ev in raw.split("BEGIN:VEVENT")[1:]:
        ev = ev.split("END:VEVENT")[0]
        lines = ev.splitlines()
        if any(l.startswith("TRANSP:TRANSPARENT") for l in lines):
            continue  # als "verfügbar" markiert
        if any(l.startswith("STATUS:CANCELLED") for l in lines):
            continue
        s = next((l for l in lines if l.startswith("DTSTART")), None)
        e = next((l for l in lines if l.startswith("DTEND")), None)
        if not s:
            continue
        start, _ = parse_day(s)
        if e:
            end, timed = parse_day(e)
            if timed:
                end += timedelta(days=1)  # Termin mit Uhrzeit: Endtag zählt mit
        else:
            end = start + timedelta(days=1)
        end = max(end, start + timedelta(days=1))
        rule = next((l for l in lines if l.startswith("RRULE")), None)
        starts = [start]
        if rule:  # einfache Wiederholungen (täglich/wöchentlich) bis Ende/UNTIL/COUNT
            p = dict(kv.split("=", 1) for kv in rule.split(":", 1)[1].split(";"))
            step = {"DAILY": 1, "WEEKLY": 7}.get(p.get("FREQ"))
            if step:
                step *= int(p.get("INTERVAL", 1))
                until = date(int(p["UNTIL"][:4]), int(p["UNTIL"][4:6]), int(p["UNTIL"][6:8])) if "UNTIL" in p else hi
                count = int(p.get("COUNT", 10**6))
                d, n = start, 0
                while d <= min(until, hi) and n < count:
                    starts.append(d); d += timedelta(days=step); n += 1
        for st in starts:
            d = st
            while d < st + (end - start):
                if lo <= d <= hi:
                    busy.add(d.isoformat())
                d += timedelta(days=1)
    data = {"busy": sorted(busy)}
    new = json.dumps(data, indent=0) + "\n"
    try:
        if open(OUT).read() == new:
            print("unverändert"); return
    except FileNotFoundError:
        pass
    open(OUT, "w").write(new)
    print(f"{len(busy)} belegte Tage geschrieben")


main()
