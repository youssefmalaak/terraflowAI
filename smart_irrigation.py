"""Priority-based smart irrigation scheduling for TerraFlow."""

MAX_ACTIVE_ZONES = 2
FIELD_TARGETS = {
    "FIELD_A": 65,
    "FIELD_B": 68,
    "FIELD_C": 65,
    "FIELD_D": 70,
}


def rank_fields(moisture, targets=None):
    """Rank fields by normalized moisture deficit (largest deficit first).

    Returns dictionaries containing field id, current moisture, target,
    and normalized deficit. Fields already at target are excluded.
    """
    targets = targets or FIELD_TARGETS
    ranked = []
    for field, target in targets.items():
        current = float(moisture.get(field, target))
        if current < target:
            deficit = (target - current) / target if target else 0.0
            ranked.append({
                "field": field,
                "moisture": current,
                "target": target,
                "priority": deficit,
            })
    ranked.sort(key=lambda item: (-item["priority"], item["field"]))
    return ranked


def select_active_zones(ranked_fields, capacity=MAX_ACTIVE_ZONES):
    """Split a ranked schedule into active zones and the waiting queue."""
    if capacity < 1:
        raise ValueError("capacity must be at least 1")
    fields = [item["field"] if isinstance(item, dict) else item for item in ranked_fields]
    return fields[:capacity], fields[capacity:]
