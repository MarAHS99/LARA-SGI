"""
Router: /api/achureros
CRUD completo. Seed automático si la tabla está vacía.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String

from database import get_db, Base
from schemas import AchureroIn, AchureroOut

router = APIRouter(tags=["achureros"])

ACHUREROS_INICIALES = ["Daniel", "Luis"]


def seed_achureros(db: Session):
    from models import Achurero
    if db.query(Achurero).count() == 0:
        for nombre in ACHUREROS_INICIALES:
            db.add(Achurero(nombre=nombre))
        db.commit()


@router.get("/achureros", response_model=list[AchureroOut])
def listar_achureros(db: Session = Depends(get_db)):
    from models import Achurero
    seed_achureros(db)
    return db.query(Achurero).order_by(Achurero.nombre).all()


@router.post("/achureros", response_model=AchureroOut, status_code=201)
def crear_achurero(data: AchureroIn, db: Session = Depends(get_db)):
    from models import Achurero
    if db.query(Achurero).filter(Achurero.nombre == data.nombre).first():
        raise HTTPException(status_code=409, detail=f"Ya existe '{data.nombre}'")
    a = Achurero(nombre=data.nombre)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


@router.put("/achureros/{achurero_id}", response_model=AchureroOut)
def editar_achurero(achurero_id: int, data: AchureroIn, db: Session = Depends(get_db)):
    from models import Achurero
    a = db.query(Achurero).filter(Achurero.id == achurero_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Achurero no encontrado")
    dup = db.query(Achurero).filter(Achurero.nombre == data.nombre, Achurero.id != achurero_id).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"Ya existe '{data.nombre}'")
    a.nombre = data.nombre
    db.commit()
    db.refresh(a)
    return a


@router.delete("/achureros/{achurero_id}", status_code=204)
def eliminar_achurero(achurero_id: int, db: Session = Depends(get_db)):
    from models import Achurero
    a = db.query(Achurero).filter(Achurero.id == achurero_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Achurero no encontrado")
    db.delete(a)
    db.commit()