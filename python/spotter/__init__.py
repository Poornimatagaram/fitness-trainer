"""Spotter: rep counting and form feedback from MediaPipe pose landmarks.

This package is the Python reference implementation of the logic that runs in
the web app (web/js/core). The two are kept line-for-line equivalent, and
tests/test_parity.py checks that they produce the same results.
"""

from .exercises import EXERCISES, depth_progress
from .rep_counter import RepCounter, grade_rep
from .summary import summarize_set

__all__ = ["EXERCISES", "RepCounter", "depth_progress", "grade_rep", "summarize_set"]
