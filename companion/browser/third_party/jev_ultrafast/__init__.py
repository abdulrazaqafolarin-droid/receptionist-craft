"""Absorbed from jev-ultrafast (MIT, (c) 2026 Browser Use).
Used as the browser lane engine: element table + loop discipline.
Decisions now come from the Director (goal in) via TypeSafe;
Rutex changes: tracked in git history, never silent.
"""

"""Jev chooses an observed action. Code owns execution."""

from .agent import Agent
from .browser import Browser

__all__ = ["Agent", "Browser"]
