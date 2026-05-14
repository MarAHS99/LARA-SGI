"""
Router: /api/cuentas-corrientes
Saldo = suma(debe de boletas) - suma(pagos manuales)

IMPORTANTE: los pagos automáticos de entrega (nota="Entrega boleta X")
NO se descuentan acá porque ya están descontados en el campo `debe`
de cada boleta. Descontarlos acá sería contarlos dos veces.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Boleta, Pago
from schemas import CuentasCorrientesOut, SaldoLocacionOut, SaldoClienteOut

router = APIRouter(tags=["cuentas"])

LOC_NOMBRES = {
    'M':   'Miramar',
    'MDP': 'Mar del Plata',
    'O':   'Otamendi',
    'B':   'Balcarce',
}

LOC_ORDER = ['M', 'MDP', 'O', 'B']


def _es_pago_automatico(pago: Pago) -> bool:
    return bool(pago.nota and pago.nota.startswith('Entrega boleta'))


def _calcular_saldos(db: Session) -> dict:
    """
    Devuelve { locacion: { cliente: { saldo_boletas, total_pagado, saldo_actual } } }
    Solo cuenta pagos manuales — los automáticos ya están en el `debe` de la boleta.
    """
    resultado = {}

    # ── Sumar debe por locacion/cliente desde boletas ──
    for b in db.query(Boleta).all():
        loc = b.locacion or '?'
        cli = b.cliente  or '(sin nombre)'
        if loc not in resultado:
            resultado[loc] = {}
        if cli not in resultado[loc]:
            resultado[loc][cli] = {'saldo_boletas': 0.0, 'total_pagado': 0.0}
        resultado[loc][cli]['saldo_boletas'] += b.debe or 0

    # ── Restar solo pagos manuales ──
    for p in db.query(Pago).all():
        if _es_pago_automatico(p):
            continue  # ya descontado en el `debe` de la boleta
        loc = p.locacion or '?'
        cli = p.cliente  or '(sin nombre)'
        if loc not in resultado:
            resultado[loc] = {}
        if cli not in resultado[loc]:
            resultado[loc][cli] = {'saldo_boletas': 0.0, 'total_pagado': 0.0}
        resultado[loc][cli]['total_pagado'] += p.monto or 0

    # ── Calcular saldo_actual por cliente ──
    for loc in resultado:
        for cli in resultado[loc]:
            d = resultado[loc][cli]
            d['saldo_actual'] = round(d['saldo_boletas'] - d['total_pagado'], 2)
            d['saldo_boletas'] = round(d['saldo_boletas'], 2)
            d['total_pagado']  = round(d['total_pagado'], 2)

    return resultado


@router.get("/cuentas-corrientes", response_model=CuentasCorrientesOut)
def cuentas_corrientes(db: Session = Depends(get_db)):
    agrupado = _calcular_saldos(db)

    locs_presentes = list(agrupado.keys())
    locs_ordenadas = (
        [l for l in LOC_ORDER if l in locs_presentes] +
        sorted([l for l in locs_presentes if l not in LOC_ORDER])
    )

    locaciones    = []
    total_general = 0.0

    for loc in locs_ordenadas:
        clientes_dict = agrupado[loc]
        clientes_out  = []

        for cli, datos in sorted(clientes_dict.items(), key=lambda x: x[1]['saldo_actual'], reverse=True):
            clientes_out.append(SaldoClienteOut(
                cliente       = cli,
                saldo_boletas = datos['saldo_boletas'],
                total_pagado  = datos['total_pagado'],
                saldo_actual  = datos['saldo_actual'],
            ))

        total_loc      = round(sum(c.saldo_actual for c in clientes_out), 2)
        total_general += total_loc

        locaciones.append(SaldoLocacionOut(
            locacion       = loc,
            nombre         = LOC_NOMBRES.get(loc, loc),
            clientes       = clientes_out,
            total_locacion = total_loc,
        ))

    return CuentasCorrientesOut(
        locaciones    = locaciones,
        total_general = round(total_general, 2),
    )


@router.get("/cuentas-corrientes/cliente/{cliente}", response_model=dict)
def saldo_cliente(cliente: str, db: Session = Depends(get_db)):
    """Usado por el front para auto-fill de saldoAnterior."""
    boletas = db.query(Boleta).filter(Boleta.cliente == cliente).all()
    pagos   = db.query(Pago).filter(Pago.cliente == cliente).all()

    saldo_boletas = sum(b.debe or 0 for b in boletas)
    # Solo pagos manuales
    total_pagado  = sum(p.monto or 0 for p in pagos if not _es_pago_automatico(p))
    saldo_actual  = round(saldo_boletas - total_pagado, 2)
    return {"cliente": cliente, "saldo": saldo_actual}