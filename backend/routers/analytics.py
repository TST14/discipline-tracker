"""routers/analytics.py — Aggregated weekly and monthly progress endpoints.

Endpoints
---------
GET /analytics/weekly?date=YYYY-MM-DD
    Returns per-day habit/task scores for the Mon–Sun week containing `date`.

GET /analytics/monthly?year=YYYY&month=M
    Returns per-day habit/task scores for every day in the given month.

Both endpoints share the same pipeline:
  1. _fetch_period   — batch-load DailyEntries + DailyTaskEntries (2 DB queries)
  2. _build_days     — compute per-day stats, gap minutes, and adjusted scores
  3. _period_summary — roll up into weekly/monthly summary KPIs

Gap / unutilized time
---------------------
_compute_gap_minutes mirrors the frontend computeGaps() logic exactly:
  • Activities with a real time span (start + end or start + duration) are
    placed on a timeline.
  • time_of_day / time_of_day_linear entries with only start_time act as
    point anchors.
  • boolean / no_rule activities are always excluded (start_time is just a
    click timestamp, not a real span).
  Gaps between merged intervals are summed; the result is subtracted from
  total_earned to produce adjusted_earned / adjusted_percentage.
"""
from datetime import date, timedelta
from calendar import monthrange
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import Habit, DailyEntry, DailyTaskEntry, ScreenTimeEntry

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _time_to_mins(t) -> int | None:
    """Convert a `datetime.time` to total minutes since midnight, or None."""
    if t is None:
        return None
    return t.hour * 60 + t.minute


def _compute_gap_minutes(habits: list, entries: list, task_entries: list) -> int:
    """Mirrors frontend computeGaps(): total unutilized minutes between timed activities.

    Included on the timeline:
      - Any entry with both start + end/duration  (has a real span)
      - time_of_day / time_of_day_linear entries with start only  (explicit clock anchor)
    Excluded:
      - boolean / no_rule 'done' markers  (start_time is just the click timestamp)
      - incomplete duration entries with start only
    """
    habit_map = {h.id: h for h in habits}
    intervals: list[list[int]] = []

    for e in entries:
        if e.start_time is None:
            continue
        habit = habit_map.get(e.habit_id)
        if not habit:
            continue
        if habit.scoring_type == 'boolean':
            continue
        start = _time_to_mins(e.start_time)
        end: int | None = None
        if e.end_time:
            end = _time_to_mins(e.end_time)
        elif e.duration_minutes and e.duration_minutes > 0:
            end = start + e.duration_minutes
        if end is not None:
            intervals.append([start, max(start, end)])
        elif habit.scoring_type in ('time_of_day', 'time_of_day_linear'):
            intervals.append([start, start])

    for te in task_entries:
        if te.start_time is None:
            continue
        scoring_type = te.todo.scoring_type if te.todo else ''
        if scoring_type == 'boolean':
            continue
        start = _time_to_mins(te.start_time)
        end: int | None = None
        if te.end_time:
            end = _time_to_mins(te.end_time)
        elif te.duration_minutes and te.duration_minutes > 0:
            end = start + te.duration_minutes
        if end is not None:
            intervals.append([start, max(start, end)])
        elif scoring_type in ('time_of_day', 'time_of_day_linear'):
            intervals.append([start, start])

    if len(intervals) < 2:
        return 0

    intervals.sort(key=lambda x: x[0])
    merged = [intervals[0][:]]
    for s, e in intervals[1:]:
        if s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])

    total_gap = 0
    for i in range(1, len(merged)):
        gap = merged[i][0] - merged[i - 1][1]
        if gap > 0:
            total_gap += gap
    return total_gap


def _build_days(
    all_dates: list[date],
    habits: list,
    entries_by_date: dict,
    task_entries_by_date: dict,
    screen_entries_by_date: dict,
) -> tuple[list[dict], list[dict]]:
    """Compute per-day stats from pre-fetched, grouped data (no per-day DB queries).

    Returns (days, todos) where todos is a deduplicated list of every todo
    that was worked on at least once across the period.
    """
    days = []
    todos_seen: dict[int, dict] = {}

    for day in all_dates:
        entries = entries_by_date.get(day, [])
        task_entries = task_entries_by_date.get(day, [])

        earned_map  = {e.habit_id: float(e.earned_points   or 0) for e in entries}
        minutes_map = {e.habit_id: int(e.duration_minutes or 0) for e in entries}

        habit_scores = []
        for h in habits:
            earned = earned_map.get(h.id, 0.0)
            pct = round(earned / h.max_points * 100, 1) if h.max_points > 0 else 0.0
            habit_scores.append({
                "habit_id": h.id,
                "name": h.name,
                "earned": round(earned, 2),
                "max": h.max_points,
                "done": earned > 0,
                "pct": pct,
                "minutes": minutes_map.get(h.id, 0),
            })

        task_earned_map:   dict[int, float] = {}
        task_minutes_map: dict[int, int]   = {}
        for e in task_entries:
            tid = e.todo_id
            # SUM across multiple entries for the same todo (multi-session support)
            task_earned_map[tid]   = task_earned_map.get(tid, 0.0)  + float(e.earned_points   or 0)
            task_minutes_map[tid]  = task_minutes_map.get(tid, 0)   + int(e.duration_minutes  or 0)
            if tid not in todos_seen:
                todos_seen[tid] = {
                    "id": tid,
                    "title": e.todo.title,
                    "max": int(e.todo.max_points or 0),
                }

        task_scores = [
            {
                "todo_id": tid,
                "title": todos_seen[tid]["title"],
                "earned": round(earned, 2),
                "max": todos_seen[tid]["max"],
                "done": earned > 0,
                "pct": round(earned / todos_seen[tid]["max"] * 100, 1)
                       if todos_seen[tid]["max"] > 0 else 0.0,
                "minutes": task_minutes_map.get(tid, 0),
            }
            for tid, earned in task_earned_map.items()
        ]

        task_earned = sum(task_earned_map.values())
        task_max = sum(todos_seen[tid]["max"] for tid in task_earned_map)

        total_earned = sum(s["earned"] for s in habit_scores) + task_earned
        total_max = sum(h.max_points for h in habits) + task_max
        percentage = round(total_earned / total_max * 100, 1) if total_max > 0 else 0.0

        gap_minutes = _compute_gap_minutes(habits, entries, task_entries)
        screen_entries = screen_entries_by_date.get(day, [])
        screen_time_minutes = sum(e.minutes for e in screen_entries)
        screen_time_penalty = screen_time_minutes * 2
        adjusted_earned = round(total_earned - gap_minutes - screen_time_penalty, 2)
        adjusted_pct = round(max(0.0, adjusted_earned) / total_max * 100, 1) if total_max > 0 else 0.0
        total_minutes = (sum(s["minutes"] for s in habit_scores)
                         + sum(s["minutes"] for s in task_scores))

        days.append({
            "date": day.isoformat(),
            "total_earned": round(total_earned, 2),
            "total_max": total_max,
            "percentage": percentage,
            "gap_minutes": gap_minutes,
            "screen_time_minutes": screen_time_minutes,
            "screen_time_penalty": screen_time_penalty,
            "adjusted_earned": round(adjusted_earned, 2),
            "adjusted_percentage": adjusted_pct,
            "total_minutes": total_minutes,
            "habit_scores": habit_scores,
            "task_scores": task_scores,
        })

    return days, list(todos_seen.values())


def _fetch_period(all_dates: list[date], db: Session) -> tuple[dict, dict, dict]:
    """Batch-fetch DailyEntry, DailyTaskEntry, and ScreenTimeEntry for all dates — 3 queries."""
    entries = (
        db.query(DailyEntry)
        .filter(DailyEntry.entry_date.in_(all_dates))
        .all()
    )
    task_entries = (
        db.query(DailyTaskEntry)
        .options(joinedload(DailyTaskEntry.todo))
        .filter(DailyTaskEntry.entry_date.in_(all_dates))
        .all()
    )
    screen_entries = (
        db.query(ScreenTimeEntry)
        .filter(ScreenTimeEntry.entry_date.in_(all_dates))
        .all()
    )

    entries_by_date: dict[date, list] = {}
    for e in entries:
        entries_by_date.setdefault(e.entry_date, []).append(e)

    task_entries_by_date: dict[date, list] = {}
    for e in task_entries:
        task_entries_by_date.setdefault(e.entry_date, []).append(e)

    screen_entries_by_date: dict[date, list] = {}
    for e in screen_entries:
        screen_entries_by_date.setdefault(e.entry_date, []).append(e)

    return entries_by_date, task_entries_by_date, screen_entries_by_date


def _period_summary(days: list) -> dict:
    """Roll up a list of day_stats into a summary."""
    if not days:
        return {"total_earned": 0, "total_max": 0, "avg_percentage": 0,
                "days_above_80": 0, "best_day": None, "best_day_pct": 0}

    total_earned = round(sum(d["total_earned"] for d in days), 2)
    total_max = sum(d["total_max"] for d in days)
    avg_pct = round(sum(d["adjusted_percentage"] for d in days) / len(days), 1)
    days_above_80 = sum(1 for d in days if d["adjusted_percentage"] >= 80)
    best = max(days, key=lambda d: d["adjusted_percentage"])
    total_gap_minutes = sum(d["gap_minutes"] for d in days)
    total_screen_time_minutes = sum(d.get("screen_time_minutes", 0) for d in days)
    total_screen_time_penalty = sum(d.get("screen_time_penalty", 0) for d in days)
    total_minutes = sum(d["total_minutes"] for d in days)

    return {
        "total_earned": total_earned,
        "total_max": total_max,
        "avg_percentage": avg_pct,
        "days_above_80": days_above_80,
        "best_day": best["date"],
        "best_day_pct": best["adjusted_percentage"],
        "total_gap_minutes": total_gap_minutes,
        "days_with_gaps": sum(1 for d in days if d["gap_minutes"] > 0),
        "total_screen_time_minutes": total_screen_time_minutes,
        "total_screen_time_penalty": total_screen_time_penalty,
        "total_minutes": total_minutes,
        "avg_minutes_per_day": round(total_minutes / len(days), 1) if days else 0.0,
    }


@router.get("/weekly")
def weekly_analytics(date: date = Query(...), db: Session = Depends(get_db)):
    """Return per-day habit/task scores for the Mon–Sun week containing `date`.

    Response shape:
      start_date, end_date  — ISO strings for the week boundaries
      habits                — list of {id, name, max}
      todos                 — deduplicated list of todos worked on this week
      days                  — 7 day objects (see _build_days)
      summary               — weekly KPIs (see _period_summary)
    """
    monday = date - timedelta(days=date.weekday())
    all_dates = [monday + timedelta(days=i) for i in range(7)]

    from sqlalchemy import or_
    has_entry_sub = db.query(DailyEntry.habit_id).filter(DailyEntry.entry_date.in_(all_dates)).subquery()
    habits = (
        db.query(Habit)
        .filter(or_(Habit.is_active == True, Habit.id.in_(has_entry_sub)))
        .order_by(Habit.display_order)
        .all()
    )
    entries_by_date, task_entries_by_date, screen_entries_by_date = _fetch_period(all_dates, db)
    days, todos = _build_days(all_dates, habits, entries_by_date, task_entries_by_date, screen_entries_by_date)

    return {
        "start_date": monday.isoformat(),
        "end_date": (monday + timedelta(days=6)).isoformat(),
        "habits": [{"id": h.id, "name": h.name, "max": h.max_points} for h in habits],
        "todos": todos,
        "days": days,
        "summary": _period_summary(days),
    }


@router.get("/monthly")
def monthly_analytics(year: int, month: int, db: Session = Depends(get_db)):
    """Return per-day habit/task scores for every day in the given month.

    Response shape mirrors /weekly with `days` covering all days in the month.
    Raises HTTP 422 if month is outside 1–12.
    """
    if not 1 <= month <= 12:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="month must be between 1 and 12")
    _, num_days = monthrange(year, month)
    all_dates = [date(year, month, d) for d in range(1, num_days + 1)]

    from sqlalchemy import or_
    has_entry_sub = db.query(DailyEntry.habit_id).filter(DailyEntry.entry_date.in_(all_dates)).subquery()
    habits = (
        db.query(Habit)
        .filter(or_(Habit.is_active == True, Habit.id.in_(has_entry_sub)))
        .order_by(Habit.display_order)
        .all()
    )
    entries_by_date, task_entries_by_date, screen_entries_by_date = _fetch_period(all_dates, db)
    days, todos = _build_days(all_dates, habits, entries_by_date, task_entries_by_date, screen_entries_by_date)

    return {
        "year": year,
        "month": month,
        "habits": [{"id": h.id, "name": h.name, "max": h.max_points} for h in habits],
        "todos": todos,
        "days": days,
        "summary": _period_summary(days),
    }
