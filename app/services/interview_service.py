from fastapi import HTTPException
from app.repositories.interview_repo import InterviewRepository
from app.repositories.sme_repo import SMERepository
from app.models.db.interview import Interview
from app.models.db.turn import Turn
from app.models.schemas.interview import InterviewCreate, TurnCreate
from app.services.llm_client import llm_client, UsageInfo, MODEL_FAST
from app.core.ids import new_id
from app.core.errors import raise_not_found
from app.core.sanitize import sanitize_input

COMPLETE_SIGNAL = "[INTERVIEW_COMPLETE]"
MAX_TURNS = 10  # hard cap — forces completion after this many turns


class InterviewService:
    def __init__(self, repo: InterviewRepository, sme_repo: SMERepository):
        self.repo = repo
        self.sme_repo = sme_repo

    async def create_interview(self, sme_id: str, data: InterviewCreate) -> Interview:
        sme = await self.sme_repo.get_by_id(sme_id)
        if not sme:
            raise_not_found("SME", sme_id)
        interview = Interview(id=new_id("int"), sme_id=sme_id, topic=data.topic)
        return await self.repo.create(interview)

    async def get_interview(self, interview_id: str) -> Interview:
        interview = await self.repo.get_by_id(interview_id)
        if not interview:
            raise_not_found("Interview", interview_id)
        return interview

    async def list_interviews(self, sme_id: str) -> list[Interview]:
        return await self.repo.list_by_sme(sme_id)

    async def get_turns(self, interview_id: str) -> list[Turn]:
        return await self.repo.get_turns(interview_id)

    async def submit_turn(self, interview_id: str, data: TurnCreate) -> tuple[Turn, UsageInfo]:
        interview = await self.get_interview(interview_id)

        # Fix 4: don't allow new turns on a completed interview
        if interview.status == "completed":
            raise HTTPException(
                status_code=409,
                detail={
                    "error": f"Interview '{interview_id}' is already completed",
                    "code": "INTERVIEW_COMPLETED",
                },
            )

        prior_turns = await self.repo.get_turns(interview_id)
        turn_number = len(prior_turns) + 1

        messages = []
        for t in prior_turns:
            messages.append({"role": "user", "content": f"SME said: {sanitize_input(t.sme_response)}"})
            if t.agent_follow_up:
                messages.append({"role": "assistant", "content": t.agent_follow_up})
        messages.append({"role": "user", "content": f"SME said: {sanitize_input(data.sme_response)}"})

        system = (
            f"You are conducting a knowledge elicitation interview with an SME. "
            f"Topic: {interview.topic}.\n\n"
            f"RULES:\n"
            f"- Ask EXACTLY ONE follow-up question per turn. Never bundle multiple "
            f"questions, never use numbered lists, never use 'and also' / 'additionally'.\n"
            f"- Keep the question focused and concise (under 30 words).\n"
            f"- Do not preface with acknowledgements like 'Great answer!' or "
            f"'Thanks for sharing.' Go straight to the question.\n"
            f"- When you have enough information, respond with exactly: {COMPLETE_SIGNAL}\n"
            f"  (no other text, no explanation — just the signal)."
        )

        # Fix 1: hard cap — after MAX_TURNS, force completion regardless of LLM output.
        # We still make the LLM call so the SME's last answer gets a closing turn, but
        # mark complete unconditionally.
        force_complete = turn_number >= MAX_TURNS

        response_text, usage = await llm_client.complete(
            system=system,
            messages=messages,
            model=MODEL_FAST,
            max_tokens=120,
            temperature=0,
        )

        # Fix 2: strict signal match — only count COMPLETE_SIGNAL when it stands alone
        # (after stripping whitespace). This prevents false positives when the LLM
        # narrates the signal phrase inside a sentence.
        llm_says_complete = response_text.strip() == COMPLETE_SIGNAL
        is_complete = llm_says_complete or force_complete
        agent_follow_up = None if is_complete else response_text

        turn = Turn(
            id=new_id("turn"),
            interview_id=interview_id,
            turn_number=turn_number,
            sme_response=data.sme_response,
            agent_follow_up=agent_follow_up,
        )
        turn = await self.repo.add_turn(turn)

        if is_complete:
            interview.status = "completed"
            await self.repo.update(interview)

        return turn, usage

    async def complete_interview(self, interview_id: str) -> Interview:
        """Fix 3: SME-initiated manual completion. Idempotent — completing an
        already-completed interview is a no-op (returns the existing record).
        """
        interview = await self.get_interview(interview_id)
        if interview.status != "completed":
            interview.status = "completed"
            interview = await self.repo.update(interview)
        return interview
