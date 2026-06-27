"""routers/entries.py — Daily habit entry endpoints.

Endpoints
---------
GET    /entries              — list all entries for a given date
POST   /entries              — upsert an entry (create or update by date+habit)
DELETE /entries/{id}         — delete a single entry
GET    /entries/summary      — total earned/max/percentage for a date

Each POST automatically recomputes earned_points via the scoring engine
so the client never has to send a points value.
"""
from datetime import date as ddate, time as dtime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from database import get_db
from models import Habit, ScoringRule, DailyEntry, DailyTaskEntry
from schemas import EntryUpsert, EntryOut, DailySummary
from services.scoring import calculate_earned_points

router = APIRouter(prefix="/entries", tags=["entries"])


def _parse_time(s: str | None) -> dtime | None:
    """Parse an "HH:MM" string to a `datetime.time`.  Raises 422 on bad format."""
    if not s:
        return None
    try:
        parts = s.split(":")
        if len(parts) != 2:
            raise ValueError
        return dtime(int(parts[0]), int(parts[1]))
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"Invalid time format '{s}'. Expected HH:MM")


@router.get("", response_model=list[EntryOut])
def list_entries(date: ddate = Query(...), db: Session = Depends(get_db)):
    """Return all DailyEntries for a specific date."""
    rows = db.query(DailyEntry).filter(DailyEntry.entry_date == date).all()
    return [EntryOut.from_orm_entry(r) for r in rows]


@router.post("", response_model=EntryOut)
def upsert_entry(payload: EntryUpsert, db: Session = Depends(get_db)):
    """Create or update a daily habit entry.

    Uses PostgreSQL ON CONFLICT DO UPDATE keyed on (entry_date, habit_id)
    so calling this endpoint twice for the same habit+date is safe.
    earned_points is always recalculated — never taken from the client.
    """
    habit = db.get(Habit, payload.habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    start = _parse_time(payload.start_time)
    end = _parse_time(payload.end_time)
    dur = payload.duration_minutes

    # Re-compute duration if not explicitly sent but start+end present
    if start and end and dur is None:
        s_mins = start.hour * 60 + start.minute
        e_mins = end.hour * 60 + end.minute
        if e_mins > s_mins:
            dur = e_mins - s_mins

    # Build a temporary entry-like object for scoring
    class _E:
        pass
    tmp = _E()
    tmp.start_time = start
    tmp.end_time = end
    tmp.duration_minutes = dur

    rules = (
        db.query(ScoringRule)
        .filter(ScoringRule.habit_id == payload.habit_id)
        .order_by(ScoringRule.rule_order)
        .all()
    )

    earned = calculate_earned_points(habit, tmp, rules)

    # Upsert via PostgreSQL ON CONFLICT
    stmt = (
        pg_insert(DailyEntry)
        .values(
            entry_date=payload.entry_date,
            habit_id=payload.habit_id,
            start_time=start,
            end_time=end,
            duration_minutes=dur,
            earned_points=earned,
        )
        .on_conflict_do_update(
            constraint="uq_entry_date_habit",
            set_={
                "start_time": start,
                "end_time": end,
                "duration_minutes": dur,
                "earned_points": earned,
            },
        )
        .returning(DailyEntry)
    )
    result = db.execute(stmt)
    db.commit()
    entry = result.scalars().first()
    return EntryOut.from_orm_entry(entry)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    """Delete a daily habit entry (silently succeeds if already missing)."""
    entry = db.get(DailyEntry, entry_id)
    if entry:
        db.delete(entry)
        db.commit()


@router.get("/summary", response_model=DailySummary)
def daily_summary(date: ddate = Query(...), db: Session = Depends(get_db)):
    """Return aggregate totals for a date: earned, max, and percentage.

    Includes both habit entries and any task entries logged for that date,
    so the score card on the Daily Log page reflects the full day's work.
    """
    from sqlalchemy import or_
    has_entry_sub = db.query(DailyEntry.habit_id).filter(DailyEntry.entry_date == date).subquery()
    habits = (
        db.query(Habit)
        .filter(or_(Habit.is_active == True, Habit.id.in_(has_entry_sub)))
        .all()
    )
    total_max = sum(h.max_points for h in habits)

    habit_entries = db.query(DailyEntry).filter(DailyEntry.entry_date == date).all()
    earned_map = {e.habit_id: float(e.earned_points or 0) for e in habit_entries}
    habit_earned = sum(earned_map.get(h.id, 0) for h in habits)

    # Include picked task entries for the day.
    # A pending task may have multiple entries (separate time blocks), so
    # sum earned_points across all rows but count max_points only once per todo.
    task_entries = db.query(DailyTaskEntry).filter(DailyTaskEntry.entry_date == date).all()
    task_earned = sum(float(e.earned_points or 0) for e in task_entries)
    seen_todo_ids: set[int] = set()
    task_max = 0
    for e in task_entries:
        if e.todo_id not in seen_todo_ids:
            task_max += int(e.todo.max_points or 0)
            seen_todo_ids.add(e.todo_id)

    total_earned = habit_earned + task_earned
    total_max += task_max

    pct = (total_earned / total_max * 100) if total_max > 0 else 0.0
    return DailySummary(
        date=date,
        total_earned=total_earned,
        total_max=total_max,
        percentage=pct,
    )
