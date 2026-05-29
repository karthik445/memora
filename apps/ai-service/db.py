import os
import psycopg2
from psycopg2.extras import RealDictCursor


def get_db():
    conn = psycopg2.connect(
        os.environ.get("DATABASE_URL", "postgresql://memora_user:memora_password@localhost:5432/memora_db"),
        cursor_factory=RealDictCursor,
    )
    conn.autocommit = False
    return conn
