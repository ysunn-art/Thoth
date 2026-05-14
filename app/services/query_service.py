import json
from datetime import datetime, timezone
from app.repositories.sme_repo import SMERepository
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.vector_repo import VectorRepository
from app.services.llm_client import llm_client, UsageInfo
from app.services.session_store import session_store
from app.models.schemas.query import QueryResponse, SourceRef, RoutingTarget, UsageInfo as UsageSchema


class QueryService:
    def __init__(self, sme_repo: SMERepository, knowledge_repo: KnowledgeRepository, vector_repo: VectorRepository):
        self.sme_repo = sme_repo
        self.knowledge_repo = knowledge_repo
        self.vector_repo = vector_repo

    async def query(self, question: str, session_id: str) -> QueryResponse:
        query_embedding = await llm_client.embed_one(question)
        chunks = await self.vector_repo.search(query_embedding, top_k=5)

        knowledge_context = ""
        for chunk, entry in chunks:
            knowledge_context += f"[Entry {entry.id} | Topic: {entry.topic}]\n{chunk.chunk_text}\n\n"

        smes = await self.sme_repo.list_all()
        sme_list = "\n".join(
            f"- {s.name} (specialization: {s.specialization}, sub_areas: {', '.join(s.sub_areas)})"
            for s in smes
        )

        history = session_store.get_history(session_id)
        history_text = ""
        if history:
            history_text = "Session history:\n" + "\n".join(
                f"  {m['role'].upper()}: {m['content']}" for m in history
            ) + "\n\n"

        system = (
            "You are a knowledge base assistant. Answer questions using ONLY the provided knowledge entries. "
            "If the question is too vague, ask for clarification. "
            "If no relevant knowledge exists, route to the appropriate SME. "
            'Respond in JSON only: { "response_type": "answer"|"clarification"|"routing", '
            '"answer": string (REQUIRED — never null; for routing explain why you are routing), "grounded": boolean, '
            '"sources": [{"entry_id": string, "sme_name": string, "topic": string}], '
            '"routed_to": [{"type": "sme"|"admin", "sme_name": string|null, "specialization": string, "reason": string}]|null, '
            '"disclaimer": string|null }'
        )

        user_msg = (
            f"{history_text}"
            f"Question: {question}\n\n"
            f"Relevant knowledge:\n{knowledge_context or '(none)'}\n\n"
            f"Available SMEs:\n{sme_list or '(none)'}"
        )

        response_text, usage = await llm_client.complete(system=system, messages=[{"role": "user", "content": user_msg}])

        try:
            parsed = json.loads(response_text)
        except json.JSONDecodeError:
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            parsed = json.loads(response_text[start:end]) if start != -1 else {}

        answer = parsed.get("answer") or response_text

        session_store.append(session_id, "user", question)
        session_store.append(session_id, "assistant", answer)

        sources = [SourceRef(**s) for s in (parsed.get("sources") or [])]
        routed_to_raw = parsed.get("routed_to")
        routed_to = [RoutingTarget(**r) for r in routed_to_raw] if routed_to_raw else None

        return QueryResponse(
            answer=answer,
            grounded=parsed.get("grounded", False),
            sources=sources,
            disclaimer=parsed.get("disclaimer"),
            session_id=session_id,
            response_type=parsed.get("response_type", "answer"),
            routed_to=routed_to,
            timestamp=datetime.now(timezone.utc).isoformat(),
            usage=UsageSchema(
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
                model=usage.model,
            ),
        )
