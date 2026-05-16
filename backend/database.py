from pathlib import Path
import socket
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from pydantic_settings import BaseSettings

# Always resolve .env relative to this file, regardless of cwd
_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    database_url: str

    model_config = {
        "extra": "ignore",
        "env_file": str(_ENV_FILE),
    }


settings = Settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,  # recycle connections every 30 min to avoid stale sockets
    connect_args={
        "tcp_keepalives": True,
        "tcp_keepalives_idle": 30,
        "options": "-c application_name=discipline_tracker",
    },
)


# Force IPv4-only DNS resolution for psycopg2
@event.listens_for(engine, "connect")
def receive_connect(dbapi_conn, connection_record):
    # This ensures IPv4 is preferred during connection establishment
    dbapi_conn.set_isolation_level(0)


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
