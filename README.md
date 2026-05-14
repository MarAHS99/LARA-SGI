# 🐄 L.A.R.A Menudencias

**Sistema interno de gestión comercial** para una distribuidora de achuras en Miramar, Argentina.

Desarrollado con Python + FastAPI corriendo como aplicación de escritorio nativa mediante PyWebView — sin dependencias de internet, sin servidores externos, todo local.

---

## ¿Qué hace?

L.A.R.A cubre el ciclo completo de operación de la distribuidora:

- **Ventas** — carga de boletas con ID semántico, saldo anterior automático, pagos de entrega, notas, historial paginado con filtros
- **Compras** — registro por proveedor con kilos y unidades opcionales
- **Precios** — generales y por cliente, con resolución automática al cargar boleta
- **Cuentas corrientes** — por cliente y proveedor, con pagos manuales y automáticos
- **Achureros** — registro de gastos por jornada (fecha, achurero, monto, localidad)
- **Cierre del período** — rango de fechas, detalle por localidad → cliente, total neto real
- **Análisis** — dashboard con comparativa de períodos, tendencias, rentabilidad por producto, clientes inactivos
- **Excel** — exportación completa con grilla de productos, CC clientes, gastos achureros, CC proveedores y margen neto destacado
- **Multi-usuario** — admin con acceso completo / viewer solo lectura

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI + SQLAlchemy + SQLite |
| Frontend | Vanilla HTML / CSS / JS |
| Desktop | PyWebView + uvicorn en thread |
| Exports | openpyxl |
| Auth | PBKDF2-HMAC-SHA256 + rate limiting |
| Empaquetado | PyInstaller + Inno Setup |

---

## Instalación para desarrollo

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/lara-menudencias.git
cd lara-menudencias

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Correr migraciones (primera vez)
python migratecancomp.py
python migratev06.py
python migrate_gastos_achurero.py

# 4. Levantar la app
python app_launcher.py
```

---

## Credenciales por defecto

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| AUT | 12345 | Admin completo |
| ROT | 123456 | Solo lectura |

---

## Empaquetado como .exe

```bash
pip install pyinstaller
pyinstaller lara.spec
```

El ejecutable queda en `dist/LARA/LARA.exe`.
Para generar el instalador, compilar `lara_installer.iss` con [Inno Setup](https://jrsoftware.org/isinfo.php).

La base de datos se almacena en `AppData\Local\LARAMenudencias\lara.db` — no se borra al desinstalar.

---

## Estructura del proyecto

```
├── app_launcher.py          # Entry point — PyWebView + uvicorn
├── main.py                  # App FastAPI + middleware
├── models.py                # ORM SQLAlchemy
├── schemas.py               # Validaciones Pydantic
├── database.py              # Engine + session
├── routers/                 # Endpoints por módulo
│   ├── auth.py
│   ├── boletas.py
│   ├── compras.py
│   ├── analisis.py
│   ├── exportar.py
│   └── ...
├── static/                  # Frontend
│   ├── index.html
│   ├── script.js
│   ├── styles.css
│   └── assets/
├── lara.spec                # Config PyInstaller
└── lara_installer.iss       # Config Inno Setup
```

---

## Contexto

Proyecto personal desarrollado para uso interno real en una distribuidora familiar. El objetivo era reemplazar el registro manual en papel/Excel por un sistema robusto, rápido y fácil de usar desde Windows sin ninguna dependencia externa.

---

*Desarrollado por Marcelo Aguirre — Miramar, Argentina*
