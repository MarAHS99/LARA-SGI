"""
Router: /api/compras
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Compra, ProductoCompra
from schemas import CompraIn, CompraOut

router = APIRouter(tags=["compras"])


@router.get("/compras", response_model=list[CompraOut])
def listar_compras(db: Session = Depends(get_db)):
    return (
        db.query(Compra)
        .order_by(Compra.fecha.desc(), Compra.id.desc())
        .all()
    )


@router.get("/compras/{compra_id}", response_model=CompraOut)
def obtener_compra(compra_id: int, db: Session = Depends(get_db)):
    compra = db.query(Compra).filter(Compra.id == compra_id).first()
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    return compra


@router.post("/compras", response_model=CompraOut, status_code=201)
def crear_compra(data: CompraIn, db: Session = Depends(get_db)):
    # Calcular subtotales en el backend — se ignora el valor que manda el front
    subtotales = [round(p.kg * p.precio, 2) for p in data.productos]
    total      = round(sum(subtotales), 2)
    compra     = Compra(fecha=data.fecha, proveedor=data.proveedor, total=total)
    for p, sub in zip(data.productos, subtotales):
        compra.productos.append(ProductoCompra(
            nombre   = p.nombre,
            cant     = p.cant,
            kg       = p.kg,
            precio   = p.precio,
            subtotal = sub,
        ))
    db.add(compra)
    db.commit()
    db.refresh(compra)
    return compra


@router.delete("/compras/{compra_id}", status_code=204)
def eliminar_compra(compra_id: int, db: Session = Depends(get_db)):
    compra = db.query(Compra).filter(Compra.id == compra_id).first()
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    db.delete(compra)
    db.commit()