"""
Router: /api/gastos-achurero
Registro de gastos por jornada de achureros.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Optional
from pydantic import BaseModel, Field
from typing import Annotated

from database import get_db
from models import GastoAchurero

router = APIRouter(tags=["gastos_achurero"])

LOC_NOMBRES = {'M': 'Miramar', 'MDP': 'Mar del Plata', 'O': 'Otamendi', 'B': 'Balcarce'}


class GastoAchurero_In(BaseModel):
    fecha:    str
    achurero: Annotated[str, Field(min_length=1, max_length=100)]
    monto:    float
    locacion: Optional[Annotated[str, Field(max_length=10)]] = ""
    nota:     Optional[Annotated[str, Field(max_length=300)]] = ""


@router.get("/gastos-achurero")
def listar_gastos(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    achurero:    Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(GastoAchurero)
    if fecha_desde: q = q.filter(GastoAchurero.fecha >= fecha_desde)
    if fecha_hasta: q = q.filter(GastoAchurero.fecha <= fecha_hasta)
    if achurero:    q = q.filter(GastoAchurero.achurero == achurero)
    rows = q.order_by(GastoAchurero.fecha.desc(), GastoAchurero.id.desc()).all()
    return [
        {
            "id":       r.id,
            "fecha":    r.fecha,
            "achurero": r.achurero,
            "monto":    r.monto,
            "locacion": r.locacion or "",
            "nota":     r.nota or "",
        }
        for r in rows
    ]


@router.post("/gastos-achurero", status_code=201)
def crear_gasto(data: GastoAchurero_In, db: Session = Depends(get_db)):
    if data.monto <= 0:
        raise HTTPException(status_code=422, detail="El monto debe ser mayor a 0")
    g = GastoAchurero(
        fecha    = data.fecha,
        achurero = data.achurero.strip(),
        monto    = round(data.monto, 2),
        locacion = data.locacion or "",
        nota     = data.nota or "",
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return {"id": g.id, "fecha": g.fecha, "achurero": g.achurero,
            "monto": g.monto, "locacion": g.locacion, "nota": g.nota}


@router.delete("/gastos-achurero/{gasto_id}", status_code=204)
def eliminar_gasto(gasto_id: int, db: Session = Depends(get_db)):
    g = db.query(GastoAchurero).filter(GastoAchurero.id == gasto_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    db.delete(g)
    db.commit()


@router.get("/gastos-achurero/resumen")
def resumen_gastos(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Total de gastos por achurero en el rango — usado por el cierre."""
    q = db.query(
        GastoAchurero.achurero,
        func.sum(GastoAchurero.monto).label("total"),
    ).group_by(GastoAchurero.achurero)
    if fecha_desde: q = q.filter(GastoAchurero.fecha >= fecha_desde)
    if fecha_hasta: q = q.filter(GastoAchurero.fecha <= fecha_hasta)
    rows = q.all()
    return {r.achurero: round(float(r.total), 2) for r in rows}