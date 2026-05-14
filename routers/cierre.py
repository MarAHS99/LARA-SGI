"""
Router: /api/cierre
Genera el resumen del cierre del día para una fecha dada.
Estructura inspirada en la pestaña TOTAL del Excel de la empresa.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date

from database import get_db
from models import Boleta, ProductoBoleta, Pago, GastoAchurero

router = APIRouter(tags=["cierre"])

LOC_NOMBRES = {'M': 'Miramar', 'MDP': 'Mar del Plata', 'O': 'Otamendi', 'B': 'Balcarce'}
LOC_ORDER   = ['M', 'MDP', 'O', 'B']


@router.get("/cierre")
def cierre_diario(
    fecha_desde: str = Query(default=None),
    fecha_hasta: str = Query(default=None),
    db: Session = Depends(get_db),
):
    hoy = date.today().isoformat()
    if not fecha_desde:
        fecha_desde = hoy
    if not fecha_hasta:
        fecha_hasta = fecha_desde

    # ── Boletas del rango ─────────────────────────────────────
    boletas = (
        db.query(Boleta)
        .filter(Boleta.fecha >= fecha_desde, Boleta.fecha <= fecha_hasta)
        .order_by(Boleta.locacion, Boleta.cliente)
        .all()
    )

    # ── Pagos del rango (incluyendo entregas automáticas) ─────
    pagos_rango = db.query(Pago).filter(Pago.fecha >= fecha_desde, Pago.fecha <= fecha_hasta).all()
    # Pagos manuales del rango agrupados por cliente
    pagos_manuales_por_cliente: dict[str, float] = {}
    for p in pagos_rango:
        if not (p.nota or '').startswith('Entrega boleta'):
            pagos_manuales_por_cliente[p.cliente] = (
                pagos_manuales_por_cliente.get(p.cliente, 0.0) + (p.monto or 0)
            )
    pagos_manuales_imputados: set[str] = set()

    # ── Detalle por localidad → cliente ───────────────────────
    locaciones = []
    total_general_ventas    = 0.0
    total_general_cobrado   = 0.0
    total_general_pendiente = 0.0

    locs_presentes = sorted(set(b.locacion for b in boletas), key=lambda l: LOC_ORDER.index(l) if l in LOC_ORDER else 99)

    for loc in locs_presentes:
        bols_loc = [b for b in boletas if b.locacion == loc]
        clientes_loc = []

        for b in bols_loc:
            # Pagos manuales se imputan una sola vez por cliente (en su primera boleta del día)
            entrega_boleta = b.entrega or 0
            if b.cliente not in pagos_manuales_imputados:
                pagos_man_cliente = pagos_manuales_por_cliente.get(b.cliente, 0.0)
                pagos_manuales_imputados.add(b.cliente)
            else:
                pagos_man_cliente = 0.0
            cobrado    = round(entrega_boleta + pagos_man_cliente, 2)
            pendiente  = round(b.debe or 0, 2)

            clientes_loc.append({
                "cliente":   b.cliente,
                "boleta_id": b.id,
                "total":     round(b.total or 0, 2),
                "entrega":   round(entrega_boleta, 2),
                "cobrado":   cobrado,
                "pendiente": pendiente,
                "achurero":  b.achurero or "",
            })

        subtotal_ventas    = round(sum(c["total"]     for c in clientes_loc), 2)
        subtotal_cobrado   = round(sum(c["cobrado"]   for c in clientes_loc), 2)
        subtotal_pendiente = round(sum(c["pendiente"] for c in clientes_loc), 2)

        locaciones.append({
            "locacion":           loc,
            "nombre":             LOC_NOMBRES.get(loc, loc),
            "clientes":           clientes_loc,
            "subtotal_ventas":    subtotal_ventas,
            "subtotal_cobrado":   subtotal_cobrado,
            "subtotal_pendiente": subtotal_pendiente,
        })

        total_general_ventas    += subtotal_ventas
        total_general_cobrado   += subtotal_cobrado
        total_general_pendiente += subtotal_pendiente

    # ── Resumen por producto ──────────────────────────────────
    rows = (
        db.query(
            ProductoBoleta.nombre,
            func.sum(ProductoBoleta.kg).label("kg"),
            func.sum(ProductoBoleta.subtotal).label("total"),
        )
        .join(Boleta, ProductoBoleta.boleta_id == Boleta.id)
        .filter(Boleta.fecha >= fecha_desde, Boleta.fecha <= fecha_hasta)
        .group_by(ProductoBoleta.nombre)
        .order_by(func.sum(ProductoBoleta.subtotal).desc())
        .all()
    )
    productos = [
        {"nombre": r.nombre, "kg": round(r.kg, 2), "total": round(r.total, 2)}
        for r in rows
    ]

    # ── Cant boletas ──────────────────────────────────────────
    cant_boletas = len(boletas)

    # ── Gastos de achureros del rango ────────────────────────
    gastos_rows = (
        db.query(GastoAchurero)
        .filter(GastoAchurero.fecha >= fecha_desde, GastoAchurero.fecha <= fecha_hasta)
        .order_by(GastoAchurero.fecha.desc())
        .all()
    )
    gastos_achurero = [
        {"id": g.id, "fecha": g.fecha, "achurero": g.achurero,
         "monto": round(g.monto, 2), "locacion": g.locacion or "", "nota": g.nota or ""}
        for g in gastos_rows
    ]
    total_gastos_achurero = round(sum(g.monto for g in gastos_rows), 2)

    # Compras del rango
    from models import Compra
    from sqlalchemy import func as _func
    total_compras_rango = round(float(
        db.query(_func.coalesce(_func.sum(Compra.total), 0))
        .filter(Compra.fecha >= fecha_desde, Compra.fecha <= fecha_hasta)
        .scalar() or 0
    ), 2)

    return {
        "fecha_desde":               fecha_desde,
        "fecha_hasta":               fecha_hasta,
        "cant_boletas":              cant_boletas,
        "total_general_ventas":      round(total_general_ventas, 2),
        "total_general_cobrado":     round(total_general_cobrado, 2),
        "total_general_pendiente":   round(total_general_pendiente, 2),
        "total_gastos_achurero":     total_gastos_achurero,
        "total_compras":             total_compras_rango,
        "total_neto":                round(total_general_ventas - total_compras_rango - total_gastos_achurero, 2),
        "locaciones":                locaciones,
        "productos":                 productos,
        "gastos_achurero":           gastos_achurero,
    }