import json
import logging
from datetime import datetime, timezone
from app.repositories.sme_repo import SMERepository
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.vector_repo import VectorRepository
from app.services.llm_client import llm_client, MODEL_FAST
from app.services.session_store import session_store
from app.models.schemas.query import QueryResponse, SourceRef, RoutingTarget, UsageInfo as UsageSchema
from app.core.sanitize import sanitize_input

logger = logging.getLogger(__name__)

_ADMIN_REFUSAL = (
    "I don't have any approved knowledge to answer this question. "
    "Please consult an administrator."
)


class QueryService:
    def __init__(self, sme_repo: SMERepository, knowledge_repo: KnowledgeRepository, vector_repo: VectorRepository):
        self.sme_repo = sme_repo
        self.knowledge_repo = knowledge_repo
        self.vector_repo = vector_repo

    def _build_admin_escalation(
        self,
        session_id: str,
        reason: str,
        usage: UsageSchema | None = None,
    ) -> QueryResponse:
        return QueryResponse(
            answer=_ADMIN_REFUSAL,
            grounded=False,
            sources=[],
            disclaimer=None,
            session_id=session_id,
            response_type="routing",
            routed_to=[RoutingTarget(
                type="admin",
                sme_name=None,
                specialization="N/A",
                reason=reason,
            )],
            timestamp=datetime.now(timezone.utc).isoformat(),
            usage=usage or UsageSchema(prompt_tokens=0, completion_tokens=0, total_tokens=0, model="none"),
        )

    async def _classify_and_route(self, question: str, session_id: str) -> QueryResponse:
        smes = await self.sme_repo.list_all()

        if not smes:
            session_store.append(session_id, "user", question)
            session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
            return self._build_admin_escalation(session_id, "No SMEs are registered in the system.")

        sme_context = "\n".join(
            f"- {s.name}: specialization={s.specialization}, sub_areas=[{', '.join(s.sub_areas)}]"
            for s in smes
        )

        system = (
            "Classify this user question against available SME domains. "
            "Use BOTH specialization and sub_areas for matching. "
            "Output JSON only:\n"
            '{"decision": "clarify"|"route", "clarifying_question": null|string, '
            '"routed_to": [{"sme_name": string, "reason": string}]}\n\n'
            "Rules:\n"
            '- "clarify": question is too vague AND could apply to ≥2 domains → ask which one\n'
            '- "route": question is clear but outside all domains → empty routed_to\n'
            '- "route": question matches a domain but lacks knowledge → populate routed_to with matching SMEs\n'
            "- Only route to SMEs whose listed expertise (specialization OR sub_areas) directly covers the question topic.\n"
            "- Be strict: if no domain matches, use empty routed_to."
        )
        user_msg = f"Question: {question}\n\nAvailable SMEs:\n{sme_context}"

        response_text, usage = await llm_client.complete(
            system=system,
            messages=[{"role": "user", "content": user_msg}],
            max_tokens=512,
            model=MODEL_FAST,
        )

        try:
            parsed = json.loads(response_text)
        except json.JSONDecodeError:
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            parsed = json.loads(response_text[start:end]) if start != -1 else {}

        decision = parsed.get("decision", "route")
        clarifying_q = parsed.get("clarifying_question")
        routed_raw = parsed.get("routed_to") or []

        usage_schema = UsageSchema(
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
            model=usage.model,
        )

        if decision == "clarify" and clarifying_q:
            session_store.append(session_id, "user", question)
            session_store.append(session_id, "assistant", clarifying_q)
            return QueryResponse(
                answer=clarifying_q,
                grounded=False,
                sources=[],
                disclaimer=None,
                session_id=session_id,
                response_type="clarification",
                routed_to=None,
                timestamp=datetime.now(timezone.utc).isoformat(),
                usage=usage_schema,
            )

        session_store.append(session_id, "user", question)

        if not routed_raw:
            session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
            return self._build_admin_escalation(
                session_id,
                "No SME specialization matches this question.",
                usage_schema,
            )

        sme_map = {s.name: s for s in smes}
        routed_to = []
        for r in routed_raw:
            sme_name = r.get("sme_name", "")
            sme = sme_map.get(sme_name)
            routed_to.append(RoutingTarget(
                type="sme",
                sme_name=sme_name if sme else None,
                specialization=sme.specialization if sme else "N/A",
                reason=r.get("reason", ""),
            ))

        if len(routed_to) == 1:
            answer = (
                f"I don't have approved knowledge on this specific topic, "
                f"but {routed_to[0].sme_name} specializes in this area and can help."
            )
        else:
            names = ", ".join(rt.sme_name for rt in routed_to if rt.sme_name)
            answer = (
                f"This question spans multiple areas of expertise. "
                f"I recommend consulting: {names}."
            )

        session_store.append(session_id, "assistant", answer)
        return QueryResponse(
            answer=answer,
            grounded=False,
            sources=[],
            disclaimer=None,
            session_id=session_id,
            response_type="routing",
            routed_to=routed_to,
            timestamp=datetime.now(timezone.utc).isoformat(),
            usage=usage_schema,
        )

    async def query(self, question: str, session_id: str) -> QueryResponse:
        question = sanitize_input(question)
        query_embedding = await llm_client.embed_one(question)
        chunks = await self.vector_repo.search(query_embedding, top_k=8)

        if not chunks:
            return await self._classify_and_route(question, session_id)

        RELEVANCE_THRESHOLD = 0.45
        relevant_chunks = [(c, e, s) for c, e, s in chunks if s >= RELEVANCE_THRESHOLD]

        print(f"[RETRIEVAL] total={len(chunks)} above_threshold={len(relevant_chunks)}", flush=True)
        for _, e, s in chunks:
            print(f"  sim={s:.3f} entry={e.id} sme_id={e.sme_id} topic={e.topic[:40]!r}", flush=True)

        if not relevant_chunks:
            top_sim = chunks[0][2] if chunks else 0.0
            if top_sim < 0.30:
                return await self._classify_and_route(question, session_id)
            return await self._classify_and_route(question, session_id)

        smes = await self.sme_repo.list_all()
        sme_by_id = {s.id: s for s in smes}
        sme_list = "\n".join(
            f"- {s.name} (specialization: {s.specialization}, sub_areas: {', '.join(s.sub_areas)})"
            for s in smes
        )

        knowledge_context = ""
        for chunk, entry, sim in relevant_chunks:
            sme_name = sme_by_id[entry.sme_id].name if entry.sme_id in sme_by_id else "Unknown"
            knowledge_context += (
                f"[Entry {entry.id} | Topic: {entry.topic} | SME: {sme_name} | Relevance: {sim:.2f}]\n"
                f"{chunk.chunk_text}\n\n"
            )

        history = session_store.get_history(session_id)
        history_text = ""
        if history:
            history_text = "Session history:\n" + "\n".join(
                f"  {m['role'].upper()}: {m['content']}" for m in history
            ) + "\n\n"

        system = (
            "You are a knowledge base assistant. Answer questions using ONLY the provided knowledge entries. "
            "PRIMARY DIRECTIVE: When retrieved knowledge contains the answer, "
            "provide a grounded answer with citations. Do not refuse to answer "
            "because of minor terminology mismatches between the question and "
            "the source (e.g., the question says 'Tier-1 jurisdictions' and the "
            "source says 'Tier-1 restricted jurisdictions' — these refer to the "
            "same thing). "
            "Use clarification ONLY when the question is genuinely ambiguous "
            "between two or more topics in the knowledge base. Do not use "
            "clarification as a hedge when you are uncertain — commit to a "
            "grounded answer with appropriate caveats instead. "
            "When the retrieved knowledge comes from multiple SMEs whose expertise "
            "is complementary on the question, synthesize an answer that draws from "
            "ALL relevant sources and cite every contributing source in the sources array. "
            "Only route to SMEs (response_type='routing') when the knowledge is insufficient "
            "to answer — not simply because multiple SMEs are involved. "
            "Each entry has a Relevance score (0-1). If the top entry's Relevance is "
            "below 0.65, prefer clarification or routing over answering directly. "
            "If the answer is not in the knowledge entries, route to ALL appropriate SMEs — "
            "there may be multiple relevant specialists, surface all of them. "
            "When no clear SME match exists, escalate to an administrator. "
            "Keep answers concise but complete — 2 to 4 paragraphs. Avoid repeating information verbatim from the sources. "
            "GROUNDED ANSWER REQUIREMENTS (response_type='answer'):\n"
            "- Cite ALL source entry_ids that contributed information to the answer\n"
            "- Include a 1-sentence paraphrase or quote from the knowledge that supports your answer\n"
            '- ALWAYS set disclaimer to "This information is based on approved SME knowledge and may not constitute professional advice."\n'
            "- If sources differ in details, present the most directly relevant source's information and briefly note other sources' views.\n"
            "If the retrieved knowledge addresses the question's topic (even "
            "partially), provide a grounded answer that cites the sources and "
            "notes any limitations. Only route when the knowledge is clearly "
            "off-topic relative to the question.\n"
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

        response_text, usage = await llm_client.complete(
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )

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
