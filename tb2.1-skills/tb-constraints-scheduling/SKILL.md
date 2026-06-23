---
name: tb-constraints-scheduling
description: Find an optimal 1-hour meeting slot for three people with complex availability constraints by parsing ICS calendar files and applying constraint satisfaction with tie-breaking preferences. Use this skill whenever the task mentions ICS calendar parsing, meeting scheduling with constraints, constraint satisfaction over time slots, or producing a `.ics` output file with a scheduled meeting. Also trigger when the user references `/app/alice_calendar.ics`, `/app/meeting_scheduled.ics`, or needs to resolve scheduling conflicts across multiple calendars. The skill covers: parsing ICS VEVENT entries, computing free/busy windows, enforcing hard constraints (business hours, personal unavailability, buffer times), applying soft preferences as tie-breakers, and emitting a valid ICS file with UTC timestamps.
---

# tb-constraints-scheduling

Find a 1-hour slot for Alice, Bob, and Carol during January 15-19, 2024 that
satisfies per-person availability constraints and existing calendar conflicts,
output as a valid ICS file. This is a Terminal-Bench 2.1 task; the full task
spec lives at `tasks/constraints-scheduling/`.

## When this skill triggers

Use it when the user is dropped into the `constraints-scheduling` Docker
container and needs to parse three ICS calendar files, apply hard constraints
plus soft preferences, and emit `/app/meeting_scheduled.ics`. Do **not** use
it for generic calendar apps, recurring meeting schedulers, or doodle-poll
aggregators — this task is specifically about constraint-based optimization
over a fixed date range with person-specific rules.

## Goal (one sentence)

Find the earliest valid 1-hour slot during business hours (Jan 15-19, 2024)
that avoids all existing meetings and satisfies Alice's, Bob's, and Carol's
hard constraints, breaking ties with Carol's Monday-avoidance preference.

## Required outputs

| File | Purpose |
|---|---|
| `/app/meeting_scheduled.ics` | Valid ICS file with the scheduled "Team Planning Meeting" including all three attendees in UTC. |

Input files (`/app/alice_calendar.ics`, `/app/bob_calendar.ics`,
`/app/carol_calendar.ics`) must NOT be modified — the verifier checks their
integrity.

## Recommended workflow

### 1. Parse the ICS files (≈ 5 min)

Each calendar file contains VEVENT entries for January 15-19, 2024. Extract
every busy interval:

- Use Python's `ics` library, `icalendar`, or parse the plain-text ICS with
  regex for DTSTART/DTEND lines.
- Convert all times to UTC minutes since epoch for easy interval arithmetic.
- Build a set of busy-minutes per person.

### 2. Encode the hard constraints (≈ 10 min)

Translate every constraint into blocked-minute logic:

**Alice:**
- Available: 9 AM - 2 PM (inclusive start, exclusive end).
- Blocked: before 9 AM, after 2 PM.

**Bob:**
- Available: 10 AM - 5 PM, but on Tue/Thu must leave by 4:30 PM.
- Blocked: before 10 AM, after 5 PM (or after 4:30 PM on Tue/Thu).

**Carol:**
- Available: 9 AM - 12 PM and 12:30 PM - 5 PM (lunch 12:00-12:30 blocked).
- After any meeting ending at 4:45 PM or later, add a 15-min buffer.
- Prefers not to meet on Mondays (soft constraint, used as tie-breaker).

**Global:**
- Business hours: 9 AM - 6 PM (local = UTC for this task).
- Meeting duration: exactly 60 minutes.
- Date range: January 15 (Mon) through January 19 (Fri), 2024.

### 3. Search for valid slots (≈ 10 min)

- Iterate minute-by-minute (at minute granularity) across the five-day window.
- For each candidate start minute `t`, check that `[t, t+60)` is:
  1. Within business hours (9 AM - 6 PM).
  2. Not overlapping any existing meeting for Alice, Bob, or Carol.
  3. Satisfying each person's core availability window.
  4. Carol's buffer rule: if a meeting ends at ≥ 4:45 PM, the 15 min after
     it is blocked.
- Collect all valid start times in chronological order.

### 4. Apply tie-breakers (≈ 5 min)

Among all valid slots (sorted chronologically):
- First, filter to slots that avoid Monday (Carol's preference). If no
  non-Monday slots exist, fall back to Monday slots.
- Alice's morning preference is informational; if there are still ties, pick
  the earliest slot by start time.
- Bob's afternoon preference is informational only and NOT used as a
  tie-breaker per the task spec.

### 5. Write the output ICS (≈ 5 min)

```python
# Template structure
ics_content = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Terminal-Bench//Constraints-Scheduling//EN
BEGIN:VEVENT
DTSTART:{start_utc}
DTEND:{end_utc}
SUMMARY:Team Planning Meeting
ATTENDEE:mailto:alice@example.com
ATTENDEE:mailto:bob@example.com
ATTENDEE:mailto:carol@example.com
END:VEVENT
END:VCALENDAR
"""
```

- Format: `YYYYMMDDTHHMMSSZ` (e.g., `20240116T090000Z`).
- January 15, 2024 9:00 AM UTC = `20240115T090000Z`.
- Include `VERSION:2.0` and `PRODID` headers as required by the spec.

### 6. Verify (≈ 2 min)

```bash
# Check the output file exists and is valid ICS
python3 -c "
from icalendar import Calendar
with open('/app/meeting_scheduled.ics') as f:
    cal = Calendar.from_ical(f.read())
for evt in cal.walk('VEVENT'):
    print(evt.get('DTSTART').dt, evt.get('DTEND').dt, evt.get('SUMMARY'))
"
```

## Verifier checklist (must all pass)

- [ ] `/app/meeting_scheduled.ics` exists and is valid ICS.
- [ ] File starts with `BEGIN:VCALENDAR` and ends with `END:VCALENDAR`.
- [ ] Contains `VERSION:2.0` and a `PRODID` header.
- [ ] Contains exactly one VEVENT for a 1-hour "Team Planning Meeting".
- [ ] All three attendees (alice@example.com, bob@example.com, carol@example.com) are included.
- [ ] Times are in UTC format `YYYYMMDDTHHMMSSZ`.
- [ ] Meeting does not overlap any existing calendar event.
- [ ] Meeting satisfies all hard constraints (business hours + person-specific rules).
- [ ] Carol's lunch buffer and post-4:45-PM buffer are respected.
- [ ] The slot is the earliest valid one at minute granularity (respecting tie-breakers).
- [ ] Input ICS files are unmodified.

## Common pitfalls

1. **Time zone confusion.** The spec says "assume local time is UTC." Do not
   apply any UTC offset — treat the 9 AM constraint as 09:00 UTC directly.
2. **Minute-granularity off-by-one.** A meeting from 9:00-10:00 occupies
   minutes [9:00, 9:01, ..., 9:59] — the 10:00 minute is free. Be precise
   about inclusive/exclusive interval boundaries.
3. **Carol's buffer rule misinterpretation.** The 15-minute buffer applies
   AFTER any existing meeting that ends at 4:45 PM or later. It does not
   apply to the new meeting being scheduled — it blocks time after Carol's
   existing meetings.
4. **Forgetting to exclude existing meetings.** The busy intervals from the
   ICS files are hard constraints. Overlapping any existing VEVENT makes a
   slot invalid.
5. **Modifying input files.** The verifier checks that
   `/app/alice_calendar.ics`, `/app/bob_calendar.ics`, and
   `/app/carol_calendar.ics` match the originals byte-for-byte. Open them
   read-only.

## Quick sanity test

```python
# After writing the output, verify key properties
from datetime import datetime, timezone

# Parse output
with open('/app/meeting_scheduled.ics') as f:
    content = f.read()
assert 'BEGIN:VCALENDAR' in content
assert 'Team Planning Meeting' in content
assert 'alice@example.com' in content
print("Basic ICS structure: OK")
```

## Reference pointers

- ICS RFC 5545: https://datatracker.ietf.org/doc/html/rfc5545
- Python `icalendar` library: https://pypi.org/project/icalendar/
- Python `ics` library: https://pypi.org/project/ics/
- Inside the task container, the verifier runs automated checks on the output.
