"""
L.A.R.A Menudencias — Backend API

Run:
    uvicorn main:app --reload
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db
from routers import (
    boletas, compras, cuentas, pagos,
    clientes, proveedores, stock, productos,
    analisis, achureros, cierre, pagos_proveedor, exportar,
    gastos_achurero,
)
from routers.auth import router as auth_router, COOKIE_NAME, _sesiones


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="L.A.R.A Menudencias API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://127.0.0.1"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api/") or path.startswith("/api/auth/"):
        return await call_next(request)
    token = request.cookies.get(COOKIE_NAME)
    if not token or token not in _sesiones:
        return JSONResponse(status_code=401, content={"detail": "No autenticado"})
    return await call_next(request)

app.include_router(auth_router,        prefix="/api")
app.include_router(boletas.router,     prefix="/api")
app.include_router(compras.router,     prefix="/api")
app.include_router(cuentas.router,     prefix="/api")
app.include_router(pagos.router,       prefix="/api")
app.include_router(clientes.router,    prefix="/api")
app.include_router(proveedores.router, prefix="/api")
app.include_router(stock.router,       prefix="/api")
app.include_router(productos.router,   prefix="/api")
app.include_router(analisis.router,    prefix="/api")
app.include_router(achureros.router,   prefix="/api")
app.include_router(cierre.router,              prefix="/api")
app.include_router(pagos_proveedor.router,     prefix="/api")
app.include_router(exportar.router,            prefix="/api")
app.include_router(gastos_achurero.router,     prefix="/api")

app.mount("/", StaticFiles(directory="static", html=True), name="static")