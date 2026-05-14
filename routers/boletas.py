"""
Router: /api/boletas
"""

import re
import unicodedata
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import Boleta, ProductoBoleta, Pago, Cliente
from schemas import BoletaIn, BoletaOut

router = APIRouter(tags=["boletas"])

# Token interno para proteger borrar_historial
# No es seguridad criptográfica — es una guardia contra llamadas accidentales
_BORRAR_TOKEN = "LARA-BORRAR-HISTORIAL-CONFIRMAR"


# ── Helpers ───────────────────────────────────────────────────

def sanitizar_cliente(nombre: str) -> str:
    normalizado = unicodedata.normalize('NFD', nombre)
    sin_tildes  = ''.join(c for c in normalizado if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-zA-Z0-9]', '', sin_tildes)


def generar_id_boleta(fecha: str, locacion: str, cliente: str, db: Session) -> str:
    base = f"{fecha}_{locacion}_{sanitizar_cliente(cliente)}"
    if not db.query(Boleta).filter(Boleta.id == base).first():
        return base
    sufijo = 1
    while db.query(Boleta).filter(Boleta.id == f"{base}_{sufijo}").first():
        sufijo += 1
    return f"{base}_{sufijo}"


def calcular_totales(productos: list, saldo_anterior: float, entrega: float):
    total = sum(p.subtotal for p in productos)
    debe  = (total + saldo_anterior) - entrega
    return round(total, 2), round(debe, 2)


def _subtotal(p) -> float:
    """Calcula subtotal en el backend. El valor que venga del front se ignora."""
    return round(p.kg * p.precio, 2)


def _registrar_pago_entrega(boleta_id: str, fecha: str, locacion: str, cliente: str, monto: float, db: Session):
    pago = Pago(
        cliente  = cliente,
        locacion = locacion,
        monto    = round(monto, 2),
        fecha    = fecha,
        nota     = f"Entrega boleta {boleta_id}",
    )
    db.add(pago)


def _eliminar_pago_entrega(boleta_id: str, db: Session):
    db.query(Pago).filter(
        Pago.nota == f"Entrega boleta {boleta_id}"
    ).delete()


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/boletas/ultimo-precio/{cliente}")
def ultimo_precio_cliente(cliente: str, db: Session = Depends(get_db)):
    """
    Devuelve el último precio usado por producto en la última boleta del cliente.
    Útil para pre-llenar precios en la nueva boleta.
    """
    ultima = (
        db.query(Boleta)
        .filter(Boleta.cliente == cliente)
        .order_by(Boleta.fecha.desc(), Boleta.id.desc())
        .first()
    )
    if not ultima:
        return {}
    return {p.nombre: p.precio for p in ultima.productos}


@router.get("/boletas/count")
def contar_boletas(
    fecha_desde: Optional[str] = Query(default=None),
    fecha_hasta: Optional[str] = Query(default=None),
    cliente:     Optional[str] = Query(default=None),
    locacion:    Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(Boleta)
    if fecha_desde: q = q.filter(Boleta.fecha >= fecha_desde)
    if fecha_hasta: q = q.filter(Boleta.fecha <= fecha_hasta)
    if cliente:     q = q.filter(Boleta.cliente == cliente)
    if locacion:    q = q.filter(Boleta.locacion == locacion)
    return {"total": q.count()}


@router.get("/boletas", response_model=list[BoletaOut])
def listar_boletas(
    fecha_desde: Optional[str] = Query(default=None),
    fecha_hasta: Optional[str] = Query(default=None),
    cliente:     Optional[str] = Query(default=None),
    locacion:    Optional[str] = Query(default=None),
    skip:        int           = Query(default=0,  ge=0),
    limit:       int           = Query(default=75, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(Boleta)
    if fecha_desde: q = q.filter(Boleta.fecha >= fecha_desde)
    if fecha_hasta: q = q.filter(Boleta.fecha <= fecha_hasta)
    if cliente:     q = q.filter(Boleta.cliente == cliente)
    if locacion:    q = q.filter(Boleta.locacion == locacion)
    return q.order_by(Boleta.fecha.desc(), Boleta.id.desc()).offset(skip).limit(limit).all()


@router.get("/boletas/{boleta_id}", response_model=BoletaOut)
def obtener_boleta(boleta_id: str, db: Session = Depends(get_db)):
    boleta = db.query(Boleta).filter(Boleta.id == boleta_id).first()
    if not boleta:
        raise HTTPException(status_code=404, detail=f"Boleta '{boleta_id}' no encontrada")
    return boleta


@router.post("/boletas", response_model=BoletaOut, status_code=201)
def crear_boleta(data: BoletaIn, db: Session = Depends(get_db)):
    # Validar que el cliente exista en la base de datos
    cliente_db = db.query(Cliente).filter(Cliente.nombre == data.cliente).first()
    if not cliente_db:
        raise HTTPException(status_code=422, detail=f"Cliente '{data.cliente}' no existe. Crealo primero en Configuración.")

    boleta_id = generar_id_boleta(data.fecha, data.locacion, data.cliente, db)

    # Calcular subtotales en el backend — se ignora el valor que manda el front
    productos_con_subtotal = [
        type('P', (), {'nombre': p.nombre, 'cant': p.cant, 'kg': p.kg,
                       'precio': p.precio, 'subtotal': _subtotal(p)})()
        for p in data.productos
    ]
    total, debe = calcular_totales(productos_con_subtotal, data.saldo_anterior, data.entrega)

    boleta = Boleta(
        id             = boleta_id,
        fecha          = data.fecha,
        locacion       = data.locacion,
        cliente        = data.cliente,
        achurero       = data.achurero or "",
        total          = total,
        saldo_anterior = data.saldo_anterior,
        entrega        = data.entrega,
        debe           = debe,
        nota           = data.nota or "",
    )
    for p in productos_con_subtotal:
        boleta.productos.append(ProductoBoleta(
            nombre=p.nombre, cant=p.cant, kg=p.kg, precio=p.precio, subtotal=p.subtotal,
        ))

    db.add(boleta)
    db.flush()

    if data.entrega > 0:
        _registrar_pago_entrega(boleta_id, data.fecha, data.locacion, data.cliente, data.entrega, db)

    db.commit()
    db.refresh(boleta)
    return boleta


@router.put("/boletas/{boleta_id}", response_model=BoletaOut)
def editar_boleta(boleta_id: str, data: BoletaIn, db: Session = Depends(get_db)):
    boleta = db.query(Boleta).filter(Boleta.id == boleta_id).first()
    if not boleta:
        raise HTTPException(status_code=404, detail=f"Boleta '{boleta_id}' no encontrada")

    # Validar que el cliente exista en la base de datos
    cliente_db = db.query(Cliente).filter(Cliente.nombre == data.cliente).first()
    if not cliente_db:
        raise HTTPException(status_code=422, detail=f"Cliente '{data.cliente}' no existe. Crealo primero en Configuración.")

    # Calcular subtotales en el backend — se ignora el valor que manda el front
    productos_con_subtotal = [
        type('P', (), {'nombre': p.nombre, 'cant': p.cant, 'kg': p.kg,
                       'precio': p.precio, 'subtotal': _subtotal(p)})()
        for p in data.productos
    ]
    total, debe = calcular_totales(productos_con_subtotal, data.saldo_anterior, data.entrega)

    boleta.fecha          = data.fecha
    boleta.locacion       = data.locacion
    boleta.cliente        = data.cliente
    boleta.achurero       = data.achurero or ""
    boleta.total          = total
    boleta.saldo_anterior = data.saldo_anterior
    boleta.entrega        = data.entrega
    boleta.debe           = debe
    boleta.nota           = data.nota or ""

    for prod in boleta.productos:
        db.delete(prod)
    db.flush()

    for p in productos_con_subtotal:
        boleta.productos.append(ProductoBoleta(
            nombre=p.nombre, cant=p.cant, kg=p.kg, precio=p.precio, subtotal=p.subtotal,
        ))

    _eliminar_pago_entrega(boleta_id, db)
    if data.entrega > 0:
        _registrar_pago_entrega(boleta_id, data.fecha, data.locacion, data.cliente, data.entrega, db)

    db.commit()
    db.refresh(boleta)
    return boleta


@router.delete("/boletas/{boleta_id}", status_code=204)
def eliminar_boleta(boleta_id: str, db: Session = Depends(get_db)):
    boleta = db.query(Boleta).filter(Boleta.id == boleta_id).first()
    if not boleta:
        raise HTTPException(status_code=404, detail=f"Boleta '{boleta_id}' no encontrada")
    _eliminar_pago_entrega(boleta_id, db)
    db.delete(boleta)
    db.commit()


@router.delete("/boletas", status_code=204)
def borrar_historial(
    x_lara_confirm: Optional[str] = Header(default=None, alias="X-Lara-Confirm"),
    db: Session = Depends(get_db),
):
    if x_lara_confirm != _BORRAR_TOKEN:
        raise HTTPException(
            status_code=403,
            detail="Acción no autorizada. Se requiere confirmación explícita."
        )
    db.query(Pago).filter(Pago.nota.like("Entrega boleta %")).delete(synchronize_session=False)
    db.query(ProductoBoleta).delete()
    db.query(Boleta).delete()
    db.commit()