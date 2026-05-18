import json
from datetime import datetime, timezone
from app.repositories.sme_repo import SMERepository
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.vector_repo import VectorRepository
from app.services.llm_client import llm_client, MODEL_FAST
from app.services.session_store import session_store
from app.models.schemas.query import QueryResponse, SourceRef, RoutingTarget, UsageInfo as UsageSchema

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

    async def _route_or_escalate(self, question: str, session_id: str) -> QueryResponse:
        smes = await self.sme_repo.list_all()

        if not smes:
            session_store.append(session_id, "user", question)
            session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
            return self._build_admin_escalation(session_id, "No SMEs are registered in the system.")

        sme_list = "\n".join(
            f"- {s.name} (specialization: {s.specialization}, sub_areas: {', '.join(s.sub_areas)})"
            for s in smes
        )

        system = (
            "You are a routing assistant. Given a question and a list of SMEs, identify which SMEs "
            "can help based on their specialization and sub_areas. "
            'Respond in JSON only: {"matches": [{"sme_name": string, "specialization": string, "reason": string}]} '
            "— use an empty matches array if no SME fits."
        )
        user_msg = f"Question: {question}\n\nAvailable SMEs:\n{sme_list}"

        usage_schema = UsageSchema(prompt_tokens=0, completion_tokens=0, total_tokens=0, model="none")
        matches = []

        try:
            response_text, usage = await llm_client.complete(
                system=system,
                messages=[{"role": "user", "content": user_msg}],
                max_tokens=512,
                model=MODEL_FAST,
            )
            usage_schema = UsageSchema(
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
                model=usage.model,
            )
            try:
                parsed = json.loads(response_text)
            except json.JSONDecodeError:
                start = response_text.find("{")
                end = response_text.rfind("}") + 1
                parsed = json.loads(response_text[start:end]) if start != -1 else {}
            matches = parsed.get("matches") or []
        except Exception:
            pass  # usage_schema stays zero, matches stays []

        session_store.append(session_id, "user", question)

        if not matches:
            session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
            return self._build_admin_escalation(
                session_id,
                "No SME specialization matches this question.",
                usage_schema,
            )

        routed_to = [
            RoutingTarget(
                type="sme",
                sme_name=m["sme_name"],
                specialization=m["specialization"],
                reason=m["reason"],
            )
            for m in matches
        ]

        if len(matches) == 1:
            answer = (
                f"I don't have approved knowledge on this specific topic, "
                f"but {matches[0]['sme_name']} specializes in this area and can help."
            )
        else:
            names = ", ".join(m["sme_name"] for m in matches)
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

    async def _ask_or_route(
        self, question: str, session_id: str, smes: list
    ) -> QueryResponse:
        """
        No relevant knowledge was retrieved. Use the LLM to decide:
        - CLARIFY if the question is under-specified but could plausibly
          fit one or more of the available SME domains
        - ROUTE if the question is clear but clearly outside all SME
          domains (fall through to _route_or_escalate)
        """
        domains = "\n".join(f"- {s.specialization}" for s in smes)

        system = (
            "You are a strict routing classifier. Your only job is to choose "
            "between ROUTE and CLARIFY. You are NOT a helpful assistant — do "
            "not try to be friendly or offer the user multiple choices. Choose "
            "exactly one action and output JSON.\n\n"

            "OUTPUT FORMAT (no other text, no markdown, no preamble):\n"
            '{"decision": "route" | "clarify", "clarifying_question": string | null}\n\n'

            "STEP 1 — DOMAIN CHECK (mandatory, do this first):\n"
            "Read the available SME domains. Does this question's LITERAL topic "
            "appear in ANY of those domains? The topic must DIRECTLY relate, not "
            "tangentially. If you cannot name at least one domain that addresses "
            "this question's literal subject matter → output "
            '{"decision": "route", "clarifying_question": null} '
            "immediately. Do not proceed to Step 2.\n\n"

            "STEP 2 — SPECIFICITY CHECK (only if Step 1 found a matching domain):\n"
            "Does the question use generic language (requirements, rules, process, "
            "steps, procedures, deadlines, fees) WITHOUT specifying which domain? "
            "AND could it plausibly apply to TWO OR MORE of the listed domains?\n"
            "- If YES to both → CLARIFY. Generate one short clarifying question "
            "using the actual domain names from the list.\n"
            "- If NO to either → ROUTE.\n\n"

            "FORBIDDEN BEHAVIOR:\n"
            "- Do not output a clarifying_question that asks 'is this about X "
            "or something else?' — that pattern means you should ROUTE, not "
            "clarify.\n"
            "- Do not offer the user a chance to rephrase off-topic questions.\n"
            "- Do not say 'I notice your question is about X but my knowledge "
            "is about Y' — that is a ROUTE case, not a CLARIFY case.\n"
            "- If you find yourself wanting to mention the user's topic and the "
            "knowledge domains in the same clarifying question, stop and "
            "choose ROUTE instead.\n\n"

            "EXAMPLES (the domains shown are illustrative; apply the same "
            "reasoning to whichever domains appear in the actual input):\n\n"

            "Input:\n"
            "User question: How do birds fly?\n"
            "Available domains:\n"
            "- Software Engineering Best Practices\n"
            "- Database Administration\n"
            "- Network Security\n"
            "Output:\n"
            '{"decision": "route", "clarifying_question": null}\n\n'

            "Input:\n"
            "User question: What is the capital of France?\n"
            "Available domains:\n"
            "- Pharmaceutical Regulatory Affairs\n"
            "- Clinical Trial Design\n"
            "Output:\n"
            '{"decision": "route", "clarifying_question": null}\n\n'

            "Input:\n"
            "User question: What is the latest version of Python?\n"
            "Available domains:\n"
            "- Tax Law\n"
            "- Estate Planning\n"
            "- Immigration Law\n"
            "Output:\n"
            '{"decision": "route", "clarifying_question": null}\n\n'

            "Input:\n"
            "User question: What are the requirements?\n"
            "Available domains:\n"
            "- Software Engineering Best Practices\n"
            "- Database Administration\n"
            "- Network Security\n"
            "Output:\n"
            '{"decision": "clarify", "clarifying_question": "Which area are '
            'you asking about — software engineering, database administration, '
            'or network security?"}\n\n'

            "Input:\n"
            "User question: Tell me about the process\n"
            "Available domains:\n"
            "- Tax Law\n"
            "- Estate Planning\n"
            "- Immigration Law\n"
            "Output:\n"
            '{"decision": "clarify", "clarifying_question": "Which process — '
            'tax filing, estate planning, or immigration?"}\n\n'

            "Input:\n"
            "User question: How do I learn JavaScript and also what are tax rules?\n"
            "Available domains:\n"
            "- Tax Law\n"
            "- Estate Planning\n"
            "Output:\n"
            '{"decision": "route", "clarifying_question": null}\n\n'

            "Note: in the CLARIFY examples, notice that the clarifying_question "
            "lists the actual domain names from the available domains list. "
            "When you produce a real clarifying question, do the same — use the "
            "actual domain names provided in the input, not the example names.\n\n"

            "Now classify the user's question. Output JSON only."
        )
        user_msg = (
            f"User question: {question}\n\n"
            f"Available SME specialization domains:\n{domains}"
        )

        response_text, usage = await llm_client.complete(
            system=system,
            messages=[{"role": "user", "content": user_msg}],
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
                usage=UsageSchema(
                    prompt_tokens=usage.prompt_tokens,
                    completion_tokens=usage.completion_tokens,
                    total_tokens=usage.total_tokens,
                    model=usage.model,
                ),
            )

        # decision == "route" — fall through to existing routing path.
        # Note: this triggers a second LLM call inside _route_or_escalate
        # to match the question to an SME. The total token cost (~400-600
        # for two short prompts) is acceptable for correct semantic routing.
        return await self._route_or_escalate(question, session_id)

    async def query(self, question: str, session_id: str) -> QueryResponse:
        query_embedding = await llm_client.embed_one(question)
        chunks = await self.vector_repo.search(query_embedding, top_k=5)

        if not chunks:
            # list_all is cached — cheap call
            smes = await self.sme_repo.list_all()
            if smes:
                return await self._ask_or_route(question, session_id, smes)
            return await self._route_or_escalate(question, session_id)

        RELEVANCE_THRESHOLD = 0.45
        relevant_chunks = [(c, e, s) for c, e, s in chunks if s >= RELEVANCE_THRESHOLD]

        if not relevant_chunks:
            top_sim = chunks[0][2] if chunks else 0.0

            if top_sim < 0.30:
                return await self._route_or_escalate(question, session_id)
            # list_all is cached — _route_or_escalate also fetches internally, acceptable duplication
            smes = await self.sme_repo.list_all()
            if smes:
                return await self._ask_or_route(question, session_id, smes)
            return await self._route_or_escalate(question, session_id)

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
            "If the question is too vague, ask for clarification. "
            "If the retrieved knowledge entries come from two or more different SMEs "
            "(different sme_name across sources) and the question genuinely spans both "
            "specializations, set response_type='routing' and list ALL relevant SMEs in "
            "routed_to, rather than answering with knowledge from only one. "
            "Each entry has a Relevance score (0-1). If the top entry's Relevance is "
            "below 0.65, prefer clarification or routing over answering directly. "
            "If the answer is not in the knowledge entries, route to ALL appropriate SMEs — "
            "there may be multiple relevant specialists, surface all of them. "
            "When no clear SME match exists, escalate to an administrator. "
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
