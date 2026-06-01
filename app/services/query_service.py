import json
import logging
from datetime import datetime, timezone
from app.repositories.sme_repo import SMERepository
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.vector_repo import VectorRepository
from app.services.llm_client import llm_client, MODEL_SMART
from app.services.session_store import session_store
from app.models.schemas.query import QueryResponse, SourceRef, RoutingTarget, UsageInfo as UsageSchema
from app.core.sanitize import sanitize_input
from app.core.risk_filter import check_risk

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
        print(f"[DECISION] classify_enter: num_smes={len(smes)}", flush=True)

        if not smes:
            print(f"[DECISION] classify_no_smes: checking common_sense...", flush=True)
            check_system = (
                "Determine if this question is common-sense/general-knowledge or "
                "requires specialized domain expertise. "
                'Output JSON: {"decision": "answer"|"route", "answer": null|string}'
            )
            check_text, check_usage = await llm_client.complete(
                system=check_system,
                messages=[{"role": "user", "content": question}],
                max_tokens=128,
                model=MODEL_SMART,
                temperature=0,
            )
            no_sme_usage = check_usage
            try:
                check_parsed = json.loads(check_text or "{}")
            except (json.JSONDecodeError, TypeError):
                check_parsed = {}

            if check_parsed.get("decision") == "answer":
                print(f"[DECISION] classify_no_smes: LLM decided 'answer' → common sense answer", flush=True)
                answer_text = check_parsed.get("answer") or ""
                if not answer_text:
                    answer_text = question
                session_store.append(session_id, "user", question)
                session_store.append(session_id, "assistant", answer_text)
                return QueryResponse(
                    answer=answer_text,
                    grounded=False,
                    sources=[],
                    disclaimer=None,
                    session_id=session_id,
                    response_type="answer",
                    routed_to=None,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    usage=UsageSchema(
                        prompt_tokens=no_sme_usage.prompt_tokens,
                        completion_tokens=no_sme_usage.completion_tokens,
                        total_tokens=no_sme_usage.total_tokens,
                        model=no_sme_usage.model,
                    ),
                )

            session_store.append(session_id, "user", question)
            session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
            return self._build_admin_escalation(
                session_id,
                "No SMEs are registered and this question requires domain expertise.",
                UsageSchema(
                    prompt_tokens=no_sme_usage.prompt_tokens,
                    completion_tokens=no_sme_usage.completion_tokens,
                    total_tokens=no_sme_usage.total_tokens,
                    model=no_sme_usage.model,
                ),
            )

        sme_context = "\n".join(
            f"- {s.name}: specialization={s.specialization}, sub_areas=[{', '.join(s.sub_areas)}]"
            for s in smes
        )

        system = (
            "You are a strict domain classifier. First, determine whether this question "
            "requires specialized SME domain knowledge or is common-sense/general knowledge. "
            'Output exactly this JSON structure:\n'
            '{"decision": "answer"|"clarify"|"route", "answer": null|string, '
            '"clarifying_question": null|string, '
            '"routed_to": [{"sme_name": string, "reason": string}]}\n\n'
            "DECISION RULES — follow in priority order:\n"
            '1. "answer": question is common-sense, general knowledge, trivia, basic math, '
            "definitions, translations, well-known facts — anything a generally knowledgeable "
            "person can answer without specialist training. Provide a short direct answer "
            "in the 'answer' field.\n"
            '2. "clarify": question is genuinely ambiguous AND could reasonably refer to '
            "≥2 different SME domains. Provide a specific follow-up question.\n"
            '3. "route": question clearly requires specialized SME domain knowledge. '
            "Populate routed_to with matching SMEs (use empty routed_to if no SME matches).\n\n"
            "HIGH-RISK TOPICS — if the question involves ANY of these, use decision='route' "
            "with empty routed_to (escalate to administrator):\n"
            "- billing / payments (refunds, cancellations, charges, pricing)\n"
            "- account access (passwords, login issues, account changes, 2FA)\n"
            "- personal data / privacy (data deletion, access requests, GDPR/CCPA)\n"
            "- legal matters (legal advice, lawsuits, compliance violations)\n"
            "- security exploits (bypassing controls, vulnerabilities, admin passwords)\n"
            "- medical advice (diagnosis, medication, symptoms, treatment)\n"
            "- financial advice (investments, tax advice, retirement planning)\n"
            "- authorization requests (asking for elevated access or permissions)\n"
            "- destructive operations (deleting databases, shutting down servers)\n"
            "- organizational procedures (expense reports, HR policies, internal contacts)\n\n"
            "IMPORTANT: Default to 'answer' for any question that does NOT clearly require "
            "specialist domain expertise AND is not a high-risk topic. Only route when the "
            "question specifically demands subject-matter knowledge from one of the listed SMEs."
        )
        user_msg = f"Question: {question}\n\nAvailable SMEs:\n{sme_context}"

        response_text, usage = await llm_client.complete(
            system=system,
            messages=[{"role": "user", "content": user_msg}],
            max_tokens=512,
            model=MODEL_SMART,
            temperature=0,
        )

        if not response_text or not response_text.strip():
            logger.error("llm_empty_response_in_classify prompt_tokens=%d", usage.prompt_tokens)
            session_store.append(session_id, "user", question)
            session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
            return self._build_admin_escalation(
                session_id,
                "LLM returned an empty response during classification.",
                UsageSchema(
                    prompt_tokens=usage.prompt_tokens,
                    completion_tokens=usage.completion_tokens,
                    total_tokens=usage.total_tokens,
                    model=usage.model,
                ),
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
        print(f"[DECISION] classify_has_smes: LLM raw decision={decision} clarify_q={bool(clarifying_q)} "
              f"num_routed={len(routed_raw)}", flush=True)

        usage_schema = UsageSchema(
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
            model=usage.model,
        )

        if decision == "answer":
            print(f"[DECISION] classify_has_smes: LLM decided 'answer' → common sense answer", flush=True)
            answer_text = parsed.get("answer") or parsed.get("clarifying_question") or ""
            if not answer_text:
                answer_system = "Answer this question concisely in 1-3 sentences."
                fallback_text, fallback_usage = await llm_client.complete(
                    system=answer_system,
                    messages=[{"role": "user", "content": question}],
                    max_tokens=256,
                    model=MODEL_SMART,
                    temperature=0,
                )
                if fallback_text and fallback_text.strip():
                    answer_text = fallback_text.strip()
                    usage.prompt_tokens += fallback_usage.prompt_tokens
                    usage.completion_tokens += fallback_usage.completion_tokens
                    usage.total_tokens += fallback_usage.total_tokens

            session_store.append(session_id, "user", question)
            session_store.append(session_id, "assistant", answer_text)
            return QueryResponse(
                answer=answer_text,
                grounded=False,
                sources=[],
                disclaimer=None,
                session_id=session_id,
                response_type="answer",
                routed_to=None,
                timestamp=datetime.now(timezone.utc).isoformat(),
                usage=UsageSchema(
                    prompt_tokens=usage.prompt_tokens,
                    completion_tokens=usage.completion_tokens,
                    total_tokens=usage.total_tokens,
                    model=usage.model,
                ),
            )

        if decision == "clarify" and clarifying_q:
            print(f"[DECISION] classify_has_smes: LLM decided 'clarify' → clarification", flush=True)
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
            print(f"[DECISION] classify_has_smes: LLM decided 'route' with empty routed_to → admin escalation", flush=True)
            session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
            return self._build_admin_escalation(
                session_id,
                "No SME specialization matches this question.",
                usage_schema,
            )

        print(f"[DECISION] classify_has_smes: LLM decided 'route' → routing to {len(routed_raw)} SME(s)", flush=True)
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
        print(f"[DECISION] entry: question={question[:60]!r}", flush=True)

        is_risky, risk_category = check_risk(question)
        print(f"[DECISION] risk_check: is_risky={is_risky} category={risk_category or 'none'}", flush=True)

        if is_risky and risk_category == "self_harm":
            print(f"[DECISION] tier1_self_harm: BLOCKED → admin escalation (no embedding)", flush=True)
            session_store.append(session_id, "user", question)
            session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
            return self._build_admin_escalation(session_id, "Question requires administrator review.")

        query_embedding = await llm_client.embed_one(question)
        chunks = await self.vector_repo.search(query_embedding, top_k=8)
        print(f"[DECISION] vector_search: total_chunks={len(chunks)}", flush=True)

        if not chunks:
            if is_risky:
                print(f"[DECISION] tier2_no_chunks: is_risky=True ({risk_category}) → admin escalation", flush=True)
                session_store.append(session_id, "user", question)
                session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
                return self._build_admin_escalation(
                    session_id,
                    f"High-risk question ({risk_category}) — requires administrator review.",
                )
            print(f"[DECISION] tier2_no_chunks: safe → _classify_and_route", flush=True)
            return await self._classify_and_route(question, session_id)

        RELEVANCE_THRESHOLD = 0.35
        relevant_chunks = [(c, e, s) for c, e, s in chunks if s >= RELEVANCE_THRESHOLD]

        print(f"[RETRIEVAL] total={len(chunks)} above_threshold={len(relevant_chunks)}", flush=True)
        for _, e, s in chunks:
            print(f"  sim={s:.3f} entry={e.id} sme_id={e.sme_id} topic={e.topic[:40]!r}", flush=True)

        if not relevant_chunks:
            if is_risky:
                print(f"[DECISION] tier2_below_threshold: is_risky=True ({risk_category}) → admin escalation", flush=True)
                session_store.append(session_id, "user", question)
                session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
                return self._build_admin_escalation(
                    session_id,
                    f"High-risk question ({risk_category}) — requires administrator review.",
                )
            print(f"[DECISION] tier2_below_threshold: safe → _classify_and_route", flush=True)
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

        max_sim = max(s for _, _, s in relevant_chunks)
        num_relevant = len(relevant_chunks)
        logger.info("retrieval_quality max_sim=%.3f num_relevant=%d", max_sim, num_relevant)

        history = session_store.get_history(session_id)
        history_text = ""
        if history:
            history_text = "Session history:\n" + "\n".join(
                f"  {m['role'].upper()}: {m['content']}" for m in history
            ) + "\n\n"

        system = (
            "You are a knowledge base assistant. Answer the user's question using "
            "the provided knowledge entries. Synthesize information from multiple "
            "sources when available. Use ONLY the provided knowledge. "

            "DECISION RULES — apply in strict priority order:\n"
            "1. ANSWER (response_type='answer'): Use when the knowledge chunks are "
            "topically related to the question. Cite all sources that contributed. "
            "Set grounded=true. If sources disagree, present the most directly "
            "relevant view and briefly note alternatives.\n"
            "2. ROUTE (response_type='routing'): Use ONLY when ALL knowledge chunks "
            "are genuinely off-topic relative to the question. Route to ALL SMEs "
            "whose specialization or sub_areas match the question. If no SME matches, "
            "escalate to administrator.\n\n"

            "SYNTHESIS RULES:\n"
            "- Draw from MULTIPLE complementary sources — cite ALL contributing entries\n"
            "- REPRODUCE EXACT TOKENS: when the source contains specific identifiers "
            "(article/section numbers, percentages, dollar amounts, dates, deadlines, "
            "named codes, defined terms, proper nouns, version numbers), include those "
            "identifiers verbatim from the source. Do NOT rephrase them.\n"
            "- Paraphrase only the connective language between facts.\n"
            "- Length: write as much as needed to include every fact from the sources "
            "relevant to the question. Do not trim facts to hit a length target. "
            "3-6 paragraphs is typical for fact-rich questions.\n"
            "- If the retrieved chunks mention the topic but lack specific details "
            "needed to answer (e.g., the question asks for a deadline but chunks only "
            "describe the process at high level), set response_type='routing' rather "
            "than fabricating partial details. Do not guess at missing specifics.\n\n"

            "JSON FORMAT — output ONLY valid JSON, no preamble:\n"
            '{"response_type": "answer"|"routing", '
            '"answer": string (REQUIRED), "grounded": boolean, '
            '"sources": [{"entry_id": string, "sme_name": string, "topic": string}], '
            '"routed_to": [{"type": "sme"|"admin", "sme_name": string|null, "specialization": string, "reason": string}]|null, '
            '"disclaimer": string|null}\n\n'

            "FOR answer type:\n"
            "- grounded: true\n"
            "- sources: list ALL entry_ids whose content contributed\n"
            "- The evaluation rewards answers that include every specific identifier "
            "present in the cited chunks. Maximum coverage of source-specific tokens "
            "is the goal.\n"
            '- disclaimer: "This information is based on approved SME knowledge and may not constitute professional advice."\n'
            "FOR routing type: grounded=false, sources=[], populate routed_to"
        )

        print(f"[DECISION] rag_path: max_sim={max_sim:.3f} num_relevant={num_relevant} → normal RAG answer flow", flush=True)

        user_msg = (
            f"{history_text}"
            f"Question: {question}\n\n"
            f"Relevant knowledge:\n{knowledge_context or '(none)'}\n\n"
            f"Available SMEs:\n{sme_list or '(none)'}"
        )

        response_text, usage = await llm_client.complete(
            system=system,
            messages=[{"role": "user", "content": user_msg}],
            temperature=0,
        )

        if not response_text or not response_text.strip():
            logger.error("llm_empty_response prompt_tokens=%d completion_tokens=%d",
                         usage.prompt_tokens, usage.completion_tokens)
            session_store.append(session_id, "user", question)
            session_store.append(session_id, "assistant", _ADMIN_REFUSAL)
            return self._build_admin_escalation(
                session_id,
                "LLM returned an empty response — unable to process question.",
                UsageSchema(
                    prompt_tokens=usage.prompt_tokens,
                    completion_tokens=usage.completion_tokens,
                    total_tokens=usage.total_tokens,
                    model=usage.model,
                ),
            )

        try:
            parsed = json.loads(response_text)
        except json.JSONDecodeError:
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            parsed = json.loads(response_text[start:end]) if start != -1 else {}

        answer = parsed.get("answer") or response_text
        response_type = parsed.get("response_type", "answer")

        print(f"[DECISION] rag_llm: response_type={response_type} grounded={parsed.get('grounded', False)} "
              f"num_sources={len(parsed.get('sources') or [])}", flush=True)

        GUARD_MAX_SIM = 0.40
        GUARD_MIN_CHUNKS = 2

        if response_type != "answer" and max_sim >= GUARD_MAX_SIM and num_relevant >= GUARD_MIN_CHUNKS:
            print(f"[DECISION] guardrail: FIRED (type={response_type}, but max_sim={max_sim:.3f}>={GUARD_MAX_SIM}, "
                  f"num={num_relevant}>={GUARD_MIN_CHUNKS}) → force retry for answer", flush=True)
            logger.warning(
                "retrieval_guard_triggered type=%s max_sim=%.3f num_chunks=%d question=%s",
                response_type, max_sim, num_relevant, question[:80],
            )
            force_system = (
                "You are a knowledge base assistant. You MUST answer the user's question "
                "using the provided knowledge chunks. The chunks ARE relevant to the question. "
                "Synthesize a complete, grounded answer that cites all contributing sources. "
                "Output JSON only:\n"
                '{"answer": string, "sources": [{"entry_id": string, "sme_name": string, "topic": string}]}'
            )
            retry_text, retry_usage = await llm_client.complete(
                system=force_system,
                messages=[{"role": "user", "content": user_msg}],
                model=MODEL_SMART,
                temperature=0,
            )
            usage.prompt_tokens += retry_usage.prompt_tokens
            usage.completion_tokens += retry_usage.completion_tokens
            usage.total_tokens += retry_usage.total_tokens

            if not retry_text or not retry_text.strip():
                logger.error("llm_empty_response_in_guard_retry")
            else:
                try:
                    retry_parsed = json.loads(retry_text)
                except json.JSONDecodeError:
                    start = retry_text.find("{")
                    end = retry_text.rfind("}") + 1
                    retry_parsed = json.loads(retry_text[start:end]) if start != -1 else {}

                answer = retry_parsed.get("answer") or answer
                response_type = "answer"
                parsed["grounded"] = True
                parsed["sources"] = retry_parsed.get("sources", [])
                parsed["disclaimer"] = (
                    "This information is based on approved SME knowledge "
                    "and may not constitute professional advice."
                )
                parsed["routed_to"] = None
        else:
            if response_type != "answer":
                print(f"[DECISION] guardrail: skipped (max_sim={max_sim:.3f} need>={GUARD_MAX_SIM}, "
                      f"num={num_relevant} need>={GUARD_MIN_CHUNKS})", flush=True)

        session_store.append(session_id, "user", question)
        session_store.append(session_id, "assistant", answer)

        sources = [SourceRef(**s) for s in (parsed.get("sources") or [])]
        routed_to_raw = parsed.get("routed_to")
        routed_to = [RoutingTarget(**r) for r in routed_to_raw] if routed_to_raw else None

        routed_target = (routed_to[0].type if routed_to else "none") if routed_to else "none"
        print(f"[DECISION] final: response_type={response_type} grounded={parsed.get('grounded', False)} "
              f"routed_to={routed_target} sources={len(sources)}", flush=True)

        return QueryResponse(
            answer=answer,
            grounded=parsed.get("grounded", False),
            sources=sources,
            disclaimer=parsed.get("disclaimer"),
            session_id=session_id,
            response_type=response_type,
            routed_to=routed_to,
            timestamp=datetime.now(timezone.utc).isoformat(),
            usage=UsageSchema(
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
                model=usage.model,
            ),
        )
