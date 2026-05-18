"""models.py — SQLAlchemy ORM models.

Table relationships at a glance:
  Habit  ──┬──  ScoringRule      (1-to-many, cascade delete)
         └──  DailyEntry       (1-to-many, cascade delete)

  Todo   ──┬──  TodoScoringRule  (1-to-many, cascade delete)
         └──  DailyTaskEntry   (1-to-many, cascade delete)
"""
from datetime import date, time
from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey,
    Integer, Numeric, String, Text, Time, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from database import Base


class Habit(Base):
    """A recurring activity tracked daily (e.g. "Morning run", "Read 30 min").

    scoring_type controls how earned_points is calculated from a DailyEntry:
      boolean           — full points if any data logged, else 0
      no_rule           — full points always (no time/duration required)
      duration          — step rules evaluated against duration_minutes
      duration_linear   — linear interpolation between duration breakpoints
      time_of_day       — step rules evaluated against start_time
      time_of_day_linear— linear interpolation between time breakpoints
    """
    __tablename__ = "habits"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    max_points = Column(Integer, nullable=False, default=10)
    scoring_type = Column(String(20), nullable=False, default="boolean")
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    scoring_rules = relationship("ScoringRule", back_populates="habit", cascade="all, delete-orphan")
    daily_entries = relationship("DailyEntry", back_populates="habit", cascade="all, delete-orphan")


class ScoringRule(Base):
    """One scoring step-rule or breakpoint attached to a Habit.

    For step rules   (duration / time_of_day):
      condition + value determine whether the rule matches;
      the first matching rule's percentage is applied.
    For linear rules (duration_linear / time_of_day_linear):
      condition is always 'bp' (breakpoint); value and percentage
      together form a (x, y) point for linear interpolation.
    """
    __tablename__ = "scoring_rules"

    id = Column(Integer, primary_key=True, index=True)
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="CASCADE"), nullable=False)
    condition = Column(String(10), nullable=False)   # lte | gte | lt | gt | eq
    value = Column(String(10), nullable=False)        # "04:00" or "45"
    percentage = Column(Integer, nullable=False)      # 0-100
    rule_order = Column(Integer, nullable=False, default=0)

    habit = relationship("Habit", back_populates="scoring_rules")


class DailyEntry(Base):
    """One logged entry per habit per calendar date.

    The unique constraint (entry_date, habit_id) ensures at most one entry
    per habit per day — subsequent saves use ON CONFLICT DO UPDATE (upsert).
    earned_points is recomputed by scoring.calculate_earned_points whenever
    the entry or its habit's rules change.
    """
    __tablename__ = "daily_entries"

    id = Column(Integer, primary_key=True, index=True)
    entry_date = Column(Date, nullable=False)
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    earned_points = Column(Numeric(6, 2), nullable=True)

    __table_args__ = (
        UniqueConstraint("entry_date", "habit_id", name="uq_entry_date_habit"),
    )

    habit = relationship("Habit", back_populates="daily_entries")


# ── To-Do Tasks ───────────────────────────────────────────────────────────────

class Todo(Base):
    """A one-off task (to-do item) with optional scoring.

    status lifecycle:  pending → done | skipped
    status_changed_date is set (in IST) whenever status is updated.
    display_order is managed by _reorder_after_status_change so tasks
    are grouped: pending first, then done, then skipped.
    """
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    max_points = Column(Integer, nullable=False, default=0)
    scoring_type = Column(String(20), nullable=False, default="boolean")
    status = Column(String(20), nullable=False, default="pending")  # pending | done | skipped
    status_changed_date = Column(Date, nullable=True)               # date when status last changed
    display_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())

    task_entries = relationship("DailyTaskEntry", back_populates="todo", cascade="all, delete-orphan")
    scoring_rules = relationship("TodoScoringRule", back_populates="todo", cascade="all, delete-orphan")


class TodoScoringRule(Base):
    """Scoring rule attached to a Todo — mirrors ScoringRule for habits."""
    __tablename__ = "todo_scoring_rules"

    id = Column(Integer, primary_key=True, index=True)
    todo_id = Column(Integer, ForeignKey("todos.id", ondelete="CASCADE"), nullable=False)
    condition = Column(String(10), nullable=False)   # lte | gte | lt | gt | eq | bp
    value = Column(String(20), nullable=False)        # "04:00" or "45"
    percentage = Column(Integer, nullable=False)      # 0-100
    rule_order = Column(Integer, nullable=False, default=0)

    todo = relationship("Todo", back_populates="scoring_rules")


class DailyTaskEntry(Base):
    """One logged entry per todo per calendar date.

    Todos can be worked on on any date (not just today), so entry_date
    can be any past or future date.  Same upsert pattern as DailyEntry.
    """
    __tablename__ = "daily_task_entries"

    id = Column(Integer, primary_key=True, index=True)
    entry_date = Column(Date, nullable=False)
    todo_id = Column(Integer, ForeignKey("todos.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    earned_points = Column(Numeric(6, 2), nullable=True)

    todo = relationship("Todo", back_populates="task_entries")
