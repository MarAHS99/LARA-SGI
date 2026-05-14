"""
Router: /api/proveedores
CRUD completo. Seed automático si la tabla está vacía.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Proveedor
from schemas import ProveedorIn, ProveedorOut

router = APIRouter(tags=["proveedores"])

PROVEEDORES_INICIALES = ["Daniel", "Luis"]


def seed_proveedores(db: Session):
    if db.query(Proveedor).count() == 0:
        for nombre in PROVEEDORES_INICIALES:
            db.add(Proveedor(nombre=nombre))
        db.commit()


@router.get("/proveedores", response_model=list[ProveedorOut])
def listar_proveedores(db: Session = Depends(get_db)):
    seed_proveedores(db)
    return db.query(Proveedor).order_by(Proveedor.nombre).all()


@router.post("/proveedores", response_model=ProveedorOut, status_code=201)
def crear_proveedor(data: ProveedorIn, db: Session = Depends(get_db)):
    existente = db.query(Proveedor).filter(Proveedor.nombre == data.nombre).first()
    if existente:
        raise HTTPException(status_code=409, detail=f"Ya existe '{data.nombre}'")
    p = Proveedor(nombre=data.nombre)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/proveedores/{proveedor_id}", response_model=ProveedorOut)
def editar_proveedor(proveedor_id: int, data: ProveedorIn, db: Session = Depends(get_db)):
    p = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    dup = db.query(Proveedor).filter(Proveedor.nombre == data.nombre, Proveedor.id != proveedor_id).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"Ya existe '{data.nombre}'")
    p.nombre = data.nombre
    db.commit()
    db.refresh(p)
    return p


@router.delete("/proveedores/{proveedor_id}", status_code=204)
def eliminar_proveedor(proveedor_id: int, db: Session = Depends(get_db)):
    p = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    db.delete(p)
    db.commit()