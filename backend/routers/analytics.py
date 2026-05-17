from datetime import date, timedelta
from calendar import monthrange
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Habit, DailyEntry, DailyTaskEntry

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _build_days(
    all_dates: list[date],
    habits: list,
    entries_by_date: dict,
    task_entries_by_date: dict,
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

        earned_map = {e.habit_id: float(e.earned_points or 0) for e in entries}

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
            })

        task_earned_map: dict[int, float] = {}
        for e in task_entries:
            tid = e.todo_id
            task_earned_map[tid] = float(e.earned_points or 0)
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
            }
            for tid, earned in task_earned_map.items()
        ]

        task_earned = sum(task_earned_map.values())
        task_max = sum(todos_seen[tid]["max"] for tid in task_earned_map)

        total_earned = sum(s["earned"] for s in habit_scores) + task_earned
        total_max = sum(h.max_points for h in habits) + task_max
        percentage = round(total_earned / total_max * 100, 1) if total_max > 0 else 0.0

        days.append({
            "date": day.isoformat(),
            "total_earned": round(total_earned, 2),
            "total_max": total_max,
            "percentage": percentage,
            "habit_scores": habit_scores,
            "task_scores": task_scores,
        })

    return days, list(todos_seen.values())


def _fetch_period(all_dates: list[date], db: Session) -> tuple[dict, dict]:
    """Batch-fetch DailyEntry and DailyTaskEntry for all dates — 2 queries total."""
    entries = (
        db.query(DailyEntry)
        .filter(DailyEntry.entry_date.in_(all_dates))
        .all()
    )
    task_entries = (
        db.query(DailyTaskEntry)
        .filter(DailyTaskEntry.entry_date.in_(all_dates))
        .all()
    )

    entries_by_date: dict[date, list] = {}
    for e in entries:
        entries_by_date.setdefault(e.entry_date, []).append(e)

    task_entries_by_date: dict[date, list] = {}
    for e in task_entries:
        task_entries_by_date.setdefault(e.entry_date, []).append(e)

    return entries_by_date, task_entries_by_date


def _period_summary(days: list) -> dict:
    """Roll up a list of day_stats into a summary."""
    if not days:
        return {"total_earned": 0, "total_max": 0, "avg_percentage": 0,
                "days_above_80": 0, "best_day": None, "best_day_pct": 0}

    total_earned = round(sum(d["total_earned"] for d in days), 2)
    total_max = sum(d["total_max"] for d in days)
    avg_pct = round(sum(d["percentage"] for d in days) / len(days), 1)
    days_above_80 = sum(1 for d in days if d["percentage"] >= 80)
    best = max(days, key=lambda d: d["percentage"])

    return {
        "total_earned": total_earned,
        "total_max": total_max,
        "avg_percentage": avg_pct,
        "days_above_80": days_above_80,
        "best_day": best["date"],
        "best_day_pct": best["percentage"],
    }


@router.get("/weekly")
def weekly_analytics(date: date = Query(...), db: Session = Depends(get_db)):
    """Return per-day habit scores for the Mon–Sun week containing the given date."""
    monday = date - timedelta(days=date.weekday())
    all_dates = [monday + timedelta(days=i) for i in range(7)]

    habits = (
        db.query(Habit)
        .filter(Habit.is_active == True)
        .order_by(Habit.display_order)
        .all()
    )
    entries_by_date, task_entries_by_date = _fetch_period(all_dates, db)
    days, todos = _build_days(all_dates, habits, entries_by_date, task_entries_by_date)

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
    """Return per-day habit scores for every day in the given month."""
    _, num_days = monthrange(year, month)
    all_dates = [date(year, month, d) for d in range(1, num_days + 1)]

    habits = (
        db.query(Habit)
        .filter(Habit.is_active == True)
        .order_by(Habit.display_order)
        .all()
    )
    entries_by_date, task_entries_by_date = _fetch_period(all_dates, db)
    days, todos = _build_days(all_dates, habits, entries_by_date, task_entries_by_date)

    return {
        "year": year,
        "month": month,
        "habits": [{"id": h.id, "name": h.name, "max": h.max_points} for h in habits],
        "todos": todos,
        "days": days,
        "summary": _period_summary(days),
    }
