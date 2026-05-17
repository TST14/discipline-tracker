from datetime import date as ddate, time as dtime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from database import get_db
from models import Todo, DailyTaskEntry
from schemas import TodoCreate, TodoUpdate, TodoOut, TaskEntryUpsert, TaskEntryOut, ReorderRequest

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
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(todo, k, v)
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=204)
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()


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

    # Boolean scoring: any logged data = full points
    earned = float(todo.max_points) if (start or dur) else 0.0

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
