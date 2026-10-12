import sys
from pathlib import Path

# Make `import spotter` and `import puppet` work when running `pytest` from the repo root or python/.
PYTHON_DIR = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(PYTHON_DIR), str(PYTHON_DIR / "tests")]
