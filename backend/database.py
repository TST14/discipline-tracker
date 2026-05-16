from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from pydantic_settings import BaseSettings

# Always resolve .env relative to this file, regardless of cwd
_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    database_url: str

    class Config:
        env_file = str(_ENV_FILE)


settings = Settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,  # recycle connections every 30 min to avoid stale sockets
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
