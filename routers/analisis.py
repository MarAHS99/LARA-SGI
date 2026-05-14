"""
Router: /api/analisis
Devuelve datos del dashboard con comparativa vs período anterior.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta

from database import get_db
from models import Boleta, ProductoBoleta, Compra, ProductoCompra, Pago, GastoAchurero

router = APIRouter(tags=["analisis"])

LOC_NOMBRES = {'M': 'Miramar', 'MDP': 'Mar del Plata', 'O': 'Otamendi', 'B': 'Balcarce'}


def _rango(periodo: str) -> tuple[str, str]:
    """Devuelve (fecha_desde, fecha_hasta) del período actual."""
    hoy = date.today()
    if periodo == "hoy":
        # Últimos 3 días (segunda mitad del período de 6)
        return (hoy - timedelta(days=2)).isoformat(), hoy.isoformat()
    if periodo == "semana":
        inicio = hoy - timedelta(days=hoy.weekday())
        return inicio.isoformat(), hoy.isoformat()
    if periodo == "mes":
        return hoy.replace(day=1).isoformat(), hoy.isoformat()
    if periodo == "anio":
        return hoy.replace(month=1, day=1).isoformat(), hoy.isoformat()
    return hoy.replace(day=1).isoformat(), hoy.isoformat()


def _rango_anterior(periodo: str) -> tuple[str, str]:
    """Devuelve (fecha_desde, fecha_hasta) del período anterior equivalente."""
    hoy = date.today()
    if periodo == "hoy":
        # 3 días anteriores (primera mitad del período de 6)
        fin_ant   = hoy - timedelta(days=3)
        desde_ant = hoy - timedelta(days=5)
        return desde_ant.isoformat(), fin_ant.isoformat()
    if periodo == "semana":
        inicio_esta = hoy - timedelta(days=hoy.weekday())
        fin_ant     = inicio_esta - timedelta(days=1)
        inicio_ant  = fin_ant - timedelta(days=6)
        return inicio_ant.isoformat(), fin_ant.isoformat()
    if periodo == "mes":
        primer_dia_este = hoy.replace(day=1)
        ultimo_ant      = primer_dia_este - timedelta(days=1)
        primer_dia_ant  = ultimo_ant.replace(day=1)
        return primer_dia_ant.isoformat(), ultimo_ant.isoformat()
    if periodo == "anio":
        anio_ant = hoy.year - 1
        return date(anio_ant, 1, 1).isoformat(), date(anio_ant, 12, 31).isoformat()
    return _rango_anterior("mes")


def _variacion(actual: float, anterior: float) -> float | None:
    """Variación porcentual redondeada. None si no hay base de comparación."""
    if anterior == 0:
        return None
    return round((actual - anterior) / anterior * 100, 1)


def _metricas(desde: str, hasta: str, db: Session) -> dict:
    """Calcula todas las métricas para un rango de fechas dado."""
    boletas = db.query(Boleta).filter(Boleta.fecha >= desde, Boleta.fecha <= hasta).all()
    total_ventas    = round(sum(b.total   for b in boletas), 2)
    total_debe      = round(sum(b.debe    for b in boletas), 2)
    total_entregado = round(sum(b.entrega for b in boletas), 2)
    cant_boletas    = len(boletas)

    compras = db.query(Compra).filter(Compra.fecha >= desde, Compra.fecha <= hasta).all()
    total_compras = round(sum(c.total for c in compras), 2)

    pagos = db.query(Pago).filter(Pago.fecha >= desde, Pago.fecha <= hasta).all()
    total_pagos = round(sum(p.monto for p in pagos), 2)

    gastos_ach = db.query(GastoAchurero).filter(
        GastoAchurero.fecha >= desde, GastoAchurero.fecha <= hasta
    ).all()
    total_gastos_achurero = round(sum(g.monto for g in gastos_ach), 2)

    margen      = round(total_ventas - total_compras, 2)
    margen_pct  = round((margen / total_ventas * 100), 1) if total_ventas > 0 else 0
    margen_neto = round(margen - total_gastos_achurero, 2)
    margen_neto_pct = round((margen_neto / total_ventas * 100), 1) if total_ventas > 0 else 0

    return {
        "total_ventas":           total_ventas,
        "total_debe":             total_debe,
        "total_entregado":        total_entregado,
        "cant_boletas":           cant_boletas,
        "total_compras":          total_compras,
        "total_pagos":            total_pagos,
        "total_gastos_achurero":  total_gastos_achurero,
        "margen":                 margen,
        "margen_pct":             margen_pct,
        "margen_neto":            margen_neto,
        "margen_neto_pct":        margen_neto_pct,
    }


@router.get("/analisis")
def obtener_analisis(
    periodo: str = Query(default="mes", pattern="^(hoy|semana|mes|anio)$"),
    db: Session = Depends(get_db),
):
    desde, hasta         = _rango(periodo)
    desde_ant, hasta_ant = _rango_anterior(periodo)

    actual   = _metricas(desde,     hasta,     db)
    anterior = _metricas(desde_ant, hasta_ant, db)

    # ── Variaciones ───────────────────────────────────────────
    variaciones = {k: _variacion(actual[k], anterior[k]) for k in actual}

    # ── Productos ranking ─────────────────────────────────────
    rows_prod = (
        db.query(
            ProductoBoleta.nombre,
            func.sum(ProductoBoleta.kg).label("kg"),
            func.sum(ProductoBoleta.subtotal).label("total"),
        )
        .join(Boleta, ProductoBoleta.boleta_id == Boleta.id)
        .filter(Boleta.fecha >= desde, Boleta.fecha <= hasta)
        .group_by(ProductoBoleta.nombre)
        .order_by(func.sum(ProductoBoleta.subtotal).desc())
        .all()
    )
    productos_ranking = [
        {"nombre": r.nombre, "kg": round(r.kg, 2), "total": round(r.total, 2)}
        for r in rows_prod
    ]

    # ── Ventas por localidad ──────────────────────────────────
    rows_loc = (
        db.query(
            Boleta.locacion,
            func.sum(Boleta.total).label("total"),
            func.count(Boleta.id).label("cant"),
        )
        .filter(Boleta.fecha >= desde, Boleta.fecha <= hasta)
        .group_by(Boleta.locacion)
        .order_by(func.sum(Boleta.total).desc())
        .all()
    )
    ventas_por_loc = [
        {
            "locacion": r.locacion,
            "nombre":   LOC_NOMBRES.get(r.locacion, r.locacion),
            "total":    round(r.total, 2),
            "cant":     r.cant,
        }
        for r in rows_loc
    ]

    # ── Top deudores (histórico) ──────────────────────────────
    rows_clientes = (
        db.query(Boleta.cliente, func.sum(Boleta.debe).label("debe_total"))
        .group_by(Boleta.cliente)
        .order_by(func.sum(Boleta.debe).desc())
        .limit(8)
        .all()
    )
    top_clientes = []
    for r in rows_clientes:
        # Solo pagos manuales — los automáticos ya están descontados en `debe`
        pagado = float(
            db.query(func.coalesce(func.sum(Pago.monto), 0))
            .filter(Pago.cliente == r.cliente)
            .filter(~Pago.nota.like("Entrega boleta %"))
            .scalar()
        )
        saldo = round(float(r.debe_total) - pagado, 2)
        if saldo > 0:
            top_clientes.append({"cliente": r.cliente, "saldo": saldo})
    top_clientes = sorted(top_clientes, key=lambda x: x["saldo"], reverse=True)[:8]

    # ── Deuda total general ───────────────────────────────────
    # Solo pagos manuales — los automáticos ya están descontados en `debe` de cada boleta
    total_deuda_general = round(
        float(db.query(func.coalesce(func.sum(Boleta.debe), 0)).scalar() or 0) -
        float(
            db.query(func.coalesce(func.sum(Pago.monto), 0))
            .filter(~Pago.nota.like("Entrega boleta %"))
            .scalar() or 0
        ),
        2
    )

    return {
        "periodo":             periodo,
        "desde":               desde,
        "hasta":               hasta,
        "desde_anterior":      desde_ant,
        "hasta_anterior":      hasta_ant,
        # métricas actuales
        **actual,
        "total_deuda_general": total_deuda_general,
        # métricas anteriores
        "anterior":            anterior,
        # variaciones %
        "variaciones":         variaciones,
        # rankings
        "productos_ranking":   productos_ranking,
        "ventas_por_loc":      ventas_por_loc,
        "top_clientes":        top_clientes,
    }


@router.get("/analisis/rentabilidad")
def rentabilidad_por_producto(
    periodo: str = Query(default="mes", pattern="^(hoy|semana|mes|anio)$"),
    db: Session = Depends(get_db),
):
    desde, hasta = _rango(periodo)

    # Ventas por producto en el período
    rows_ventas = (
        db.query(
            ProductoBoleta.nombre,
            func.sum(ProductoBoleta.kg).label("kg_vendido"),
            func.sum(ProductoBoleta.subtotal).label("total_vendido"),
        )
        .join(Boleta, ProductoBoleta.boleta_id == Boleta.id)
        .filter(Boleta.fecha >= desde, Boleta.fecha <= hasta)
        .group_by(ProductoBoleta.nombre)
        .all()
    )

    # Compras por producto en el período
    rows_compras = (
        db.query(
            ProductoCompra.nombre,
            func.sum(ProductoCompra.kg).label("kg_comprado"),
            func.sum(ProductoCompra.subtotal).label("total_comprado"),
        )
        .join(Compra, ProductoCompra.compra_id == Compra.id)
        .filter(Compra.fecha >= desde, Compra.fecha <= hasta)
        .group_by(ProductoCompra.nombre)
        .all()
    )

    compras_map = {
        r.nombre: {"kg": round(float(r.kg_comprado), 3), "costo": round(float(r.total_comprado), 2)}
        for r in rows_compras
    }

    resultado = []
    for r in rows_ventas:
        kg_v   = round(float(r.kg_vendido), 3)
        venta  = round(float(r.total_vendido), 2)
        compra = compras_map.get(r.nombre, {"kg": 0, "costo": 0})
        costo  = compra["costo"]
        # Precio promedio de venta y compra por kg
        px_venta  = round(venta  / kg_v,           2) if kg_v > 0       else 0
        px_compra = round(costo  / compra["kg"],    2) if compra["kg"] > 0 else 0
        margen    = round(venta - costo,            2)
        margen_pct = round(margen / venta * 100,    1) if venta > 0 else 0
        resultado.append({
            "producto":   r.nombre,
            "kg_vendido": kg_v,
            "venta":      venta,
            "costo":      costo,
            "margen":     margen,
            "margen_pct": margen_pct,
            "px_venta":   px_venta,
            "px_compra":  px_compra,
        })

    resultado.sort(key=lambda x: x["margen"], reverse=True)
    return {"periodo": periodo, "desde": desde, "hasta": hasta, "productos": resultado}


@router.get("/analisis/clientes-inactivos")
def clientes_inactivos(
    dias: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    hoy    = date.today()
    limite = (hoy - timedelta(days=dias)).isoformat()

    # Última boleta por cliente
    rows = (
        db.query(
            Boleta.cliente,
            Boleta.locacion,
            func.max(Boleta.fecha).label("ultima_boleta"),
            func.count(Boleta.id).label("total_boletas"),
            func.sum(Boleta.debe).label("deuda_acumulada"),
        )
        .group_by(Boleta.cliente, Boleta.locacion)
        .having(func.max(Boleta.fecha) < limite)
        .order_by(func.max(Boleta.fecha).asc())
        .all()
    )

    # Calcular saldo real (descontando pagos manuales)
    resultado = []
    for r in rows:
        pagado = float(
            db.query(func.coalesce(func.sum(Pago.monto), 0))
            .filter(Pago.cliente == r.cliente)
            .filter(~Pago.nota.like("Entrega boleta %"))
            .scalar()
        )
        saldo = round(float(r.deuda_acumulada or 0) - pagado, 2)
        dias_inactivo = (hoy - date.fromisoformat(r.ultima_boleta)).days
        resultado.append({
            "cliente":       r.cliente,
            "locacion":      LOC_NOMBRES.get(r.locacion, r.locacion),
            "ultima_boleta": r.ultima_boleta,
            "dias_inactivo": dias_inactivo,
            "total_boletas": r.total_boletas,
            "saldo":         saldo,
        })

    return {"dias": dias, "total": len(resultado), "clientes": resultado}