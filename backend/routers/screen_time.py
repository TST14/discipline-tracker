"""routers/screen_time.py — Manually logged wasted screen time.

Endpoints:
  GET  /screen-time/{entry_date}  — list all entries for a date
  POST /screen-time               — log a new entry
  DELETE /screen-time/{entry_id}  — remove an entry
"""
from datetime import date as DateType

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import ScreenTimeEntry
from schemas import ScreenTimeEntryCreate, ScreenTimeEntryOut

router = APIRouter(prefix="/screen-time", tags=["screen-time"])

PENALTY_RATE = 2  # pts deducted per wasted minute


@router.get("/{entry_date}", response_model=list[ScreenTimeEntryOut])
def get_screen_time(entry_date: DateType, db: Session = Depends(get_db)):
    """Return all screen-time entries for *entry_date*, ordered by start time."""
    return (
        db.query(ScreenTimeEntry)
        .filter(ScreenTimeEntry.entry_date == entry_date)
        .order_by(ScreenTimeEntry.start_time)
        .all()
    )


@router.post("", response_model=ScreenTimeEntryOut, status_code=201)
def create_screen_time(body: ScreenTimeEntryCreate, db: Session = Depends(get_db)):
    """Log a new wasted screen-time session. minutes is derived from end − start."""
    start_mins = body.start_time.hour * 60 + body.start_time.minute
    end_mins   = body.end_time.hour   * 60 + body.end_time.minute
    minutes    = end_mins - start_mins
    entry = ScreenTimeEntry(
        entry_date=body.entry_date,
        start_time=body.start_time,
        end_time=body.end_time,
        minutes=minutes,
        note=body.note,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.put("/{entry_id}", response_model=ScreenTimeEntryOut)
def update_screen_time(entry_id: int, body: ScreenTimeEntryCreate, db: Session = Depends(get_db)):
    """Update an existing screen-time entry (recalculates minutes from end − start)."""
    entry = db.query(ScreenTimeEntry).filter(ScreenTimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Screen time entry not found")
    start_mins = body.start_time.hour * 60 + body.start_time.minute
    end_mins   = body.end_time.hour   * 60 + body.end_time.minute
    entry.start_time = body.start_time
    entry.end_time   = body.end_time
    entry.minutes    = end_mins - start_mins
    entry.note       = body.note
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def delete_screen_time(entry_id: int, db: Session = Depends(get_db)):
    """Delete a screen-time entry by id."""
    entry = db.query(ScreenTimeEntry).filter(ScreenTimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Screen time entry not found")
    db.delete(entry)
    db.commit()
