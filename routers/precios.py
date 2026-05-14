"""
Router: /api/precios
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Precio
from schemas import PreciosIn, PreciosOut

router = APIRouter(tags=["precios"])
 
PRODUCTOS = [
    'Hígado','Corazón','Lengua','Riñón','Sesos',
    'Chinchulin','Tripas rueda','Molleja','Rabo',
    'C. de entraña','Quijada','Mondongo','Carne chica','Otros'
]
 
 
@router.get("/precios", response_model=PreciosOut)
def obtener_precios(db: Session = Depends(get_db)):
    """
    Reemplaza: cargarPrecios()
    Devuelve todos los precios como dict {nombre: precio}.
    Si un producto no tiene precio guardado, devuelve 0.
    """
    registros = db.query(Precio).all()
    mapa      = {r.nombre: r.precio for r in registros}
 
    # Garantizar que todos los productos están presentes
    precios = {nombre: mapa.get(nombre, 0) for nombre in PRODUCTOS}
    return PreciosOut(precios=precios)
 
 
@router.put("/precios", response_model=PreciosOut)
def guardar_precios(data: PreciosIn, db: Session = Depends(get_db)):
    for nombre, precio in data.precios.items():
        if nombre not in PRODUCTOS:
            continue

        registro = db.query(Precio).filter(Precio.nombre == nombre).first()
        if registro:
            registro.precio = precio
        else:
            db.add(Precio(nombre=nombre, precio=precio))

    db.commit()

    registros = db.query(Precio).all()
    mapa      = {r.nombre: r.precio for r in registros}
    precios   = {nombre: mapa.get(nombre, 0) for nombre in PRODUCTOS}
    return PreciosOut(precios=precios)
