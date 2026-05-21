import asyncio
import logging
from dataclasses import dataclass
from functools import lru_cache
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

MODEL_FAST = "anthropic/claude-haiku-4.5"   # interviews, routing
MODEL_SMART = "anthropic/claude-sonnet-4.5"  # synthesis, Q&A

LLM_TIMEOUT = 30  # seconds — enough for long synthesis, fails fast on hangs


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


@lru_cache(maxsize=1)
def _get_embedding_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2")


class LLMClient:
    def __init__(self):
        self._client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key,
            timeout=LLM_TIMEOUT,
        )

    async def complete(
        self,
        system: str,
        messages: list,
        max_tokens: int = 2048,
        model: str = MODEL_SMART,
    ) -> tuple[str, UsageInfo]:
        all_messages = ([{"role": "system", "content": system}] if system else []) + messages
        response = await self._client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=all_messages,
        )
        u = response.usage
        usage = UsageInfo(
            prompt_tokens=u.prompt_tokens,
            completion_tokens=u.completion_tokens,
            total_tokens=u.total_tokens,
            model=model,
        )
        logger.info("llm_complete model=%s prompt_tokens=%d completion_tokens=%d",
                    model, u.prompt_tokens, u.completion_tokens)
        return response.choices[0].message.content, usage

    async def embed(self, texts: list[str]) -> list[list[float]]:
        model = _get_embedding_model()
        embeddings = await asyncio.to_thread(model.encode, texts)
        return embeddings.tolist()

    async def embed_one(self, text: str) -> list[float]:
        return (await self.embed([text]))[0]


llm_client = LLMClient()
