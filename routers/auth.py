"""
Router: /api/auth
Dos usuarios: admin y viewer (solo lectura).

Credenciales via variables de entorno (.env):
    LARA_USER           usuario admin
    LARA_PASSWORD       contrasena admin
    LARA_USER_LUIS      usuario viewer
    LARA_PASSWORD_LUIS  contrasena viewer
"""

import os
import secrets
import hashlib
import time
from collections import defaultdict
from fastapi import APIRouter, Response, Request, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["auth"])

COOKIE_NAME = "lara_session"
_sesiones: dict = {}

_intentos_fallidos: dict = defaultdict(list)
_MAX_INTENTOS = 5
_VENTANA_SEG  = 60
_BLOQUEO_SEG  = 60


def _check_rate_limit(ip: str):
    ahora = time.time()
    _intentos_fallidos[ip] = [t for t in _intentos_fallidos[ip] if ahora - t < _VENTANA_SEG]
    if len(_intentos_fallidos[ip]) >= _MAX_INTENTOS:
        restante = int(_BLOQUEO_SEG - (ahora - _intentos_fallidos[ip][0]))
        raise HTTPException(status_code=429, detail=f"Demasiados intentos. Espera {max(restante,1)}s.")

def _registrar_fallo(ip: str):
    _intentos_fallidos[ip].append(time.time())

def _limpiar_ip(ip: str):
    _intentos_fallidos.pop(ip, None)


_SALT = b"lara_menudencias_salt_v1"

def _hashear(password: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), _SALT, 260_000).hex()

def _verificar(password: str, hashed: str) -> bool:
    return secrets.compare_digest(_hashear(password), hashed)


def _cargar_usuarios() -> dict:
    admin_user = os.getenv("LARA_USER", "Romina")
    admin_pass = os.getenv("LARA_PASSWORD", "L4R4M3N")
    luis_user  = os.getenv("LARA_USER_LUIS", "Luis")
    luis_pass  = os.getenv("LARA_PASSWORD_LUIS", "L4R4Luis")
    return {
        admin_user: {"hash": _hashear(admin_pass), "rol": "admin"},
        luis_user:  {"hash": _hashear(luis_pass),  "rol": "viewer"},
    }

_usuarios = _cargar_usuarios()
_hash_admin_mutable = {"hash": _usuarios[os.getenv("LARA_USER", "Romina")]["hash"]}


def get_rol(token: str) -> str | None:
    return _sesiones.get(token)


class LoginIn(BaseModel):
    usuario:    str
    contrasena: str

class CambioPasswordIn(BaseModel):
    contrasena_actual: str
    contrasena_nueva:  str


@router.post("/auth/login")
def login(data: LoginIn, request: Request, response: Response):
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)
    usuario = data.usuario.strip()
    if usuario not in _usuarios:
        _registrar_fallo(ip)
        raise HTTPException(status_code=401, detail="Usuario o contrasena incorrectos")
    config = _usuarios[usuario]
    hash_v = _hash_admin_mutable["hash"] if config["rol"] == "admin" else config["hash"]
    if not _verificar(data.contrasena, hash_v):
        _registrar_fallo(ip)
        raise HTTPException(status_code=401, detail="Usuario o contrasena incorrectos")
    _limpiar_ip(ip)
    token = secrets.token_hex(32)
    _sesiones[token] = config["rol"]
    response.set_cookie(key=COOKIE_NAME, value=token, httponly=True, samesite="lax", max_age=60*60*12)
    return {"ok": True, "rol": config["rol"]}


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        _sesiones.pop(token, None)
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/auth/check")
def check(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token or token not in _sesiones:
        raise HTTPException(status_code=401, detail="No autenticado")
    return {"ok": True, "rol": _sesiones[token]}


@router.post("/auth/cambiar-password")
def cambiar_password(data: CambioPasswordIn, request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token or token not in _sesiones:
        raise HTTPException(status_code=401, detail="No autenticado")
    if _sesiones[token] != "admin":
        raise HTTPException(status_code=403, detail="Sin permisos")
    if not _verificar(data.contrasena_actual, _hash_admin_mutable["hash"]):
        raise HTTPException(status_code=400, detail="Contrasena actual incorrecta")
    if len(data.contrasena_nueva.strip()) < 4:
        raise HTTPException(status_code=400, detail="Minimo 4 caracteres")
    _hash_admin_mutable["hash"] = _hashear(data.contrasena_nueva.strip())
    return {"ok": True}
