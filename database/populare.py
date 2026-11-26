import logging
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Final
from urllib.parse import quote_plus

import pandas as pd
import pyodbc
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger: Final[logging.Logger] = logging.getLogger(__name__)

DATASET_DIR: Final[Path] = Path("pc-part-dataset")
SERVER_NAME: Final[str] = r"Vasi_Device\SQLEXPRESS02"
DATABASE_NAME: Final[str] = "OverClock_Store_DB"


def resolve_odbc_driver() -> str:
    installed = [d for d in pyodbc.drivers() if "SQL Server" in d]
    for preferred in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"):
        if preferred in installed:
            return preferred
    if installed:
        return installed[-1]
    raise RuntimeError(
        "Niciun driver ODBC pentru SQL Server nu este instalat pe sistem."
    )


def build_engine(server: str, database: str) -> Engine:
    driver = resolve_odbc_driver()
    # SQL Server 2022 (v16) impune criptare implicită în Driver 18; TrustServerCertificate evită eroarea SSL locală
    raw_odbc = (
        f"DRIVER={{{driver}}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        "Trusted_Connection=yes;"
        "TrustServerCertificate=yes;"
    )
    conn_url = f"mssql+pyodbc:///?odbc_connect={quote_plus(raw_odbc)}"
    return create_engine(conn_url, fast_executemany=True)


def sanitize_identifier(raw_name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "_", raw_name).lower().strip("_")
    return (
        f"col_{cleaned}"
        if cleaned and cleaned[0].isdigit()
        else (cleaned or "col_unknown")
    )


def iter_csv_files(directory: Path) -> Iterator[tuple[str, Path]]:
    for csv_path in sorted(directory.glob("*.csv")):
        yield sanitize_identifier(csv_path.stem), csv_path


def ingest_dataset(engine: Engine, directory: Path) -> None:
    if not directory.is_dir():
        raise FileNotFoundError(f"Directorul nu a fost găsit: {directory.resolve()}")

    for table_name, csv_path in iter_csv_files(directory):
        try:
            df = pd.read_csv(csv_path, low_memory=False)
            df.columns = [sanitize_identifier(str(col)) for col in df.columns]
            df.to_sql(
                name=table_name,
                con=engine,
                schema="dbo",
                if_exists="replace",
                index=False,
                chunksize=1000,
            )
            logger.info(
                "dbo.%-24s | %6d rânduri | Coloane: %s",
                table_name,
                len(df),
                list(df.columns),
            )
        except (pd.errors.ParserError, UnicodeDecodeError) as err:
            logger.error("Eroare la citirea CSV %s: %s", csv_path.name, err)
        except (SQLAlchemyError, pyodbc.Error) as err:
            logger.error("Eroare la scrierea în dbo.%s: %s", table_name, err)


if __name__ == "__main__":
    sql_engine = build_engine(SERVER_NAME, DATABASE_NAME)
    ingest_dataset(sql_engine, DATASET_DIR)
    with sql_engine.connect() as conn:
        table_count = conn.execute(
            text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"
            )
        ).scalar_one()
        logger.info("Total tabele în %s: %d", DATABASE_NAME, table_count)
