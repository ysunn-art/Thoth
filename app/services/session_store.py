from typing import Dict, List


class SessionStore:
    def __init__(self):
        self._sessions: Dict[str, List[dict]] = {}

    def get_history(self, session_id: str) -> List[dict]:
        return self._sessions.get(session_id, [])

    def append(self, session_id: str, role: str, content: str):
        if session_id not in self._sessions:
            self._sessions[session_id] = []
        self._sessions[session_id].append({"role": role, "content": content})

    def clear_all(self):
        self._sessions.clear()


session_store = SessionStore()
