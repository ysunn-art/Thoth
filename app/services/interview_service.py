from app.repositories.interview_repo import InterviewRepository
from app.repositories.sme_repo import SMERepository
from app.models.db.interview import Interview
from app.models.db.turn import Turn
from app.models.schemas.interview import InterviewCreate, TurnCreate
from app.services.llm_client import llm_client, UsageInfo
from app.core.ids import new_id
from app.core.errors import raise_not_found

COMPLETE_SIGNAL = "[INTERVIEW_COMPLETE]"


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
        prior_turns = await self.repo.get_turns(interview_id)
        turn_number = len(prior_turns) + 1

        messages = []
        for t in prior_turns:
            messages.append({"role": "user", "content": f"SME said: {t.sme_response}"})
            if t.agent_follow_up:
                messages.append({"role": "assistant", "content": t.agent_follow_up})
        messages.append({"role": "user", "content": f"SME said: {data.sme_response}"})

        system = (
            f"You are conducting a knowledge elicitation interview with an SME. "
            f"Topic: {interview.topic}. Ask focused follow-up questions to extract detailed knowledge. "
            f"When you have enough information, respond with exactly: {COMPLETE_SIGNAL}"
        )

        response_text, usage = await llm_client.complete(system=system, messages=messages)

        is_complete = COMPLETE_SIGNAL in response_text
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
