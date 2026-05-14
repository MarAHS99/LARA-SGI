"""
ORM Models
"""

from sqlalchemy import Column, String, Float, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


class Cliente(Base):
    __tablename__ = "clientes"
    id       = Column(Integer, primary_key=True, autoincrement=True)
    nombre   = Column(String, nullable=False, unique=True, index=True)
    locacion = Column(String, nullable=False)


class Proveedor(Base):
    __tablename__ = "proveedores"
    id     = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String, nullable=False, unique=True, index=True)


class Achurero(Base):
    __tablename__ = "achureros"
    id     = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String, nullable=False, unique=True, index=True)


class Producto(Base):
    __tablename__ = "productos"
    id     = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String, nullable=False, unique=True, index=True)
    orden  = Column(Integer, nullable=False, default=0)


class Precio(Base):
    __tablename__ = "precios"
    nombre = Column(String, primary_key=True)
    precio = Column(Float, nullable=False, default=0)


class PrecioCliente(Base):
    __tablename__ = "precios_cliente"
    __table_args__ = (
        UniqueConstraint('cliente', 'producto', name='uq_precio_cliente_producto'),
    )
    id       = Column(Integer, primary_key=True, autoincrement=True)
    cliente  = Column(String, nullable=False, index=True)
    producto = Column(String, nullable=False)
    precio   = Column(Float, nullable=False, default=0)


class Boleta(Base):
    __tablename__ = "boletas"
    id             = Column(String, primary_key=True, index=True)
    fecha          = Column(String, nullable=False)
    locacion       = Column(String, nullable=False)
    cliente        = Column(String, nullable=False, index=True)
    achurero       = Column(String, nullable=True)
    total          = Column(Float, nullable=False, default=0)
    saldo_anterior = Column(Float, nullable=False, default=0)
    entrega        = Column(Float, nullable=False, default=0)
    debe           = Column(Float, nullable=False, default=0)
    nota           = Column(String, nullable=True, default="")
    productos      = relationship("ProductoBoleta", back_populates="boleta", cascade="all, delete-orphan")


class ProductoBoleta(Base):
    __tablename__ = "productos_boleta"
    id        = Column(Integer, primary_key=True, autoincrement=True)
    boleta_id = Column(String, ForeignKey("boletas.id", ondelete="CASCADE"), nullable=False)
    nombre    = Column(String, nullable=False)
    cant      = Column(Float, nullable=False, default=0)
    kg        = Column(Float, nullable=False, default=0)
    precio    = Column(Float, nullable=False, default=0)
    subtotal  = Column(Float, nullable=False, default=0)
    boleta    = relationship("Boleta", back_populates="productos")


class Compra(Base):
    __tablename__ = "compras"
    id        = Column(Integer, primary_key=True, autoincrement=True)
    fecha     = Column(String, nullable=False)
    proveedor = Column(String, nullable=False)
    total     = Column(Float, nullable=False, default=0)
    productos = relationship("ProductoCompra", back_populates="compra", cascade="all, delete-orphan")


class ProductoCompra(Base):
    __tablename__ = "productos_compra"
    id        = Column(Integer, primary_key=True, autoincrement=True)
    compra_id = Column(Integer, ForeignKey("compras.id", ondelete="CASCADE"), nullable=False)
    nombre    = Column(String, nullable=False)
    cant      = Column(Float, nullable=False, default=0)
    kg        = Column(Float, nullable=False, default=0)
    precio    = Column(Float, nullable=False, default=0)
    subtotal  = Column(Float, nullable=False, default=0)
    compra    = relationship("Compra", back_populates="productos")


class Pago(Base):
    __tablename__ = "pagos"
    id       = Column(Integer, primary_key=True, autoincrement=True)
    cliente  = Column(String, nullable=False, index=True)
    locacion = Column(String, nullable=False)
    monto    = Column(Float, nullable=False)
    fecha    = Column(String, nullable=False)
    nota     = Column(String, nullable=True)


class StockManual(Base):
    __tablename__ = "stock_manual"
    id       = Column(Integer, primary_key=True, autoincrement=True)
    fecha    = Column(String, nullable=False, index=True)
    producto = Column(String, nullable=False, index=True)
    kg_real  = Column(Float, nullable=False, default=0)


class PagoProveedor(Base):
    __tablename__ = "pagos_proveedor"
    id        = Column(Integer, primary_key=True, autoincrement=True)
    proveedor = Column(String, nullable=False, index=True)
    monto     = Column(Float, nullable=False)
    fecha     = Column(String, nullable=False)
    nota      = Column(String, nullable=True)


class GastoAchurero(Base):
    __tablename__ = "gastos_achurero"
    id       = Column(Integer, primary_key=True, autoincrement=True)
    fecha    = Column(String, nullable=False, index=True)
    achurero = Column(String, nullable=False, index=True)
    monto    = Column(Float, nullable=False)
    locacion = Column(String, nullable=True)
    nota     = Column(String, nullable=True)