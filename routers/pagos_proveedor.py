"""
Router: /api/pagos-proveedor + /api/proveedores-cuentas
Cuentas corrientes del lado de proveedores:
  Saldo = suma(compras) - suma(pagos_proveedor)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import PagoProveedor, Compra, Proveedor
from schemas import PagoProveedorIn, PagoProveedorOut

router = APIRouter(tags=["pagos_proveedor"])


# ── Pagos ─────────────────────────────────────────────────────

@router.post("/pagos-proveedor", response_model=PagoProveedorOut, status_code=201)
def registrar_pago_proveedor(data: PagoProveedorIn, db: Session = Depends(get_db)):
    pago = PagoProveedor(
        proveedor = data.proveedor,
        monto     = data.monto,
        fecha     = data.fecha,
        nota      = data.nota or "",
    )
    db.add(pago)
    db.commit()
    db.refresh(pago)
    return pago


@router.get("/pagos-proveedor/{proveedor}", response_model=list[PagoProveedorOut])
def historial_pagos_proveedor(proveedor: str, db: Session = Depends(get_db)):
    return (
        db.query(PagoProveedor)
        .filter(PagoProveedor.proveedor == proveedor)
        .order_by(PagoProveedor.fecha.desc(), PagoProveedor.id.desc())
        .all()
    )


@router.delete("/pagos-proveedor/{pago_id}", status_code=204)
def eliminar_pago_proveedor(pago_id: int, db: Session = Depends(get_db)):
    pago = db.query(PagoProveedor).filter(PagoProveedor.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    db.delete(pago)
    db.commit()


# ── Cuentas corrientes proveedores ────────────────────────────

@router.get("/proveedores-cuentas")
def cuentas_proveedores(db: Session = Depends(get_db)):
    """
    Devuelve saldo por proveedor:
      debe  = suma de compras
      haber = suma de pagos
      saldo = debe - haber  (positivo = le debemos al proveedor)
    """
    # Todos los proveedores registrados
    proveedores = db.query(Proveedor).order_by(Proveedor.nombre).all()

    resultado = []
    total_general = 0.0

    for prov in proveedores:
        # Total compras
        total_compras = float(
            db.query(func.coalesce(func.sum(Compra.total), 0))
            .filter(Compra.proveedor == prov.nombre)
            .scalar() or 0
        )
        # Total pagado
        total_pagado = float(
            db.query(func.coalesce(func.sum(PagoProveedor.monto), 0))
            .filter(PagoProveedor.proveedor == prov.nombre)
            .scalar() or 0
        )

        saldo = round(total_compras - total_pagado, 2)
        total_general += saldo

        resultado.append({
            "proveedor":     prov.nombre,
            "total_compras": round(total_compras, 2),
            "total_pagado":  round(total_pagado, 2),
            "saldo":         saldo,
        })

    # Ordenar por saldo descendente (el que más le debemos primero)
    resultado.sort(key=lambda x: x["saldo"], reverse=True)

    return {
        "proveedores":    resultado,
        "total_general":  round(total_general, 2),
    }