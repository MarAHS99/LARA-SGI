/* ═══════════════════════════════════════════════════════════
   L.A.R.A Menudencias — Frontend
   ═══════════════════════════════════════════════════════════ */

const API = '/api';

// ── Tema claro/oscuro ─────────────────────────────────────
function toggleTheme() {
  const root    = document.documentElement;
  const isLight = root.getAttribute('data-theme') === 'light';
  root.setAttribute('data-theme', isLight ? 'dark' : 'light');
  document.getElementById('theme-icon').textContent  = isLight ? '🌙' : '☀️';
  document.getElementById('theme-label').textContent = isLight ? 'Oscuro' : 'Claro';
  localStorage.setItem('lara-theme', isLight ? 'dark' : 'light');
}

// Restaurar tema guardado
(function() {
  const saved = localStorage.getItem('lara-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    const icon  = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (icon)  icon.textContent  = '☀️';
    if (label) label.textContent = 'Claro';
  }
})();

document.getElementById('fecha').valueAsDate        = new Date();
document.getElementById('fecha-compra').valueAsDate = new Date();

const LOC_NOMBRES = { M:'Miramar', MDP:'Mar del Plata', O:'Otamendi', B:'Balcarce' };
const LOC_ORDER   = ['M','MDP','O','B'];

const formatMoney = n => '$ ' + Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const formatKg    = n => Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' kg';
const round2      = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Lista dinámica de productos [{ id, nombre, orden, precio }]
let PRODUCTOS = [];
// Precios generales { nombre: precio }
let PRECIOS   = {};
// Precios resueltos para el cliente actual en boleta { nombre: precio }
let PRECIOS_CLIENTE_ACTIVO = {};

let EDITANDO_ID  = null;
let SALDO_MANUAL = false;

/* ─── API HELPER ──────────────────────────────────────────── */

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (!res.ok) {
      if (res.status === 401) {
        mostrarLogin();
        throw new Error('No autenticado');
      }
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Error ${res.status}`);
    }
    if (res.status === 204) return null;
    return await res.json();
  } catch (e) {
    console.error(`API error [${path}]:`, e.message);
    throw e;
  }
}

/* ─── PRODUCTOS ───────────────────────────────────────────── */

async function cargarProductos() {
  try {
    const data = await apiFetch('/productos');
    PRODUCTOS = data;
    PRECIOS   = {};
    data.forEach(p => { PRECIOS[p.nombre] = p.precio; });
    PRECIOS_CLIENTE_ACTIVO = { ...PRECIOS };
  } catch {
    console.warn('No se pudieron cargar productos');
  }
}

function getPrecioProducto(nombre) {
  return PRECIOS_CLIENTE_ACTIVO[nombre] ?? PRECIOS[nombre] ?? 0;
}

async function resolverPreciosCliente(cliente) {
  if (!cliente) {
    PRECIOS_CLIENTE_ACTIVO = { ...PRECIOS };
    return;
  }
  try {
    const data = await apiFetch(`/precios/resolver/${encodeURIComponent(cliente)}`);
    PRECIOS_CLIENTE_ACTIVO = data;
  } catch {
    PRECIOS_CLIENTE_ACTIVO = { ...PRECIOS };
  }
}

function buildTablaVentas() {
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';
  PRODUCTOS.forEach((prod, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" min="0" step="1"   placeholder="0"   class="cant" id="cant-${i}" data-nav="ventas" data-row="${i}" data-col="0" oninput="calcFila(${i})"></td>
      <td class="prod-name">${prod.nombre}</td>
      <td><input type="number" min="0" step="any" placeholder="0.0" id="kg-${i}" data-nav="ventas" data-row="${i}" data-col="1" oninput="calcFila(${i})"></td>
      <td><input type="number" min="0" step="1"   placeholder="0"   id="px-${i}" data-nav="ventas" data-row="${i}" data-col="2" oninput="calcFila(${i})"></td>
      <td class="subtotal-cell" id="sub-${i}">—</td>`;
    tr.addEventListener('click', () => {
      document.querySelectorAll('#tbody tr').forEach(r => r.classList.remove('active-row'));
      tr.classList.add('active-row');
    });
    tbody.appendChild(tr);
    const px = document.getElementById('px-' + i);
    if (px) px.value = getPrecioProducto(prod.nombre) || '';
  });
}

function buildTablaCompra() {
  const compraBody = document.getElementById('compra-body');
  compraBody.innerHTML = '';
  PRODUCTOS.forEach((prod, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="prod-name">${prod.nombre}</td>
      <td><input type="number" min="0" step="any" placeholder="0.0" id="c-kg-${i}" data-nav="compra" data-row="${i}" data-col="0" oninput="calcCompraFila(${i})" style="width:100%;background:var(--panel);border:1px solid var(--edge);border-radius:6px;padding:5px 7px;color:var(--text-1);font-size:13px;text-align:right;outline:none;box-sizing:border-box;"></td>
      <td><input type="number" min="0" step="1"   placeholder="0"   id="c-px-${i}" data-nav="compra" data-row="${i}" data-col="1" oninput="calcCompraFila(${i})" style="width:100%;background:var(--panel);border:1px solid var(--edge);border-radius:6px;padding:5px 7px;color:var(--text-1);font-size:13px;text-align:right;outline:none;box-sizing:border-box;"></td>
      <td><input type="number" min="0" step="1" placeholder="Unid." id="c-cant-${i}" data-nav="compra" data-row="${i}" data-col="2" style="width:100%;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:5px 7px;color:var(--text-3);font-size:12px;text-align:right;outline:none;box-sizing:border-box;" title="Opcional — solo si el proveedor entrega por unidades"></td>
      <td class="subtotal-cell" id="c-sub-${i}" style="text-align:right;">—</td>`;
    tr.addEventListener('click', () => {
      document.querySelectorAll('#compra-body tr').forEach(r => r.classList.remove('active-row'));
      tr.classList.add('active-row');
    });
    compraBody.appendChild(tr);
  });
}

function buildTablaPrecios() {
  const preciosBody = document.getElementById('precios-body');
  if (!preciosBody) return;
  preciosBody.innerHTML = '';
  PRODUCTOS.forEach((prod, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="prod-name">${prod.nombre}</td>
      <td><input type="number" min="0" step="1" placeholder="0" id="precio-${i}" data-nav="precios" data-row="${i}" data-col="0" value="${prod.precio}" oninput="updatePrecioGeneral(${i})"></td>`;
    preciosBody.appendChild(tr);
  });
}

/* ─── PRECIOS GENERALES ───────────────────────────────────── */

async function guardarPrecios() {
  const btn = document.getElementById('btn-guardar-precios');
  btn.textContent = 'Guardando...'; btn.disabled = true;
  const precios = {};
  PRODUCTOS.forEach((prod, i) => {
    const val = parseFloat(document.getElementById('precio-' + i)?.value) || 0;
    precios[prod.nombre] = val;
    PRECIOS[prod.nombre] = val;
    PRODUCTOS[i].precio  = val;
  });
  try {
    await apiFetch('/precios', { method: 'PUT', body: JSON.stringify({ precios }) });
    btn.textContent = '✔ Guardado'; btn.style.background = '#5DCAA5';
    setTimeout(() => { btn.textContent = 'Guardar precios'; btn.style.background = ''; btn.disabled = false; }, 2000);
  } catch (e) {
    alert('Error: ' + e.message);
    btn.textContent = 'Guardar precios'; btn.disabled = false;
  }
}

function updatePrecioGeneral(i) {
  const value = parseFloat(document.getElementById('precio-' + i).value) || 0;
  PRECIOS[PRODUCTOS[i].nombre]   = value;
  PRODUCTOS[i].precio            = value;
  const pxInput = document.getElementById('px-' + i);
  if (pxInput && (!pxInput.value || parseFloat(pxInput.value) <= 0)) {
    pxInput.value = value > 0 ? value : '';
    calcFila(i);
  }
}

/* ─── PRECIOS POR CLIENTE ─────────────────────────────────── */

async function showPreciosClienteTab() {
  // Renderizar estructura base si no existe
  const panel = document.getElementById('precios-cliente');
  if (!panel.dataset.init) {
    panel.dataset.init = '1';
    panel.querySelector('.section-body').innerHTML = `
      <!-- Buscador para cualquier cliente -->
      <div class="section-panel-inner" style="margin-bottom:16px;">
        <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;">
          <div>
            <label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Buscar cliente</label>
            <input type="text" id="precios-cliente-input" list="precios-clientes-list"
              placeholder="— Cualquier cliente —"
              style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:10px 12px;color:var(--text-1);font-size:14px;box-sizing:border-box;outline:none;">
            <datalist id="precios-clientes-list"></datalist>
          </div>
          <button onclick="cargarPreciosCliente()"
            style="background:var(--violet-glow);border:1px solid rgba(123,110,246,0.4);border-radius:10px;color:var(--text-1);padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
            Ver precios
          </button>
        </div>
      </div>

      <!-- Lista agrupada de clientes con precios especiales -->
      <div id="precios-especiales-lista" style="margin-bottom:16px;"></div>

      <!-- Tabla editable del cliente seleccionado -->
      <div id="precios-cliente-tabla"></div>`;
  }

  // Cargar clientes con precios especiales
  await _renderClientesConEspeciales();
}

async function _renderClientesConEspeciales() {
  const cont = document.getElementById('precios-especiales-lista');
  if (!cont) return;

  let grupos;
  try { grupos = await apiFetch('/precios/clientes-con-especiales'); }
  catch (e) { cont.innerHTML = `<div style="color:var(--danger);font-size:13px;">Error cargando lista</div>`; return; }

  if (!grupos || grupos.length === 0) {
    cont.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:4px 0;">Ningún cliente tiene precios especiales aún.</div>`;
    return;
  }

  let html = `<div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Clientes con precios especiales</div>`;

  grupos.forEach(g => {
    html += `<div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:700;color:var(--violet);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">📍 ${g.nombre}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${g.clientes.map(c =>
          `<button onclick="seleccionarClientePrecios(this.dataset.cliente)"
            class="precio-cliente-chip" data-cliente="${c}"
            style="background:var(--violet-glow);border:1px solid rgba(123,110,246,0.35);border-radius:8px;color:var(--text-1);font-size:12px;font-weight:600;padding:5px 12px;cursor:pointer;transition:all 0.15s ease;">
            ${c}
          </button>`
        ).join('')}
      </div>
    </div>`;
  });

  cont.innerHTML = html;
}

function seleccionarClientePrecios(cliente) {
  // Marcar chip activo
  document.querySelectorAll('.precio-cliente-chip').forEach(b => {
    b.style.background = b.dataset.cliente === cliente
      ? 'rgba(123,110,246,0.4)'
      : 'rgba(123,110,246,0.15)';
    b.style.borderColor = b.dataset.cliente === cliente
      ? 'var(--violet)'
      : 'rgba(123,110,246,0.35)';
  });
  // Poner en el input y cargar
  const input = document.getElementById('precios-cliente-input');
  if (input) input.value = cliente;
  cargarPreciosCliente();
}

async function cargarPreciosCliente() {
  const cliente = document.getElementById('precios-cliente-input').value.trim();
  if (!cliente) { alert('Seleccioná un cliente'); return; }

  // Marcar chip si existe
  document.querySelectorAll('.precio-cliente-chip').forEach(b => {
    b.style.background = b.dataset.cliente === cliente
      ? 'rgba(123,110,246,0.4)'
      : 'rgba(123,110,246,0.15)';
    b.style.borderColor = b.dataset.cliente === cliente
      ? 'var(--violet)'
      : 'rgba(123,110,246,0.35)';
  });

  const cont = document.getElementById('precios-cliente-tabla');
  cont.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-3);">Cargando...</div>`;

  let data;
  try { data = await apiFetch(`/precios/cliente/${encodeURIComponent(cliente)}`); }
  catch (e) { cont.innerHTML = `<div class="section-panel-inner" style="color:var(--danger);padding:24px;text-align:center;">Error: ${e.message}</div>`; return; }

  const clienteEsc = cliente.replace(/'/g, "\'");
  cont.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:13px;color:var(--text-2);">
        Precios especiales para <strong style="color:var(--text-1);">${cliente}</strong>.
        Dejá vacío para usar el precio general.
      </div>
      <button onclick="guardarPreciosCliente('${clienteEsc}')"
        id="btn-guardar-precios-cliente"
        style="background:var(--violet);color:var(--text-1);border:none;
               border-radius:10px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
        Guardar precios de ${cliente}
      </button>
    </div>
    <div class="section-panel-inner" style="padding:0;overflow:hidden;">
      <table class="lara-table" style="table-layout:fixed;">
        <thead><tr>
          <th style="width:36%;">Artículo</th>
          <th style="width:22%;text-align:right;">General</th>
          <th style="width:24%;text-align:right;">Especial</th>
          <th style="width:18%;text-align:right;">Efectivo</th>
        </tr></thead>
        <tbody id="precios-cliente-body"></tbody>
      </table>
    </div>`;

  const tbodyEl = document.getElementById('precios-cliente-body');
  data.forEach((item, i) => {
    const tr = document.createElement('tr');
    const tieneEspecial = item.precio_especial !== null && item.precio_especial !== undefined;
    tr.innerHTML = `
      <td class="prod-name" style="padding:8px 12px;">${item.producto}</td>
      <td style="text-align:right;padding:8px 12px;font-size:12px;color:var(--text-3);">
        ${formatMoney(item.precio_general)}
      </td>
      <td style="text-align:right;padding:8px 6px;">
        <input type="number" min="0" step="1" placeholder="—"
          id="pc-${i}"
          data-nav="precios-cliente" data-row="${i}" data-col="0"
          value="${tieneEspecial ? item.precio_especial : ''}"
          style="width:90%;background:var(--panel);border:1px solid var(--edge);
                 border-radius:8px;padding:6px 8px;color:var(--text-1);font-size:13px;text-align:right;
                 outline:none;box-sizing:border-box;"
          oninput="actualizarEfectivo(${i}, ${item.precio_general})">
      </td>
      <td id="pc-efectivo-${i}" style="text-align:right;padding:8px 12px;font-size:13px;font-weight:700;
        color:${tieneEspecial ? 'var(--violet)' : 'rgba(255,255,255,0.5)'};">
        ${formatMoney(item.precio_efectivo)}
      </td>`;
    tbodyEl.appendChild(tr);
  });

  window._preciosClienteData = data;
}
function actualizarEfectivo(i, precioGeneral) {
  const val     = parseFloat(document.getElementById(`pc-${i}`)?.value);
  const efectivo = (!isNaN(val) && val > 0) ? val : precioGeneral;
  const tdEfect  = document.getElementById(`pc-efectivo-${i}`);
  if (tdEfect) {
    tdEfect.textContent = formatMoney(efectivo);
    tdEfect.style.color = (!isNaN(val) && val > 0) ? 'var(--violet)' : 'rgba(255,255,255,0.5)';
  }
}

async function guardarPreciosCliente(cliente) {
  const data   = window._preciosClienteData || [];
  const precios = {};

  data.forEach((item, i) => {
    const val = parseFloat(document.getElementById(`pc-${i}`)?.value);
    precios[item.producto] = (!isNaN(val) && val > 0) ? val : null;
  });

  const btn = document.getElementById('btn-guardar-precios-cliente');
  const textoOriginal = `Guardar precios de ${cliente}`;
  btn.textContent = 'Guardando...'; btn.disabled = true;

  try {
    await apiFetch(`/precios/cliente/${encodeURIComponent(cliente)}`, {
      method: 'PUT',
      body:   JSON.stringify({ precios }),
    });
    btn.textContent = '✔ Guardado';
    btn.style.setProperty('background', 'var(--mint)');
    await _renderClientesConEspeciales();
    setTimeout(() => {
      btn.textContent = textoOriginal;
      btn.style.removeProperty('background');
      btn.disabled = false;
    }, 2000);
  } catch (e) {
    alert('Error: ' + e.message);
    btn.textContent = textoOriginal; btn.disabled = false;
  }
}

/* ─── CLIENTES ────────────────────────────────────────────── */

async function cargarSidebar() {
  let clientes;
  try { clientes = await apiFetch('/clientes'); }
  catch { return; }

  const sidebarBody = document.getElementById('sidebar-body');
  sidebarBody.innerHTML = '';
  const grupos = {};
  clientes.forEach(c => { if (!grupos[c.locacion]) grupos[c.locacion]=[]; grupos[c.locacion].push(c); });
  LOC_ORDER.forEach(loc => {
    if (!grupos[loc]?.length) return;
    const grupo = document.createElement('div');
    grupo.className = 'sidebar-group';
    grupo.innerHTML = `<div class="sidebar-location">📍 ${LOC_NOMBRES[loc]}</div>`;
    const ul = document.createElement('ul');
    ul.className = 'sidebar-clients';
    grupos[loc].forEach(c => {
      const li = document.createElement('li');
      li.textContent = c.nombre;
      li.onclick = () => selectClient(c.nombre, c.locacion);
      ul.appendChild(li);
    });
    grupo.appendChild(ul);
    sidebarBody.appendChild(grupo);
  });

  const datalist = document.getElementById('clientes-list');
  datalist.innerHTML = '';
  clientes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.nombre;
    datalist.appendChild(opt);
  });

  const datalistPrecios = document.getElementById('precios-clientes-list');
  if (datalistPrecios) {
    datalistPrecios.innerHTML = '';
    clientes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nombre;
      datalistPrecios.appendChild(opt);
    });
  }
}

/* ─── PROVEEDORES ─────────────────────────────────────────── */

async function cargarProveedores() {
  let proveedores;
  try { proveedores = await apiFetch('/proveedores'); }
  catch { return; }
  const select = document.getElementById('proveedor');
  select.innerHTML = '<option value="">— Seleccionar —</option>';
  proveedores.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.nombre; opt.textContent = p.nombre;
    select.appendChild(opt);
  });
}

async function cargarAchureros() {
  let achureros;
  try { achureros = await apiFetch('/achureros'); }
  catch { return; }
  const select = document.getElementById('achurero');
  const valorActual = select.value;
  select.innerHTML = '<option value="">— Seleccionar —</option>';
  achureros.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.nombre; opt.textContent = a.nombre;
    select.appendChild(opt);
  });
  if (valorActual) select.value = valorActual;
}

/* ─── CONFIG PRODUCTOS ────────────────────────────────────── */

async function renderConfigProductos() {
  const cont = document.getElementById('config-productos');
  cont.innerHTML = `<div class="section-body"><div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div></div>`;
  let prods;
  try { prods = await apiFetch('/productos'); }
  catch (e) { cont.innerHTML = `<div class="section-body"><div class="section-panel-inner" style="color:var(--danger);padding:48px;text-align:center;">Error: ${e.message}</div></div>`; return; }

  cont.innerHTML = `
    <div class="section-body">
      <div class="section-panel-inner" style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">➕ Nuevo producto</div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;">
          <div>
            <label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Nombre</label>
            <input id="nuevo-producto-nombre" type="text" placeholder="Ej: Tripa Gorda"
              style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:9px 12px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;">
          </div>
          <button onclick="agregarProducto()"
            style="background:var(--violet);color:var(--text-1);border:none;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
            Agregar
          </button>
        </div>
      </div>
      <div class="section-panel-inner" style="padding:0;overflow:hidden;">
        <div style="padding:10px 12px 6px;font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;">↕ Arrastrá para reordenar</div>
        <ul id="productos-lista" style="list-style:none;margin:0;padding:0 0 8px;"></ul>
      </div>
    </div>`;

  const lista = document.getElementById('productos-lista');
  prods.forEach(p => {
    const nombreEscapado = p.nombre.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const li = document.createElement('li');
    li.dataset.id    = p.id;
    li.dataset.orden = p.orden;
    li.draggable     = true;
    li.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--edge);cursor:grab;';
    li.innerHTML = `
      <span style="color:var(--text-3);font-size:16px;user-select:none;">⠿</span>
      <span id="prod-nombre-${p.id}" style="flex:1;font-size:13px;color:var(--text-1);">${p.nombre}</span>
      <input id="prod-edit-nombre-${p.id}" type="text" value="${p.nombre}"
        style="display:none;flex:1;background:var(--panel);border:1px solid var(--edge-hi);border-radius:6px;padding:5px 8px;color:var(--text-1);font-size:13px;outline:none;">
      <div id="prod-acciones-${p.id}" style="display:flex;gap:6px;">
        <button onclick="editarProductoUI(${p.id})" style="background:var(--violet-glow);border:1px solid rgba(123,110,246,0.4);border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 10px;">✏️</button>
        <button onclick="eliminarProducto(${p.id},'${nombreEscapado}')" style="background:transparent;border:1px solid rgba(255,90,90,0.3);border-radius:6px;color:var(--danger);font-size:12px;cursor:pointer;padding:4px 10px;">🗑️</button>
      </div>
      <div id="prod-edit-acciones-${p.id}" style="display:none;gap:6px;">
        <button onclick="guardarEdicionProducto(${p.id})" style="background:var(--violet);border:none;border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 10px;font-weight:700;">✔</button>
        <button onclick="cancelarEdicionProducto(${p.id})" style="background:var(--panel);border:1px solid var(--edge);border-radius:6px;color:var(--text-2);font-size:12px;cursor:pointer;padding:4px 10px;">✕</button>
      </div>`;
    lista.appendChild(li);
  });
  _initDragOrden(lista);
}

function editarProductoUI(id){document.getElementById(`prod-nombre-${id}`).style.display='none';document.getElementById(`prod-edit-nombre-${id}`).style.display='block';document.getElementById(`prod-acciones-${id}`).style.display='none';document.getElementById(`prod-edit-acciones-${id}`).style.display='flex';document.getElementById(`prod-edit-nombre-${id}`).focus();}
function cancelarEdicionProducto(id){document.getElementById(`prod-nombre-${id}`).style.display='';document.getElementById(`prod-edit-nombre-${id}`).style.display='none';document.getElementById(`prod-acciones-${id}`).style.display='flex';document.getElementById(`prod-edit-acciones-${id}`).style.display='none';}
async function guardarEdicionProducto(id){const nombre=document.getElementById(`prod-edit-nombre-${id}`).value.trim();if(!nombre){alert('El nombre no puede estar vacío');return;}const orden=parseInt(document.querySelector(`#productos-lista [data-id="${id}"]`)?.dataset.orden||0);try{await apiFetch(`/productos/${id}`,{method:'PUT',body:JSON.stringify({nombre,orden})});await cargarProductos();buildTablaVentas();buildTablaCompra();buildTablaPrecios();renderConfigProductos();}catch(e){alert('Error: '+e.message);}}
async function agregarProducto(){const nombre=document.getElementById('nuevo-producto-nombre').value.trim();if(!nombre){alert('Ingresá el nombre');return;}try{await apiFetch('/productos',{method:'POST',body:JSON.stringify({nombre,orden:PRODUCTOS.length})});await cargarProductos();buildTablaVentas();buildTablaCompra();buildTablaPrecios();renderConfigProductos();}catch(e){alert('Error: '+e.message);}}
async function eliminarProducto(id, nombre){if(!confirm(`¿Eliminar el producto "${nombre}"?\n\nLas boletas existentes no se verán afectadas.`))return;try{await apiFetch(`/productos/${id}`,{method:'DELETE'});await cargarProductos();buildTablaVentas();buildTablaCompra();buildTablaPrecios();renderConfigProductos();}catch(e){alert('Error: '+e.message);}}

function _initDragOrden(lista) {
  let dragging = null;
  lista.addEventListener('dragstart', e => { dragging = e.target.closest('li'); dragging.style.opacity = '0.4'; });
  lista.addEventListener('dragend',   e => { dragging.style.opacity = ''; dragging = null; _guardarOrden(lista); });
  lista.addEventListener('dragover',  e => { e.preventDefault(); const t = e.target.closest('li'); if (!t || t === dragging) return; const after = e.clientY > t.getBoundingClientRect().top + t.getBoundingClientRect().height / 2; lista.insertBefore(dragging, after ? t.nextSibling : t); });
}

async function _guardarOrden(lista) {
  const items = [...lista.querySelectorAll('li')].map((li, i) => ({ id: parseInt(li.dataset.id), orden: i }));
  try { await apiFetch('/productos-orden', { method: 'PUT', body: JSON.stringify(items) }); await cargarProductos(); buildTablaVentas(); buildTablaCompra(); buildTablaPrecios(); }
  catch (e) { console.error('Error guardando orden:', e.message); }
}

/* ─── CONFIG CLIENTES ─────────────────────────────────────── */

async function renderConfigClientes() {
  const cont = document.getElementById('config-clientes');
  cont.innerHTML = `<div class="section-body"><div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div></div>`;
  let clientes;
  try { clientes = await apiFetch('/clientes'); }
  catch (e) { cont.innerHTML = `<div class="section-body"><div class="section-panel-inner" style="color:var(--danger);padding:48px;text-align:center;">Error: ${e.message}</div></div>`; return; }

  cont.innerHTML = `
    <div class="section-body">
      <div class="section-panel-inner" style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">➕ Nuevo cliente</div>
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;">
          <div><label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Nombre</label><input id="nuevo-cliente-nombre" type="text" placeholder="Nombre del cliente" style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:9px 12px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;"></div>
          <div><label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Localidad</label><select id="nuevo-cliente-locacion" style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:9px 12px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;"><option value="">— Seleccionar —</option><option value="M">Miramar</option><option value="MDP">Mar del Plata</option><option value="O">Otamendi</option><option value="B">Balcarce</option></select></div>
          <button onclick="agregarCliente()" style="background:var(--violet);color:var(--text-1);border:none;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">Agregar</button>
        </div>
      </div>
      <div class="section-panel-inner" style="padding:0;overflow:hidden;">
        <table class="lara-table" style="table-layout:auto;"><thead><tr><th style="width:45%;">Nombre</th><th style="width:30%;">Localidad</th><th style="width:25%;text-align:center;">Acciones</th></tr></thead><tbody id="clientes-tabla-body"></tbody></table>
      </div>
    </div>`;

  const tbodyEl = document.getElementById('clientes-tabla-body');
  const grupos = {};
  clientes.forEach(c => { if (!grupos[c.locacion]) grupos[c.locacion]=[]; grupos[c.locacion].push(c); });
  LOC_ORDER.forEach(loc => {
    if (!grupos[loc]?.length) return;
    const trH = document.createElement('tr'); trH.style.cssText='background:var(--violet-glow);';
    trH.innerHTML=`<td colspan="3" style="font-size:11px;font-weight:700;color:var(--violet);text-transform:uppercase;letter-spacing:0.12em;padding:8px 12px;">📍 ${LOC_NOMBRES[loc]}</td>`;
    tbodyEl.appendChild(trH);
    grupos[loc].forEach(c=>{
      const nombreEscapado = c.nombre.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const tr=document.createElement('tr');
      tr.innerHTML=`<td style="padding:8px 12px;"><span id="cliente-nombre-${c.id}" style="font-size:13px;color:var(--text-1);">${c.nombre}</span><input id="cliente-edit-nombre-${c.id}" type="text" value="${c.nombre}" style="display:none;width:100%;background:var(--panel);border:1px solid var(--edge-hi);border-radius:6px;padding:5px 8px;color:var(--text-1);font-size:13px;outline:none;"></td><td style="padding:8px 12px;"><span id="cliente-loc-${c.id}" style="font-size:13px;color:var(--text-2);">${LOC_NOMBRES[c.locacion]||c.locacion}</span><select id="cliente-edit-loc-${c.id}" style="display:none;background:var(--panel);border:1px solid var(--edge-hi);border-radius:6px;padding:5px 8px;color:var(--text-1);font-size:13px;outline:none;"><option value="M" ${c.locacion==='M'?'selected':''}>Miramar</option><option value="MDP" ${c.locacion==='MDP'?'selected':''}>Mar del Plata</option><option value="O" ${c.locacion==='O'?'selected':''}>Otamendi</option><option value="B" ${c.locacion==='B'?'selected':''}>Balcarce</option></select></td><td style="text-align:center;padding:8px;"><div id="cliente-acciones-${c.id}" style="display:flex;gap:6px;justify-content:center;"><button onclick="editarClienteUI(${c.id})" style="background:var(--violet-glow);border:1px solid rgba(123,110,246,0.4);border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 10px;">✏️</button><button onclick="eliminarCliente(${c.id},'${nombreEscapado}')" style="background:transparent;border:1px solid rgba(255,90,90,0.3);border-radius:6px;color:var(--danger);font-size:12px;cursor:pointer;padding:4px 10px;">🗑️</button></div><div id="cliente-edit-acciones-${c.id}" style="display:none;gap:6px;justify-content:center;"><button onclick="guardarEdicionCliente(${c.id})" style="background:var(--violet);border:none;border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 10px;font-weight:700;">✔</button><button onclick="cancelarEdicionCliente(${c.id})" style="background:var(--panel);border:1px solid var(--edge);border-radius:6px;color:var(--text-2);font-size:12px;cursor:pointer;padding:4px 10px;">✕</button></div></td>`;
      tbodyEl.appendChild(tr);
    });
  });
}

function editarClienteUI(id){document.getElementById(`cliente-nombre-${id}`).style.display='none';document.getElementById(`cliente-edit-nombre-${id}`).style.display='block';document.getElementById(`cliente-loc-${id}`).style.display='none';document.getElementById(`cliente-edit-loc-${id}`).style.display='block';document.getElementById(`cliente-acciones-${id}`).style.display='none';document.getElementById(`cliente-edit-acciones-${id}`).style.display='flex';document.getElementById(`cliente-edit-nombre-${id}`).focus();}
function cancelarEdicionCliente(id){document.getElementById(`cliente-nombre-${id}`).style.display='';document.getElementById(`cliente-edit-nombre-${id}`).style.display='none';document.getElementById(`cliente-loc-${id}`).style.display='';document.getElementById(`cliente-edit-loc-${id}`).style.display='none';document.getElementById(`cliente-acciones-${id}`).style.display='';document.getElementById(`cliente-edit-acciones-${id}`).style.display='none';}
async function guardarEdicionCliente(id){const nombre=document.getElementById(`cliente-edit-nombre-${id}`).value.trim();const locacion=document.getElementById(`cliente-edit-loc-${id}`).value;if(!nombre){alert('El nombre no puede estar vacío');return;}try{await apiFetch(`/clientes/${id}`,{method:'PUT',body:JSON.stringify({nombre,locacion})});await cargarSidebar();renderConfigClientes();}catch(e){alert('Error: '+e.message);}}
async function agregarCliente(){const nombre=document.getElementById('nuevo-cliente-nombre').value.trim();const locacion=document.getElementById('nuevo-cliente-locacion').value;if(!nombre){alert('Ingresá el nombre');return;}if(!locacion){alert('Seleccioná la localidad');return;}try{await apiFetch('/clientes',{method:'POST',body:JSON.stringify({nombre,locacion})});await cargarSidebar();renderConfigClientes();}catch(e){alert('Error: '+e.message);}}
async function eliminarCliente(id, nombre){if(!confirm(`¿Eliminar al cliente "${nombre}"?`))return;try{await apiFetch(`/clientes/${id}`,{method:'DELETE'});await cargarSidebar();renderConfigClientes();}catch(e){alert('Error: '+e.message);}}

/* ─── CONFIG PROVEEDORES ──────────────────────────────────── */

async function renderConfigProveedores() {
  const cont = document.getElementById('config-proveedores');
  cont.innerHTML=`<div class="section-body"><div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div></div>`;
  let proveedores;
  try{proveedores=await apiFetch('/proveedores');}catch(e){cont.innerHTML=`<div class="section-body"><div class="section-panel-inner" style="color:var(--danger);padding:48px;text-align:center;">Error: ${e.message}</div></div>`;return;}
  cont.innerHTML=`<div class="section-body"><div class="section-panel-inner" style="margin-bottom:16px;"><div style="font-size:13px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">➕ Nuevo proveedor</div><div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;"><div><label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Nombre</label><input id="nuevo-proveedor-nombre" type="text" placeholder="Nombre del proveedor" style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:9px 12px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;"></div><button onclick="agregarProveedor()" style="background:var(--violet);color:var(--text-1);border:none;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">Agregar</button></div></div><div class="section-panel-inner" style="padding:0;overflow:hidden;"><table class="lara-table" style="table-layout:auto;"><thead><tr><th style="width:70%;">Nombre</th><th style="width:30%;text-align:center;">Acciones</th></tr></thead><tbody id="proveedores-tabla-body"></tbody></table></div></div>`;
  const tbodyEl=document.getElementById('proveedores-tabla-body');
  proveedores.forEach(p=>{
    const nombreEscapado = p.nombre.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const tr=document.createElement('tr');
    tr.innerHTML=`<td style="padding:8px 12px;"><span id="prov-nombre-${p.id}" style="font-size:13px;color:var(--text-1);">${p.nombre}</span><input id="prov-edit-nombre-${p.id}" type="text" value="${p.nombre}" style="display:none;width:100%;background:var(--panel);border:1px solid var(--edge-hi);border-radius:6px;padding:5px 8px;color:var(--text-1);font-size:13px;outline:none;"></td><td style="text-align:center;padding:8px;"><div id="prov-acciones-${p.id}" style="display:flex;gap:6px;justify-content:center;"><button onclick="editarProveedorUI(${p.id})" style="background:var(--violet-glow);border:1px solid rgba(123,110,246,0.4);border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 10px;">✏️</button><button onclick="eliminarProveedor(${p.id},'${nombreEscapado}')" style="background:transparent;border:1px solid rgba(255,90,90,0.3);border-radius:6px;color:var(--danger);font-size:12px;cursor:pointer;padding:4px 10px;">🗑️</button></div><div id="prov-edit-acciones-${p.id}" style="display:none;gap:6px;justify-content:center;"><button onclick="guardarEdicionProveedor(${p.id})" style="background:var(--violet);border:none;border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 10px;font-weight:700;">✔</button><button onclick="cancelarEdicionProveedor(${p.id})" style="background:var(--panel);border:1px solid var(--edge);border-radius:6px;color:var(--text-2);font-size:12px;cursor:pointer;padding:4px 10px;">✕</button></div></td>`;
    tbodyEl.appendChild(tr);
  });
}
function editarProveedorUI(id){document.getElementById(`prov-nombre-${id}`).style.display='none';document.getElementById(`prov-edit-nombre-${id}`).style.display='block';document.getElementById(`prov-acciones-${id}`).style.display='none';document.getElementById(`prov-edit-acciones-${id}`).style.display='flex';document.getElementById(`prov-edit-nombre-${id}`).focus();}
function cancelarEdicionProveedor(id){document.getElementById(`prov-nombre-${id}`).style.display='';document.getElementById(`prov-edit-nombre-${id}`).style.display='none';document.getElementById(`prov-acciones-${id}`).style.display='';document.getElementById(`prov-edit-acciones-${id}`).style.display='none';}
async function guardarEdicionProveedor(id){const nombre=document.getElementById(`prov-edit-nombre-${id}`).value.trim();if(!nombre){alert('El nombre no puede estar vacío');return;}try{await apiFetch(`/proveedores/${id}`,{method:'PUT',body:JSON.stringify({nombre})});await cargarProveedores();renderConfigProveedores();}catch(e){alert('Error: '+e.message);}}
async function agregarProveedor(){const nombre=document.getElementById('nuevo-proveedor-nombre').value.trim();if(!nombre){alert('Ingresá el nombre');return;}try{await apiFetch('/proveedores',{method:'POST',body:JSON.stringify({nombre})});await cargarProveedores();renderConfigProveedores();}catch(e){alert('Error: '+e.message);}}
async function eliminarProveedor(id, nombre){if(!confirm(`¿Eliminar al proveedor "${nombre}"?`))return;try{await apiFetch(`/proveedores/${id}`,{method:'DELETE'});await cargarProveedores();renderConfigProveedores();}catch(e){alert('Error: '+e.message);}}

/* ─── CONFIG ACHUREROS ────────────────────────────────────── */

async function renderConfigAchureros() {
  const cont = document.getElementById('config-achureros');
  cont.innerHTML = `<div class="section-body"><div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div></div>`;
  let achureros;
  try { achureros = await apiFetch('/achureros'); }
  catch (e) { cont.innerHTML = `<div class="section-body"><div class="section-panel-inner" style="color:var(--danger);padding:48px;text-align:center;">Error: ${e.message}</div></div>`; return; }

  cont.innerHTML = `<div class="section-body"><div class="section-panel-inner" style="margin-bottom:16px;"><div style="font-size:13px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">➕ Nuevo achurero</div><div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;"><div><label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Nombre</label><input id="nuevo-achurero-nombre" type="text" placeholder="Nombre del achurero" style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:9px 12px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;"></div><button onclick="agregarAchurero()" style="background:var(--violet);color:var(--text-1);border:none;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">Agregar</button></div></div><div class="section-panel-inner" style="padding:0;overflow:hidden;"><table class="lara-table" style="table-layout:auto;"><thead><tr><th style="width:70%;">Nombre</th><th style="width:30%;text-align:center;">Acciones</th></tr></thead><tbody id="achureros-tabla-body"></tbody></table></div></div>`;

  const tbodyEl = document.getElementById('achureros-tabla-body');
  achureros.forEach(a => {
    const nombreEscapado = a.nombre.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="padding:8px 12px;"><span id="ach-nombre-${a.id}" style="font-size:13px;color:var(--text-1);">${a.nombre}</span><input id="ach-edit-nombre-${a.id}" type="text" value="${a.nombre}" style="display:none;width:100%;background:var(--panel);border:1px solid var(--edge-hi);border-radius:6px;padding:5px 8px;color:var(--text-1);font-size:13px;outline:none;"></td><td style="text-align:center;padding:8px;"><div id="ach-acciones-${a.id}" style="display:flex;gap:6px;justify-content:center;"><button onclick="editarAchureroUI(${a.id})" style="background:var(--violet-glow);border:1px solid rgba(123,110,246,0.4);border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 10px;">✏️</button><button onclick="eliminarAchurero(${a.id},'${nombreEscapado}')" style="background:transparent;border:1px solid rgba(255,90,90,0.3);border-radius:6px;color:var(--danger);font-size:12px;cursor:pointer;padding:4px 10px;">🗑️</button></div><div id="ach-edit-acciones-${a.id}" style="display:none;gap:6px;justify-content:center;"><button onclick="guardarEdicionAchurero(${a.id})" style="background:var(--violet);border:none;border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 10px;font-weight:700;">✔</button><button onclick="cancelarEdicionAchurero(${a.id})" style="background:var(--panel);border:1px solid var(--edge);border-radius:6px;color:var(--text-2);font-size:12px;cursor:pointer;padding:4px 10px;">✕</button></div></td>`;
    tbodyEl.appendChild(tr);
  });
}

function editarAchureroUI(id){document.getElementById(`ach-nombre-${id}`).style.display='none';document.getElementById(`ach-edit-nombre-${id}`).style.display='block';document.getElementById(`ach-acciones-${id}`).style.display='none';document.getElementById(`ach-edit-acciones-${id}`).style.display='flex';document.getElementById(`ach-edit-nombre-${id}`).focus();}
function cancelarEdicionAchurero(id){document.getElementById(`ach-nombre-${id}`).style.display='';document.getElementById(`ach-edit-nombre-${id}`).style.display='none';document.getElementById(`ach-acciones-${id}`).style.display='';document.getElementById(`ach-edit-acciones-${id}`).style.display='none';}
async function guardarEdicionAchurero(id){const nombre=document.getElementById(`ach-edit-nombre-${id}`).value.trim();if(!nombre){alert('El nombre no puede estar vacío');return;}try{await apiFetch(`/achureros/${id}`,{method:'PUT',body:JSON.stringify({nombre})});await cargarAchureros();renderConfigAchureros();}catch(e){alert('Error: '+e.message);}}
async function agregarAchurero(){const nombre=document.getElementById('nuevo-achurero-nombre').value.trim();if(!nombre){alert('Ingresá el nombre');return;}try{await apiFetch('/achureros',{method:'POST',body:JSON.stringify({nombre})});await cargarAchureros();renderConfigAchureros();}catch(e){alert('Error: '+e.message);}}
async function eliminarAchurero(id, nombre){if(!confirm(`¿Eliminar al achurero "${nombre}"?`))return;try{await apiFetch(`/achureros/${id}`,{method:'DELETE'});await cargarAchureros();renderConfigAchureros();}catch(e){alert('Error: '+e.message);}}

/* ─── SALDO ANTERIOR ──────────────────────────────────────── */

// ── Alerta de deuda alta ─────────────────────────────────────
const DEUDA_ALERTA = 50000; // umbral en pesos — ajustar según el negocio

function _mostrarAlertaDeuda(saldo) {
  let el = document.getElementById('alerta-deuda-alta');
  if (!el) {
    el = document.createElement('div');
    el.id = 'alerta-deuda-alta';
    el.style.cssText = 'display:none;margin-top:6px;padding:7px 12px;background:rgba(255,90,90,0.12);border:1px solid rgba(255,90,90,0.4);border-radius:8px;font-size:12px;color:#f09595;font-weight:600;';
    const saldoAntEl = document.getElementById('saldo-ant');
    if (saldoAntEl) saldoAntEl.closest('.total-row')?.after(el);
  }
  if (saldo >= DEUDA_ALERTA) {
    el.textContent = `⚠️ Deuda alta: ${formatMoney(saldo)} — verificar antes de entregar`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

function _ocultarAlertaDeuda() {
  const el = document.getElementById('alerta-deuda-alta');
  if (el) el.style.display = 'none';
}

async function autoFillSaldoAnterior(cliente) {
  if(EDITANDO_ID!==null||SALDO_MANUAL||!cliente)return;
  try{const data=await apiFetch(`/cuentas-corrientes/cliente/${encodeURIComponent(cliente)}`);document.getElementById('saldo-ant').value=data.saldo.toFixed(2);_mostrarAlertaDeuda(data.saldo);calcTotales();}
  catch{/*silencioso*/}
}

// ── Último precio por cliente ─────────────────────────────────
async function autoFillUltimoPrecio(cliente) {
  if (EDITANDO_ID !== null || !cliente) return;
  let ultimosPreciosCli = {};
  try { ultimosPreciosCli = await apiFetch(`/boletas/ultimo-precio/${encodeURIComponent(cliente)}`); }
  catch { return; }
  if (!ultimosPreciosCli || !Object.keys(ultimosPreciosCli).length) return;
  PRODUCTOS.forEach((prod, i) => {
    const pxEl = document.getElementById('px-' + i);
    if (!pxEl) return;
    const precioGeneral  = PRECIOS[prod.nombre] || 0;
    const precioEspecial = PRECIOS_CLIENTE_ACTIVO[prod.nombre];
    const esPrecioEspecial = precioEspecial && precioEspecial !== precioGeneral;
    if (!esPrecioEspecial && ultimosPreciosCli[prod.nombre]) {
      pxEl.value = ultimosPreciosCli[prod.nombre];
      calcFila(i);
    }
  });
}

/* ─── VENTAS CALCULATIONS ─────────────────────────────────── */

function calcFila(i) {
  const kg=parseFloat(document.getElementById('kg-'+i)?.value)||0;
  const pxInput=document.getElementById('px-'+i);
  let px=parseFloat(pxInput?.value)||0;
  if(kg>0&&(!pxInput?.value||px<=0)){const p=getPrecioProducto(PRODUCTOS[i]?.nombre);if(p>0){px=p;pxInput.value=p;}}
  const sub=document.getElementById('sub-'+i);if(sub)sub.textContent=(kg*px)>0?formatMoney(kg*px):'—';
  calcTotales();
}

function calcTotales() {
  let total=0;
  PRODUCTOS.forEach((_,i)=>{total+=(parseFloat(document.getElementById('kg-'+i)?.value)||0)*(parseFloat(document.getElementById('px-'+i)?.value)||0);});
  total = round2(total);
  // Si "paga ya" está marcado, actualizar entrega automáticamente
  const pagaEl = document.getElementById('boleta-paga');
  if (pagaEl?.checked) {
    const entEl = document.getElementById('entrega');
    if (entEl) entEl.value = total.toFixed(2);
  }
  const saldo=parseFloat(document.getElementById('saldo-ant').value)||0;
  const entrega=parseFloat(document.getElementById('entrega').value)||0;
  const debe=round2((total+saldo)-entrega);
  document.getElementById('total-boleta').textContent=formatMoney(total);
  const debeEl=document.getElementById('debe');debeEl.textContent=formatMoney(debe);debeEl.style.color=debe>0?'#f09595':'#5DCAA5';
}

/* ─── COMPRAS CALCULATIONS ────────────────────────────────── */

function calcCompraFila(i){const kg=parseFloat(document.getElementById('c-kg-'+i)?.value)||0;const px=parseFloat(document.getElementById('c-px-'+i)?.value)||0;const sub=document.getElementById('c-sub-'+i);if(sub)sub.textContent=(kg*px)>0?formatMoney(kg*px):'—';calcTotalCompra();}
function calcTotalCompra(){let t=0;PRODUCTOS.forEach((_,i)=>{t+=(parseFloat(document.getElementById('c-kg-'+i)?.value)||0)*(parseFloat(document.getElementById('c-px-'+i)?.value)||0);});document.getElementById('total-compra').textContent=formatMoney(t);}

/* ─── GUARDAR BOLETA ──────────────────────────────────────── */

async function guardarBoleta() {
  const btn=document.querySelector('#ventas .btn-primary');
  const fecha=document.getElementById('fecha').value,locacion=document.getElementById('locacion').value,cliente=document.getElementById('cliente').value.trim(),achurero=document.getElementById('achurero').value,saldoAnt=parseFloat(document.getElementById('saldo-ant').value)||0,entrega=parseFloat(document.getElementById('entrega').value)||0;
  if(!cliente){alert('Seleccioná un cliente');return;}if(!locacion){alert('Seleccioná una localidad');return;}
  const productos=[];PRODUCTOS.forEach((prod,i)=>{const cant=parseFloat(document.getElementById('cant-'+i)?.value)||0, kg=parseFloat(document.getElementById('kg-'+i)?.value)||0,px=parseFloat(document.getElementById('px-'+i)?.value)||0;if(kg>0&&px>0)productos.push({nombre:prod.nombre,cant,kg,precio:px,subtotal:kg*px});});
  if(productos.length===0){alert('Ingresá al menos un producto');return;}
  btn.innerHTML='<span class="loader"></span>Guardando...';btn.disabled=true;
  const nota=document.getElementById('boleta-nota')?.value.trim()||'';
  try{const payload={fecha,locacion,cliente,achurero,productos,saldo_anterior:saldoAnt,entrega,nota};if(EDITANDO_ID!==null)await apiFetch(`/boletas/${encodeURIComponent(EDITANDO_ID)}`,{method:'PUT',body:JSON.stringify(payload)});else await apiFetch('/boletas',{method:'POST',body:JSON.stringify(payload)});EDITANDO_ID=null;SALDO_MANUAL=false;btn.innerHTML='✔ Guardado';btn.style.background='#5DCAA5';setTimeout(()=>{btn.innerHTML='Guardar boleta';btn.style.background='';btn.disabled=false;limpiarForm();},1200);}catch(e){alert('Error: '+e.message);btn.innerHTML='Guardar boleta';btn.disabled=false;}
}

/* ─── GUARDAR COMPRA ──────────────────────────────────────── */

async function guardarCompra(){const btn=document.querySelector('#compras-cargar .btn-primary'),fecha=document.getElementById('fecha-compra').value,proveedor=document.getElementById('proveedor').value;if(!proveedor){alert('Seleccioná un proveedor');return;}const productos=[];PRODUCTOS.forEach((prod,i)=>{const kg=parseFloat(document.getElementById('c-kg-'+i)?.value)||0,px=parseFloat(document.getElementById('c-px-'+i)?.value)||0;if(kg>0&&px>0)productos.push({nombre:prod.nombre,cant:parseFloat(document.getElementById('c-cant-'+i)?.value)||0,kg,precio:px,subtotal:kg*px});});if(productos.length===0){alert('Ingresá al menos un producto');return;}btn.innerHTML='<span class="loader"></span>Guardando...';btn.disabled=true;try{await apiFetch('/compras',{method:'POST',body:JSON.stringify({fecha,proveedor,productos})});btn.innerHTML='✔ Guardado';btn.style.background='#5DCAA5';setTimeout(()=>{btn.innerHTML='Guardar compra';btn.style.background='';btn.disabled=false;limpiarCompra();},1200);}catch(e){alert('Error: '+e.message);btn.innerHTML='Guardar compra';btn.disabled=false;}}
function limpiarCompra(){PRODUCTOS.forEach((_,i)=>{const ct=document.getElementById('c-cant-'+i),k=document.getElementById('c-kg-'+i),p=document.getElementById('c-px-'+i);if(ct)ct.value='';if(k)k.value='';if(p)p.value='';const s=document.getElementById('c-sub-'+i);if(s)s.textContent='—';});document.getElementById('proveedor').value='';document.getElementById('fecha-compra').valueAsDate=new Date();calcTotalCompra();}

/* ─── HISTORIAL COMPRAS ───────────────────────────────────── */

async function renderHistorialCompras(){const cont=document.getElementById('compras-historial');cont.innerHTML=`<div class="section-body"><div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div></div>`;let compras;try{compras=await apiFetch('/compras');}catch(e){cont.innerHTML=`<div class="section-body"><div class="section-panel-inner" style="text-align:center;padding:48px;color:var(--danger);">Error: ${e.message}</div></div>`;return;}if(!compras||compras.length===0){cont.innerHTML=`<div class="section-body"><div class="section-panel-inner" style="text-align:center;padding:48px 24px;"><div style="font-size:32px;margin-bottom:16px;">📦</div><div style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:8px;">Sin compras</div><div style="font-size:14px;color:var(--text-3);">No hay compras registradas</div></div></div>`;return;}cont.innerHTML=`<div class="section-body"><div class="section-panel-inner" style="padding:0;overflow:hidden;"><table class="lara-table" style="table-layout:auto;"><thead><tr><th style="width:10%;">N°</th><th style="width:22%;">Fecha</th><th style="width:30%;">Proveedor</th><th style="width:20%;text-align:right;">Total</th><th style="width:10%;text-align:center;">Ver</th><th style="width:8%;text-align:center;">⚙</th></tr></thead><tbody id="historial-compras-body"></tbody></table></div></div>`;const tbodyEl=document.getElementById('historial-compras-body');compras.forEach(c=>{const tr=document.createElement('tr');tr.innerHTML=`<td style="font-size:12px;color:var(--text-2);font-family:monospace;">#${c.id}</td><td>${c.fecha}</td><td style="font-size:13px;font-weight:500;">${c.proveedor}</td><td style="text-align:right;font-weight:700;color:var(--violet);">${formatMoney(c.total)}</td><td style="text-align:center;"><button onclick="toggleDetalleCompra(${c.id},this)" style="background:var(--violet-glow);border:1px solid rgba(123,110,246,0.4);border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 10px;">▼</button></td><td style="text-align:center;"><button onclick="eliminarCompra(${c.id})" style="background:transparent;border:1px solid rgba(255,90,90,0.3);border-radius:6px;color:var(--danger);font-size:14px;cursor:pointer;padding:4px 8px;">🗑️</button></td>`;tbodyEl.appendChild(tr);const trDet=document.createElement('tr');trDet.id=`detalle-compra-${c.id}`;trDet.style.display='none';const pH=c.productos.map(p=>`<tr><td style="padding:4px 8px;font-size:12px;color:var(--text-2);">${p.nombre}</td><td style="padding:4px 8px;font-size:12px;text-align:right;">${p.cant > 0 ? p.cant + ' u.' : '—'}</td><td style="padding:4px 8px;font-size:12px;text-align:right;">${p.kg} kg</td><td style="padding:4px 8px;font-size:12px;text-align:right;">${formatMoney(p.precio)}/kg</td><td style="padding:4px 8px;font-size:12px;text-align:right;color:var(--violet);font-weight:600;">${formatMoney(p.subtotal)}</td></tr>`).join('');trDet.innerHTML=`<td colspan="6" style="padding:0 16px 12px;"><table style="width:100%;border-collapse:collapse;background:var(--panel);border-radius:8px;overflow:hidden;"><thead><tr style="background:var(--violet-glow);"><th style="padding:6px 8px;font-size:11px;color:var(--violet);text-align:left;">Producto</th><th style="padding:6px 8px;font-size:11px;color:var(--violet);text-align:right;">Cant.</th><th style="padding:6px 8px;font-size:11px;color:var(--violet);text-align:right;">Kg</th><th style="padding:6px 8px;font-size:11px;color:var(--violet);text-align:right;">P/kg</th><th style="padding:6px 8px;font-size:11px;color:var(--violet);text-align:right;">Subtotal</th></tr></thead><tbody>${pH}</tbody></table></td>`;tbodyEl.appendChild(trDet);});}
function toggleDetalleCompra(id,btn){const det=document.getElementById(`detalle-compra-${id}`);const vis=det.style.display!=='none';det.style.display=vis?'none':'table-row';btn.textContent=vis?'▼':'▲';}
async function eliminarCompra(id){if(!confirm(`¿Eliminar la compra #${id}?`))return;try{await apiFetch(`/compras/${id}`,{method:'DELETE'});renderHistorialCompras();}catch(e){alert('Error: '+e.message);}}

/* ─── STOCK ───────────────────────────────────────────────── */

async function renderStock(){const cont=document.getElementById('compras-stock');cont.innerHTML=`<div class="section-body"><div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div></div>`;let stockData;try{stockData=await apiFetch('/stock');}catch(e){cont.innerHTML=`<div class="section-body"><div class="section-panel-inner" style="text-align:center;padding:48px;color:var(--danger);">Error: ${e.message}</div></div>`;return;}const hoy=new Date().toISOString().slice(0,10);cont.innerHTML=`<div class="section-body"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;"><div style="font-size:12px;color:var(--text-3);">💡 Completá <strong style="color:var(--text-1);">Real</strong> con el conteo físico al cierre del día.</div><button onclick="guardarStockManual('${hoy}')" style="background:var(--violet);color:var(--text-1);border:none;border-radius:10px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">💾 Guardar conteo</button></div><div class="section-panel-inner" style="padding:0;overflow:hidden;"><table class="lara-table" style="table-layout:fixed;"><thead><tr><th style="width:36%;">Producto</th><th style="width:22%;text-align:right;">Stock teórico</th><th style="width:22%;text-align:right;">Último conteo</th><th style="width:20%;text-align:right;">Real hoy</th></tr></thead><tbody id="stock-tabla-body"></tbody></table></div></div>`;const tbodyEl=document.getElementById('stock-tabla-body');stockData.forEach((item,i)=>{const color=item.kg_teorico<0?'#f09595':item.kg_teorico<5?'#f5c518':'rgba(255,255,255,0.85)';const tr=document.createElement('tr');tr.innerHTML=`<td class="prod-name" style="padding:8px 12px;">${item.producto}</td><td style="text-align:right;padding:8px 12px;font-weight:700;color:${color};">${formatKg(item.kg_teorico)}</td><td style="text-align:right;padding:8px 12px;font-size:12px;color:var(--text-3);">${item.fecha_ultimo_manual?`${formatKg(item.kg_ultimo_manual)}<br><span style="font-size:10px;">${item.fecha_ultimo_manual}</span>`:'—'}</td><td style="text-align:right;padding:8px 6px;"><input type="number" min="0" step="0.1" placeholder="—" id="stock-real-${i}" data-nav="stock" data-row="${i}" data-col="0" style="width:90%;background:var(--panel);border:1px solid var(--edge);border-radius:8px;padding:6px 8px;color:var(--text-1);font-size:13px;text-align:right;outline:none;box-sizing:border-box;"></td>`;tbodyEl.appendChild(tr);});window._stockData=stockData;}
async function guardarStockManual(fecha){const stockData=window._stockData||[];const items=[];stockData.forEach((item,i)=>{const val=parseFloat(document.getElementById(`stock-real-${i}`)?.value);if(!isNaN(val)&&val>=0)items.push({fecha,producto:item.producto,kg_real:val});});if(items.length===0){alert('Ingresá al menos un valor en la columna Real');return;}try{await apiFetch('/stock/manual',{method:'POST',body:JSON.stringify(items)});renderStock();}catch(e){alert('Error guardando stock: '+e.message);}}

/* ─── HISTORIAL BOLETAS ───────────────────────────────────── */

// ── Estado de paginación del historial ────────────────────────
let _histPagina   = 0;   // página actual (base 0)
const _HIST_LIMIT = 75;

async function renderHistorial(resetPagina = true) {
  if (resetPagina) _histPagina = 0;

  const cont = document.getElementById('ventas-historial');

  // Leer filtros activos
  const fd  = document.getElementById('hist-fecha-desde')?.value || '';
  const fh  = document.getElementById('hist-fecha-hasta')?.value || '';
  const cli = document.getElementById('hist-cliente')?.value.trim() || '';
  const loc = document.getElementById('hist-locacion')?.value || '';

  // Construir query string base (sin paginación)
  const filtros = new URLSearchParams();
  if (fd)  filtros.set('fecha_desde', fd);
  if (fh)  filtros.set('fecha_hasta', fh);
  if (cli) filtros.set('cliente', cli);
  if (loc) filtros.set('locacion', loc);
  const fsBase = filtros.toString() ? '?' + filtros.toString() : '';

  // Renderizar filtros (solo la primera vez o si no existen)
  if (!document.getElementById('hist-fecha-desde')) {
    cont.innerHTML = `
      <div class="section-body">
        <div class="section-panel-inner" style="margin-bottom:12px;padding:14px 16px;">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto auto;gap:8px;align-items:end;flex-wrap:wrap;">
            <div>
              <label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:4px;">Desde</label>
              <input type="date" id="hist-fecha-desde" style="width:100%;background:var(--panel);border:1px solid var(--edge);border-radius:8px;padding:7px 10px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:4px;">Hasta</label>
              <input type="date" id="hist-fecha-hasta" style="width:100%;background:var(--panel);border:1px solid var(--edge);border-radius:8px;padding:7px 10px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:4px;">Cliente</label>
              <input type="text" id="hist-cliente" list="clientes-list" placeholder="Todos" style="width:100%;background:var(--panel);border:1px solid var(--edge);border-radius:8px;padding:7px 10px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:4px;">Localidad</label>
              <select id="hist-locacion" style="width:100%;background:var(--panel);border:1px solid var(--edge);border-radius:8px;padding:7px 10px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;">
                <option value="">Todas</option>
                <option value="M">Miramar</option>
                <option value="MDP">Mar del Plata</option>
                <option value="O">Otamendi</option>
                <option value="B">Balcarce</option>
              </select>
            </div>
            <button onclick="renderHistorial()" style="background:var(--violet);color:var(--text-1);border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">Buscar</button>
            <button onclick="limpiarFiltrosHistorial()" style="background:var(--panel);color:var(--text-2);border:1px solid var(--edge);border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;white-space:nowrap;">Limpiar</button>
          </div>
        </div>
        <div id="historial-resultados"></div>
      </div>`;
  }

  const resultados = document.getElementById('historial-resultados');
  resultados.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div>`;

  // Pedir total y página actual en paralelo
  const skip = _histPagina * _HIST_LIMIT;
  const paginaParams = new URLSearchParams(filtros);
  paginaParams.set('skip',  skip);
  paginaParams.set('limit', _HIST_LIMIT);

  let boletas, totalCount;
  try {
    [boletas, { total: totalCount }] = await Promise.all([
      apiFetch('/boletas?' + paginaParams.toString()),
      apiFetch('/boletas/count' + fsBase),
    ]);
  } catch (e) {
    resultados.innerHTML = `<div class="section-panel-inner" style="text-align:center;padding:48px;color:var(--danger);">Error: ${e.message}</div>`;
    return;
  }

  if (!boletas || boletas.length === 0) {
    resultados.innerHTML = `<div class="section-panel-inner" style="text-align:center;padding:48px 24px;"><div style="font-size:32px;margin-bottom:16px;">📋</div><div style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:8px;">Sin resultados</div><div style="font-size:14px;color:var(--text-3);">No hay boletas para los filtros seleccionados</div></div>`;
    return;
  }

  const totalPaginas  = Math.ceil(totalCount / _HIST_LIMIT);
  const paginaActual  = _histPagina + 1;
  const hayAnterior   = _histPagina > 0;
  const haySiguiente  = paginaActual < totalPaginas;

  // Controles de paginación reutilizables
  const ctrlPaginacion = () => `
    <div style="display:flex;align-items:center;gap:8px;">
      <button onclick="irPaginaHistorial(-1)" ${!hayAnterior ? 'disabled' : ''}
        style="background:var(--panel);color:${hayAnterior ? 'var(--text-1)' : 'var(--text-3)'};border:1px solid var(--edge);border-radius:8px;padding:5px 12px;font-size:13px;cursor:${hayAnterior ? 'pointer' : 'default'};">← Anterior</button>
      <span style="font-size:12px;color:var(--text-3);white-space:nowrap;">Página <strong style="color:var(--text-1);">${paginaActual}</strong> de <strong style="color:var(--text-1);">${totalPaginas}</strong></span>
      <button onclick="irPaginaHistorial(1)" ${!haySiguiente ? 'disabled' : ''}
        style="background:var(--panel);color:${haySiguiente ? 'var(--text-1)' : 'var(--text-3)'};border:1px solid var(--edge);border-radius:8px;padding:5px 12px;font-size:13px;cursor:${haySiguiente ? 'pointer' : 'default'};">Siguiente →</button>
    </div>`;

  resultados.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:12px;color:var(--text-3);">${totalCount} boleta${totalCount !== 1 ? 's' : ''} en total · mostrando ${skip + 1}–${Math.min(skip + boletas.length, totalCount)}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${ctrlPaginacion()}
        <button id="btn-borrar-historial" class="btn-secondary" style="width:auto;padding:6px 14px;font-size:12px;color:var(--danger);border-color:rgba(255,90,90,0.3);">🗑️ Borrar todo</button>
      </div>
    </div>
    <div class="section-panel-inner" style="padding:0;overflow:hidden;">
      <table class="lara-table" style="table-layout:auto;">
        <thead><tr>
          <th style="width:32%;">Cliente</th>
          <th style="width:16%;">Fecha</th>
          <th style="width:16%;">Localidad</th>
          <th style="width:16%;text-align:right;">Total</th>
          <th style="width:6%;text-align:center;">⚙</th>
        </tr></thead>
        <tbody id="historial-body"></tbody>
      </table>
    </div>
    ${totalPaginas > 1 ? `<div style="display:flex;justify-content:flex-end;margin-top:10px;">${ctrlPaginacion()}</div>` : ''}`;

  document.getElementById('btn-borrar-historial').addEventListener('click', borrarHistorial);

  const tbodyEl = document.getElementById('historial-body');
  boletas.forEach(b => {
    const idStr = String(b.id);
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td style="font-size:11px;color:var(--text-2);font-weight:500;">${b.cliente}</td>
      <td style="font-size:12px;color:var(--text-2);">${b.fecha}</td>
      <td style="font-size:12px;color:var(--text-2);">${LOC_NOMBRES[b.locacion] || b.locacion}</td>
      <td style="text-align:right;font-weight:500;font-family:var(--font-mono);">${formatMoney(b.total)}</td>
      <td style="text-align:center;">
        <button class="btn-delete-boleta" data-id="${idStr}" style="background:transparent;border:1px solid rgba(255,90,90,0.3);border-radius:6px;color:var(--danger);font-size:14px;cursor:pointer;padding:4px 8px;">🗑️</button>
      </td>`;
    tr.addEventListener('click', e => { if (e.target.classList.contains('btn-delete-boleta')) return; cargarBoleta(idStr); });
    tr.querySelector('.btn-delete-boleta').addEventListener('click', e => { e.stopPropagation(); eliminarBoleta(idStr); });
    tbodyEl.appendChild(tr);
  });
}

function irPaginaHistorial(delta) {
  _histPagina += delta;
  renderHistorial(false);
  document.getElementById('historial-resultados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function limpiarFiltrosHistorial() {
  const ids = ['hist-fecha-desde','hist-fecha-hasta','hist-cliente','hist-locacion'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderHistorial();
}
async function borrarHistorial(){if(!confirm('¿Borrar todo el historial?'))return;if(!confirm('⚠️ Esta acción no se puede deshacer.'))return;try{await apiFetch('/boletas',{method:'DELETE',headers:{'X-Lara-Confirm':'LARA-BORRAR-HISTORIAL-CONFIRMAR'}});EDITANDO_ID=null;SALDO_MANUAL=false;limpiarForm();renderHistorial();}catch(e){alert('Error: '+e.message);}}
async function eliminarBoleta(id){if(!confirm(`¿Eliminar la boleta?\n${id}`))return;try{await apiFetch(`/boletas/${encodeURIComponent(id)}`,{method:'DELETE'});if(String(EDITANDO_ID)===id){EDITANDO_ID=null;SALDO_MANUAL=false;limpiarForm();}renderHistorial();}catch(e){alert('Error: '+e.message);}}

/* ─── CUENTAS CORRIENTES ──────────────────────────────────── */

async function renderCuentasCorrientes(){const cont=document.getElementById('ventas-cc');cont.innerHTML=`<div class="section-body"><div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div></div>`;let data;try{data=await apiFetch('/cuentas-corrientes');}catch(e){cont.innerHTML=`<div class="section-body"><div class="section-panel-inner" style="text-align:center;padding:48px;color:var(--danger);">Error: ${e.message}</div></div>`;return;}if(!data.locaciones||data.locaciones.length===0){cont.innerHTML=`<div class="section-body"><div class="section-panel-inner" style="text-align:center;padding:48px 24px;"><div style="font-size:32px;margin-bottom:16px;">📒</div><div style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:8px;">Sin datos</div><div style="font-size:14px;color:var(--text-3);">No hay boletas registradas</div></div></div>`;return;}cont.innerHTML=`<div class="section-body"><div class="section-panel-inner" style="padding:0;overflow:hidden;"><table class="lara-table" style="table-layout:fixed;"><thead><tr><th style="width:32%;">Localidad / Cliente</th><th style="width:18%;text-align:right;">Boletas</th><th style="width:18%;text-align:right;">Pagado</th><th style="width:14%;text-align:right;">Saldo</th><th style="width:10%;text-align:center;">Pago</th><th style="width:8%;text-align:center;">Hist.</th></tr></thead><tbody id="cc-body"></tbody></table></div></div>`;const tbodyEl=document.getElementById('cc-body');data.locaciones.forEach(loc=>{const trLoc=document.createElement('tr');trLoc.style.cssText='background:var(--violet-glow);';trLoc.innerHTML=`<td colspan="6" style="font-size:11px;font-weight:700;color:var(--violet);text-transform:uppercase;letter-spacing:0.12em;padding:10px 12px 8px;">📍 ${loc.nombre}</td>`;tbodyEl.appendChild(trLoc);loc.clientes.forEach(({cliente,saldo_boletas,total_pagado,saldo_actual})=>{const tr=document.createElement('tr');tr.innerHTML=`<td style="font-size:13px;color:var(--text-1);font-weight:500;padding:8px 12px 8px 24px;">${cliente}</td><td style="text-align:right;font-size:12px;color:var(--text-2);padding:8px 12px;">${formatMoney(saldo_boletas)}</td><td style="text-align:right;font-size:12px;color:var(--mint);padding:8px 12px;">${total_pagado>0?'- '+formatMoney(total_pagado):'—'}</td><td style="text-align:right;font-size:13px;font-weight:700;padding:8px 12px;color:${saldo_actual>0?'#f09595':'#5DCAA5'};">${formatMoney(saldo_actual)}</td><td style="text-align:center;padding:8px 4px;"><button style="background:var(--violet-glow);border:1px solid rgba(123,110,246,0.4);border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 8px;" data-cliente="${cliente}" data-locacion="${loc.locacion}" data-saldo="${saldo_actual}" onclick="abrirModalPago(this)">💰</button></td><td style="text-align:center;padding:8px 4px;"><button style="background:var(--panel);border:1px solid var(--edge);border-radius:6px;color:var(--text-2);font-size:12px;cursor:pointer;padding:4px 8px;" onclick="abrirHistorialPagos('${cliente}')">📋</button></td>`;tbodyEl.appendChild(tr);});const trTot=document.createElement('tr');trTot.style.cssText='border-top:1px solid var(--violet-glow);border-bottom:2px solid var(--violet-glow);';trTot.innerHTML=`<td colspan="3" style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.1em;padding:6px 12px 10px 24px;">Total ${loc.nombre}</td><td style="text-align:right;font-size:14px;font-weight:700;padding:6px 12px 10px;color:${loc.total_locacion>0?'#f09595':'#5DCAA5'};">${formatMoney(loc.total_locacion)}</td><td colspan="2"></td>`;tbodyEl.appendChild(trTot);});const trGen=document.createElement('tr');trGen.style.cssText='background:var(--violet-glow);';trGen.innerHTML=`<td colspan="3" style="font-size:12px;font-weight:700;color:var(--text-1);text-transform:uppercase;letter-spacing:0.1em;padding:12px;">🧾 Total General</td><td style="text-align:right;font-size:16px;font-weight:700;padding:12px;color:${data.total_general>0?'#f09595':'#5DCAA5'};text-shadow:0 0 8px rgba(255,90,90,0.3);">${formatMoney(data.total_general)}</td><td colspan="2"></td>`;tbodyEl.appendChild(trGen);}

async function abrirHistorialPagos(cliente){document.getElementById('modal-pagos-hist')?.remove();let pagos;try{pagos=await apiFetch(`/pagos/${encodeURIComponent(cliente)}`);}catch(e){alert('Error: '+e.message);return;}const modal=document.createElement('div');modal.id='modal-pagos-hist';modal.style.cssText='position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;';const fH=pagos.length===0?`<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-3);">Sin pagos registrados</td></tr>`:pagos.map(p=>{
    const esAuto = (p.nota||'').startsWith('Entrega boleta');
    const badge = esAuto ? `<span style="font-size:10px;background:var(--violet-glow);color:var(--violet);border-radius:4px;padding:2px 6px;margin-left:6px;font-family:var(--font-mono);letter-spacing:0.06em;">AUTO</span>` : '';
    return `<tr style="${esAuto?'opacity:0.7;':''}">`+
      `<td style="padding:8px 12px;font-size:13px;font-family:var(--font-mono);">${p.fecha}</td>`+
      `<td style="padding:8px 12px;font-size:13px;font-weight:500;color:var(--mint);font-family:var(--font-mono);">${formatMoney(p.monto)}</td>`+
      `<td style="padding:8px 12px;font-size:12px;color:var(--text-2);">${p.nota||'—'}${badge}</td>`+
      `<td style="text-align:center;padding:8px;">${esAuto?'':'<button onclick="eliminarPago('+p.id+',\''+cliente+'\')" style="background:transparent;border:1px solid rgba(255,90,90,0.3);border-radius:6px;color:var(--danger);font-size:13px;cursor:pointer;padding:3px 8px;">🗑️</button>'}</td>`+
      `</tr>`;
  }).join('');modal.innerHTML=`<div style="background:var(--panel);border:1px solid rgba(123,110,246,0.35);border-radius:16px;padding:24px;width:440px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.7);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><div style="font-size:16px;font-weight:700;color:var(--text-1);">📋 Pagos — ${cliente}</div><button onclick="document.getElementById('modal-pagos-hist').remove()" style="background:transparent;border:none;color:var(--text-2);font-size:18px;cursor:pointer;">✕</button></div><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:var(--violet-glow);"><th style="padding:8px 12px;font-size:11px;color:var(--violet);text-align:left;text-transform:uppercase;letter-spacing:0.08em;">Fecha</th><th style="padding:8px 12px;font-size:11px;color:var(--violet);text-align:left;text-transform:uppercase;letter-spacing:0.08em;">Monto</th><th style="padding:8px 12px;font-size:11px;color:var(--violet);text-align:left;text-transform:uppercase;letter-spacing:0.08em;">Nota</th><th style="padding:8px 12px;font-size:11px;color:var(--violet);text-align:center;text-transform:uppercase;letter-spacing:0.08em;">⚙</th></tr></thead><tbody>${fH}</tbody></table></div>`;document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});}
async function eliminarPago(id,cliente){if(!confirm('¿Eliminar este pago?'))return;try{await apiFetch(`/pagos/${id}`,{method:'DELETE'});document.getElementById('modal-pagos-hist')?.remove();await abrirHistorialPagos(cliente);renderCuentasCorrientes();}catch(e){alert('Error: '+e.message);}}

function abrirModalPago(btn){const cliente=btn.dataset.cliente,locacion=btn.dataset.locacion,saldo=parseFloat(btn.dataset.saldo);document.getElementById('modal-pago')?.remove();const hoy=new Date().toISOString().slice(0,10);const modal=document.createElement('div');modal.id='modal-pago';modal.style.cssText='position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;';modal.innerHTML=`<div style="background:var(--panel);border:1px solid rgba(123,110,246,0.35);border-radius:16px;padding:28px 28px 24px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.7);"><div style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:4px;">💰 Registrar pago</div><div style="font-size:13px;color:var(--text-2);margin-bottom:20px;">${cliente} · Saldo: <span style="color:var(--danger);font-weight:600;">${formatMoney(saldo)}</span></div><div style="margin-bottom:14px;"><label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Monto</label><input id="pago-monto" type="number" min="0.01" step="0.01" placeholder="0.00" style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:10px 12px;color:var(--text-1);font-size:15px;box-sizing:border-box;outline:none;"></div><div style="margin-bottom:14px;"><label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Fecha</label><input id="pago-fecha" type="date" value="${hoy}" style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:10px 12px;color:var(--text-1);font-size:14px;box-sizing:border-box;outline:none;"></div><div style="margin-bottom:20px;"><label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Nota (opcional)</label><input id="pago-nota" type="text" placeholder="Ej: efectivo, transferencia..." style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:10px 12px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;"></div><div style="display:flex;gap:10px;"><button id="btn-confirmar-pago" style="flex:1;background:var(--violet);color:var(--text-1);border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;">Confirmar</button><button onclick="document.getElementById('modal-pago').remove()" style="flex:1;background:var(--panel);color:var(--text-1);border:1px solid var(--edge);border-radius:10px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;">Cancelar</button></div></div>`;document.body.appendChild(modal);document.getElementById('pago-monto').focus();modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});document.getElementById('btn-confirmar-pago').addEventListener('click',()=>confirmarPago(cliente,locacion));}
async function confirmarPago(cliente,locacion){const monto=parseFloat(document.getElementById('pago-monto').value),fecha=document.getElementById('pago-fecha').value,nota=document.getElementById('pago-nota').value.trim();if(!monto||monto<=0){alert('Ingresá un monto válido');return;}const btn=document.getElementById('btn-confirmar-pago');btn.textContent='Guardando...';btn.disabled=true;try{await apiFetch('/pagos',{method:'POST',body:JSON.stringify({cliente,locacion,monto,fecha,nota})});document.getElementById('modal-pago').remove();renderCuentasCorrientes();}catch(e){alert('Error: '+e.message);btn.textContent='Confirmar';btn.disabled=false;}}

/* ─── CARGAR BOLETA (EDICIÓN) ─────────────────────────────── */

async function cargarBoleta(id){let boleta;try{boleta=await apiFetch(`/boletas/${encodeURIComponent(id)}`);}catch(e){alert('Error: '+e.message);return;}EDITANDO_ID=String(id);SALDO_MANUAL=false;limpiarInputs();document.getElementById('nro-boleta').textContent=boleta.id;document.getElementById('fecha').value=boleta.fecha;document.getElementById('locacion').value=boleta.locacion||'';document.getElementById('cliente').value=boleta.cliente;document.getElementById('achurero').value=boleta.achurero||'';document.getElementById('saldo-ant').value=boleta.saldo_anterior||0;document.getElementById('entrega').value=boleta.entrega||0;const notaEl=document.getElementById('boleta-nota');if(notaEl)notaEl.value=boleta.nota||'';boleta.productos.forEach(p=>{const i=PRODUCTOS.findIndex(x=>x.nombre===p.nombre);if(i===-1)return;document.getElementById('kg-'+i).value=p.kg;document.getElementById('px-'+i).value=p.precio;document.getElementById('sub-'+i).textContent=formatMoney(p.subtotal);});calcTotales();ALL_SECTIONS.forEach(s=>{const el=document.getElementById(s);if(el)el.classList.toggle('section-hidden',s!=='ventas');});activateTabs({'tab-ventas-crear':true,'tab-ventas-cc':false,'tab-ventas-historial':false});togglePanels({'ventas-crear':true,'ventas-cc':false,'ventas-historial':false});}

/* ─── FORM HELPERS ────────────────────────────────────────── */

// ── Boleta paga en el momento ─────────────────────────────────
function toggleBoletaPaga(chk) {
  const entregaEl = document.getElementById('entrega');
  if (chk.checked) {
    const totalText = document.getElementById('total-boleta')?.textContent || '0';
    const total = parseFloat(totalText.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    entregaEl.value = total.toFixed(2);
    entregaEl.disabled = true;
    entregaEl.style.opacity = '0.5';
  } else {
    entregaEl.disabled = false;
    entregaEl.style.opacity = '1';
  }
  calcTotales();
}

function limpiarForm(){
  EDITANDO_ID=null; SALDO_MANUAL=false; limpiarInputs();
  document.getElementById('nro-boleta').textContent='—';
  const notaEl=document.getElementById('boleta-nota'); if(notaEl)notaEl.value='';
  const pagaEl=document.getElementById('boleta-paga');
  if(pagaEl){ pagaEl.checked=false; }
  const entregaEl=document.getElementById('entrega');
  if(entregaEl){ entregaEl.disabled=false; entregaEl.style.opacity='1'; }
}
function limpiarInputs(){PRODUCTOS.forEach((prod,i)=>{const kg=document.getElementById('kg-'+i);if(kg)kg.value='';const px=document.getElementById('px-'+i);if(px)px.value=getPrecioProducto(prod.nombre)||'';const sub=document.getElementById('sub-'+i);if(sub)sub.textContent='—';});document.getElementById('saldo-ant').value=0;document.getElementById('entrega').value=0;_ocultarAlertaDeuda();calcTotales();}
function fillBoletaPricesFromMatrix(){PRODUCTOS.forEach((prod,i)=>{const pxInput=document.getElementById('px-'+i);if(!pxInput||(pxInput.value&&parseFloat(pxInput.value)>0))return;const p=getPrecioProducto(prod.nombre);if(p>0){pxInput.value=p;calcFila(i);}});}

/* ─── NAVIGATION ──────────────────────────────────────────── */

const ALL_SECTIONS=['home','ventas','compras','analisis','config','precios','cierre','achureros-gastos'];

function showHome(){ALL_SECTIONS.forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('section-hidden',id!=='home');});const home=document.getElementById('home');home.classList.remove('fade-in');void home.offsetWidth;home.classList.add('fade-in');}

function showSection(id){ALL_SECTIONS.forEach(sid=>{const el=document.getElementById(sid);if(!el)return;if(sid===id){el.classList.remove('section-hidden','fade-in');void el.offsetWidth;el.classList.add('fade-in');}else el.classList.add('section-hidden');});if(id==='ventas')showVentasTab('crear');if(id==='compras')showComprasTab('cargar');if(id==='config')showConfigTab('productos');if(id==='analisis')showAnalisisTab('dashboard');if(id==='precios')showPreciosTab('general');if(id==='achureros-gastos')showAchGastosTab('cargar');}

/* ─── INIT ────────────────────────────────────────────────── */

/* ─── AUTH ────────────────────────────────────────────────── */

function mostrarLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-wrap').style.display     = 'none';
  setTimeout(() => document.getElementById('login-usuario')?.focus(), 100);
}

function ocultarLogin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-wrap').style.display     = 'block';
}

async function hacerLogin() {
  const usuario    = document.getElementById('login-usuario').value.trim();
  const contrasena = document.getElementById('login-contrasena').value;
  const btn        = document.getElementById('btn-login');
  const err        = document.getElementById('login-error');
  err.textContent  = '';
  if (!usuario || !contrasena) { err.textContent = 'Completá usuario y contraseña'; return; }
  btn.textContent = 'Ingresando...'; btn.disabled = true;
  try {
    await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, contrasena }),
    });
    ocultarLogin();
    await arrancarApp();
  } catch (e) {
    err.textContent = 'Usuario o contraseña incorrectos';
    btn.textContent = 'Ingresar'; btn.disabled = false;
  }
}

function abrirCambioPassword() {
  document.getElementById('modal-cambio-pass')?.remove();
  const modal = document.createElement('div');
  modal.id = 'modal-cambio-pass';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--panel);border:1px solid rgba(123,110,246,0.35);border-radius:16px;padding:28px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.7);">
      <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:4px;">Cambiar contraseña</div>
      <div style="font-size:12px;color:var(--text-3);font-family:var(--font-mono);margin-bottom:20px;">Los cambios aplican de inmediato.</div>
      <div style="margin-bottom:12px;">
        <label style="font-family:var(--font-mono);font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:5px;">Contraseña actual</label>
        <input id="cp-actual" type="password" style="width:100%;background:var(--raised);border:1px solid var(--edge);border-radius:var(--r-sm);padding:10px 12px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;">
      </div>
      <div style="margin-bottom:20px;">
        <label style="font-family:var(--font-mono);font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:5px;">Contraseña nueva</label>
        <input id="cp-nueva" type="password" style="width:100%;background:var(--raised);border:1px solid var(--edge);border-radius:var(--r-sm);padding:10px 12px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;">
      </div>
      <div id="cp-error" style="font-size:12px;color:var(--danger);text-align:center;margin-bottom:12px;min-height:16px;font-family:var(--font-mono);"></div>
      <div style="display:flex;gap:10px;">
        <button id="btn-confirmar-cp" onclick="confirmarCambioPassword()"
          style="flex:1;background:var(--violet);color:#fff;border:none;border-radius:var(--r-md);padding:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-body);">
          Cambiar
        </button>
        <button onclick="document.getElementById('modal-cambio-pass').remove()"
          style="flex:1;background:transparent;color:var(--text-2);border:1px solid var(--edge);border-radius:var(--r-md);padding:12px;font-size:13px;cursor:pointer;font-family:var(--font-body);">
          Cancelar
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => document.getElementById('cp-actual')?.focus(), 50);
}

async function confirmarCambioPassword() {
  const actual = document.getElementById('cp-actual').value;
  const nueva  = document.getElementById('cp-nueva').value.trim();
  const err    = document.getElementById('cp-error');
  const btn    = document.getElementById('btn-confirmar-cp');
  err.textContent = '';
  if (!actual || !nueva) { err.textContent = 'Completá ambos campos'; return; }
  btn.textContent = 'Guardando...'; btn.disabled = true;
  try {
    await apiFetch('/auth/cambiar-password', {
      method: 'POST',
      body: JSON.stringify({ contrasena_actual: actual, contrasena_nueva: nueva }),
    });
    document.getElementById('modal-cambio-pass').remove();
    alert('Contraseña actualizada correctamente.');
  } catch (e) {
    err.textContent = e.message;
    btn.textContent = 'Cambiar'; btn.disabled = false;
  }
}

function cerrarApp() {
  if (window.pywebview) {
    window.pywebview.api.cerrar();
  } else {
    window.close();
  }
}

async function cerrarSesion() {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
  mostrarLogin();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen')?.style.display !== 'none') {
    hacerLogin();
  }
});

/* ─── INIT ────────────────────────────────────────────────── */

async function arrancarApp() {
  await Promise.all([cargarProductos(), cargarSidebar(), cargarProveedores(), cargarAchureros()]);
  buildTablaVentas();
  buildTablaCompra();
  buildTablaPrecios();
  showHome();
  calcTotales();
  calcTotalCompra();
}

(async function init(){
  try {
    await apiFetch('/auth/check');
    ocultarLogin();
    await arrancarApp();
  } catch {
    mostrarLogin();
  }
})();

/* ─── EVENT LISTENERS ─────────────────────────────────────── */

document.getElementById('cliente').addEventListener('change', async () => {
  if (EDITANDO_ID !== null) return;
  const cliente = document.getElementById('cliente').value.trim();
  await resolverPreciosCliente(cliente);
  buildTablaVentas();
  fillBoletaPricesFromMatrix();
  autoFillSaldoAnterior(cliente);
  autoFillUltimoPrecio(cliente);
});

document.getElementById('saldo-ant').addEventListener('input',()=>{if(EDITANDO_ID!==null)return;if(document.getElementById('cliente').value.trim())SALDO_MANUAL=true;});

// ── Atajos de teclado globales ────────────────────────────────
document.addEventListener('keydown', e => {
  // Ctrl+S → guardar boleta (desde cualquier lugar en la sección ventas)
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    const ventas = document.getElementById('ventas');
    if (ventas && !ventas.classList.contains('section-hidden')) {
      e.preventDefault();
      guardarBoleta();
    }
    return;
  }
  // Enter en campo cliente → pasar al primer input de la tabla
  if (e.key === 'Enter' && document.activeElement?.id === 'cliente') {
    e.preventDefault();
    const primerInput = document.querySelector('#tbody input');
    if (primerInput) { primerInput.focus(); primerInput.select(); }
    return;
  }
  // Tab desde saldo-ant → entrega
  if (e.key === 'Tab' && !e.shiftKey && document.activeElement?.id === 'saldo-ant') {
    e.preventDefault();
    document.getElementById('entrega')?.focus();
    return;
  }
  // Tab desde entrega → botón guardar
  if (e.key === 'Tab' && !e.shiftKey && document.activeElement?.id === 'entrega') {
    e.preventDefault();
    document.querySelector('.btn-primary')?.focus();
    return;
  }
  // Enter en botón guardar → guardar boleta
  if (e.key === 'Enter' && document.activeElement?.classList.contains('btn-primary')) {
    e.preventDefault();
    guardarBoleta();
    return;
  }
});

/* ─── TAB HELPERS ─────────────────────────────────────────── */

function activateTabs(t){Object.entries(t).forEach(([id,a])=>{const el=document.getElementById(id);if(el)el.classList.toggle('active',a);});}
function togglePanels(t){Object.entries(t).forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.classList.toggle('section-hidden',!v);});}

function showVentasTab(tab){activateTabs({'tab-ventas-crear':tab==='crear','tab-ventas-cc':tab==='cc','tab-ventas-historial':tab==='historial'});togglePanels({'ventas-crear':tab==='crear','ventas-cc':tab==='cc','ventas-historial':tab==='historial'});if(tab==='crear'){fillBoletaPricesFromMatrix();setTimeout(()=>{const clienteEl=document.getElementById('cliente');if(clienteEl&&!clienteEl.value.trim()){clienteEl.focus();}else{const f=document.querySelector('#tbody input');if(f)f.focus();}},50);}if(tab==='historial')renderHistorial();if(tab==='cc')renderCuentasCorrientes();}
function showComprasTab(tab){activateTabs({'tab-compras-cargar':tab==='cargar','tab-compras-historial':tab==='historial','tab-compras-stock':tab==='stock','tab-compras-proveedores':tab==='proveedores'});togglePanels({'compras-cargar':tab==='cargar','compras-historial':tab==='historial','compras-stock':tab==='stock','compras-proveedores':tab==='proveedores'});if(tab==='historial')renderHistorialCompras();if(tab==='stock')renderStock();if(tab==='proveedores')renderCuentasProveedores();}
function showAnalisisTab(tab){
  activateTabs({'tab-analisis-dashboard':tab==='dashboard','tab-analisis-insights':tab==='insights','tab-analisis-rentabilidad':tab==='rentabilidad','tab-analisis-inactivos':tab==='inactivos'});
  togglePanels({'analisis-dashboard':tab==='dashboard','analisis-insights':tab==='insights','analisis-rentabilidad':tab==='rentabilidad','analisis-inactivos':tab==='inactivos'});
  if(tab==='dashboard')renderAnalisis();
  if(tab==='insights')renderInsights();
  if(tab==='rentabilidad')renderRentabilidad();
  if(tab==='inactivos')renderClientesInactivos();
}
function showConfigTab(tab){activateTabs({'tab-config-productos':tab==='productos','tab-config-clientes':tab==='clientes','tab-config-proveedores':tab==='proveedores','tab-config-achureros':tab==='achureros'});togglePanels({'config-productos':tab==='productos','config-clientes':tab==='clientes','config-proveedores':tab==='proveedores','config-achureros':tab==='achureros'});if(tab==='productos')renderConfigProductos();if(tab==='clientes')renderConfigClientes();if(tab==='proveedores')renderConfigProveedores();if(tab==='achureros')renderConfigAchureros();}
function showPreciosTab(tab){activateTabs({'tab-precios-general':tab==='general','tab-precios-cliente':tab==='cliente'});togglePanels({'precios-general':tab==='general','precios-cliente':tab==='cliente'});if(tab==='cliente')showPreciosClienteTab();}

/* ─── ACHUREROS — GASTOS ──────────────────────────────────── */

function showAchGastosTab(tab) {
  activateTabs({'tab-ach-cargar': tab==='cargar', 'tab-ach-historial': tab==='historial'});
  togglePanels({'ach-cargar': tab==='cargar', 'ach-historial': tab==='historial'});
  if (tab === 'cargar') {
    const fd = document.getElementById('gasto-fecha');
    if (fd && !fd.value) fd.valueAsDate = new Date();
    cargarAchurerosEnGasto();
  }
  if (tab === 'historial') renderHistorialGastos();
}

async function cargarAchurerosEnGasto() {
  const sel = document.getElementById('gasto-achurero');
  if (!sel) return;
  try {
    const data = await apiFetch('/achureros');
    const val  = sel.value;
    sel.innerHTML = '<option value="">— Seleccionar —</option>';
    data.forEach(a => {
      const o = document.createElement('option');
      o.value = a.nombre; o.textContent = a.nombre;
      if (a.nombre === val) o.selected = true;
      sel.appendChild(o);
    });
  } catch {}
}

async function guardarGastoAchurero() {
  const fecha    = document.getElementById('gasto-fecha').value;
  const achurero = document.getElementById('gasto-achurero').value;
  const monto    = parseFloat(document.getElementById('gasto-monto').value);
  const locacion = document.getElementById('gasto-locacion').value;
  const nota     = document.getElementById('gasto-nota').value.trim();

  if (!fecha)         { alert('Seleccioná una fecha');    return; }
  if (!achurero)      { alert('Seleccioná un achurero');  return; }
  if (!monto || monto <= 0) { alert('Ingresá un monto válido'); return; }

  const btn = document.querySelector('#ach-cargar .btn-primary');
  const orig = btn.textContent;
  btn.textContent = 'Guardando...'; btn.disabled = true;

  try {
    await apiFetch('/gastos-achurero', {
      method: 'POST',
      body: JSON.stringify({ fecha, achurero, monto, locacion, nota }),
    });
    btn.textContent = '✔ Guardado';
    btn.style.setProperty('background', 'var(--mint)');
    setTimeout(() => {
      btn.textContent = orig; btn.style.removeProperty('background'); btn.disabled = false;
      document.getElementById('gasto-monto').value = '';
      document.getElementById('gasto-nota').value  = '';
    }, 1200);
  } catch (e) {
    alert('Error: ' + e.message);
    btn.textContent = orig; btn.disabled = false;
  }
}

async function renderHistorialGastos() {
  const cont = document.getElementById('ach-historial-contenido');
  cont.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div>`;
  let data;
  try { data = await apiFetch('/gastos-achurero'); }
  catch (e) { cont.innerHTML = `<div style="color:var(--danger);padding:24px;">Error: ${e.message}</div>`; return; }

  if (!data || data.length === 0) {
    cont.innerHTML = `<div class="section-panel-inner" style="text-align:center;padding:48px;">
      <div style="font-size:32px;margin-bottom:12px;">🚚</div>
      <div style="color:var(--text-3);">No hay gastos registrados</div></div>`;
    return;
  }

  const total = data.reduce((s, g) => s + g.monto, 0);
  cont.innerHTML = `
    <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;">${data.length} registro${data.length!==1?'s':''} · Total: <strong style="color:var(--danger);">${formatMoney(total)}</strong></div>
    <div class="section-panel-inner" style="padding:0;overflow:hidden;">
      <table class="lara-table" style="table-layout:auto;">
        <thead><tr>
          <th>Fecha</th><th>Achurero</th><th>Localidad</th>
          <th style="text-align:right;">Monto</th><th>Nota</th>
          <th style="text-align:center;">⚙</th>
        </tr></thead>
        <tbody id="gastos-tbody"></tbody>
      </table>
    </div>`;

  const tbody = document.getElementById('gastos-tbody');
  const LOC = {M:'Miramar',MDP:'Mar del Plata',O:'Otamendi',B:'Balcarce'};
  data.forEach(g => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:12px;color:var(--text-3);">${g.fecha}</td>
      <td style="font-weight:500;">${g.achurero}</td>
      <td style="font-size:12px;color:var(--text-3);">${LOC[g.locacion]||g.locacion||'—'}</td>
      <td style="text-align:right;font-weight:700;color:var(--danger);">${formatMoney(g.monto)}</td>
      <td style="font-size:12px;color:var(--text-3);">${g.nota||'—'}</td>
      <td style="text-align:center;">
        <button onclick="eliminarGastoAchurero(${g.id},this)"
          style="background:transparent;border:1px solid rgba(255,90,90,0.3);border-radius:6px;color:var(--danger);font-size:14px;cursor:pointer;padding:4px 8px;">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

async function eliminarGastoAchurero(id, btn) {
  if (!confirm('¿Eliminar este gasto?')) return;
  try {
    await apiFetch(`/gastos-achurero/${id}`, { method: 'DELETE' });
    renderHistorialGastos();
  } catch (e) { alert('Error: ' + e.message); }
}

function showCierreTab(tab){
  activateTabs({'tab-cierre-dia': tab==='dia'});
  togglePanels({'cierre-dia': tab==='dia'});
  if (tab==='dia') {
    const fd = document.getElementById('cierre-fecha-desde');
    const fh = document.getElementById('cierre-fecha-hasta');
    if (fd && !fd.value) fd.valueAsDate = new Date();
    if (fh && !fh.value) fh.valueAsDate = new Date();
  }
}

/* ─── ANALISIS ────────────────────────────────────────────── */

let _analisisPeriodo = 'mes';

function _varBadge(v) {
  if (v === null || v === undefined) return '';
  const color = v >= 0 ? '#5DCAA5' : '#f09595';
  const arrow = v >= 0 ? '▲' : '▼';
  return `<span style="font-size:11px;font-weight:700;color:${color};margin-left:6px;">${arrow} ${Math.abs(v)}%</span>`;
}

function _periodoAntLabel(periodo) {
  const m = { hoy: '3 días anteriores', semana: 'semana anterior', mes: 'mes anterior', anio: 'año anterior' };
  return m[periodo] || '';
}

async function renderAnalisis(periodo) {
  _analisisPeriodo = periodo || _analisisPeriodo;

  ['hoy','semana','mes','anio'].forEach(p => {
    const btn = document.getElementById(`periodo-${p}`);
    if (btn) btn.classList.toggle('active', p === _analisisPeriodo);
  });

  const tab = document.getElementById('analisis-dashboard');
  if (!tab || tab.classList.contains('section-hidden')) return;

  const cont = document.getElementById('analisis-dashboard-inner');
  if (!cont) return;
  cont.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-3);">Cargando...</div>`;

  let d;
  try { d = await apiFetch(`/analisis?periodo=${_analisisPeriodo}`); }
  catch (e) {
    if (e.message.includes('401') || e.message.includes('autenticado')) { mostrarLogin(); return; }
    cont.innerHTML = `<div style="color:var(--danger);text-align:center;padding:48px;">Error: ${e.message}</div>`;
    return;
  }

  const PERIODO_LABEL = { hoy: 'Últimos 3 días', semana: 'Esta semana', mes: 'Este mes', anio: 'Este año' };
  const label    = PERIODO_LABEL[_analisisPeriodo];
  const antLabel = _periodoAntLabel(_analisisPeriodo);
  const vr       = d.variaciones || {};
  const ant      = d.anterior    || {};

  cont.innerHTML = `

    <div class="analisis-metrics">

      <div class="an-card an-card--purple">
        <div class="an-card-title">💰 Ventas ${label} ${_varBadge(vr.total_ventas)}</div>
        <div class="an-card-value">${formatMoney(d.total_ventas)}</div>
        <div class="an-card-sub">${d.cant_boletas} boleta${d.cant_boletas !== 1 ? 's' : ''} · ${antLabel}: ${formatMoney(ant.total_ventas || 0)}</div>
      </div>

      <div class="an-card an-card--green">
        <div class="an-card-title">✅ Cobrado ${label} ${_varBadge(vr.total_pagos)}</div>
        <div class="an-card-value">${formatMoney(d.total_pagos)}</div>
        <div class="an-card-sub">Entregado en boletas: ${formatMoney(d.total_entregado)} · ${antLabel}: ${formatMoney(ant.total_pagos || 0)}</div>
      </div>

      <div class="an-card an-card--red">
        <div class="an-card-title">📋 Deuda total general</div>
        <div class="an-card-value">${formatMoney(d.total_deuda_general)}</div>
        <div class="an-card-sub">Generado ${label}: ${formatMoney(d.total_debe)} · ${antLabel}: ${formatMoney(ant.total_debe || 0)}</div>
      </div>

      <div class="an-card ${d.margen >= 0 ? 'an-card--green' : 'an-card--red'}">
        <div class="an-card-title">📊 Margen bruto ${label} ${_varBadge(vr.margen)}</div>
        <div class="an-card-value">${formatMoney(d.margen)}</div>
        <div class="an-card-sub">${d.margen_pct}% · Compras: ${formatMoney(d.total_compras)} · ${antLabel}: ${formatMoney(ant.margen || 0)}</div>
      </div>

      ${d.total_gastos_achurero > 0 ? `
      <div class="an-card an-card--red">
        <div class="an-card-title">🚚 Gastos achureros ${label}</div>
        <div class="an-card-value">${formatMoney(d.total_gastos_achurero)}</div>
        <div class="an-card-sub">${antLabel}: ${formatMoney(ant.total_gastos_achurero || 0)}</div>
      </div>

      <div class="an-card ${d.margen_neto >= 0 ? 'an-card--green' : 'an-card--red'}">
        <div class="an-card-title">💰 Margen neto ${label} ${_varBadge(vr.margen_neto)}</div>
        <div class="an-card-value">${formatMoney(d.margen_neto)}</div>
        <div class="an-card-sub">${d.margen_neto_pct}% sobre ventas · ${antLabel}: ${formatMoney(ant.margen_neto || 0)}</div>
      </div>` : ''}

    </div>

    <div class="analisis-rankings">

      <div class="an-panel">
        <div class="an-panel-title">🥩 Productos más vendidos ${label}</div>
        ${d.productos_ranking.length === 0
          ? `<div class="an-empty">Sin ventas en este período</div>`
          : `<table class="an-table">
              <thead><tr><th>Producto</th><th style="text-align:right;">Kg</th><th style="text-align:right;">Total</th></tr></thead>
              <tbody>
                ${d.productos_ranking.slice(0,8).map((p, i) => `
                  <tr>
                    <td>
                      <div class="an-bar-wrap">
                        <div class="an-bar-fill" style="width:${Math.round(p.total / d.productos_ranking[0].total * 100)}%"></div>
                        <span class="an-bar-label">${i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':''}${p.nombre}</span>
                      </div>
                    </td>
                    <td style="text-align:right;font-size:12px;color:var(--text-2);">${formatKg(p.kg)}</td>
                    <td style="text-align:right;font-weight:700;color:var(--violet);">${formatMoney(p.total)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
      </div>

      <div class="an-panel">
        <div class="an-panel-title">📍 Ventas por localidad ${label}</div>
        ${d.ventas_por_loc.length === 0
          ? `<div class="an-empty">Sin ventas en este período</div>`
          : `<table class="an-table">
              <thead><tr><th>Localidad</th><th style="text-align:right;">Boletas</th><th style="text-align:right;">Total</th></tr></thead>
              <tbody>
                ${d.ventas_por_loc.map(l => `
                  <tr>
                    <td>
                      <div class="an-bar-wrap">
                        <div class="an-bar-fill" style="width:${Math.round(l.total / d.ventas_por_loc[0].total * 100)}%"></div>
                        <span class="an-bar-label">${l.nombre}</span>
                      </div>
                    </td>
                    <td style="text-align:right;font-size:12px;color:var(--text-2);">${l.cant}</td>
                    <td style="text-align:right;font-weight:700;color:var(--violet);">${formatMoney(l.total)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
      </div>

      <div class="an-panel">
        <div class="an-panel-title">⚠️ Clientes con mayor deuda</div>
        ${d.top_clientes.length === 0
          ? `<div class="an-empty">Sin deudas pendientes 🎉</div>`
          : `<table class="an-table">
              <thead><tr><th>Cliente</th><th style="text-align:right;">Saldo</th></tr></thead>
              <tbody>
                ${d.top_clientes.map(c => `
                  <tr>
                    <td>
                      <div class="an-bar-wrap">
                        <div class="an-bar-fill an-bar-fill--red" style="width:${Math.round(c.saldo / d.top_clientes[0].saldo * 100)}%"></div>
                        <span class="an-bar-label">${c.cliente}</span>
                      </div>
                    </td>
                    <td style="text-align:right;font-weight:700;color:var(--danger);">${formatMoney(c.saldo)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
      </div>

    </div>`;
}

function renderChart() { renderAnalisis(); }
async function renderInsights() {
  const cont = document.getElementById('analisis-insights');
  if (!cont) return;
  cont.innerHTML = `<div class="section-body"><div style="text-align:center;padding:32px;color:var(--text-3);font-family:var(--font-mono);font-size:12px;">Cargando...</div></div>`;

  let d;
  try { d = await apiFetch(`/analisis?periodo=${_analisisPeriodo}`); }
  catch (e) { cont.innerHTML = `<div class="section-body"><div style="color:var(--danger);text-align:center;padding:48px;">${e.message}</div></div>`; return; }

  const PERIODO_LABEL = { hoy: 'últimos 3 días', semana: 'esta semana', mes: 'este mes', anio: 'este año' };
  const label = PERIODO_LABEL[_analisisPeriodo] || 'este mes';

  const insights = [];

  // Producto estrella
  if (d.productos_ranking.length > 0) {
    const top = d.productos_ranking[0];
    insights.push({ icon: '🥇', texto: `${top.nombre} es el producto más vendido ${label} con ${formatKg(top.kg)} — ${formatMoney(top.total)}` });
  }

  // Localidad líder
  if (d.ventas_por_loc.length > 0) {
    const topLoc = d.ventas_por_loc[0];
    insights.push({ icon: '📍', texto: `${topLoc.nombre} lidera las ventas ${label} con ${formatMoney(topLoc.total)} en ${topLoc.cant} boleta${topLoc.cant !== 1 ? 's' : ''}` });
  }

  // Margen
  if (d.total_compras > 0) {
    const signo = d.margen >= 0 ? '✅' : '⚠️';
    insights.push({ icon: signo, texto: `Margen bruto ${label}: ${formatMoney(d.margen)} (${d.margen_pct}% sobre ventas de ${formatMoney(d.total_ventas)})` });
    if (d.total_gastos_achurero > 0) {
      insights.push({ icon: '🚚', texto: `Gastos de achureros ${label}: ${formatMoney(d.total_gastos_achurero)}` });
      const signoNeto = d.margen_neto >= 0 ? '💰' : '🔴';
      insights.push({ icon: signoNeto, texto: `Margen neto ${label}: ${formatMoney(d.margen_neto)} (${d.margen_neto_pct}% sobre ventas)` });
    }
  }

  // Deuda
  if (d.total_deuda_general > 0) {
    insights.push({ icon: '📋', texto: `Deuda total pendiente: ${formatMoney(d.total_deuda_general)}` });
    if (d.top_clientes.length > 0) {
      const topDeudor = d.top_clientes[0];
      insights.push({ icon: '⚠️', texto: `Mayor deuda: ${topDeudor.cliente} con ${formatMoney(topDeudor.saldo)} pendiente` });
    }
  }

  // Cobrado vs vendido
  if (d.total_ventas > 0) {
    const pct = Math.round(d.total_pagos / d.total_ventas * 100);
    insights.push({ icon: '💰', texto: `Cobrado ${label}: ${formatMoney(d.total_pagos)} (${pct}% de lo vendido)` });
  }

  if (insights.length === 0) {
    insights.push({ icon: '📊', texto: `Sin datos suficientes para generar insights ${label}` });
  }

  cont.innerHTML = `<div class="section-body"><div class="section-panel-inner insights-box">
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">Insights — ${PERIODO_LABEL[_analisisPeriodo]}</div>
    ${insights.map(i => `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--edge);">
        <span style="font-size:16px;flex-shrink:0;">${i.icon}</span>
        <span style="font-size:13px;color:var(--text-1);line-height:1.5;">${i.texto}</span>
      </div>`).join('')}
  </div></div>`;
}

/* ─── RENTABILIDAD POR PRODUCTO ───────────────────────────── */

async function renderRentabilidad() {
  const cont = document.getElementById('analisis-rentabilidad-inner');
  if (!cont) return;
  cont.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div>`;

  let d;
  try { d = await apiFetch(`/analisis/rentabilidad?periodo=${_analisisPeriodo}`); }
  catch (e) { cont.innerHTML = `<div style="color:var(--danger);padding:24px;">Error: ${e.message}</div>`; return; }

  if (!d.productos || d.productos.length === 0) {
    cont.innerHTML = `<div class="section-panel-inner" style="text-align:center;padding:48px;"><div style="font-size:32px;margin-bottom:12px;">📊</div><div style="color:var(--text-3);">Sin datos en el período seleccionado</div></div>`;
    return;
  }

  const totalMargen = d.productos.reduce((s, p) => s + p.margen, 0);

  cont.innerHTML = `
    <div style="margin-bottom:10px;font-size:12px;color:var(--text-3);">Período: <strong style="color:var(--text-1);">${d.desde}</strong> → <strong style="color:var(--text-1);">${d.hasta}</strong> · Margen total: <strong style="color:${totalMargen>=0?'var(--mint)':'var(--danger)'};">${formatMoney(totalMargen)}</strong></div>
    <div class="section-panel-inner" style="padding:0;overflow:hidden;">
      <table class="lara-table" style="table-layout:auto;">
        <thead><tr>
          <th>Producto</th>
          <th style="text-align:right;">Kg vendidos</th>
          <th style="text-align:right;">Venta</th>
          <th style="text-align:right;">Costo</th>
          <th style="text-align:right;">Margen $</th>
          <th style="text-align:right;">Margen %</th>
          <th style="text-align:right;">P/kg venta</th>
          <th style="text-align:right;">P/kg costo</th>
        </tr></thead>
        <tbody>
          ${d.productos.map(p => {
            const colorM = p.margen > 0 ? 'var(--mint)' : p.margen < 0 ? 'var(--danger)' : 'var(--text-3)';
            const colorP = p.margen_pct > 20 ? 'var(--mint)' : p.margen_pct > 0 ? 'var(--text-1)' : 'var(--danger)';
            return `<tr>
              <td style="font-weight:500;">${p.producto}</td>
              <td style="text-align:right;font-family:var(--font-mono);font-size:12px;">${formatKg(p.kg_vendido)}</td>
              <td style="text-align:right;font-family:var(--font-mono);font-size:12px;">${formatMoney(p.venta)}</td>
              <td style="text-align:right;font-family:var(--font-mono);font-size:12px;color:var(--text-3);">${p.costo > 0 ? formatMoney(p.costo) : '—'}</td>
              <td style="text-align:right;font-family:var(--font-mono);font-size:12px;font-weight:700;color:${colorM};">${formatMoney(p.margen)}</td>
              <td style="text-align:right;font-family:var(--font-mono);font-size:12px;color:${colorP};">${p.costo > 0 ? p.margen_pct + '%' : '—'}</td>
              <td style="text-align:right;font-family:var(--font-mono);font-size:12px;">${p.px_venta > 0 ? formatMoney(p.px_venta) : '—'}</td>
              <td style="text-align:right;font-family:var(--font-mono);font-size:12px;color:var(--text-3);">${p.px_compra > 0 ? formatMoney(p.px_compra) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ─── CLIENTES INACTIVOS ──────────────────────────────────── */

let _diasInactivos = 30;

async function renderClientesInactivos() {
  const cont = document.getElementById('analisis-inactivos-inner');
  if (!cont) return;
  cont.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
      <label style="font-size:12px;color:var(--text-3);">Sin compra en los últimos</label>
      <select id="select-dias-inactivos" onchange="_diasInactivos=+this.value;renderClientesInactivos()"
        style="background:var(--panel);border:1px solid var(--edge);border-radius:8px;padding:5px 10px;color:var(--text-1);font-size:13px;outline:none;">
        <option value="15"  ${_diasInactivos===15?'selected':''}>15 días</option>
        <option value="30"  ${_diasInactivos===30?'selected':''}>30 días</option>
        <option value="60"  ${_diasInactivos===60?'selected':''}>60 días</option>
        <option value="90"  ${_diasInactivos===90?'selected':''}>90 días</option>
      </select>
    </div>
    <div id="inactivos-tabla" style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div>`;

  let d;
  try { d = await apiFetch(`/analisis/clientes-inactivos?dias=${_diasInactivos}`); }
  catch (e) { document.getElementById('inactivos-tabla').innerHTML = `<div style="color:var(--danger);">Error: ${e.message}</div>`; return; }

  const tabla = document.getElementById('inactivos-tabla');
  if (!d.clientes || d.clientes.length === 0) {
    tabla.innerHTML = `<div class="section-panel-inner" style="text-align:center;padding:48px;"><div style="font-size:32px;margin-bottom:12px;">✅</div><div style="color:var(--text-3);">Todos los clientes compraron en los últimos ${_diasInactivos} días</div></div>`;
    return;
  }

  tabla.innerHTML = `
    <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;">${d.total} cliente${d.total!==1?'s':''} sin actividad en los últimos ${d.dias} días</div>
    <div class="section-panel-inner" style="padding:0;overflow:hidden;">
      <table class="lara-table" style="table-layout:auto;">
        <thead><tr>
          <th>Cliente</th>
          <th>Localidad</th>
          <th style="text-align:right;">Última boleta</th>
          <th style="text-align:right;">Días inactivo</th>
          <th style="text-align:right;">Boletas hist.</th>
          <th style="text-align:right;">Saldo pendiente</th>
        </tr></thead>
        <tbody>
          ${d.clientes.map(c => {
            const colorDias = c.dias_inactivo > 60 ? 'var(--danger)' : c.dias_inactivo > 30 ? '#f5c518' : 'var(--text-2)';
            const colorSaldo = c.saldo > 0 ? 'var(--danger)' : 'var(--text-3)';
            return `<tr>
              <td style="font-weight:500;">${c.cliente}</td>
              <td style="font-size:12px;color:var(--text-3);">${c.locacion}</td>
              <td style="text-align:right;font-size:12px;color:var(--text-3);">${c.ultima_boleta}</td>
              <td style="text-align:right;font-weight:700;color:${colorDias};">${c.dias_inactivo}d</td>
              <td style="text-align:right;font-size:12px;color:var(--text-3);">${c.total_boletas}</td>
              <td style="text-align:right;font-weight:600;color:${colorSaldo};">${c.saldo > 0 ? formatMoney(c.saldo) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ─── CUENTAS PROVEEDORES ─────────────────────────────────── */

async function renderCuentasProveedores() {
  const cont = document.getElementById('compras-proveedores');
  cont.innerHTML = `<div class="section-body"><div style="text-align:center;padding:32px;color:var(--text-3);">Cargando...</div></div>`;
  let data;
  try { data = await apiFetch('/proveedores-cuentas'); }
  catch (e) { cont.innerHTML = `<div class="section-body"><div class="section-panel-inner" style="text-align:center;padding:48px;color:var(--danger);">Error: ${e.message}</div></div>`; return; }

  if (!data.proveedores || data.proveedores.length === 0) {
    cont.innerHTML = `<div class="section-body"><div class="section-panel-inner" style="text-align:center;padding:48px 24px;"><div style="font-size:32px;margin-bottom:16px;">🏭</div><div style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:8px;">Sin proveedores</div><div style="font-size:14px;color:var(--text-3);">No hay compras registradas</div></div></div>`;
    return;
  }

  cont.innerHTML = `
    <div class="section-body">
      <div class="section-panel-inner" style="padding:0;overflow:hidden;">
        <table class="lara-table" style="table-layout:fixed;">
          <thead><tr>
            <th style="width:32%;">Proveedor</th>
            <th style="width:20%;text-align:right;">Compras</th>
            <th style="width:20%;text-align:right;">Pagado</th>
            <th style="width:16%;text-align:right;">Saldo</th>
            <th style="width:6%;text-align:center;">Pago</th>
            <th style="width:6%;text-align:center;">Hist.</th>
          </tr></thead>
          <tbody id="cc-proveedores-body"></tbody>
        </table>
      </div>
    </div>`;

  const tbody = document.getElementById('cc-proveedores-body');
  data.proveedores.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:13px;color:var(--text-1);font-weight:500;padding:8px 12px;">${p.proveedor}</td>
      <td style="text-align:right;font-size:12px;color:var(--text-2);padding:8px 12px;">${formatMoney(p.total_compras)}</td>
      <td style="text-align:right;font-size:12px;color:var(--mint);padding:8px 12px;">${p.total_pagado > 0 ? '- ' + formatMoney(p.total_pagado) : '—'}</td>
      <td style="text-align:right;font-size:13px;font-weight:700;padding:8px 12px;color:${p.saldo > 0 ? '#f09595' : '#5DCAA5'};">${formatMoney(p.saldo)}</td>
      <td style="text-align:center;padding:8px 4px;">
        <button style="background:var(--violet-glow);border:1px solid rgba(123,110,246,0.4);border-radius:6px;color:var(--text-1);font-size:12px;cursor:pointer;padding:4px 8px;"
          data-proveedor="${p.proveedor}" data-saldo="${p.saldo}" onclick="abrirModalPagoProveedor(this)">💰</button>
      </td>
      <td style="text-align:center;padding:8px 4px;">
        <button style="background:var(--panel);border:1px solid var(--edge);border-radius:6px;color:var(--text-2);font-size:12px;cursor:pointer;padding:4px 8px;"
          onclick="abrirHistorialPagosProveedor('${p.proveedor}')">📋</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Fila total general
  const trTotal = document.createElement('tr');
  trTotal.style.cssText = 'background:var(--violet-glow);';
  trTotal.innerHTML = `
    <td colspan="3" style="font-size:12px;font-weight:700;color:var(--text-1);text-transform:uppercase;letter-spacing:0.1em;padding:12px;">🏭 Total a proveedores</td>
    <td style="text-align:right;font-size:16px;font-weight:700;padding:12px;color:${data.total_general > 0 ? '#f09595' : '#5DCAA5'};">${formatMoney(data.total_general)}</td>
    <td colspan="2"></td>`;
  tbody.appendChild(trTotal);
}

function abrirModalPagoProveedor(btn) {
  const proveedor = btn.dataset.proveedor;
  const saldo = parseFloat(btn.dataset.saldo);
  document.getElementById('modal-pago-proveedor')?.remove();
  const hoy = new Date().toISOString().slice(0, 10);
  const modal = document.createElement('div');
  modal.id = 'modal-pago-proveedor';
  modal.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--panel);border:1px solid rgba(123,110,246,0.35);border-radius:16px;padding:28px 28px 24px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.7);">
      <div style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:4px;">💰 Registrar pago</div>
      <div style="font-size:13px;color:var(--text-2);margin-bottom:20px;">${proveedor} · Saldo: <span style="color:var(--danger);font-weight:600;">${formatMoney(saldo)}</span></div>
      <div style="margin-bottom:14px;">
        <label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Monto</label>
        <input id="pago-prov-monto" type="number" min="0.01" step="0.01" placeholder="0.00"
          style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:10px 12px;color:var(--text-1);font-size:15px;box-sizing:border-box;outline:none;">
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Fecha</label>
        <input id="pago-prov-fecha" type="date" value="${hoy}"
          style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:10px 12px;color:var(--text-1);font-size:14px;box-sizing:border-box;outline:none;">
      </div>
      <div style="margin-bottom:20px;">
        <label style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:6px;">Nota (opcional)</label>
        <input id="pago-prov-nota" type="text" placeholder="Ej: transferencia, efectivo..."
          style="width:100%;background:var(--panel);border:2px solid var(--edge);border-radius:10px;padding:10px 12px;color:var(--text-1);font-size:13px;box-sizing:border-box;outline:none;">
      </div>
      <div style="display:flex;gap:10px;">
        <button id="btn-confirmar-pago-prov" style="flex:1;background:var(--violet);color:var(--text-1);border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;">Confirmar</button>
        <button onclick="document.getElementById('modal-pago-proveedor').remove()" style="flex:1;background:var(--panel);color:var(--text-1);border:1px solid var(--edge);border-radius:10px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('pago-prov-monto').focus();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.getElementById('btn-confirmar-pago-prov').addEventListener('click', () => confirmarPagoProveedor(proveedor));
}

async function confirmarPagoProveedor(proveedor) {
  const monto = parseFloat(document.getElementById('pago-prov-monto').value);
  const fecha = document.getElementById('pago-prov-fecha').value;
  const nota  = document.getElementById('pago-prov-nota').value.trim();
  if (!monto || monto <= 0) { alert('Ingresá un monto válido'); return; }
  const btn = document.getElementById('btn-confirmar-pago-prov');
  btn.textContent = 'Guardando...'; btn.disabled = true;
  try {
    await apiFetch('/pagos-proveedor', { method: 'POST', body: JSON.stringify({ proveedor, monto, fecha, nota }) });
    document.getElementById('modal-pago-proveedor').remove();
    renderCuentasProveedores();
  } catch (e) {
    alert('Error: ' + e.message);
    btn.textContent = 'Confirmar'; btn.disabled = false;
  }
}

async function abrirHistorialPagosProveedor(proveedor) {
  document.getElementById('modal-pagos-prov-hist')?.remove();
  let pagos;
  try { pagos = await apiFetch(`/pagos-proveedor/${encodeURIComponent(proveedor)}`); }
  catch (e) { alert('Error: ' + e.message); return; }

  const filas = pagos.length === 0
    ? `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-3);">Sin pagos registrados</td></tr>`
    : pagos.map(p => `
        <tr>
          <td style="padding:8px 12px;font-size:13px;font-family:var(--font-mono);">${p.fecha}</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:500;color:var(--mint);font-family:var(--font-mono);">${formatMoney(p.monto)}</td>
          <td style="padding:8px 12px;font-size:12px;color:var(--text-2);">${p.nota || '—'}</td>
          <td style="text-align:center;padding:8px;">
            <button onclick="eliminarPagoProveedor(${p.id},'${proveedor}')"
              style="background:transparent;border:1px solid rgba(255,90,90,0.3);border-radius:6px;color:var(--danger);font-size:13px;cursor:pointer;padding:3px 8px;">🗑️</button>
          </td>
        </tr>`).join('');

  const modal = document.createElement('div');
  modal.id = 'modal-pagos-prov-hist';
  modal.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--panel);border:1px solid rgba(123,110,246,0.35);border-radius:16px;padding:24px;width:440px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.7);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-size:16px;font-weight:700;color:var(--text-1);">📋 Pagos — ${proveedor}</div>
        <button onclick="document.getElementById('modal-pagos-prov-hist').remove()" style="background:transparent;border:none;color:var(--text-2);font-size:18px;cursor:pointer;">✕</button>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:var(--violet-glow);">
          <th style="padding:8px 12px;font-size:11px;color:var(--violet);text-align:left;text-transform:uppercase;letter-spacing:0.08em;">Fecha</th>
          <th style="padding:8px 12px;font-size:11px;color:var(--violet);text-align:left;text-transform:uppercase;letter-spacing:0.08em;">Monto</th>
          <th style="padding:8px 12px;font-size:11px;color:var(--violet);text-align:left;text-transform:uppercase;letter-spacing:0.08em;">Nota</th>
          <th style="padding:8px 12px;font-size:11px;color:var(--violet);text-align:center;text-transform:uppercase;letter-spacing:0.08em;">⚙</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function eliminarPagoProveedor(id, proveedor) {
  if (!confirm('¿Eliminar este pago?')) return;
  try {
    await apiFetch(`/pagos-proveedor/${id}`, { method: 'DELETE' });
    document.getElementById('modal-pagos-prov-hist')?.remove();
    await abrirHistorialPagosProveedor(proveedor);
    renderCuentasProveedores();
  } catch (e) { alert('Error: ' + e.message); }
}


/* ─── EXPORTAR CIERRE ────────────────────────────────────── */

async function exportarCierre() {
  const fechaDesde = document.getElementById('cierre-fecha-desde').value;
  const fechaHasta = document.getElementById('cierre-fecha-hasta').value;
  if (!fechaDesde || !fechaHasta) { alert('Seleccioná las fechas Desde y Hasta'); return; }
  if (fechaDesde > fechaHasta) { alert('La fecha Desde no puede ser posterior a Hasta'); return; }

  const btn = document.getElementById('btn-exportar-cierre');
  const textoOriginal = btn.textContent;
  btn.textContent = 'Generando...';
  btn.disabled = true;

  let data;
  try {
    data = await apiFetch(`/cierre/exportar?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`);
  } catch (e) {
    alert('Error generando el archivo: ' + e.message);
    btn.textContent = textoOriginal; btn.disabled = false;
    return;
  }

  if (!data || !data.data || !data.filename) {
    alert('El servidor no devolvió un archivo válido. Verificá que openpyxl esté instalado.');
    btn.textContent = textoOriginal; btn.disabled = false;
    return;
  }

  // Si corre en PyWebView usamos la API nativa para guardar
  if (window.pywebview) {
    try {
      const ruta = await window.pywebview.api.guardar_excel(data.data, data.filename);
      if (ruta) {
        btn.textContent = '✔ Guardado';
        btn.style.background = '#5DCAA5';
        setTimeout(() => { btn.textContent = textoOriginal; btn.style.background = ''; btn.disabled = false; }, 2500);
      } else {
        // Usuario canceló el diálogo
        btn.textContent = textoOriginal; btn.disabled = false;
      }
    } catch (e) {
      alert('Error guardando el archivo: ' + e.message);
      btn.textContent = textoOriginal; btn.disabled = false;
    }
  } else {
    // Fallback navegador: descarga directa
    const bytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
    const blob  = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url; a.download = data.filename;
    a.click();
    URL.revokeObjectURL(url);
    btn.textContent = '✔ Descargado';
    btn.style.background = '#5DCAA5';
    setTimeout(() => { btn.textContent = textoOriginal; btn.style.background = ''; btn.disabled = false; }, 2500);
  }
}

/* ─── CIERRE DEL DÍA ─────────────────────────────────────── */

async function renderCierre() {
  const fechaDesde = document.getElementById('cierre-fecha-desde').value;
  const fechaHasta = document.getElementById('cierre-fecha-hasta').value;
  if (!fechaDesde || !fechaHasta) { alert('Seleccioná las fechas Desde y Hasta'); return; }
  if (fechaDesde > fechaHasta) { alert('La fecha Desde no puede ser posterior a Hasta'); return; }

  const btn = document.getElementById('btn-ver-cierre');
  btn.textContent = 'Cargando...'; btn.disabled = true;

  let data;
  try { data = await apiFetch(`/cierre?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`); }
  catch (e) {
    document.getElementById('cierre-resultado').innerHTML = `<div style="color:var(--danger);padding:24px;text-align:center;">Error: ${e.message}</div>`;
    btn.textContent = 'Ver cierre'; btn.disabled = false;
    return;
  }

  btn.textContent = 'Ver cierre'; btn.disabled = false;
  document.getElementById('cierre-export-btn').style.display = 'block';

  const cont = document.getElementById('cierre-resultado');

  if (!data.locaciones || data.locaciones.length === 0) {
    cont.innerHTML = `<div class="section-panel-inner" style="text-align:center;padding:48px 24px;"><div style="font-size:32px;margin-bottom:16px;">📋</div><div style="font-size:16px;font-weight:700;color:var(--text-1);margin-bottom:8px;">Sin boletas</div><div style="font-size:14px;color:var(--text-3);">No hay boletas para esta fecha</div></div>`;
    return;
  }

  let html = `<div class="section-panel-inner" style="padding:0;overflow:hidden;margin-bottom:16px;"><table class="lara-table" style="table-layout:fixed;"><thead><tr><th style="width:30%;">Localidad / Cliente</th><th style="width:16%;text-align:right;">Total</th><th style="width:16%;text-align:right;">Entrega</th><th style="width:16%;text-align:right;">Cobrado</th><th style="width:16%;text-align:right;">Pendiente</th><th style="width:6%;text-align:center;">Ach.</th></tr></thead><tbody>`;

  data.locaciones.forEach(loc => {
    html += `<tr style="background:var(--violet-glow);"><td colspan="6" style="font-size:11px;font-weight:700;color:var(--violet);text-transform:uppercase;letter-spacing:0.12em;padding:10px 12px 8px;">📍 ${loc.nombre}</td></tr>`;
    loc.clientes.forEach(c => {
      html += `<tr><td style="font-size:13px;color:var(--text-1);font-weight:500;padding:8px 12px 8px 24px;">${c.cliente}</td><td style="text-align:right;font-size:12px;padding:8px 12px;">${formatMoney(c.total)}</td><td style="text-align:right;font-size:12px;color:var(--mint);padding:8px 12px;">${c.entrega>0?formatMoney(c.entrega):'—'}</td><td style="text-align:right;font-size:12px;color:var(--mint);padding:8px 12px;">${c.cobrado>0?formatMoney(c.cobrado):'—'}</td><td style="text-align:right;font-size:13px;font-weight:700;padding:8px 12px;color:${c.pendiente>0?'#f09595':'#5DCAA5'};">${formatMoney(c.pendiente)}</td><td style="text-align:center;font-size:11px;color:var(--text-3);padding:8px 4px;">${c.achurero||'—'}</td></tr>`;
    });
    html += `<tr><td colspan="1" style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;padding:6px 12px 10px 24px;">Total ${loc.nombre}</td><td style="text-align:right;font-size:13px;font-weight:700;padding:6px 12px 10px;color:var(--violet);">${formatMoney(loc.subtotal_ventas)}</td><td style="text-align:right;font-size:13px;font-weight:700;padding:6px 12px 10px;color:var(--mint);">${formatMoney(loc.subtotal_cobrado)}</td><td></td><td style="text-align:right;font-size:13px;font-weight:700;padding:6px 12px 10px;color:${loc.subtotal_pendiente>0?'#f09595':'#5DCAA5'};">${formatMoney(loc.subtotal_pendiente)}</td><td></td></tr>`;
  });

  html += `<tr style="background:var(--violet-glow);"><td colspan="1" style="font-size:12px;font-weight:700;color:var(--text-1);text-transform:uppercase;letter-spacing:0.1em;padding:12px;">🧾 Total General</td><td style="text-align:right;font-size:15px;font-weight:700;padding:12px;color:var(--violet);">${formatMoney(data.total_general_ventas)}</td><td style="text-align:right;font-size:15px;font-weight:700;padding:12px;color:var(--mint);">${formatMoney(data.total_general_cobrado)}</td><td></td><td style="text-align:right;font-size:15px;font-weight:700;padding:12px;color:${data.total_general_pendiente>0?'#f09595':'#5DCAA5'};">${formatMoney(data.total_general_pendiente)}</td><td></td></tr>`;
  html += `</tbody></table></div>`;

  // ── Gastos de achureros ───────────────────────────────────
  if (data.gastos_achurero && data.gastos_achurero.length > 0) {
    const LOC = {M:'Miramar',MDP:'Mar del Plata',O:'Otamendi',B:'Balcarce'};
    html += `<div class="section-panel-inner" style="padding:0;overflow:hidden;">
      <div style="padding:10px 12px 6px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;">🚚 Gastos de Achureros</div>
      <table class="lara-table" style="table-layout:fixed;">
        <thead><tr>
          <th style="width:15%;">Fecha</th>
          <th style="width:25%;">Achurero</th>
          <th style="width:20%;">Localidad</th>
          <th style="width:25%;text-align:right;">Monto</th>
          <th style="width:15%;">Nota</th>
        </tr></thead><tbody>`;
    data.gastos_achurero.forEach(g => {
      html += `<tr>
        <td style="font-size:12px;color:var(--text-3);padding:8px 12px;">${g.fecha}</td>
        <td style="font-weight:500;padding:8px 12px;">${g.achurero}</td>
        <td style="font-size:12px;color:var(--text-3);padding:8px 12px;">${LOC[g.locacion]||g.locacion||'—'}</td>
        <td style="text-align:right;font-weight:700;color:var(--danger);padding:8px 12px;">${formatMoney(g.monto)}</td>
        <td style="font-size:12px;color:var(--text-3);padding:8px 12px;">${g.nota||'—'}</td>
      </tr>`;
    });
    html += `<tr style="background:rgba(255,90,90,0.08);">
      <td colspan="3" style="font-weight:700;padding:10px 12px;color:var(--danger);">Total gastos achureros</td>
      <td style="text-align:right;font-weight:700;font-size:15px;padding:10px 12px;color:var(--danger);">${formatMoney(data.total_gastos_achurero)}</td>
      <td></td>
    </tr>`;
    html += `</tbody></table></div>`;

    // Total neto (ventas - gastos)
    html += `<div class="section-panel-inner" style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:13px;font-weight:700;color:var(--text-1);">💰 Total Neto (ventas − compras − gastos achureros)</span>
      <span style="font-size:18px;font-weight:700;color:${data.total_neto>=0?'var(--mint)':'var(--danger)'};">${formatMoney(data.total_neto)}</span>
    </div>`;
  }

  if (data.productos && data.productos.length > 0) {
    html += `<div class="section-panel-inner" style="padding:0;overflow:hidden;"><div style="padding:10px 12px 6px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em;">🥩 Productos del día</div><table class="lara-table" style="table-layout:fixed;"><thead><tr><th style="width:50%;">Producto</th><th style="width:25%;text-align:right;">Kilos</th><th style="width:25%;text-align:right;">Total</th></tr></thead><tbody>`;
    data.productos.forEach(p => {
      html += `<tr><td class="prod-name" style="padding:8px 12px;">${p.nombre}</td><td style="text-align:right;padding:8px 12px;font-size:12px;color:var(--text-2);">${formatKg(p.kg)}</td><td style="text-align:right;padding:8px 12px;font-weight:700;color:var(--violet);">${formatMoney(p.total)}</td></tr>`;
    });
    html += `</tbody></table></div>`;
  }

  cont.innerHTML = html;
}

/* ─── KEYBOARD NAVIGATION (genérico) ─────────────────────── */
// Funciona en cualquier input con data-nav="GRID" data-row="N" data-col="N"

function navFocus(grid, row, col) {
  const inputs = [...document.querySelectorAll(`[data-nav="${grid}"]`)];
  if (!inputs.length) return;
  const maxRow = Math.max(...inputs.map(i => +i.dataset.row));
  const maxCol = Math.max(...inputs.map(i => +i.dataset.col));
  row = Math.max(0, Math.min(maxRow, row));
  col = Math.max(0, Math.min(maxCol, col));
  const target = inputs.find(i => +i.dataset.row === row && +i.dataset.col === col);
  if (target) { target.focus(); target.select(); }
}

document.addEventListener('keydown', e => {
  const active = document.activeElement;
  if (!active || active.tagName !== 'INPUT') return;
  const grid = active.dataset.nav;
  if (!grid) return;
  const row = +active.dataset.row;
  const col = +active.dataset.col;
  const inputs = [...document.querySelectorAll(`[data-nav="${grid}"]`)];
  const maxRow = Math.max(...inputs.map(i => +i.dataset.row));
  const maxCol = Math.max(...inputs.map(i => +i.dataset.col));

  if (e.key === 'Enter') {
    e.preventDefault();
    if (row < maxRow) navFocus(grid, row + 1, col);
    else if (col < maxCol) navFocus(grid, 0, col + 1);
    return;
  }
  if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  switch (e.key) {
    case 'ArrowUp':    navFocus(grid, row - 1, col); break;
    case 'ArrowDown':  navFocus(grid, row + 1, col); break;
    case 'ArrowLeft':  if (col > 0) navFocus(grid, row, col - 1); break;
    case 'ArrowRight': if (col < maxCol) navFocus(grid, row, col + 1); break;
  }
});

/* ─── SIDEBAR ─────────────────────────────────────────────── */

function toggleSidebar(){const s=document.getElementById('client-sidebar'),b=document.getElementById('sidebar-open-btn');s.classList.toggle('open');b.classList.toggle('hidden',s.classList.contains('open'));}
function selectClient(nombre,loc){const ci=document.getElementById('cliente'),ls=document.getElementById('locacion');if(ci)ci.value=nombre;if(ls)ls.value=loc;document.querySelectorAll('.sidebar-clients li').forEach(li=>li.classList.toggle('active',li.textContent.trim()===nombre));document.getElementById('cliente').dispatchEvent(new Event('change'));const vs=document.getElementById('ventas');if(vs&&vs.classList.contains('section-hidden'))showSection('ventas');else showVentasTab('crear');}