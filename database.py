"""
Database configuration — SQLAlchemy + SQLite
Migrate to PostgreSQL later by changing DATABASE_URL only.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# En producción (.exe) la ruta viene del launcher via variable de entorno
# En desarrollo usa el archivo local
_db_path = os.environ.get('LARA_DB_PATH', './lara.db')
DATABASE_URL = f"sqlite:///{_db_path}"

# PostgreSQL (producción):
# DATABASE_URL = "postgresql://user:password@localhost/lara"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # solo necesario para SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    """Dependency para inyectar la sesión en cada endpoint."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Crea todas las tablas si no existen."""
    from models import (
        Boleta, ProductoBoleta,
        Compra, ProductoCompra,
        Precio, PrecioCliente,
        Pago, Cliente, Proveedor,
        Producto, StockManual,
        Achurero, PagoProveedor,
    )
    Base.metadata.create_all(bind=engine)