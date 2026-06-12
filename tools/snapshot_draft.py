#!/usr/bin/env python3
"""Freeze the live draft into data/draft-final.json.

The draft room (https://wc-draft-room.vercel.app) is editable until the league
finishes picking. Run this ONCE the draft is complete to capture the final
rosters as a stable input for the tracker. The tracker reads this file (or the
live API) and never lets results scoring depend on a draft that could still move.

    python3 tools/snapshot_draft.py
"""
import json, os, sys, urllib.request, datetime

API = "https://wc-draft-room.vercel.app/api/draft"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "draft-final.json")

def main():
    st = json.load(urllib.request.urlopen(API, timeout=15)).get("state")
    if not st:
        sys.exit("No draft state at the API — nothing to snapshot.")
    picks = st.get("picks", [])
    expected = len(st["players"]) * st["slots"]
    out = {
        "_snapshot_taken": datetime.datetime.now().isoformat(timespec="seconds"),
        "_source": API,
        "_complete": len(picks) >= expected,
        "rev": st.get("rev"),
        "players": st["players"],
        "slots": st["slots"],
        "order": st["order"],
        "picks": picks,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2)
    flag = "COMPLETE" if out["_complete"] else f"INCOMPLETE ({len(picks)}/{expected})"
    print(f"Wrote {os.path.normpath(OUT)} — {flag}, rev {out['rev']}")
    if not out["_complete"]:
        print("  (re-run this once the last picks are in)")

if __name__ == "__main__":
    main()
