"""
Router: /api/clientes
CRUD completo. La sidebar y el datalist se cargan desde aquí.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Cliente
from schemas import ClienteIn, ClienteOut

router = APIRouter(tags=["clientes"])

LOC_ORDER = ['M', 'MDP', 'O', 'B']

# Clientes iniciales — se insertan solo si la tabla está vacía
CLIENTES_INICIALES = [
    # Miramar
    ("Beto",                       "M"),
    ("Cecchi",                     "M"),
    ("Campomar 1",                 "M"),
    ("Campomar 2",                 "M"),
    ("Luis Mitre",                 "M"),
    ("Don Renato",                 "M"),
    ("Nano",                       "M"),
    ("Mingo",                      "M"),
    ("Mario",                      "M"),
    ("Parquemar",                  "M"),
    ("La Tradicional",             "M"),
    ("Buena Vibra",                "M"),
    ("San Andres",                 "M"),
    ("Manuel Gomero",              "M"),
    ("Angulo",                     "M"),
    ("Pamela",                     "M"),
    ("Turco Ducato",               "M"),
    ("El Mercadito",               "M"),
    ("El Audaz",                   "M"),
    # Mar del Plata
    ("Chino Alvarado",             "MDP"),
    ("El Palenque",                "MDP"),
    ("Jose Soip",                  "MDP"),
    ("Mauro Kalle",                "MDP"),
    ("Miguelito",                  "MDP"),
    ("Tucu",                       "MDP"),
    ("Vicente",                    "MDP"),
    ("Pol",                        "MDP"),
    ("Salucla",                    "MDP"),
    ("Ale",                        "MDP"),
    ("Italo Lo de Martin",         "MDP"),
    # Otamendi
    ("Gargiulo",                   "O"),
    ("Globo",                      "O"),
    ("Beades",                     "O"),
    ("Chino Ota",                  "O"),
    ("Padilla",                    "O"),
    # Balcarce
    ("Balcarce Carnes",            "B"),
    ("Augusto",                    "B"),
    ("Belmonte",                   "B"),
    ("Patricia Eva y 106",         "B"),
    ("Guille 39",                  "B"),
    ("Jorge Gutierrez",            "B"),
    ("Valeria Cajera BC 24 y 27",  "B"),
    ("Mauro Malena",               "B"),
    ("Todo Carne M.I.",            "B"),
    ("La Esq Avicola",             "B"),
    ("Mariela Balcarce",           "B"),
    ("19 y 22",                    "B"),
    ("Turco Mechongue",            "B"),
    ("Tamara 13 y 10",             "B"),
    ("Frutimar 2",                 "B"),
    ("Res",                        "B"),
    ("Oscar 13 y 16",              "B"),
]


def seed_clientes(db: Session):
    """Poblar tabla si está vacía."""
    if db.query(Cliente).count() == 0:
        for nombre, locacion in CLIENTES_INICIALES:
            db.add(Cliente(nombre=nombre, locacion=locacion))
        db.commit()


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/clientes", response_model=list[ClienteOut])
def listar_clientes(db: Session = Depends(get_db)):
    """
    Devuelve todos los clientes ordenados por localidad y nombre.
    Usado por la sidebar y el datalist del formulario de boleta.
    """
    seed_clientes(db)
    clientes = db.query(Cliente).all()
    orden_loc = {loc: i for i, loc in enumerate(LOC_ORDER)}
    return sorted(clientes, key=lambda c: (orden_loc.get(c.locacion, 99), c.nombre.lower()))


@router.post("/clientes", response_model=ClienteOut, status_code=201)
def crear_cliente(data: ClienteIn, db: Session = Depends(get_db)):
    existente = db.query(Cliente).filter(Cliente.nombre == data.nombre).first()
    if existente:
        raise HTTPException(status_code=409, detail=f"Ya existe un cliente con el nombre '{data.nombre}'")
    cliente = Cliente(nombre=data.nombre, locacion=data.locacion)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.put("/clientes/{cliente_id}", response_model=ClienteOut)
def editar_cliente(cliente_id: int, data: ClienteIn, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Verificar que el nuevo nombre no esté en uso por otro cliente
    duplicado = db.query(Cliente).filter(
        Cliente.nombre == data.nombre,
        Cliente.id != cliente_id
    ).first()
    if duplicado:
        raise HTTPException(status_code=409, detail=f"Ya existe un cliente con el nombre '{data.nombre}'")

    cliente.nombre   = data.nombre
    cliente.locacion = data.locacion
    db.commit()
    db.refresh(cliente)
    return cliente


@router.delete("/clientes/{cliente_id}", status_code=204)
def eliminar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    db.delete(cliente)
    db.commit()