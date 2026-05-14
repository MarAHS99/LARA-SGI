# -*- mode: python ; coding: utf-8 -*-
# lara.spec — PyInstaller spec para L.A.R.A Menudencias
# Ejecutar desde la carpeta raíz del proyecto:
#   pyinstaller lara.spec

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# ── Archivos de datos a incluir ───────────────────────────────
datas = [
    ('static',   'static'),    # HTML, CSS, JS, assets
    ('routers',  'routers'),   # Routers FastAPI
]

# ── Imports ocultos que PyInstaller no detecta solo ───────────
hiddenimports = [
    # FastAPI / Starlette
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'starlette.routing',
    'starlette.middleware',
    'starlette.middleware.cors',
    # SQLAlchemy
    'sqlalchemy.dialects.sqlite',
    'sqlalchemy.orm',
    # Email validator (requerido por pydantic)
    'email_validator',
    # Routers
    'routers.auth',
    'routers.boletas',
    'routers.compras',
    'routers.cuentas',
    'routers.pagos',
    'routers.pagos_proveedor',
    'routers.clientes',
    'routers.proveedores',
    'routers.achureros',
    'routers.gastos_achurero',
    'routers.productos',
    'routers.precios',
    'routers.analisis',
    'routers.cierre',
    'routers.exportar',
    'routers.stock',
    # Otros
    'openpyxl',
    'multipart',
    'python_multipart',
]

a = Analysis(
    ['app_launcher.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',
        'PIL',
        'test',
        'unittest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='LARA',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,        # Sin ventana de consola negra
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='static\\favicon.ico',  # Ícono del .exe
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='LARA',
)
