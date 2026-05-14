"""
Pydantic schemas
"""

from pydantic import BaseModel, field_validator, Field
from typing import Optional, Annotated
import re

# Tipos con límites de longitud
Str50  = Annotated[str, Field(min_length=1, max_length=50)]
Str100 = Annotated[str, Field(min_length=1, max_length=100)]
Str10  = Annotated[str, Field(min_length=1, max_length=10)]

LOCACIONES_VALIDAS = {'M', 'MDP', 'O', 'B'}

PRODUCTOS_INICIALES = [
    'Hígado','Corazón','Lengua','Riñón','Sesos',
    'Chinchulin','Tripas rueda','Molleja','Rabo',
    'C. de entraña','Quijada','Mondongo','Carne chica','Otros'
]


# ── Clientes ──────────────────────────────────────────────────

class ClienteIn(BaseModel):
    nombre:   Str100
    locacion: Str10

    @field_validator('nombre')
    @classmethod
    def nombre_no_vacio(cls, v):
        if not v or not v.strip():
            raise ValueError("El nombre no puede estar vacío")
        return v.strip()

    @field_validator('locacion')
    @classmethod
    def locacion_valida(cls, v):
        if v not in LOCACIONES_VALIDAS:
            raise ValueError(f"Locacion '{v}' no válida.")
        return v

class ClienteOut(BaseModel):
    id:       int
    nombre:   str
    locacion: str
    class Config:
        from_attributes = True


# ── Proveedores ───────────────────────────────────────────────

class ProveedorIn(BaseModel):
    nombre: Str100

    @field_validator('nombre')
    @classmethod
    def nombre_no_vacio(cls, v):
        if not v or not v.strip():
            raise ValueError("El nombre no puede estar vacío")
        return v.strip()

class ProveedorOut(BaseModel):
    id:     int
    nombre: str
    class Config:
        from_attributes = True


# ── Achureros ─────────────────────────────────────────────────

class AchureroIn(BaseModel):
    nombre: Str100

    @field_validator('nombre')
    @classmethod
    def nombre_no_vacio(cls, v):
        if not v or not v.strip():
            raise ValueError("El nombre no puede estar vacío")
        return v.strip()

class AchureroOut(BaseModel):
    id:     int
    nombre: str
    class Config:
        from_attributes = True


# ── Productos (lista dinámica) ────────────────────────────────

class ProductoIn(BaseModel):
    nombre: Str100
    orden:  int = 0

    @field_validator('nombre')
    @classmethod
    def nombre_no_vacio(cls, v):
        if not v or not v.strip():
            raise ValueError("El nombre no puede estar vacío")
        return v.strip()

class ProductoOut(BaseModel):
    id:     int
    nombre: str
    orden:  int
    precio: float = 0.0
    class Config:
        from_attributes = True

class ProductoOrdenIn(BaseModel):
    id:    int
    orden: int


# ── Precios ───────────────────────────────────────────────────

class PreciosIn(BaseModel):
    precios: dict[str, float]

class PreciosOut(BaseModel):
    precios: dict[str, float]


# ── Precios por cliente ───────────────────────────────────────

class PrecioClienteOut(BaseModel):
    producto:        str
    precio_general:  float
    precio_especial: Optional[float]
    precio_efectivo: float

class PreciosClienteIn(BaseModel):
    precios: dict[str, Optional[float]]


# ── Productos boleta ──────────────────────────────────────────

class ProductoBoletaIn(BaseModel):
    nombre: Str100
    cant:   float = 0
    kg:     float
    precio: float
    # subtotal se calcula en el backend: round(kg * precio, 2)

    @field_validator('kg')
    @classmethod
    def kg_positivo(cls, v):
        if v <= 0:
            raise ValueError("El kg debe ser mayor a 0")
        return round(v, 3)

    @field_validator('precio')
    @classmethod
    def precio_positivo(cls, v):
        if v <= 0:
            raise ValueError("El precio debe ser mayor a 0")
        return round(v, 2)

    @field_validator('cant')
    @classmethod
    def cant_no_negativa(cls, v):
        if v < 0:
            raise ValueError("La cantidad no puede ser negativa")
        return round(v, 2)

class ProductoBoletaOut(ProductoBoletaIn):
    id: int
    class Config:
        from_attributes = True


# ── Productos compra ──────────────────────────────────────────

class ProductoCompraIn(BaseModel):
    nombre: Str100
    cant:   float = 0
    kg:     float
    precio: float
    # subtotal se calcula en el backend: round(kg * precio, 2)

    @field_validator('kg')
    @classmethod
    def kg_positivo(cls, v):
        if v <= 0:
            raise ValueError("El kg debe ser mayor a 0")
        return round(v, 3)

    @field_validator('precio')
    @classmethod
    def precio_positivo(cls, v):
        if v <= 0:
            raise ValueError("El precio debe ser mayor a 0")
        return round(v, 2)

class ProductoCompraOut(ProductoCompraIn):
    id: int
    class Config:
        from_attributes = True


# ── Boletas ───────────────────────────────────────────────────

class BoletaIn(BaseModel):
    fecha:          str
    locacion:       Str10
    cliente:        Str100
    achurero:       Optional[Str100] = ""
    productos:      list[ProductoBoletaIn]
    saldo_anterior: float = 0
    entrega:        float = 0
    nota:           Optional[Annotated[str, Field(max_length=500)]] = ""

    @field_validator('locacion')
    @classmethod
    def locacion_valida(cls, v):
        if v not in LOCACIONES_VALIDAS:
            raise ValueError(f"Locacion '{v}' no válida.")
        return v

    @field_validator('cliente')
    @classmethod
    def cliente_no_vacio(cls, v):
        if not v or not v.strip():
            raise ValueError("El cliente no puede estar vacío")
        return v.strip()

    @field_validator('productos')
    @classmethod
    def productos_no_vacios(cls, v):
        if not v:
            raise ValueError("Debe tener al menos un producto")
        return v

    @field_validator('saldo_anterior')
    @classmethod
    def saldo_no_negativo(cls, v):
        if v < 0:
            raise ValueError("El saldo anterior no puede ser negativo")
        return round(v, 2)

    @field_validator('entrega')
    @classmethod
    def entrega_no_negativa(cls, v):
        if v < 0:
            raise ValueError("La entrega no puede ser negativa")
        return round(v, 2)

    @field_validator('fecha')
    @classmethod
    def fecha_valida(cls, v):
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError("Fecha debe ser YYYY-MM-DD")
        return v

class BoletaOut(BaseModel):
    id:             str
    fecha:          str
    locacion:       str
    cliente:        str
    achurero:       Optional[str]
    total:          float
    saldo_anterior: float
    entrega:        float
    debe:           float
    nota:           Optional[str] = ""
    productos:      list[ProductoBoletaOut]
    class Config:
        from_attributes = True


# ── Compras ───────────────────────────────────────────────────

class CompraIn(BaseModel):
    fecha:      str
    proveedor:  Str100
    productos:  list[ProductoCompraIn]

    @field_validator('proveedor')
    @classmethod
    def proveedor_no_vacio(cls, v):
        if not v or not v.strip():
            raise ValueError("El proveedor no puede estar vacío")
        return v.strip()

    @field_validator('productos')
    @classmethod
    def productos_no_vacios(cls, v):
        if not v:
            raise ValueError("Debe tener al menos un producto")
        return v

    @field_validator('fecha')
    @classmethod
    def fecha_valida(cls, v):
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError("Fecha debe ser YYYY-MM-DD")
        return v

class CompraOut(BaseModel):
    id:        int
    fecha:     str
    proveedor: str
    total:     float
    productos: list[ProductoCompraOut]
    class Config:
        from_attributes = True


# ── Pagos ─────────────────────────────────────────────────────

class PagoIn(BaseModel):
    cliente:  Str100
    locacion: Str10
    monto:    float
    fecha:    str
    nota:     Optional[Annotated[str, Field(max_length=200)]] = ""

    @field_validator('monto')
    @classmethod
    def monto_positivo(cls, v):
        if v <= 0:
            raise ValueError("El monto debe ser mayor a 0")
        return round(v, 2)

    @field_validator('locacion')
    @classmethod
    def locacion_valida(cls, v):
        if v not in LOCACIONES_VALIDAS:
            raise ValueError(f"Locacion '{v}' no válida.")
        return v

    @field_validator('fecha')
    @classmethod
    def fecha_valida(cls, v):
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError("Fecha debe ser YYYY-MM-DD")
        return v

class PagoOut(BaseModel):
    id:       int
    cliente:  str
    locacion: str
    monto:    float
    fecha:    str
    nota:     Optional[str]
    class Config:
        from_attributes = True


# ── Cuentas Corrientes ────────────────────────────────────────

class SaldoClienteOut(BaseModel):
    cliente:       str
    saldo_boletas: float
    total_pagado:  float
    saldo_actual:  float

class SaldoLocacionOut(BaseModel):
    locacion:       str
    nombre:         str
    clientes:       list[SaldoClienteOut]
    total_locacion: float

class CuentasCorrientesOut(BaseModel):
    locaciones:    list[SaldoLocacionOut]
    total_general: float


# ── Stock ─────────────────────────────────────────────────────

class StockManualIn(BaseModel):
    fecha:    str
    producto: str
    kg_real:  float

    @field_validator('fecha')
    @classmethod
    def fecha_valida(cls, v):
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError("Fecha debe ser YYYY-MM-DD")
        return v

    @field_validator('kg_real')
    @classmethod
    def kg_no_negativo(cls, v):
        if v < 0:
            raise ValueError("El kg no puede ser negativo")
        return round(v, 3)

class StockManualOut(StockManualIn):
    id: int
    class Config:
        from_attributes = True

class StockProductoOut(BaseModel):
    producto:            str
    kg_teorico:          float
    kg_ultimo_manual:    float
    fecha_ultimo_manual: Optional[str]

# ── Pagos Proveedor ───────────────────────────────────────────

class PagoProveedorIn(BaseModel):
    proveedor: Str100
    monto:     float
    fecha:     str
    nota:      Optional[Annotated[str, Field(max_length=200)]] = ""

    @field_validator('monto')
    @classmethod
    def monto_positivo(cls, v):
        if v <= 0:
            raise ValueError("El monto debe ser mayor a 0")
        return round(v, 2)

    @field_validator('fecha')
    @classmethod
    def fecha_valida(cls, v):
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError("Fecha debe ser YYYY-MM-DD")
        return v

class PagoProveedorOut(BaseModel):
    id:        int
    proveedor: str
    monto:     float
    fecha:     str
    nota:      Optional[str]
    class Config:
        from_attributes = True