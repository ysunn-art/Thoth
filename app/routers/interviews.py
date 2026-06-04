from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.auth import (
    get_current_user, require_sme_owner_or_admin,
)
from app.core.errors import raise_forbidden, raise_not_found
from app.models.schemas.interview import (
    InterviewCreate, InterviewResponse, InterviewListResponse,
    TurnCreate, TurnResponse, TurnSummary, InterviewTranscript,
    InterviewSummary, UsageInfo,
)
from app.models.schemas.user import CurrentUser
from app.services.interview_service import InterviewService
from app.repositories.interview_repo import InterviewRepository
from app.repositories.sme_repo import SMERepository

# Reads require any authenticated user; writes get per-route ownership checks.
router = APIRouter(dependencies=[Depends(get_current_user)])


def _interview_response(interview) -> InterviewResponse:
    return InterviewResponse(
        interview_id=interview.id,
        sme_id=interview.sme_id,
        topic=interview.topic,
        status=interview.status,
        created_at=interview.created_at.isoformat(),
    )


def _interview_summary(interview) -> InterviewSummary:
    return InterviewSummary(
        interview_id=interview.id,
        topic=interview.topic,
        status=interview.status,
        created_at=interview.created_at.isoformat(),
    )


def _turn_response(turn, usage=None) -> TurnResponse:
    return TurnResponse(
        turn_number=turn.turn_number,
        sme_response=turn.sme_response,
        agent_follow_up=turn.agent_follow_up,
        timestamp=turn.timestamp.isoformat(),
        usage=UsageInfo(
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
            model=usage.model,
        ) if usage else None,
    )


def _turn_summary(turn) -> TurnSummary:
    return TurnSummary(
        turn_number=turn.turn_number,
        sme_response=turn.sme_response,
        agent_follow_up=turn.agent_follow_up,
        timestamp=turn.timestamp.isoformat(),
    )


@router.get("/smes/{sme_id}/interviews", response_model=InterviewListResponse)
async def list_interviews(sme_id: str, db: AsyncSession = Depends(get_db)):
    service = InterviewService(InterviewRepository(db), SMERepository(db))
    interviews = await service.list_interviews(sme_id)
    return InterviewListResponse(interviews=[_interview_summary(i) for i in interviews])


@router.post(
    "/smes/{sme_id}/interviews",
    status_code=201,
    response_model=InterviewResponse,
    dependencies=[Depends(require_sme_owner_or_admin)],
)
async def create_interview(sme_id: str, data: InterviewCreate, db: AsyncSession = Depends(get_db)):
    service = InterviewService(InterviewRepository(db), SMERepository(db))
    interview = await service.create_interview(sme_id, data)
    return _interview_response(interview)


@router.post("/interviews/{interview_id}/turns", response_model=TurnResponse)
async def submit_turn(
    interview_id: str,
    data: TurnCreate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    # Look up the interview to discover its sme_id, then apply ownership check.
    interview = await InterviewRepository(db).get_by_id(interview_id)
    if not interview:
        raise_not_found("Interview", interview_id)
    if not user.is_admin and not (user.is_sme and user.sme_id == interview.sme_id):
        raise_forbidden(f"Not allowed to act on interview '{interview_id}'")

    service = InterviewService(InterviewRepository(db), SMERepository(db))
    turn, usage = await service.submit_turn(interview_id, data)
    return _turn_response(turn, usage)


@router.post("/interviews/{interview_id}/complete", response_model=InterviewResponse)
async def complete_interview(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """SME-initiated manual completion. The SME (or admin) marks the interview
    as completed without going through another LLM turn. Idempotent."""
    interview = await InterviewRepository(db).get_by_id(interview_id)
    if not interview:
        raise_not_found("Interview", interview_id)
    if not user.is_admin and not (user.is_sme and user.sme_id == interview.sme_id):
        raise_forbidden(f"Not allowed to act on interview '{interview_id}'")

    service = InterviewService(InterviewRepository(db), SMERepository(db))
    interview = await service.complete_interview(interview_id)
    return _interview_response(interview)


@router.get("/interviews/{interview_id}", response_model=InterviewTranscript)
async def get_interview(interview_id: str, db: AsyncSession = Depends(get_db)):
    service = InterviewService(InterviewRepository(db), SMERepository(db))
    interview = await service.get_interview(interview_id)
    turns = await service.get_turns(interview_id)
    return InterviewTranscript(
        interview_id=interview.id,
        sme_id=interview.sme_id,
        topic=interview.topic,
        status=interview.status,
        turns=[_turn_summary(t) for t in turns],
    )
