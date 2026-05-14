"""
Router: /api/productos  +  /api/precios  +  /api/precios/cliente
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional

from database import get_db
from models import Producto, Precio, PrecioCliente, Cliente
from schemas import (
    ProductoIn, ProductoOut, ProductoOrdenIn,
    PreciosIn, PreciosOut,
    PrecioClienteOut, PreciosClienteIn,
    PRODUCTOS_INICIALES,
)

router = APIRouter(tags=["productos"])

LOC_ORDER  = ['M', 'MDP', 'O', 'B']
LOC_NOMBRES = {'M': 'Miramar', 'MDP': 'Mar del Plata', 'O': 'Otamendi', 'B': 'Balcarce'}


# ── Helpers ───────────────────────────────────────────────────

def seed_productos(db: Session):
    if db.query(Producto).count() == 0:
        for i, nombre in enumerate(PRODUCTOS_INICIALES):
            db.add(Producto(nombre=nombre, orden=i))
        db.commit()


def _precios_map(db: Session) -> dict:
    return {r.nombre: r.precio for r in db.query(Precio).all()}


def _enriquecer(p: Producto, precios_map: dict) -> ProductoOut:
    return ProductoOut(
        id     = p.id,
        nombre = p.nombre,
        orden  = p.orden,
        precio = precios_map.get(p.nombre, 0.0),
    )


def _productos_ordenados(db: Session) -> list:
    seed_productos(db)
    return db.query(Producto).order_by(Producto.orden, Producto.id).all()


# ── Productos CRUD ────────────────────────────────────────────

@router.get("/productos", response_model=list[ProductoOut])
def listar_productos(db: Session = Depends(get_db)):
    prods = _productos_ordenados(db)
    pm    = _precios_map(db)
    return [_enriquecer(p, pm) for p in prods]


@router.post("/productos", response_model=ProductoOut, status_code=201)
def crear_producto(data: ProductoIn, db: Session = Depends(get_db)):
    if db.query(Producto).filter(Producto.nombre == data.nombre).first():
        raise HTTPException(status_code=409, detail=f"Ya existe '{data.nombre}'")
    if data.orden == 0:
        data.orden = db.query(Producto).count()
    p = Producto(nombre=data.nombre, orden=data.orden)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _enriquecer(p, _precios_map(db))


@router.put("/productos/{producto_id}", response_model=ProductoOut)
def editar_producto(producto_id: int, data: ProductoIn, db: Session = Depends(get_db)):
    p = db.query(Producto).filter(Producto.id == producto_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    dup = db.query(Producto).filter(Producto.nombre == data.nombre, Producto.id != producto_id).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"Ya existe '{data.nombre}'")
    p.nombre = data.nombre
    p.orden  = data.orden
    db.commit()
    db.refresh(p)
    return _enriquecer(p, _precios_map(db))


@router.delete("/productos/{producto_id}", status_code=204)
def eliminar_producto(producto_id: int, db: Session = Depends(get_db)):
    p = db.query(Producto).filter(Producto.id == producto_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    db.delete(p)
    db.commit()


@router.put("/productos-orden", response_model=list[ProductoOut])
def reordenar_productos(items: list[ProductoOrdenIn], db: Session = Depends(get_db)):
    for item in items:
        p = db.query(Producto).filter(Producto.id == item.id).first()
        if p:
            p.orden = item.orden
    db.commit()
    prods = db.query(Producto).order_by(Producto.orden, Producto.id).all()
    pm    = _precios_map(db)
    return [_enriquecer(p, pm) for p in prods]


# ── Precios generales ─────────────────────────────────────────

@router.get("/precios", response_model=PreciosOut)
def obtener_precios(db: Session = Depends(get_db)):
    prods = _productos_ordenados(db)
    pm    = _precios_map(db)
    return PreciosOut(precios={p.nombre: pm.get(p.nombre, 0) for p in prods})


@router.put("/precios", response_model=PreciosOut)
def guardar_precios(data: PreciosIn, db: Session = Depends(get_db)):
    for nombre, precio in data.precios.items():
        r = db.query(Precio).filter(Precio.nombre == nombre).first()
        if r:
            r.precio = precio
        else:
            db.add(Precio(nombre=nombre, precio=precio))
    db.commit()
    prods = _productos_ordenados(db)
    pm    = _precios_map(db)
    return PreciosOut(precios={p.nombre: pm.get(p.nombre, 0) for p in prods})


# ── Precios por cliente ───────────────────────────────────────

@router.get("/precios/clientes-con-especiales")
def clientes_con_especiales(db: Session = Depends(get_db)):
    """
    Devuelve los clientes que tienen al menos un precio especial,
    agrupados por localidad en el orden de la sidebar.
    """
    # Clientes con algún precio especial
    nombres_con_especial = {
        r.cliente
        for r in db.query(PrecioCliente.cliente).distinct().all()
    }

    # Todos los clientes desde la tabla clientes
    todos = db.query(Cliente).all()

    grupos = {loc: [] for loc in LOC_ORDER}
    sin_loc = []

    for c in todos:
        if c.nombre not in nombres_con_especial:
            continue
        if c.locacion in grupos:
            grupos[c.locacion].append(c.nombre)
        else:
            sin_loc.append(c.nombre)

    # Ordenar cada grupo alfabéticamente
    for loc in grupos:
        grupos[loc].sort()

    resultado = []
    for loc in LOC_ORDER:
        if grupos[loc]:
            resultado.append({
                "locacion": loc,
                "nombre":   LOC_NOMBRES.get(loc, loc),
                "clientes": grupos[loc],
            })
    if sin_loc:
        resultado.append({
            "locacion": "?",
            "nombre":   "Sin localidad",
            "clientes": sorted(sin_loc),
        })

    return resultado


@router.get("/precios/cliente/{cliente}", response_model=list[PrecioClienteOut])
def obtener_precios_cliente(cliente: str, db: Session = Depends(get_db)):
    prods      = _productos_ordenados(db)
    pm         = _precios_map(db)
    especiales = {
        r.producto: r.precio
        for r in db.query(PrecioCliente).filter(PrecioCliente.cliente == cliente).all()
    }
    resultado = []
    for p in prods:
        gral     = pm.get(p.nombre, 0.0)
        especial = especiales.get(p.nombre)
        efectivo = especial if especial is not None else gral
        resultado.append(PrecioClienteOut(
            producto        = p.nombre,
            precio_general  = gral,
            precio_especial = especial,
            precio_efectivo = efectivo,
        ))
    return resultado


@router.put("/precios/cliente/{cliente}", response_model=list[PrecioClienteOut])
def guardar_precios_cliente(cliente: str, data: PreciosClienteIn, db: Session = Depends(get_db)):
    for producto, precio in data.precios.items():
        registro = db.query(PrecioCliente).filter(
            PrecioCliente.cliente  == cliente,
            PrecioCliente.producto == producto,
        ).first()
        if precio is None or precio == 0:
            if registro:
                db.delete(registro)
        else:
            if registro:
                registro.precio = precio
            else:
                db.add(PrecioCliente(cliente=cliente, producto=producto, precio=precio))
    db.commit()
    return obtener_precios_cliente(cliente, db)


@router.get("/precios/resolver/{cliente}", response_model=dict)
def resolver_precios_cliente(cliente: str, db: Session = Depends(get_db)):
    prods      = _productos_ordenados(db)
    pm         = _precios_map(db)
    especiales = {
        r.producto: r.precio
        for r in db.query(PrecioCliente).filter(PrecioCliente.cliente == cliente).all()
    }
    return {
        p.nombre: especiales.get(p.nombre, pm.get(p.nombre, 0.0))
        for p in prods
    }