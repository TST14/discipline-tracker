"""schemas.py — Pydantic request/response models for the entire API.

Naming convention:
  *Base    — shared fields used by both Create and Out schemas
  *Create  — payload accepted on POST/PUT (input validation)
  *Update  — partial payload accepted on PUT (all fields optional)
  *Out     — response shape returned to the client

ScoringType is a Literal shared by both Habit and Todo schemas so the
allowed values are enforced in one place.
"""
from datetime import date, datetime, time
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator

# ── Shared constrained types ──────────────────────────────────────────────────
ScoringType = Literal["boolean", "no_rule", "duration", "duration_linear", "time_of_day", "time_of_day_linear", "time_multiplier"]
RuleCondition = Literal["lte", "gte", "lt", "gt", "eq", "bp"]
TodoStatus = Literal["pending", "done", "skipped"]


# ── Scoring Rules ─────────────────────────────────────────────────────────────

class ScoringRuleBase(BaseModel):
    condition: RuleCondition
    value: str = Field(..., max_length=20)
    percentage: int = Field(..., ge=0, le=10000)  # >100 used by time_multiplier (stores multiplier×100)
    rule_order: int = Field(0, ge=0)


class ScoringRuleCreate(ScoringRuleBase):
    pass


class ScoringRuleOut(ScoringRuleBase):
    id: int
    habit_id: int

    model_config = {"from_attributes": True}


# ── Habits ────────────────────────────────────────────────────────────────────

class HabitBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    max_points: int = Field(10, ge=0, le=10000)
    scoring_type: ScoringType = "boolean"
    display_order: int = Field(0, ge=0)
    is_active: bool = True


class HabitCreate(HabitBase):
    pass


class HabitUpdate(HabitBase):
    pass


class HabitOut(HabitBase):
    id: int
    multiplier: Optional[int] = None  # percentage value (e.g. 100 = 1×) for time_multiplier habits

    model_config = {"from_attributes": True}


class ReorderRequest(BaseModel):
    ordered_ids: list[int]


# ── Daily Entries ─────────────────────────────────────────────────────────────

class EntryUpsert(BaseModel):
    habit_id: int = Field(..., gt=0)
    entry_date: date
    start_time: Optional[str] = Field(None, pattern=r"^\d{1,2}:\d{2}$")
    end_time: Optional[str] = Field(None, pattern=r"^\d{1,2}:\d{2}$")
    duration_minutes: Optional[int] = Field(None, ge=0, le=1440)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def parse_time_str(cls, v):
        if v == "" or v is None:
            return None
        return v


class EntryOut(BaseModel):
    id: int
    habit_id: int
    entry_date: date
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    earned_points: Optional[float] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_entry(cls, entry):
        return cls(
            id=entry.id,
            habit_id=entry.habit_id,
            entry_date=entry.entry_date,
            start_time=entry.start_time.strftime("%H:%M") if entry.start_time else None,
            end_time=entry.end_time.strftime("%H:%M") if entry.end_time else None,
            duration_minutes=entry.duration_minutes,
            earned_points=float(entry.earned_points) if entry.earned_points is not None else None,
        )


class DailySummary(BaseModel):
    date: date
    total_earned: float
    total_max: int
    percentage: float


# ── Todo Scoring Rules ────────────────────────────────────────────────────────

class TodoScoringRuleBase(BaseModel):
    condition: RuleCondition
    value: str = Field(..., max_length=20)
    percentage: int = Field(..., ge=0, le=10000)  # >100 used by time_multiplier (stores multiplier×100)
    rule_order: int = Field(0, ge=0)


class TodoScoringRuleCreate(TodoScoringRuleBase):
    pass


class TodoScoringRuleOut(TodoScoringRuleBase):
    id: int
    todo_id: int

    model_config = {"from_attributes": True}


# ── Todos ─────────────────────────────────────────────────────────────────────

class TodoCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    max_points: int = Field(0, ge=0, le=10000)
    scoring_type: ScoringType = "boolean"


class TodoUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    max_points: Optional[int] = Field(None, ge=0, le=10000)
    scoring_type: Optional[ScoringType] = None
    status: Optional[TodoStatus] = None   # pending | done | skipped


class TodoOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    max_points: int
    scoring_type: str
    status: str
    status_changed_date: Optional[date] = None
    display_order: int
    created_at: datetime
    multiplier: Optional[int] = None  # percentage value (e.g. 100 = 1×) for time_multiplier todos

    model_config = {"from_attributes": True}


# ── Daily Task Entries (todos picked for a day) ───────────────────────────────

class TaskEntryUpsert(BaseModel):
    id: Optional[int] = Field(None, gt=0)   # if provided → UPDATE that row; if omitted → INSERT new
    todo_id: int = Field(..., gt=0)
    entry_date: date
    start_time: Optional[str] = Field(None, pattern=r"^\d{1,2}:\d{2}$")
    end_time: Optional[str] = Field(None, pattern=r"^\d{1,2}:\d{2}$")
    duration_minutes: Optional[int] = Field(None, ge=0, le=1440)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def parse_time_str(cls, v):
        if v == "" or v is None:
            return None
        return v


class TaskEntryOut(BaseModel):
    id: int
    todo_id: int
    entry_date: date
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    earned_points: Optional[float] = None
    todo_title: Optional[str] = None
    todo_max_points: Optional[int] = None
    todo_scoring_type: Optional[str] = None
    todo_display_order: Optional[int] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_entry(cls, entry):
        return cls(
            id=entry.id,
            todo_id=entry.todo_id,
            entry_date=entry.entry_date,
            start_time=entry.start_time.strftime("%H:%M") if entry.start_time else None,
            end_time=entry.end_time.strftime("%H:%M") if entry.end_time else None,
            duration_minutes=entry.duration_minutes,
            earned_points=float(entry.earned_points) if entry.earned_points is not None else None,
            todo_title=entry.todo.title if entry.todo else None,
            todo_max_points=entry.todo.max_points if entry.todo else None,
            todo_scoring_type=entry.todo.scoring_type if entry.todo else None,
            todo_display_order=entry.todo.display_order if entry.todo else None,
        )


# ── Screen Time ───────────────────────────────────────────────────────────────

class ScreenTimeEntryCreate(BaseModel):
    entry_date: date
    start_time: time
    end_time: time
    note: Optional[str] = Field(None, max_length=200)

    @field_validator('end_time')
    @classmethod
    def end_after_start(cls, end, info):
        start = info.data.get('start_time')
        if start is not None:
            start_mins = start.hour * 60 + start.minute
            end_mins   = end.hour   * 60 + end.minute
            if end_mins <= start_mins:
                raise ValueError('end_time must be after start_time')
        return end


class ScreenTimeEntryOut(BaseModel):
    id: int
    entry_date: date
    start_time: time
    end_time: time
    minutes: int
    note: Optional[str]
    logged_at: datetime

    model_config = {"from_attributes": True}
