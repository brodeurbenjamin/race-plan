/**
 * © 2026 Hybrid_by_Ben. All rights reserved. See LICENSE.
 *
 * Race Day Plan: the logic, with no page code, so it can be tested on its own.
 *
 * A plan is one race:
 *   race     { name, date: "2026-12-18", start: "09:00", tz: "Europe/Paris" }
 *   settings { caffeineLimit: number|null, alertMin: 0 }
 *   items    race-morning items, timed in minutes before the start (`offset`):
 *            { id, label, kind, offset, amount, caffeine, rehearsed, note,
 *              duration, moving,                     (activities only)
 *              before: { id, min } | null,            "at least min before item id"
 *              reaction: { from, to, moving } | null } "effects from..to min after; be moving then"
 *   leadIn   days around the race: { id, label, amount, first, last, time, note }
 *            first/last are days relative to race day (-3 = 3 days before, 0 = race day, 2 = 2 days after)
 *   cues     in-race reminders: { id, at: "Run 3", when: "after"|"before"|"during", text }
 *
 * Nothing here suggests an amount or a product: every amount is the user's own text.
 */

export const KINDS = {
  food: 'Food & drink',
  caffeine: 'Caffeine',
  supplement: 'Supplement',
  gel: 'Gel',
  activity: 'Activity',
  other: 'Other',
};

// HYROX race order, for the in-race cue card.
export const SEGMENTS = [
  'Start',
  'Run 1', 'SkiErg', 'Run 2', 'Sled Push', 'Run 3', 'Sled Pull', 'Run 4', 'Burpee Broad Jumps',
  'Run 5', 'Rowing', 'Run 6', 'Farmers Carry', 'Run 7', 'Sandbag Lunges', 'Run 8', 'Wall Balls',
  'Finish',
];

export const uid = () => Math.random().toString(36).slice(2, 10);

// "1:30" -> 90, "90" -> 90, "0:05" -> 5. null if unreadable.
export function parseOffset(s) {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^\d{1,4}$/);
  if (m) return Number(t);
  return null;
}

// 90 -> "1:30"
export const hm = (min) => `${Math.floor(Math.abs(min) / 60)}:${String(Math.abs(min) % 60).padStart(2, '0')}`;

// 90 -> "T-1:30", 0 -> "T-0:00", -20 -> "T+0:20"
export const tminus = (offset) => (offset < 0 ? `T+${hm(offset)}` : `T-${hm(offset)}`);

// Wall-clock time in the race's time zone: start "09:00", offset 90 -> { hhmm: "07:30", day: 0 }.
// day is -1 for the evening before, +1 after midnight.
export function clockAt(start, offset) {
  const [h, m] = String(start || '00:00').split(':').map(Number);
  const t = h * 60 + m - offset;
  const day = Math.floor(t / 1440);
  const mins = ((t % 1440) + 1440) % 1440;
  return { hhmm: `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`, day };
}

// "07:30" -> "7:30 AM"
export function ampm(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---- time zones -------------------------------------------------------------

// Minutes the zone is ahead of UTC at that instant (Paris in winter: 60).
export function zoneOffset(utcMs, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

// The UTC instant of a wall-clock time in a zone: ("2026-12-18", "07:30", "Europe/Paris") -> ms.
export function zonedToUtc(date, hhmm, tz) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - zoneOffset(wall, tz) * 60000;
  utc = wall - zoneOffset(utc, tz) * 60000; // second pass settles daylight-saving edges
  return utc;
}

// The UTC instant of an item `offset` minutes before the start.
export const itemUtc = (race, offset) => zonedToUtc(race.date, race.start, race.tz) - offset * 60000;

export function validZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---- dates ------------------------------------------------------------------

const DAY = 864e5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ymdMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const addDays = (s, n) => new Date(ymdMs(s) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((ymdMs(b) - ymdMs(a)) / DAY);
// "2026-12-18" -> "Fri 18 Dec"
export function dayLabel(s) {
  const d = new Date(ymdMs(s));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
// -3 -> "3 days before", 0 -> "race day", 1 -> "1 day after"
export const relDay = (n) => (n === 0 ? 'race day' : `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} ${n < 0 ? 'before' : 'after'}`);

// A lead-in item's dates and where today sits: { from, to, state, text }.
// today is "YYYY-MM-DD" on the user's device.
export function leadInStatus(race, li, today) {
  const from = addDays(race.date, li.first);
  const to = addDays(race.date, li.last);
  let state, text;
  if (today < from) {
    const n = daysBetween(today, from);
    state = 'upcoming';
    text = n === 1 ? 'Starts tomorrow' : `Starts in ${n} days`;
  } else if (today > to) {
    state = 'done';
    text = 'Done';
  } else {
    const left = daysBetween(today, to);
    state = 'now';
    text = left === 0 ? 'Today is the last day' : `Today · ${left} more day${left === 1 ? '' : 's'} after today`;
  }
  return { from, to, state, text };
}

// ---- the morning timeline -----------------------------------------------------

// Items earliest first (biggest offset first); activities before items at the same time.
export function sortedItems(plan) {
  return [...plan.items].sort((a, b) => b.offset - a.offset || (a.kind === 'activity' ? -1 : 0) - (b.kind === 'activity' ? -1 : 0));
}

// Running caffeine total after each item, earliest first: Map(id -> mg so far).
export function caffeineRunning(plan) {
  const out = new Map();
  let total = 0;
  for (const it of sortedItems(plan)) {
    total += Number(it.caffeine) || 0;
    out.set(it.id, total);
  }
  return out;
}

// Is the athlete moving at time t (minutes before start; negative = after the start)?
// The race itself counts as moving; activity blocks run from offset to offset - duration.
function stateAt(plan, t) {
  if (t <= 0) return 'race';
  // A still block wins over a moving one at the same time (e.g. sitting for
  // photos in the middle of a warm-up).
  let moving = false;
  for (const a of plan.items) {
    if (a.kind !== 'activity' || !(a.duration > 0)) continue;
    if (t <= a.offset && t > a.offset - a.duration) {
      if (!a.moving) return { still: a };
      moving = true;
    }
  }
  return moving ? 'moving' : null;
}

// Group consecutive minutes with the same verdict: [[fromT, toT, verdict], ...]
function runs(fromT, toT, f) {
  const out = [];
  for (let t = fromT; t > toT; t--) {
    const v = f(t);
    const last = out[out.length - 1];
    if (last && last[2] === v) last[1] = t - 1;
    else out.push([t, t - 1, v]);
  }
  return out;
}

// Warnings for the plan: [{ level: 'warn'|'info', ids: [...], text }].
export function warnings(plan) {
  const out = [];
  const byId = Object.fromEntries(plan.items.map((i) => [i.id, i]));
  const clock = (t) => ampm(clockAt(plan.race.start, t).hhmm);

  for (const it of plan.items) {
    // "At least N min before another item"
    if (it.before && byId[it.before.id] && it.before.min > 0) {
      const other = byId[it.before.id];
      const gap = it.offset - other.offset;
      if (gap < it.before.min) {
        out.push({ level: 'warn', ids: [it.id, other.id],
          text: `${it.label} is ${gap < 0 ? `after ${other.label}` : `${gap} min before ${other.label}`}; your rule is at least ${it.before.min} min before.` });
      }
    }
    // Reaction window: be moving from dose + from to dose + to.
    if (it.reaction && it.reaction.moving && it.reaction.to > it.reaction.from) {
      const a = it.offset - it.reaction.from;
      const b = it.offset - it.reaction.to;
      const bad = runs(a, b, (t) => {
        const s = stateAt(plan, t);
        if (s === 'race' || s === 'moving') return 'ok';
        return s ? `still:${s.still.id}` : 'none';
      }).filter((r) => r[2] !== 'ok');
      for (const [from, to, v] of bad) {
        const span = `${tminus(from)} to ${tminus(to)} (${clock(from)}–${clock(to)})`;
        if (v === 'none') {
          out.push({ level: 'warn', ids: [it.id], text: `${it.label}: you'll be in its reaction window from ${span} with no moving activity planned. Add a warm-up or move the dose.` });
        } else {
          const s = byId[v.slice(6)];
          out.push({ level: 'warn', ids: [it.id, s.id], text: `${it.label}: its reaction window overlaps ${s.label} (marked still), ${span}.` });
        }
      }
    }
  }

  // Caffeine limit (only if the user set one).
  const limit = Number(plan.settings?.caffeineLimit);
  if (limit > 0) {
    const run = caffeineRunning(plan);
    const over = sortedItems(plan).find((i) => run.get(i.id) > limit);
    if (over) out.push({ level: 'warn', ids: [over.id], text: `Caffeine reaches ${run.get(over.id)} mg at ${tminus(over.offset)} (${over.label}); your limit is ${limit} mg.` });
  }

  // Nothing new on race day.
  const fresh = sortedItems(plan).filter((i) => !['activity', 'other'].includes(i.kind) && !String(i.rehearsed || '').trim());
  if (fresh.length) {
    out.push({ level: 'info', ids: fresh.map((i) => i.id),
      text: `Not rehearsed yet: ${fresh.map((i) => i.label).join(', ')}. Only use what you've tested in training, and note when you did.` });
  }
  return out;
}

// ---- calendar export ----------------------------------------------------------

const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUtc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Lines over 75 octets are folded, as the format requires.
function fold(line) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) {
      out.push(cur);
      cur = ' ' + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

/**
 * The plan as an .ics calendar file. Race-morning items are pinned to the race
 * time zone (as UTC), so they're right whatever zone the phone is in. Lead-in
 * items use "floating" times: 8:00 means 8:00 wherever you are that day, which
 * is what you want while travelling. Every event gets an alert.
 */
export function buildIcs(plan, { leadIn = true, now = Date.now() } = {}) {
  const alert = Math.max(0, Number(plan.settings?.alertMin) || 0);
  const stamp = icsUtc(now);
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hybrid_by_Ben//Race Day Plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(plan.race.name || 'Race Day Plan')}`];
  const alarm = (desc) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(desc)}`, `TRIGGER:${alert ? `-PT${alert}M` : 'PT0M'}`, 'END:VALARM'];
  const ev = (uidv, start, end, summary, desc, floating) => [
    'BEGIN:VEVENT', `UID:${uidv}@race-plans.hybridbyben.com`, `DTSTAMP:${stamp}`,
    ...(floating ? [`DTSTART:${start}`, `DTEND:${end}`] : [`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(end)}`]),
    `SUMMARY:${icsText(summary)}`, ...(desc ? [`DESCRIPTION:${icsText(desc)}`] : []), ...alarm(summary), 'END:VEVENT'];

  for (const it of sortedItems(plan)) {
    const start = itemUtc(plan.race, it.offset);
    const len = it.kind === 'activity' && it.duration > 0 ? it.duration : 5;
    const desc = [`${tminus(it.offset)} (start ${ampm(plan.race.start)} race time)`, it.amount, it.note,
      it.reaction?.moving ? `Be moving ${tminus(it.offset - it.reaction.from)} to ${tminus(it.offset - it.reaction.to)}` : ''].filter(Boolean).join('\n');
    L.push(...ev(`${plan.id}-${it.id}`, start, start + len * 60000, `${it.label}${it.amount ? ` · ${it.amount}` : ''}`, desc, false));
  }
  const startUtc = zonedToUtc(plan.race.date, plan.race.start, plan.race.tz);
  L.push(...ev(`${plan.id}-start`, startUtc, startUtc + 90 * 60000, `${plan.race.name || 'Race'}: start`, cuesText(plan), false));

  if (leadIn) {
    for (const li of plan.leadIn) {
      for (let d = li.first; d <= li.last; d++) {
        const date = addDays(plan.race.date, d).replace(/-/g, '');
        const t = /^\d\d:\d\d$/.test(li.time || '') ? li.time : '08:00';
        const start = `${date}T${t.replace(':', '')}00`;
        const [h, m] = t.split(':').map(Number);
        const endMin = Math.min(h * 60 + m + 10, 23 * 60 + 59);
        const end = `${date}T${String(Math.floor(endMin / 60)).padStart(2, '0')}${String(endMin % 60).padStart(2, '0')}00`;
        const desc = [`${relDay(d)} (${relDayRange(li)})`, li.amount, li.note].filter(Boolean).join('\n');
        L.push(...ev(`${plan.id}-${li.id}-${d}`, start, end, `${li.label}${li.amount ? ` · ${li.amount}` : ''}`, desc, true));
      }
    }
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

export const relDayRange = (li) => (li.first === li.last ? relDay(li.first) : `${relDay(li.first)} to ${relDay(li.last)}`);

// ---- in-race cues -------------------------------------------------------------

export function sortedCues(plan) {
  const w = { before: 0, during: 1, after: 2 };
  return [...plan.cues].sort((a, b) => SEGMENTS.indexOf(a.at) - SEGMENTS.indexOf(b.at) || w[a.when] - w[b.when]);
}
export const cueWhen = (c) => `${c.when[0].toUpperCase()}${c.when.slice(1)} ${c.at}`;
export const cuesText = (plan) => sortedCues(plan).map((c) => `${cueWhen(c)}: ${c.text}`).join('\n');

// ---- plans --------------------------------------------------------------------

export function blankPlan(today, tz) {
  return {
    v: 1, id: uid(),
    race: { name: '', date: addDays(today, 28), start: '09:00', tz },
    settings: { caffeineLimit: null, alertMin: 0 },
    items: [], leadIn: [], cues: [],
  };
}

// A generic example: common slots with example times and NO amounts or
// products. Everyone fills in their own, from what they've tested.
export function examplePlan(today, tz) {
  const p = blankPlan(today, tz);
  p.race.name = 'Example race';
  const it = (label, kind, offset, extra = {}) => ({ id: uid(), label, kind, offset, amount: '', caffeine: 0, rehearsed: '', note: '', before: null, reaction: null, ...extra });
  p.items = [
    it('Breakfast', 'food', 180, { note: 'What you ate before your best training sessions.' }),
    it('Coffee', 'caffeine', 180),
    it('Arrive and check in', 'activity', 105, { duration: 30, moving: false }),
    it('Bathroom', 'other', 70),
    it('Warm-up', 'activity', 40, { duration: 25, moving: true }),
    it('Corral: keep moving', 'activity', 15, { duration: 15, moving: true }),
    it('Gel', 'gel', 12),
  ];
  p.leadIn = [
    { id: uid(), label: 'Shakeout: short and easy', amount: '', first: -1, last: -1, time: '', note: '' },
  ];
  p.cues = [];
  return p;
}

// Cleans a plan read from storage or an imported file. Throws if it isn't one.
export function normalisePlan(raw) {
  if (!raw || typeof raw !== 'object' || !raw.race || !Array.isArray(raw.items)) throw new Error('not a Race Day Plan file');
  const s = (v, n = 200) => String(v ?? '').slice(0, n);
  const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
  const date = /^\d{4}-\d\d-\d\d$/.test(raw.race.date) ? raw.race.date : new Date().toISOString().slice(0, 10);
  const plan = {
    v: 1, id: s(raw.id, 20) || uid(),
    race: { name: s(raw.race.name, 80), date, start: /^\d\d:\d\d$/.test(raw.race.start) ? raw.race.start : '09:00',
      tz: validZone(raw.race.tz) ? raw.race.tz : 'UTC' },
    settings: { caffeineLimit: raw.settings?.caffeineLimit > 0 ? num(raw.settings.caffeineLimit, 1, 5000) : null,
      alertMin: num(raw.settings?.alertMin, 0, 60) },
    items: raw.items.slice(0, 60).map((i) => ({
      id: s(i.id, 20) || uid(), label: s(i.label, 80) || 'Item', kind: KINDS[i.kind] ? i.kind : 'other',
      offset: num(i.offset, 0, 24 * 60), amount: s(i.amount), caffeine: num(i.caffeine, 0, 2000), rehearsed: s(i.rehearsed, 300), note: s(i.note, 500),
      ...(i.kind === 'activity' ? { duration: num(i.duration, 0, 600, 15), moving: !!i.moving } : {}),
      before: i.before && i.before.id ? { id: s(i.before.id, 20), min: num(i.before.min, 0, 24 * 60) } : null,
      reaction: i.reaction ? { from: num(i.reaction.from, 0, 24 * 60), to: num(i.reaction.to, 0, 24 * 60), moving: i.reaction.moving !== false } : null,
    })),
    leadIn: (Array.isArray(raw.leadIn) ? raw.leadIn : []).slice(0, 40).map((l) => {
      const first = num(l.first, -60, 30), last = num(l.last, -60, 30);
      return { id: s(l.id, 20) || uid(), label: s(l.label, 80) || 'Item', amount: s(l.amount), first: Math.min(first, last), last: Math.max(first, last),
        time: /^\d\d:\d\d$/.test(l.time || '') ? l.time : '', note: s(l.note, 500) };
    }),
    cues: (Array.isArray(raw.cues) ? raw.cues : []).slice(0, 40).map((c) => ({
      id: s(c.id, 20) || uid(), at: SEGMENTS.includes(c.at) ? c.at : 'Start', when: ['before', 'during', 'after'].includes(c.when) ? c.when : 'after', text: s(c.text, 120) })),
  };
  // Drop "before" rules that point at items that no longer exist.
  const ids = new Set(plan.items.map((i) => i.id));
  for (const i of plan.items) if (i.before && !ids.has(i.before.id)) i.before = null;
  return plan;
}
