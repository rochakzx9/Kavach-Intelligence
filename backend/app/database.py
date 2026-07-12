import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Dynamically load DATABASE_URL or fallback to local SQLite DB
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'kavach.db'))
    DATABASE_URL = f"sqlite:///{db_path}"

# Standardize Render's postgres:// URI scheme to postgresql:// required by SQLAlchemy 2
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

SQLALCHEMY_DATABASE_URL = DATABASE_URL

# SQLite requires check_same_thread=False for multi-threading; PostgreSQL does not support it
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,  # Ensures disconnected connections are checked and re-opened
        pool_recycle=3600    # Prevent stale connections on Render database restarts
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

