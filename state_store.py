"""
Persistence helpers for the agent dashboard bridge.
The trading loop writes a compact JSON snapshot each tick and the Streamlit
dashboard reads the latest version from disk.
"""

import json
import os
import tempfile
from typing import Any, Dict


class AgentStateStore:
    def __init__(self, path: str = "/tmp/prism_state.json"):
        self.path = path

    def write(self, state: Dict[str, Any]) -> None:
        directory = os.path.dirname(self.path) or "."
        os.makedirs(directory, exist_ok=True)
        fd, temp_path = tempfile.mkstemp(prefix="prism_state_", suffix=".json", dir=directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(state, handle, indent=2)
            os.replace(temp_path, self.path)
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
