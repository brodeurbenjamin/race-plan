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
 *   nutrition { weight, unit: "kg"|"lb", finish: minutes|null, show } for the carb guide
 *
 * Items and day items picked from the checklist carry `cat` (their CATALOG id)
 * and every item has a `group` (its checklist category). An item's `offset`
 * (or a day item's `first`/`last`) can be null: picked, but no time set yet.
 *
 * Amounts are the user's own text. The only numbers the page offers are the
 * published carbohydrate guideline ranges (carbGuide), scaled by body weight
 * and cited; never doses for caffeine or supplements, which get no suggested
 * time either.
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
  return plan.items.filter((i) => i.offset !== null).sort((a, b) => b.offset - a.offset || (a.kind === 'activity' ? -1 : 0) - (b.kind === 'activity' ? -1 : 0));
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
    if (a.kind !== 'activity' || !(a.duration > 0) || a.offset === null) continue;
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

  for (const it of sortedItems(plan)) {
    // "At least N min before another item"
    if (it.before && byId[it.before.id] && byId[it.before.id].offset !== null && it.before.min > 0) {
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

  // Picked from the checklist but no time set yet.
  const unset = [...plan.items.filter((i) => i.offset === null), ...plan.leadIn.filter((l) => l.first === null)];
  if (unset.length) {
    out.push({ level: 'warn', ids: unset.map((i) => i.id), text: `Set a time for: ${unset.map((i) => i.label).join(', ')}. Use what you tested in training.` });
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
    for (const li of dayItems(plan)) {
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

// ---- the checklist ------------------------------------------------------------

export const CATEGORIES = [
  ['days', 'Days before'],
  ['sleep', 'Sleep'],
  ['food', 'Food & drink'],
  ['caffeine', 'Caffeine'],
  ['supplements', 'Supplements'],
  ['venue', 'At the venue'],
];

// Things people often plan. Race-morning items (`offset`, minutes before the
// start) or day items (`day`: first/last relative to race day, optional
// time). Typical times are suggestions to edit. Caffeine pills and
// supplements have no suggested time (null): the user sets their own.
export const CATALOG = [
  { id: 'shakeout', cat: 'days', label: 'Shakeout: short and easy', day: [-1, -1, ''] },
  { id: 'checkwave', cat: 'days', label: 'Check your wave time and the venue', day: [-2, -2, ''] },
  { id: 'travel', cat: 'days', label: 'Travel / hotel check-in', day: [-1, -1, ''] },
  { id: 'dinner', cat: 'days', label: 'Carb-focused dinner', day: [-1, -1, '18:30'] },
  { id: 'hydrate', cat: 'days', label: 'Drink regularly through the day', day: [-1, -1, ''] },
  { id: 'pack', cat: 'days', label: 'Pack your bag and lay out kit', day: [-1, -1, '20:00'] },
  { id: 'carbs', cat: 'days', label: 'Daily carb targets from your weight', carbs: true },
  { id: 'lightsout', cat: 'sleep', label: 'Lights out', day: [-1, -1, '22:00'] },
  { id: 'wake', cat: 'sleep', label: 'Wake-up alarm', kind: 'other', offset: 210 },
  { id: 'breakfast', cat: 'food', label: 'Breakfast', kind: 'food', offset: 180 },
  { id: 'water', cat: 'food', label: 'Water', kind: 'food', offset: 120 },
  { id: 'snack', cat: 'food', label: 'Pre-race snack', kind: 'food', offset: 75 },
  { id: 'electrolytes', cat: 'food', label: 'Electrolytes', kind: 'food', offset: 60 },
  { id: 'gel', cat: 'food', label: 'Gel before the start', kind: 'gel', offset: 12 },
  { id: 'coffee', cat: 'caffeine', label: 'Coffee', kind: 'caffeine', offset: 180 },
  { id: 'caffeine', cat: 'caffeine', label: 'Caffeine pill or gum', kind: 'caffeine', offset: null },
  { id: 'bicarb', cat: 'supplements', label: 'Sodium bicarbonate', kind: 'supplement', offset: null },
  { id: 'nitrate', cat: 'supplements', label: 'Nitrate (beet) on race morning', kind: 'supplement', offset: null },
  { id: 'nitrateDays', cat: 'supplements', label: 'Nitrate (beet) on the days before', day: null },
  { id: 'cherry', cat: 'supplements', label: 'Tart cherry', day: null },
  { id: 'creatine', cat: 'supplements', label: 'Creatine: keep your usual', day: null, note: "Don't change it near the race." },
  { id: 'arrive', cat: 'venue', label: 'Arrive and check in', kind: 'activity', offset: 90, duration: 20, moving: false },
  { id: 'bathroom', cat: 'venue', label: 'Bathroom', kind: 'other', offset: 50 },
  { id: 'bagdrop', cat: 'venue', label: 'Bag drop', kind: 'other', offset: 45 },
  { id: 'warmup', cat: 'venue', label: 'Warm-up', kind: 'activity', offset: 40, duration: 25, moving: true },
  { id: 'corral', cat: 'venue', label: 'Start pen: keep moving', kind: 'activity', offset: 15, duration: 15, moving: true },
];
export const catalogItem = (id) => CATALOG.find((c) => c.id === id);
export const isDayEntry = (c) => c && 'day' in c;

export function isTicked(plan, cid) {
  if (catalogItem(cid)?.carbs) return !!plan.nutrition?.show;
  return plan.items.some((i) => i.cat === cid) || plan.leadIn.some((l) => l.cat === cid);
}

// Adds a checklist entry with its suggested time (or none). Returns the new id.
export function tick(plan, cid) {
  const c = catalogItem(cid);
  if (!c || isTicked(plan, cid)) return null;
  if (c.carbs) {
    plan.nutrition = { ...plan.nutrition, show: true };
    return 'carbs';
  }
  const id = uid();
  if (isDayEntry(c)) {
    const [first, last, time] = c.day || [null, null, ''];
    plan.leadIn.push({ id, cat: c.id, group: c.cat, label: c.label, amount: '', first, last, time, note: c.note || '' });
  } else {
    plan.items.push({ id, cat: c.id, group: c.cat, label: c.label, kind: c.kind, offset: c.offset, amount: '', caffeine: 0,
      rehearsed: '', note: c.note || '', before: null, reaction: null,
      ...(c.kind === 'activity' ? { duration: c.duration, moving: c.moving } : {}) });
  }
  return id;
}

export function untick(plan, cid) {
  if (catalogItem(cid)?.carbs) {
    plan.nutrition = { ...plan.nutrition, show: false };
    return;
  }
  const gone = new Set(plan.items.filter((i) => i.cat === cid).map((i) => i.id));
  plan.items = plan.items.filter((i) => i.cat !== cid);
  plan.leadIn = plan.leadIn.filter((l) => l.cat !== cid);
  for (const i of plan.items) if (i.before && gone.has(i.before.id)) i.before = null;
}

// Group for an item the user added themselves.
export const groupOfKind = (kind) => ({ food: 'food', gel: 'food', caffeine: 'caffeine', supplement: 'supplements' })[kind] || 'venue';

// ---- carbohydrate guide --------------------------------------------------------

export const CARB_SOURCE = 'American College of Sports Medicine, Academy of Nutrition and Dietetics and Dietitians of Canada, "Nutrition and Athletic Performance" (joint position statement, 2016)';
export const LB_PER_KG = 2.20462;

/**
 * Published carbohydrate guideline ranges for this athlete (null without a
 * usable weight). Event length picks the row: under 90 min is "fuelling up"
 * (7-12 g/kg in the 24 h before); over 90 min is carb loading (10-12 g/kg a
 * day for 36-48 h). Pre-event: 1-4 g/kg, 1-4 h before. During: under 45 min
 * not needed; 45-75 min small amounts or a mouth rinse; 1-2.5 h 30-60 g/h;
 * longer, up to 90 g/h. Grams are rounded to 5.
 */
export function carbGuide(n) {
  const w = Number(n?.weight);
  const kg = n?.unit === 'lb' ? w / LB_PER_KG : w;
  if (!(kg >= 30 && kg <= 250)) return null;
  const g = (lo, hi) => [Math.round((lo * kg) / 5) * 5, Math.round((hi * kg) / 5) * 5];
  const finish = Number(n.finish) > 0 ? Number(n.finish) : null;
  const load = finish !== null && finish > 90;
  const days = load
    ? { first: -2, last: -1, perKg: [10, 12], g: g(10, 12), name: 'Carb loading (events over 90 min): 10–12 g/kg a day for the 36–48 h before' }
    : { first: -1, last: -1, perKg: [7, 12], g: g(7, 12), name: 'Fuelling up (events under 90 min): 7–12 g/kg in the 24 h before' };
  let during;
  if (finish === null) during = { text: 'Enter your expected finish time to see this.' };
  else if (finish < 45) during = { text: 'Not needed for efforts under 45 min.' };
  else if (finish <= 75) during = { text: 'Small amounts, or rinsing your mouth with a carb drink (45–75 min efforts).' };
  else if (finish <= 150) during = { text: '30–60 g per hour (1–2.5 h efforts)', total: [Math.round((30 * finish) / 60 / 5) * 5, Math.round((60 * finish) / 60 / 5) * 5] };
  else during = { text: 'Up to 90 g per hour (efforts over 2.5 h)' };
  return { kg, load, finish, days, pre: { perKg: [1, 4], g: g(1, 4) }, during };
}

// Day items for the timeline and calendar: the user's (with dates set) plus
// the carb targets when switched on.
export function dayItems(plan) {
  const out = plan.leadIn.filter((l) => l.first !== null);
  const guide = plan.nutrition?.show ? carbGuide(plan.nutrition) : null;
  if (guide) {
    out.push({ id: 'carbs', cat: 'carbs', group: 'days', label: 'Carbs today', amount: `${guide.days.g[0]}–${guide.days.g[1]} g`,
      first: guide.days.first, last: guide.days.last, time: '', note: `${guide.days.name}. Published guideline, not personal advice.`, derived: true });
  }
  return out;
}

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
    nutrition: { weight: null, unit: 'kg', finish: null, show: false },
  };
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
      cat: catalogItem(i.cat) ? i.cat : '', group: CATEGORIES.some((c) => c[0] === i.group) ? i.group : groupOfKind(i.kind),
      offset: i.offset === null || i.offset === '' || i.offset === undefined ? null : num(i.offset, 0, 24 * 60), amount: s(i.amount), caffeine: num(i.caffeine, 0, 2000), rehearsed: s(i.rehearsed, 300), note: s(i.note, 500),
      ...(i.kind === 'activity' ? { duration: num(i.duration, 0, 600, 15), moving: !!i.moving } : {}),
      before: i.before && i.before.id ? { id: s(i.before.id, 20), min: num(i.before.min, 0, 24 * 60) } : null,
      reaction: i.reaction ? { from: num(i.reaction.from, 0, 24 * 60), to: num(i.reaction.to, 0, 24 * 60), moving: i.reaction.moving !== false } : null,
    })),
    leadIn: (Array.isArray(raw.leadIn) ? raw.leadIn : []).slice(0, 40).map((l) => {
      const unset = l.first === null || l.first === undefined || l.first === '';
      const first = unset ? null : num(l.first, -60, 30), last = unset ? null : num(l.last ?? l.first, -60, 30);
      return { id: s(l.id, 20) || uid(), cat: catalogItem(l.cat) ? l.cat : '', group: CATEGORIES.some((c) => c[0] === l.group) ? l.group : 'days',
        label: s(l.label, 80) || 'Item', amount: s(l.amount), first: unset ? null : Math.min(first, last), last: unset ? null : Math.max(first, last),
        time: /^\d\d:\d\d$/.test(l.time || '') ? l.time : '', note: s(l.note, 500) };
    }),
    cues: (Array.isArray(raw.cues) ? raw.cues : []).slice(0, 40).map((c) => ({
      id: s(c.id, 20) || uid(), at: SEGMENTS.includes(c.at) ? c.at : 'Start', when: ['before', 'during', 'after'].includes(c.when) ? c.when : 'after', text: s(c.text, 120) })),
    nutrition: {
      weight: Number(raw.nutrition?.weight) > 0 ? Math.min(600, Math.round(Number(raw.nutrition.weight) * 10) / 10) : null,
      unit: raw.nutrition?.unit === 'lb' ? 'lb' : 'kg',
      finish: Number(raw.nutrition?.finish) > 0 ? num(raw.nutrition.finish, 1, 24 * 60) : null,
      show: !!raw.nutrition?.show,
    },
  };
  // Plans made before the checklist: tick the matching boxes by name.
  const MATCH = [
    ['breakfast', /breakfast/i], ['coffee', /coffee/i], ['caffeine', /caffeine (pill|gum)/i], ['bicarb', /bicarb/i],
    ['nitrate', /beet|nitrate/i], ['gel', /^gel/i], ['warmup', /warm-?up/i], ['arrive', /arriv/i], ['bathroom', /bathroom/i],
    ['corral', /corral|start pen/i], ['electrolytes', /electrolyte/i], ['snack', /snack/i], ['wake', /wake/i], ['bagdrop', /bag drop/i],
  ];
  const MATCH_DAYS = [
    ['cherry', /tart cherry/i], ['creatine', /creatine/i], ['nitrateDays', /beet|nitrate/i], ['shakeout', /shakeout/i],
    ['pack', /pack/i], ['dinner', /dinner/i], ['lightsout', /lights out/i], ['travel', /travel|fly/i],
  ];
  for (const [list, rules] of [[plan.items, MATCH], [plan.leadIn, MATCH_DAYS]]) {
    for (const x of list) {
      if (x.cat) continue;
      const hit = rules.find(([cid, re]) => re.test(x.label) && !list.some((y) => y.cat === cid));
      if (hit) { x.cat = hit[0]; x.group = catalogItem(hit[0]).cat; }
    }
  }
  // Drop "before" rules that point at items that no longer exist.
  const ids = new Set(plan.items.map((i) => i.id));
  for (const i of plan.items) if (i.before && !ids.has(i.before.id)) i.before = null;
  return plan;
}
