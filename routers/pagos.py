"""
Router: /api/pagos
Registrar y consultar pagos de clientes.
"""

from fastapi import APIRouter, Depends, HTTPException, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Pago
from schemas import PagoIn, PagoOut

router = APIRouter(tags=["pagos"])


@router.post("/pagos", response_model=PagoOut, status_code=201)
def registrar_pago(data: PagoIn, db: Session = Depends(get_db)):
    pago = Pago(
        cliente  = data.cliente,
        locacion = data.locacion,
        monto    = data.monto,
        fecha    = data.fecha,
        nota     = data.nota or "",
    )
    db.add(pago)
    db.commit()
    db.refresh(pago)
    return pago


@router.get("/pagos/{cliente}", response_model=list[PagoOut])
def historial_pagos(cliente: str, db: Session = Depends(get_db)):
    return (
        db.query(Pago)
        .filter(Pago.cliente == cliente)
        .order_by(Pago.fecha.desc(), Pago.id.desc())
        .all()
    )


@router.delete("/pagos/{pago_id}", status_code=204)
def eliminar_pago(pago_id: int, db: Session = Depends(get_db)):
    pago = db.query(Pago).filter(Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    db.delete(pago)
    db.commit()