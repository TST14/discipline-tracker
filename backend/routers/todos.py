from datetime import date as ddate, datetime as _dt, time as dtime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from database import get_db

# India Standard Time = UTC+5:30 (no DST, so a fixed offset is always correct)
_IST = timezone(timedelta(hours=5, minutes=30))


def _ist_today() -> ddate:
    """Return today's date in IST (UTC+5:30), safe on any server timezone."""
    return _dt.now(_IST).date()


from models import Todo, DailyTaskEntry, TodoScoringRule
from schemas import (
    TodoCreate, TodoUpdate, TodoOut, TaskEntryUpsert, TaskEntryOut, ReorderRequest,
    TodoScoringRuleCreate, TodoScoringRuleOut,
)
from services.scoring import calculate_earned_points

def _recompute_todo_entries(todo: Todo, db: Session) -> None:
    """Recalculate earned_points for every existing entry of this todo."""
    rules = (
        db.query(TodoScoringRule)
        .filter(TodoScoringRule.todo_id == todo.id)
        .order_by(TodoScoringRule.rule_order)
        .all()
    )
    entries = db.query(DailyTaskEntry).filter(DailyTaskEntry.todo_id == todo.id).all()
    for entry in entries:
        entry.earned_points = calculate_earned_points(todo, entry, rules)
    db.commit()


def _reorder_after_status_change(todo_id: int, new_status: str, db: Session) -> None:
    """Reinsert the todo at the boundary of its new status group.

    Group order: pending → done → skipped.
    - marked done    → goes right after the last pending task (start of done group)
    - marked skipped → goes right after the last done task   (start of skipped group)
    - marked pending → goes right after the last pending task (end of pending group)
    Relative order within each group is otherwise preserved.
    """
    all_todos = db.query(Todo).order_by(Todo.display_order).all()
    changed  = next(t for t in all_todos if t.id == todo_id)
    others   = [t for t in all_todos if t.id != todo_id]

    if new_status in ('pending', 'done'):
        # Both land at the pending/done boundary
        insert_at = sum(1 for t in others if t.status == 'pending')
    else:  # skipped
        insert_at = sum(1 for t in others if t.status in ('pending', 'done'))

    others.insert(insert_at, changed)
    for i, t in enumerate(others):
        t.display_order = i
    db.commit()


router = APIRouter(prefix="/todos", tags=["todos"])


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


# ── To-Do CRUD ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TodoOut])
def list_todos(status: str | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(Todo).order_by(Todo.display_order)
    if status:
        q = q.filter(Todo.status == status)
    return q.all()


@router.post("", response_model=TodoOut, status_code=201)
def create_todo(payload: TodoCreate, db: Session = Depends(get_db)):
    next_order = db.query(Todo).count()
    todo = Todo(**payload.model_dump(), display_order=next_order)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.put("/reorder")
def reorder_todos(payload: ReorderRequest, db: Session = Depends(get_db)):
    for order, todo_id in enumerate(payload.ordered_ids):
        db.query(Todo).filter(Todo.id == todo_id).update({"display_order": order})
    db.commit()
    return {"ok": True}


@router.put("/{todo_id}", response_model=TodoOut)
def update_todo(todo_id: int, payload: TodoUpdate, db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    new_status = payload.status  # capture before applying
    changed = payload.model_dump(exclude_none=True)
    scoring_changed = 'max_points' in changed or 'scoring_type' in changed
    for k, v in changed.items():
        setattr(todo, k, v)
    if new_status is not None:
        todo.status_changed_date = _ist_today()
    db.commit()
    db.refresh(todo)
    if new_status is not None:
        _reorder_after_status_change(todo_id, new_status, db)
        db.refresh(todo)
    if scoring_changed:
        _recompute_todo_entries(todo, db)
    return todo


@router.delete("/{todo_id}", status_code=204)
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()


# ── Todo Scoring Rules ────────────────────────────────────────────────────────

@router.get("/{todo_id}/rules", response_model=list[TodoScoringRuleOut])
def get_todo_rules(todo_id: int, db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return db.query(TodoScoringRule).filter(
        TodoScoringRule.todo_id == todo_id
    ).order_by(TodoScoringRule.rule_order).all()


@router.put("/{todo_id}/rules", response_model=list[TodoScoringRuleOut])
def set_todo_rules(todo_id: int, payload: list[TodoScoringRuleCreate], db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.query(TodoScoringRule).filter(TodoScoringRule.todo_id == todo_id).delete()
    new_rules = [
        TodoScoringRule(todo_id=todo_id, **rule.model_dump())
        for rule in payload
    ]
    db.add_all(new_rules)
    db.commit()
    _recompute_todo_entries(todo, db)
    return db.query(TodoScoringRule).filter(
        TodoScoringRule.todo_id == todo_id
    ).order_by(TodoScoringRule.rule_order).all()


# ── Daily Task Entries ────────────────────────────────────────────────────────

@router.get("/entries", response_model=list[TaskEntryOut])
def list_task_entries(date: ddate = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(DailyTaskEntry)
        .filter(DailyTaskEntry.entry_date == date)
        .all()
    )
    return [TaskEntryOut.from_orm_entry(r) for r in rows]


@router.post("/entries", response_model=TaskEntryOut)
def upsert_task_entry(payload: TaskEntryUpsert, db: Session = Depends(get_db)):
    todo = db.get(Todo, payload.todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    start = _parse_time(payload.start_time)
    end = _parse_time(payload.end_time)
    dur = payload.duration_minutes

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
        db.query(TodoScoringRule)
        .filter(TodoScoringRule.todo_id == payload.todo_id)
        .order_by(TodoScoringRule.rule_order)
        .all()
    )
    earned = calculate_earned_points(todo, tmp, rules)

    stmt = (
        pg_insert(DailyTaskEntry)
        .values(
            entry_date=payload.entry_date,
            todo_id=payload.todo_id,
            start_time=start,
            end_time=end,
            duration_minutes=dur,
            earned_points=earned,
        )
        .on_conflict_do_update(
            constraint="uq_task_entry_date_todo",
            set_={
                "start_time": start,
                "end_time": end,
                "duration_minutes": dur,
                "earned_points": earned,
            },
        )
        .returning(DailyTaskEntry)
    )
    result = db.execute(stmt)
    db.commit()
    entry = result.scalars().first()
    # Reload with relationship
    db.refresh(entry)
    return TaskEntryOut.from_orm_entry(entry)


@router.delete("/entries/{entry_id}", status_code=204)
def delete_task_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(DailyTaskEntry, entry_id)
    if entry:
        db.delete(entry)
        db.commit()
