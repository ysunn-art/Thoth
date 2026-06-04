from typing import Dict, List


class SessionStore:
    """Session store with in-memory fallback for sync access and DB-backed async access."""

    def __init__(self, session_repo=None):
        self._repo = session_repo
        self._memory: Dict[str, List[dict]] = {}

    def set_repo(self, repo):
        self._repo = repo

    def get_history(self, session_id: str) -> List[dict]:
        return self._memory.get(session_id, [])

    def append(self, session_id: str, role: str, content: str):
        if session_id not in self._memory:
            self._memory[session_id] = []
        self._memory[session_id].append({"role": role, "content": content})

    async def get_history_async(self, session_id: str) -> List[dict]:
        if self._repo:
            messages = await self._repo.get_history(session_id)
            return [{"role": m.role, "content": m.content} for m in messages]
        return self.get_history(session_id)

    async def append_async(self, session_id: str, role: str, content: str, user_id: str | None = None):
        self.append(session_id, role, content)
        if self._repo:
            await self._repo.append_message(session_id, role, content, user_id)

    def clear_all(self):
        self._memory.clear()

    async def clear_all_async(self):
        self.clear_all()
        if self._repo:
            await self._repo.delete_all()


session_store = SessionStore()
