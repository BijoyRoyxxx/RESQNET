from typing import Literal

DepartmentName = Literal["women_safety", "fire", "health", "police", "disaster", "municipal"]

DEPARTMENTS: tuple[tuple[DepartmentName, str, tuple[str, ...]], ...] = (
    ("women_safety", "Women’s Safety", ("women_safety",)),
    ("fire", "Fire & Rescue", ("fire",)),
    ("health", "Health Services", ("medical",)),
    ("police", "Police", ("crime", "unknown")),
    ("disaster", "Disaster Management", ("flood",)),
    ("municipal", "Municipal Services", ("infrastructure",)),
)

DEPARTMENT_LABELS = {name: label for name, label, _ in DEPARTMENTS}


def department_for_category(category: str | None) -> DepartmentName:
    for department, _, categories in DEPARTMENTS:
        if category in categories:
            return department
    return "police"
