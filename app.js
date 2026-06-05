// 1. CONFIGURACIÓN
const SUPABASE_URL = 'https://maalgmxakmikryrmhloz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbG... (PEGA_TU_CLAVE_ANON_AQUÍ)';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const views = {
    login: document.getElementById('login-view'),
    app: document.getElementById('app-view'),
    admin: document.getElementById('admin-view'),
    search: document.getElementById('search-view')
};

let map, marker;
let padronUbicacionActual = "Desconocido"; // Guardará el padrón donde está parado el policía

// 2. SEGURIDAD Y ROLES
async function checkSession() {
    const { data: { session } } = await db.auth.getSession();
    if (session) validarRol(session.user.email);
}
checkSession();

async function validarRol(email) {
    const { data } = await db.from('administradores').select('*').eq('email', email);
    iniciarApp(data && data.length > 0);
}

document.getElementById('btn-login').addEventListener('click', async () => {
    const e = document.getElementById('doc').value;
    const p = document.getElementById('pass').value;
    document.getElementById('btn-login').innerText = "Verificando...";
    const { error } = await db.auth.signInWithPassword({ email: e, password: p });
    
    if (error) {
        document.getElementById('login-error').style.display = 'block';
        document.getElementById('login-error').innerText = "Credenciales inválidas.";
        document.getElementById('btn-login').innerText = "Ingresar";
    } else {
        document.getElementById('login-error').style.display = 'none';
        validarRol(e);
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await db.auth.signOut();
    cambiarVista('login');
    document.getElementById('pass').value = '';
    document.getElementById('btn-login').innerText = "Ingresar";
});

function cambiarVista(vistaDestino) {
    Object.values(views).forEach(v => v.style.display = 'none');
    views[vistaDestino].style.display = 'flex';
    if(vistaDestino === 'app' && map) setTimeout(() => { map.invalidateSize(); }, 200);
}

function iniciarApp(esAdmin) {
    cambiarVista('app');
    if(esAdmin) document.getElementById('btn-admin-panel').style.display = 'block';

    if (!map) {
        map = L.map('mapa').setView([-34.898, -54.945], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    }
}

// 3. RASTREO TÁCTICO
document.getElementById('btn-ubicar').addEventListener('click', () => {
    const btn = document.getElementById('btn-ubicar');
    if ("geolocation" in navigator) {
        btn.innerText = "Satélites...";
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude, lon = pos.coords.longitude;
            if(marker) map.removeLayer(marker);
            marker = L.marker([lat, lon]).addTo(map);
            map.setView([lat, lon], 18);

            const { data } = await db.rpc('padron_actual', { lon: lon, lat: lat });
            if (data && data.length > 0) {
                padronUbicacionActual = data[0].numero_padron;
                document.getElementById('resultado-padron').innerText = `Padrón: ${padronUbicacionActual}`;
                document.getElementById('btn-censar').style.display = 'block';
            } else {
                padronUbicacionActual = "Vía Pública";
                document.getElementById('resultado-padron').innerText = "Vía Pública";
                document.getElementById('btn-censar').style.display = 'none';
            }
            btn.innerText = "Actualizar GPS";
        }, () => { btn.innerText = "Error GPS"; }, { enableHighAccuracy: true });
    }
});

// 4. GUARDAR CENSO
const modalCenso = document.getElementById('modal-censo');
document.getElementById('btn-censar').addEventListener('click', () => modalCenso.style.display = 'flex');
document.getElementById('btn-cancelar-censo').addEventListener('click', () => modalCenso.style.display = 'none');

document.getElementById('btn-guardar-censo').addEventListener('click', async () => {
    const btn = document.getElementById('btn-guardar-censo');
    const ci = document.getElementById('censo-ci').value;
    const nom = document.getElementById('censo-nombre').value;
    const ape = document.getElementById('censo-apellido').value;
    const ant = document.getElementById('censo-antecedentes').checked;
    
    if(!ci || !nom || !ape) { alert("Complete CI, Nombre y Apellido."); return; }
    btn.innerText = "Guardando...";

    const obs = `[VEHÍCULOS] ${document.getElementById('censo-vehiculos').value || 'Ninguno'} | [TENENCIA] ${document.getElementById('censo-tenencia').value}`;

    const { error } = await db.from('personas').insert([{
        documento_identidad: ci, nombre: nom, apellido: ape, alias: document.getElementById('censo-alias').value,
        tiene_antecedentes: ant, observaciones_seguridad: obs, padron_asociado: padronUbicacionActual
    }]);

    if (error) alert("Error: " + error.message);
    else {
        alert("Guardado.");
        modalCenso.style.display = 'none';
        ['censo-ci','censo-nombre','censo-apellido','censo-vehiculos','censo-alias'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('censo-antecedentes').checked = false;
    }
    btn.innerText = "Guardar Datos";
});

// 5. MÓDULO DE BÚSQUEDA (INTELIGENCIA)
document.getElementById('btn-abrir-buscar').addEventListener('click', () => cambiarVista('search'));
document.getElementById('btn-cerrar-buscar').addEventListener('click', () => cambiarVista('app'));

document.getElementById('btn-ejecutar-busqueda').addEventListener('click', async () => {
    const tipo = document.getElementById('search-tipo').value;
    const valor = document.getElementById('search-valor').value;
    const contenedor = document.getElementById('contenedor-resultados');
    
    if(!valor) { contenedor.innerHTML = "<p style='color:red;'>Ingrese un valor para buscar.</p>"; return; }
    
    contenedor.innerHTML = "<p>Consultando base de datos...</p>";
    
    // Armar la consulta dinámicamente según lo que eligió el policía
    let query = db.from('personas').select('*');
    if(tipo === 'documento_identidad' || tipo === 'padron_asociado') {
        query = query.eq(tipo, valor);
    } else {
        query = query.ilike(tipo, `%${valor}%`); // Búsqueda parcial para nombres/apellidos
    }

    const { data, error } = await query;

    if (error) {
        contenedor.innerHTML = `<p style="color:red;">Error de conexión.</p>`;
    } else if (data.length === 0) {
        contenedor.innerHTML = `<p>No se encontraron registros para esta búsqueda.</p>`;
    } else {
        contenedor.innerHTML = '';
        data.forEach(p => {
            const alertaHTML = p.tiene_antecedentes ? `<span style="color:#dc3545; font-weight:bold;">⚠️ POSEE ANTECEDENTES</span>` : `<span style="color:#28a745;">Sin anotaciones</span>`;
            const claseFicha = p.tiene_antecedentes ? 'ficha-resultado alerta' : 'ficha-resultado';
            
            contenedor.innerHTML += `
                <div class="${claseFicha}">
                    <div class="ficha-ubicacion">📍 Padrón / Vivienda: ${p.padron_asociado || 'No registrado'}</div>
                    <h4 class="ficha-nombre">${p.nombre} ${p.apellido} ${p.alias ? `alias "${p.alias}"` : ''}</h4>
                    <p class="ficha-datos">C.I: ${p.documento_identidad} | Estado: ${alertaHTML}</p>
                    <div class="ficha-obs">${p.observaciones_seguridad || 'Sin observaciones sociales o de inteligencia registradas.'}</div>
                </div>
            `;
        });
    }
});

// 6. PANEL DE ADMIN
document.getElementById('btn-admin-panel').addEventListener('click', async () => {
    cambiarVista('admin');
    const { data } = await db.from('logs_auditoria').select('*').order('fecha_hora', { ascending: false }).limit(30);
    const tabla = document.getElementById('tabla-logs');
    tabla.innerHTML = ''; 
    if(data) data.forEach(l => {
        tabla.innerHTML += `<tr><td style="padding:10px; border-bottom:1px solid #ddd;">${new Date(l.fecha_hora).toLocaleDateString('es-UY')}</td>
        <td style="border-bottom:1px solid #ddd; font-weight:bold;">${l.usuario_ci}</td>
        <td style="border-bottom:1px solid #ddd; font-size:0.8rem;">${l.accion} en ${l.tabla_afectada}</td></tr>`;
    });
});
document.getElementById('btn-cerrar-admin').addEventListener('click', () => cambiarVista('app'));
