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
    rows = db.query(DailyEntry).filter(DailyEntry.entry_date == date).all()
    return [EntryOut.from_orm_entry(r) for r in rows]


@router.post("", response_model=EntryOut)
def upsert_entry(payload: EntryUpsert, db: Session = Depends(get_db)):
    habit = db.get(Habit, payload.habit_id)

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
    ) if habit else []

    earned = calculate_earned_points(habit, tmp, rules) if habit else 0.0

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
    entry = db.get(DailyEntry, entry_id)
    if entry:
        db.delete(entry)
        db.commit()


@router.get("/summary", response_model=DailySummary)
def daily_summary(date: ddate = Query(...), db: Session = Depends(get_db)):
    habits = db.query(Habit).filter(Habit.is_active == True).all()
    total_max = sum(h.max_points for h in habits)

    habit_entries = db.query(DailyEntry).filter(DailyEntry.entry_date == date).all()
    earned_map = {e.habit_id: float(e.earned_points or 0) for e in habit_entries}
    habit_earned = sum(earned_map.get(h.id, 0) for h in habits)

    # Include picked task entries for the day
    task_entries = db.query(DailyTaskEntry).filter(DailyTaskEntry.entry_date == date).all()
    task_earned = sum(float(e.earned_points or 0) for e in task_entries)
    task_max = sum(int(e.todo.max_points or 0) for e in task_entries)

    total_earned = habit_earned + task_earned
    total_max += task_max

    pct = (total_earned / total_max * 100) if total_max > 0 else 0.0
    return DailySummary(
        date=date,
        total_earned=total_earned,
        total_max=total_max,
        percentage=pct,
    )
