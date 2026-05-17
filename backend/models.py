from datetime import date, time
from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey,
    Integer, Numeric, String, Text, Time, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from database import Base


class Habit(Base):
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
    __tablename__ = "scoring_rules"

    id = Column(Integer, primary_key=True, index=True)
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="CASCADE"), nullable=False)
    condition = Column(String(10), nullable=False)   # lte | gte | lt | gt | eq
    value = Column(String(10), nullable=False)        # "04:00" or "45"
    percentage = Column(Integer, nullable=False)      # 0-100
    rule_order = Column(Integer, nullable=False, default=0)

    habit = relationship("Habit", back_populates="scoring_rules")


class DailyEntry(Base):
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
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    max_points = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="pending")  # pending | done | skipped
    display_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())

    task_entries = relationship("DailyTaskEntry", back_populates="todo", cascade="all, delete-orphan")


class DailyTaskEntry(Base):
    __tablename__ = "daily_task_entries"

    id = Column(Integer, primary_key=True, index=True)
    entry_date = Column(Date, nullable=False)
    todo_id = Column(Integer, ForeignKey("todos.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    earned_points = Column(Numeric(6, 2), nullable=True)

    __table_args__ = (
        UniqueConstraint("entry_date", "todo_id", name="uq_task_entry_date_todo"),
    )

    todo = relationship("Todo", back_populates="task_entries")
