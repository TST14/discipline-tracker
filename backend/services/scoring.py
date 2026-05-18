"""
Scoring engine — calculates earned points for a daily entry.
"""
from datetime import time as dtime


def _time_from_str(s: str) -> dtime:
    h, m = map(int, s.split(":"))
    return dtime(h, m)


def _time_to_mins(t: dtime) -> int:
    return t.hour * 60 + t.minute


def _compare(condition: str, actual, threshold) -> bool:
    ops = {
        "lte": actual <= threshold,
        "gte": actual >= threshold,
        "lt":  actual < threshold,
        "gt":  actual > threshold,
        "eq":  actual == threshold,
    }
    return ops.get(condition, False)


def _linear_interpolate(actual_mins: int, breakpoints: list[tuple[int, int]]) -> float:
    """
    Linear interpolation between (time_mins, percentage) breakpoints.
    Clamps to first/last breakpoint outside the range.
    """
    if not breakpoints:
        return 0.0
    if actual_mins <= breakpoints[0][0]:
        return float(breakpoints[0][1])
    if actual_mins >= breakpoints[-1][0]:
        return float(breakpoints[-1][1])
    for i in range(len(breakpoints) - 1):
        t1, p1 = breakpoints[i]
        t2, p2 = breakpoints[i + 1]
        if t1 <= actual_mins <= t2:
            ratio = (actual_mins - t1) / (t2 - t1)
            return p1 + ratio * (p2 - p1)
    return 0.0


def calculate_earned_points(habit, entry, rules: list) -> float:
    """Return earned points (float) for a single daily entry."""
    scoring_type = habit.scoring_type

    if scoring_type in ("boolean", "no_rule"):
        has_data = (
            entry.start_time is not None
            or entry.duration_minutes is not None
        )
        return float(habit.max_points) if has_data else 0.0

    if scoring_type == "time_of_day":
        if entry.start_time is None:
            return 0.0
        actual = entry.start_time
        for rule in sorted(rules, key=lambda r: r.rule_order):
            threshold = _time_from_str(rule.value)
            if _compare(rule.condition, actual, threshold):
                return round((rule.percentage / 100) * habit.max_points, 2)
        return 0.0

    if scoring_type == "time_of_day_linear":
        if entry.start_time is None:
            return 0.0
        actual_mins = _time_to_mins(entry.start_time)
        # Sort breakpoints by time value (ascending) — entry order doesn't matter
        breakpoints = []
        for r in rules:
            h, m = map(int, r.value.split(":"))
            breakpoints.append((h * 60 + m, r.percentage))
        breakpoints.sort(key=lambda x: x[0])
        pct = _linear_interpolate(actual_mins, breakpoints)
        return round((pct / 100) * habit.max_points, 2)

    if scoring_type == "duration_linear":
        mins = entry.duration_minutes
        if mins is None or mins <= 0:
            return 0.0
        # Sort breakpoints by minute value (ascending) — entry order doesn't matter
        breakpoints = sorted([(int(r.value), r.percentage) for r in rules], key=lambda x: x[0])
        pct = _linear_interpolate(mins, breakpoints)
        return round((pct / 100) * habit.max_points, 2)

    if scoring_type == "duration":
        mins = entry.duration_minutes
        if mins is None or mins <= 0:
            return 0.0
        for rule in sorted(rules, key=lambda r: r.rule_order):
            threshold = int(rule.value)
            if _compare(rule.condition, mins, threshold):
                return round((rule.percentage / 100) * habit.max_points, 2)
        return 0.0

    return 0.0
