from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    benchmark_api_key: str
    anthropic_api_key: str
    openai_api_key: str = ""
    upload_dir: str = "./uploads"
    embedding_dim: int = 1536

    class Config:
        env_file = ".env"


settings = Settings()
