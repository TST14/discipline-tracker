"""routers/habits.py — CRUD endpoints for Habits and their ScoringRules.

Endpoints
---------
GET    /habits                — list all active (or all) habits
POST   /habits                — create a new habit
PUT    /habits/reorder        — bulk update display_order
PUT    /habits/{id}           — update habit; deletes rules if scoring_type changed
DELETE /habits/{id}           — hard delete (cascades entries + rules)
GET    /habits/{id}/rules     — list scoring rules for a habit
PUT    /habits/{id}/rules     — replace all rules, then recompute historic entries
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Habit, ScoringRule, DailyEntry
from schemas import HabitCreate, HabitUpdate, HabitOut, ScoringRuleOut, ScoringRuleCreate, ReorderRequest
from services.scoring import calculate_earned_points

router = APIRouter(prefix="/habits", tags=["habits"])


def _recompute_habit_entries(habit: Habit, db: Session) -> None:
    """Recalculate earned_points for every existing entry of this habit."""
    rules = (
        db.query(ScoringRule)
        .filter(ScoringRule.habit_id == habit.id)
        .order_by(ScoringRule.rule_order)
        .all()
    )
    entries = db.query(DailyEntry).filter(DailyEntry.habit_id == habit.id).all()
    for entry in entries:
        entry.earned_points = calculate_earned_points(habit, entry, rules)
    db.commit()


@router.get("", response_model=list[HabitOut])
def list_habits(active_only: bool = True, db: Session = Depends(get_db)):
    """Return habits ordered by display_order.
    Pass active_only=false to include archived habits.
    """
    q = db.query(Habit).order_by(Habit.display_order)
    if active_only:
        q = q.filter(Habit.is_active == True)
    return q.all()


@router.post("", response_model=HabitOut, status_code=201)
def create_habit(payload: HabitCreate, db: Session = Depends(get_db)):
    """Create a new habit and return it."""
    habit = Habit(**payload.model_dump())
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.put("/reorder")
def reorder_habits(payload: ReorderRequest, db: Session = Depends(get_db)):
    """Bulk-update display_order from an ordered list of habit IDs."""
    for order, habit_id in enumerate(payload.ordered_ids):
        db.query(Habit).filter(Habit.id == habit_id).update({"display_order": order})
    db.commit()
    return {"ok": True}


@router.put("/{habit_id}", response_model=HabitOut)
def update_habit(habit_id: int, payload: HabitUpdate, db: Session = Depends(get_db)):
    """Update a habit's fields.

    Side-effects:
      - If scoring_type changed: all existing ScoringRules are deleted.
      - If scoring_type or max_points changed: all DailyEntries are
        recomputed via the scoring engine.
    """
    habit = db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    old_scoring_type = habit.scoring_type
    scoring_changed = (
        payload.max_points != habit.max_points
        or payload.scoring_type != habit.scoring_type
    )
    for k, v in payload.model_dump().items():
        setattr(habit, k, v)
    if payload.scoring_type != old_scoring_type:
        db.query(ScoringRule).filter(ScoringRule.habit_id == habit_id).delete()
    db.commit()
    db.refresh(habit)
    if scoring_changed:
        _recompute_habit_entries(habit, db)
    return habit


@router.delete("/{habit_id}", status_code=204)
def delete_habit(habit_id: int, db: Session = Depends(get_db)):
    """Hard-delete a habit and all its entries/rules (cascade).

    Requires the habit to be inactive first (is_active=False).
    This enforces the intentional two-step flow: deactivate → delete.
    """
    habit = db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    if habit.is_active:
        raise HTTPException(
            status_code=409,
            detail="Habit must be deactivated before it can be deleted.",
        )
    db.delete(habit)
    db.commit()


# ── Scoring Rules ─────────────────────────────────────────────────────────────

@router.get("/{habit_id}/rules", response_model=list[ScoringRuleOut])
def get_rules(habit_id: int, db: Session = Depends(get_db)):
    """Return all scoring rules for a habit, sorted by rule_order."""
    return (
        db.query(ScoringRule)
        .filter(ScoringRule.habit_id == habit_id)
        .order_by(ScoringRule.rule_order)
        .all()
    )


@router.put("/{habit_id}/rules", response_model=list[ScoringRuleOut])
def set_rules(habit_id: int, rules: list[ScoringRuleCreate], db: Session = Depends(get_db)):
    """Replace all scoring rules for a habit (full replace, not patch),
    then recompute earned_points for every existing DailyEntry.
    """
    habit = db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    db.query(ScoringRule).filter(ScoringRule.habit_id == habit_id).delete()
    new_rules = [ScoringRule(habit_id=habit_id, **r.model_dump()) for r in rules]
    db.add_all(new_rules)
    db.commit()
    for r in new_rules:
        db.refresh(r)
    _recompute_habit_entries(habit, db)
    return new_rules
