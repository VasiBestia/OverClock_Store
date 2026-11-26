import logging
from typing import Final, Literal
from urllib.parse import quote_plus

import pyodbc
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger: Final[logging.Logger] = logging.getLogger(__name__)

SERVER_NAME: Final[str] = r"Vasi_Device\SQLEXPRESS02"
DATABASE_NAME: Final[str] = "OverClock_Store_DB"


def resolve_odbc_driver() -> str:
    installed = [d for d in pyodbc.drivers() if "SQL Server" in d]
    for preferred in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"):
        if preferred in installed:
            return preferred
    if installed:
        return installed[-1]
    raise RuntimeError("Driverul ODBC pentru SQL Server lipsește.")


def build_engine() -> Engine:
    driver = resolve_odbc_driver()
    raw_odbc = (
        f"DRIVER={{{driver}}};"
        f"SERVER={SERVER_NAME};"
        f"DATABASE={DATABASE_NAME};"
        "Trusted_Connection=yes;"
        "TrustServerCertificate=yes;"
    )
    return create_engine(f"mssql+pyodbc:///?odbc_connect={quote_plus(raw_odbc)}", pool_pre_ping=True)


engine: Final[Engine] = build_engine()
app = FastAPI(title="OverClock Store API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProductOut(BaseModel):
    product_id: int
    name: str
    category_slug: str
    category_name: str
    price_ron: float
    old_price_ron: float
    stock_qty: int
    image_url: str


class BuildRequest(BaseModel):
    budget_ron: float = Field(ge=2500, le=60000)
    use_case: Literal["gaming", "workstation"] = "gaming"
    preferred_socket: str | None = Field(default="AM5")


class BuildComponent(BaseModel):
    role: str
    product_id: int
    name: str
    price_ron: float
    image_url: str
    meta: str


class BuildResponse(BaseModel):
    socket: str
    total_price_ron: float
    remaining_budget_ron: float
    components: list[BuildComponent]


@app.get("/api/categories")
def list_categories() -> list[dict[str, object]]:
    query = text("""
        SELECT c.category_id, c.slug, c.display_name, c.default_image, COUNT(p.product_id) AS product_count
        FROM dbo.categories c
        INNER JOIN dbo.products p ON c.category_id = p.category_id
        WHERE p.is_active = 1
        GROUP BY c.category_id, c.slug, c.display_name, c.default_image
        ORDER BY product_count DESC
    """)
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()
    return [dict(r) for r in rows]


@app.get("/api/products", response_model=list[ProductOut])
def list_products(
    category: str | None = Query(default=None),
    search: str | None = Query(default=None, min_length=2),
    limit: int = Query(default=8, ge=1, le=60),
) -> list[ProductOut]:
    clauses = ["p.is_active = 1"]
    params: dict[str, object] = {"limit": limit}

    if category:
        clauses.append("c.slug = :category")
        params["category"] = category.strip().lower()
    if search:
        clauses.append("p.name LIKE :search")
        params["search"] = f"%{search.strip()}%"

    query = text(f"""
        SELECT TOP (:limit)
            p.product_id,
            p.name,
            c.slug AS category_slug,
            c.display_name AS category_name,
            CAST(p.price_ron AS FLOAT) AS price_ron,
            CAST(ROUND(p.price_ron * 1.12, 2) AS FLOAT) AS old_price_ron,
            p.stock_qty,
            p.image_url
        FROM dbo.products p
        INNER JOIN dbo.categories c ON p.category_id = c.category_id
        WHERE {" AND ".join(clauses)}
        ORDER BY p.price_ron DESC
    """)

    try:
        with engine.connect() as conn:
            rows = conn.execute(query, params).mappings().all()
        return [ProductOut(**dict(r)) for r in rows]
    except SQLAlchemyError as err:
        logger.error("Eroare interogare produse: %s", err)
        raise HTTPException(status_code=500, detail="Eroare la citirea produselor.") from err


@app.post("/api/configure-pc", response_model=BuildResponse)
def configure_pc(payload: BuildRequest) -> BuildResponse:
    # Alocare procentuală a bugetului în funcție de destinația sistemului
    weights: dict[str, float] = (
        {"gpu": 0.38, "cpu": 0.22, "mb": 0.13, "ram": 0.08, "ssd": 0.07, "psu": 0.06, "case": 0.06}
        if payload.use_case == "gaming"
        else {"gpu": 0.26, "cpu": 0.32, "mb": 0.14, "ram": 0.10, "ssd": 0.07, "psu": 0.06, "case": 0.05}
    )
    socket_code = (payload.preferred_socket or "AM5").upper()
    ram_gen = "DDR4" if socket_code in {"AM4", "LGA1200", "LGA1151"} else "DDR5"

    try:
        with engine.connect() as conn:
            cpu_row = conn.execute(
                text("""
                    SELECT TOP 1 p.product_id, p.name, CAST(p.price_ron AS FLOAT) AS price_ron,
                           p.image_url, s.socket_id, s.socket_code,
                           CONCAT(c.core_count, ' Cores | ', c.tdp, 'W TDP') AS meta
                    FROM dbo.products p
                    INNER JOIN dbo.cpu c ON p.source_table = 'cpu' AND p.source_row_id = c.id
                    INNER JOIN dbo.sockets s ON c.socket_id = s.socket_id
                    WHERE p.is_active = 1 AND s.socket_code = :sc AND p.price_ron <= :max_p
                    ORDER BY p.price_ron DESC
                """),
                {"sc": socket_code, "max_p": payload.budget_ron * weights["cpu"]},
            ).mappings().first()

            if not cpu_row:
                raise HTTPException(status_code=404, detail=f"Nu există procesor pe {socket_code} în acest buget.")

            mb_row = conn.execute(
                text("""
                    SELECT TOP 1 p.product_id, p.name, CAST(p.price_ron AS FLOAT) AS price_ron,
                           p.image_url, m.form_factor_id, ff.code AS ff_code
                    FROM dbo.products p
                    INNER JOIN dbo.motherboard m ON p.source_table = 'motherboard' AND p.source_row_id = m.id
                    INNER JOIN dbo.form_factors ff ON m.form_factor_id = ff.form_factor_id
                    WHERE p.is_active = 1 AND m.socket_id = :sid AND p.price_ron <= :max_p
                    ORDER BY p.price_ron DESC
                """),
                {"sid": cpu_row["socket_id"], "max_p": payload.budget_ron * weights["mb"]},
            ).mappings().first()

            if not mb_row:
                raise HTTPException(status_code=404, detail="Nu s-a găsit placă de bază compatibilă.")

            gpu_row = conn.execute(
                text("""
                    SELECT TOP 1 p.product_id, p.name, CAST(p.price_ron AS FLOAT) AS price_ron,
                           p.image_url, CONCAT(v.chipset, ' | ', v.memory, 'GB VRAM') AS meta
                    FROM dbo.products p
                    INNER JOIN dbo.video_card v ON p.source_table = 'video_card' AND p.source_row_id = v.id
                    WHERE p.is_active = 1 AND p.price_ron <= :max_p
                    ORDER BY p.price_ron DESC
                """),
                {"max_p": payload.budget_ron * weights["gpu"]},
            ).mappings().first()

            ram_row = conn.execute(
                text("""
                    SELECT TOP 1 p.product_id, p.name, CAST(p.price_ron AS FLOAT) AS price_ron,
                           p.image_url, CONCAT(mt.ram_generation, ' | ', m.modules) AS meta
                    FROM dbo.products p
                    INNER JOIN dbo.memory m ON p.source_table = 'memory' AND p.source_row_id = m.id
                    INNER JOIN dbo.memory_types mt ON m.memory_type_id = mt.memory_type_id
                    WHERE p.is_active = 1 AND mt.ram_generation = :rg AND p.price_ron <= :max_p
                    ORDER BY p.price_ron DESC
                """),
                {"rg": ram_gen, "max_p": payload.budget_ron * weights["ram"]},
            ).mappings().first()

            ssd_row = conn.execute(
                text("""
                    SELECT TOP 1 p.product_id, p.name, CAST(p.price_ron AS FLOAT) AS price_ron,
                           p.image_url, CONCAT(d.capacity, 'GB | ', d.interface) AS meta
                    FROM dbo.products p
                    INNER JOIN dbo.internal_hard_drive d ON p.source_table = 'internal_hard_drive' AND p.source_row_id = d.id
                    WHERE p.is_active = 1 AND p.price_ron <= :max_p
                    ORDER BY p.price_ron DESC
                """),
                {"max_p": payload.budget_ron * weights["ssd"]},
            ).mappings().first()

            psu_row = conn.execute(
                text("""
                    SELECT TOP 1 p.product_id, p.name, CAST(p.price_ron AS FLOAT) AS price_ron,
                           p.image_url, CONCAT(ps.wattage, 'W | ', ps.efficiency) AS meta
                    FROM dbo.products p
                    INNER JOIN dbo.power_supply ps ON p.source_table = 'power_supply' AND p.source_row_id = ps.id
                    WHERE p.is_active = 1 AND p.price_ron <= :max_p
                    ORDER BY p.price_ron DESC
                """),
                {"max_p": payload.budget_ron * weights["psu"]},
            ).mappings().first()

            case_row = conn.execute(
                text("""
                    SELECT TOP 1 p.product_id, p.name, CAST(p.price_ron AS FLOAT) AS price_ron,
                           p.image_url, CAST(cs.type AS NVARCHAR(60)) AS meta
                    FROM dbo.products p
                    INNER JOIN dbo.cases cs ON p.source_table = 'cases' AND p.source_row_id = cs.id
                    WHERE p.is_active = 1 AND cs.form_factor_id = :ffid AND p.price_ron <= :max_p
                    ORDER BY p.price_ron DESC
                """),
                {"ffid": mb_row["form_factor_id"], "max_p": payload.budget_ron * weights["case"]},
            ).mappings().first()

    except SQLAlchemyError as err:
        logger.error("Eroare configurator PC: %s", err)
        raise HTTPException(status_code=500, detail="Eroare SQL la generarea configurației.") from err

    selected: list[BuildComponent] = []
    candidates = [
        ("Processor", cpu_row, cpu_row["meta"] if cpu_row else ""),
        ("Motherboard", mb_row, f"{socket_code} | {mb_row['ff_code']}" if mb_row else ""),
        ("Graphics Card", gpu_row, gpu_row["meta"] if gpu_row else ""),
        ("Memory (RAM)", ram_row, ram_row["meta"] if ram_row else ""),
        ("Storage", ssd_row, ssd_row["meta"] if ssd_row else ""),
        ("Power Supply", psu_row, psu_row["meta"] if psu_row else ""),
        ("PC Case", case_row, case_row["meta"] if case_row else ""),
    ]

    for role, row, meta_text in candidates:
        if row:
            selected.append(
                BuildComponent(
                    role=role,
                    product_id=row["product_id"],
                    name=row["name"],
                    price_ron=row["price_ron"],
                    image_url=row["image_url"],
                    meta=meta_text,
                )
            )

    total = round(sum(c.price_ron for c in selected), 2)
    return BuildResponse(
        socket=socket_code,
        total_price_ron=total,
        remaining_budget_ron=round(payload.budget_ron - total, 2),
        components=selected,
    )