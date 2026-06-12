#!/usr/bin/env python3
import json, os, subprocess, urllib.request

URL     = "https://wc-draft-room.vercel.app/api/draft"
CHAT_ID = "any;+;0dd0a1c00b5346c5ac64a09dd1f03b34"
SEEN    = os.path.expanduser("~/.draftping_seen")

def imessage(text):
    safe = text.replace("\\", "\\\\").replace('"', '\\"')  # don't let a name break the AppleScript
    osa = f'tell application "Messages" to send "{safe}" to chat id "{CHAT_ID}"'
    subprocess.run(["osascript", "-e", osa], check=True)

st = json.load(urllib.request.urlopen(URL, timeout=15)).get("state")
if not st: raise SystemExit

players, order, picks, slots = st["players"], st["order"], st.get("picks", []), st["slots"]
seq = []
for r in range(slots):
    seq += order if r % 2 == 0 else list(reversed(order))

made = len(picks)
last = int(open(SEEN).read() or 0) if os.path.exists(SEEN) else -1
if made == last: raise SystemExit

if made >= len(seq):
    imessage("Thats a wrap, the draft is complete. Check the board.")
else:
    who = players[seq[made]]
    rnd = made // len(players) + 1
    imessage(f"{who}, you are on the clock. Pick #{made+1} (Round {rnd}). https://wc-draft-room.vercel.app/")

# Record the pick count only AFTER a successful send. If imessage() raises, SEEN
# is left untouched so the next run retries instead of silently skipping a ping.
open(SEEN, "w").write(str(made))
