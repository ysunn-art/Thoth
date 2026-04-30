from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    benchmark_api_key: str
    openrouter_api_key: str
    upload_dir: str = "./uploads"
    embedding_dim: int = 384

    class Config:
        env_file = ".env"


settings = Settings()
