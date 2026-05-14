"""
L.A.R.A Menudencias — Launcher de escritorio
Arranca FastAPI en un thread y abre PyWebView como ventana nativa.

Uso en desarrollo:    python app_launcher.py
Uso en producción:    este archivo es el entry point de PyInstaller
"""

import sys
import os
import threading
import time
import socket
import uvicorn
import webview

# ── Resolver rutas cuando corre como .exe empaquetado ────────
def resource_path(relative: str) -> str:
    """
    PyInstaller extrae los archivos a una carpeta temporal (_MEIPASS).
    En desarrollo usa la carpeta actual.
    """
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative)


# ── Resolver ruta del .db (AppData del usuario) ───────────────
def db_path() -> str:
    """
    En producción el .db vive en AppData/Local/LARAMenudencias
    para garantizar permisos de escritura.
    En desarrollo usa la carpeta local.
    """
    if getattr(sys, 'frozen', False):
        # Corriendo como .exe
        app_data = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'LARAMenudencias')
        os.makedirs(app_data, exist_ok=True)
        return os.path.join(app_data, 'lara.db')
    else:
        # Desarrollo
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lara.db')


# ── Inyectar la ruta del .db antes de importar la app ─────────
os.environ['LARA_DB_PATH'] = db_path()

# ── Agregar el directorio de la app al path ───────────────────
app_dir = resource_path('.')
if app_dir not in sys.path:
    sys.path.insert(0, app_dir)


PORT = 8765  # Puerto interno — la usuaria nunca lo ve


# ── API expuesta al frontend via window.pywebview.api ─────────
class API:
    def __init__(self):
        self._window = None

    def cerrar(self):
        if self._window:
            self._window.destroy()

    def guardar_excel(self, b64_data: str, filename: str) -> str:
        """
        Abre un diálogo 'Guardar como' y escribe el archivo Excel.
        Devuelve la ruta donde se guardó, o '' si el usuario canceló.
        """
        import base64
        import webview

        save_path = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            directory  = '',
            save_filename = filename,
            file_types = ('Excel (*.xlsx)',),
        )

        if not save_path:
            return ''

        # En algunas versiones devuelve tuple, en otras string
        path = save_path[0] if isinstance(save_path, (list, tuple)) else save_path

        # Asegurar extensión
        if not path.endswith('.xlsx'):
            path += '.xlsx'

        with open(path, 'wb') as f:
            f.write(base64.b64decode(b64_data))

        return path


def puerto_libre(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) != 0


def iniciar_servidor():
    """Corre uvicorn en un thread daemon."""
    os.chdir(resource_path('.'))
    from main import app
    uvicorn.run(app, host='127.0.0.1', port=PORT, log_level='error')


def esperar_servidor(timeout: int = 15) -> bool:
    """Espera hasta que el servidor responda."""
    inicio = time.time()
    while time.time() - inicio < timeout:
        if not puerto_libre(PORT):
            return True
        time.sleep(0.1)
    return False


def main():
    # Arrancar servidor en background
    t = threading.Thread(target=iniciar_servidor, daemon=True)
    t.start()

    # Esperar que levante
    esperar_servidor()

    # Crear API y ventana
    api = API()

    window = webview.create_window(
        title      = 'L.A.R.A Menudencias',
        url        = f'http://127.0.0.1:{PORT}',
        min_size   = (1024, 700),
        resizable  = True,
        js_api     = api,
    )

    # Asignar referencia a la ventana en la API
    api._window = window

    webview.start(debug=False)


if __name__ == '__main__':
    main()