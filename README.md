# Race Day Plan

A pre-race scheduler for Hybrid_by_Ben, at https://hybridbyben.com/race-plan/.
Plan race morning to the minute (timed back from your start), the days before
and after, and in-race cues; get it as calendar reminders (.ics) and a
printable cue card.

- **Your amounts, your plan.** The page never suggests doses or products:
  every amount is the user's own text, with a "only what you've tested in
  training; not medical advice" notice.
- **Private.** Plans are saved in the visitor's browser only (and as a plan
  file they download themselves). Nothing is uploaded, and no one's personal
  routine is stored in this repo.

| Path | What |
|---|---|
| `site/index.html` | The page |
| `site/plan.js` | The logic (times and time zones, warnings, calendar file), no page code |
| `.github/workflows/pages.yml` | Publishes `site/` to GitHub Pages on each change |

© 2026 Hybrid_by_Ben. All rights reserved. See [LICENSE](LICENSE).
