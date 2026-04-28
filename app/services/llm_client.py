from dataclasses import dataclass
import anthropic
from openai import AsyncOpenAI
from app.config import settings


@dataclass
class UsageInfo:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    model: str

    def __add__(self, other: "UsageInfo") -> "UsageInfo":
        return UsageInfo(
            prompt_tokens=self.prompt_tokens + other.prompt_tokens,
            completion_tokens=self.completion_tokens + other.completion_tokens,
            total_tokens=self.total_tokens + other.total_tokens,
            model=self.model,
        )


class LLMClient:
    MODEL = "claude-sonnet-4-20250514"
    EMBED_MODEL = "text-embedding-3-small"

    def __init__(self):
        self._claude = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self._openai = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    async def complete(self, system: str, messages: list, max_tokens: int = 2048) -> tuple[str, UsageInfo]:
        response = await self._claude.messages.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        usage = UsageInfo(
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
            total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            model=self.MODEL,
        )
        return response.content[0].text, usage

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not self._openai:
            raise RuntimeError("OPENAI_API_KEY not set — required for embeddings")
        response = await self._openai.embeddings.create(model=self.EMBED_MODEL, input=texts)
        return [item.embedding for item in response.data]

    async def embed_one(self, text: str) -> list[float]:
        embeddings = await self.embed([text])
        return embeddings[0]


llm_client = LLMClient()
