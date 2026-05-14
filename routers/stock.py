"""
Router: /api/stock

IMPORTANTE: las rutas específicas (/stock/manual) deben ir ANTES
de las rutas con parámetros (/stock/{x}) para evitar que FastAPI
interprete "manual" como un parámetro de ruta.

Lógica de stock teórico por producto:
  1. Buscar el último StockManual para ese producto (fecha más reciente)
  2. Sumar kg de compras POSTERIORES a esa fecha
  3. Restar kg de ventas (boletas) POSTERIORES a esa fecha
  Si no hay registro manual → punto de partida 0, usa toda la historia
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import StockManual, ProductoCompra, Compra, ProductoBoleta, Boleta, Producto
from schemas import StockManualIn, StockManualOut, StockProductoOut

router = APIRouter(tags=["stock"])


def _nombres_productos_ordenados(db: Session) -> list[str]:
    """Obtiene la lista de productos en el orden definido en la tabla productos."""
    productos = db.query(Producto).order_by(Producto.orden, Producto.id).all()
    if productos:
        return [p.nombre for p in productos]
    # Fallback si la tabla aún no tiene datos
    return [
        'Hígado','Corazón','Lengua','Riñón','Sesos',
        'Chinchulin','Tripas rueda','Molleja','Rabo',
        'C. de entraña','Quijada','Mondongo','Carne chica','Otros'
    ]


def _calcular_stock_producto(producto: str, db: Session) -> StockProductoOut:
    # 1. Último ingreso manual
    ultimo = (
        db.query(StockManual)
        .filter(StockManual.producto == producto)
        .order_by(StockManual.fecha.desc(), StockManual.id.desc())
        .first()
    )

    kg_base          = float(ultimo.kg_real) if ultimo else 0.0
    fecha_corte      = ultimo.fecha          if ultimo else None

    # 2. Compras posteriores
    q_compras = (
        db.query(func.coalesce(func.sum(ProductoCompra.kg), 0.0))
        .join(Compra, ProductoCompra.compra_id == Compra.id)
        .filter(ProductoCompra.nombre == producto)
    )
    if fecha_corte:
        q_compras = q_compras.filter(Compra.fecha > fecha_corte)
    kg_comprado = float(q_compras.scalar() or 0)

    # 3. Ventas posteriores
    q_ventas = (
        db.query(func.coalesce(func.sum(ProductoBoleta.kg), 0.0))
        .join(Boleta, ProductoBoleta.boleta_id == Boleta.id)
        .filter(ProductoBoleta.nombre == producto)
    )
    if fecha_corte:
        q_ventas = q_ventas.filter(Boleta.fecha > fecha_corte)
    kg_vendido = float(q_ventas.scalar() or 0)

    return StockProductoOut(
        producto             = producto,
        kg_teorico           = round(kg_base + kg_comprado - kg_vendido, 3),
        kg_ultimo_manual     = kg_base,
        fecha_ultimo_manual  = fecha_corte,
    )


# ── IMPORTANTE: ruta específica ANTES que ruta genérica ──────

@router.get("/stock/manual", response_model=list[StockManualOut])
def historial_stock_manual(db: Session = Depends(get_db)):
    """Historial de todos los conteos manuales, más reciente primero."""
    return (
        db.query(StockManual)
        .order_by(StockManual.fecha.desc(), StockManual.id.desc())
        .all()
    )


@router.post("/stock/manual", response_model=list[StockManualOut], status_code=201)
def guardar_stock_manual(items: list[StockManualIn], db: Session = Depends(get_db)):
    """
    Guarda conteos manuales. Acepta array:
    [{ "fecha": "2026-04-01", "producto": "Hígado", "kg_real": 12.5 }, ...]
    Solo guarda las filas que se envíen (el front filtra las vacías).
    """
    if not items:
        return []

    creados = []
    for item in items:
        registro = StockManual(
            fecha    = item.fecha,
            producto = item.producto,
            kg_real  = item.kg_real,
        )
        db.add(registro)
        creados.append(registro)

    db.commit()
    for r in creados:
        db.refresh(r)
    return creados


@router.get("/stock", response_model=list[StockProductoOut])
def obtener_stock(db: Session = Depends(get_db)):
    """Stock teórico calculado para todos los productos, en orden definido."""
    nombres = _nombres_productos_ordenados(db)
    return [_calcular_stock_producto(n, db) for n in nombres]