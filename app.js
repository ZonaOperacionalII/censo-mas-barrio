// 1. CONFIGURACIÓN
const SUPABASE_URL = 'https://maalgmxakmikryrmhloz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYWxnbXhha21pa3J5cm1obG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzEzNTQsImV4cCI6MjA5NjE0NzM1NH0.Hdoh3Sct07fHVDb7YrEKe_zvryPXxLOvCMGLv-iseCs';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const views = {
    login: document.getElementById('login-view'),
    app: document.getElementById('app-view'),
    admin: document.getElementById('admin-view'),
    search: document.getElementById('search-view')
};

let map, marker;
let padronUbicacionActual = "Desconocido";

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

// 3. MOTOR DE UBICACIÓN Y MAPA (GPS + MODO MANUAL + ALTA PROVISORIA)
let ultimaLat = null;
let ultimaLon = null;

async function procesarUbicacion(lat, lon) {
    ultimaLat = lat;
    ultimaLon = lon;
    if(marker) map.removeLayer(marker);
    marker = L.marker([lat, lon]).addTo(map);
    
    document.getElementById('resultado-padron').innerText = "📍 Analizando sector...";
    document.getElementById('btn-censar').style.display = 'none';
    document.getElementById('btn-crear-padron').style.display = 'none';

    const { data } = await db.rpc('padron_actual', { lon: lon, lat: lat });
    
    if (data && data.length > 0) {
        padronUbicacionActual = data[0].numero_padron;
        document.getElementById('resultado-padron').innerText = `Padrón / Vivienda: ${padronUbicacionActual}`;
        document.getElementById('btn-censar').style.display = 'block';
    } else {
        padronUbicacionActual = "Vía Pública";
        document.getElementById('resultado-padron').innerText = "Vía Pública / Fuera de cartografía";
        document.getElementById('btn-crear-padron').style.display = 'block'; // Mostrar opción de emergencia
    }
}

// Lógica del botón Crear Padrón Provisorio
document.getElementById('btn-crear-padron').addEventListener('click', () => {
    const idProvisorio = 'PROV-' + Math.floor(Math.random() * 1000000);
    padronUbicacionActual = idProvisorio;
    
    // Cambiar marcador a rojo para alerta visual
    if(marker) map.removeLayer(marker);
    const redIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    marker = L.marker([ultimaLat, ultimaLon], {icon: redIcon}).addTo(map);
    
    document.getElementById('resultado-padron').innerText = `Alta Táctica: ${idProvisorio}`;
    document.getElementById('btn-crear-padron').style.display = 'none';
    document.getElementById('btn-censar').style.display = 'block';
});

function iniciarApp(esAdmin) {
    cambiarVista('app');
    if(esAdmin) document.getElementById('btn-admin-panel').style.display = 'block';

    if (!map) {
        map = L.map('mapa').setView([-34.898, -54.945], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        
        map.on('click', async (e) => {
            await procesarUbicacion(e.latlng.lat, e.latlng.lng);
        });
    }
    document.getElementById('resultado-padron').innerText = "Usa el GPS o toca el mapa";
}

document.getElementById('btn-ubicar').addEventListener('click', () => {
    const btn = document.getElementById('btn-ubicar');
    if ("geolocation" in navigator) {
        btn.innerText = "Satélites...";
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude, lon = pos.coords.longitude;
            map.setView([lat, lon], 18);
            await procesarUbicacion(lat, lon);
            btn.innerText = "Ubicar Posición GPS";
        }, () => { btn.innerText = "Error GPS"; }, { enableHighAccuracy: true });
    }
});

// 4. GUARDAR CENSO
document.getElementById('btn-guardar-censo').addEventListener('click', async () => {
    const btn = document.getElementById('btn-guardar-censo');
    // Nuevos campos
    const padronMan = document.getElementById('censo-padron-manual').value;
    const man = document.getElementById('censo-manzana').value;
    const viv = document.getElementById('censo-vivienda').value;
    
    // Datos existentes
    const ci = document.getElementById('censo-ci').value;
    const nom = document.getElementById('censo-nombre').value;
    const ape = document.getElementById('censo-apellido').value;
    const ant = document.getElementById('censo-antecedentes').checked;
    
    if(!ci || !nom || !ape) { alert("Complete CI, Nombre y Apellido."); return; }
    btn.innerText = "Guardando...";

    let obs = `[LOC] Padrón: ${padronMan || '-'} | Manzana: ${man || '-'} | Vivienda: ${viv || '-'} | [VEHÍCULOS] ${document.getElementById('censo-vehiculos').value || 'Ninguno'} | [TENENCIA] ${document.getElementById('censo-tenencia').value}`;
    
    if (padronUbicacionActual.startsWith('PROV-')) {
        obs += ` | [GPS TÁCTICO] Lat: ${ultimaLat}, Lon: ${ultimaLon}`;
    }

    const { error } = await db.from('personas').insert([{
        documento_identidad: ci, nombre: nom, apellido: ape, alias: document.getElementById('censo-alias').value,
        tiene_antecedentes: ant, observaciones_seguridad: obs, padron_asociado: (padronMan || padronUbicacionActual)
    }]);

    if (error) alert("Error: " + error.message);
    else {
        alert("Guardado exitosamente.");
        modalCenso.style.display = 'none';
        // Limpiar formulario
        ['censo-ci','censo-nombre','censo-apellido','censo-vehiculos','censo-alias','censo-padron-manual','censo-manzana','censo-vivienda'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('censo-antecedentes').checked = false;
    }
    btn.innerText = "Guardar Datos";
});

// 5. MÓDULO DE BÚSQUEDA MEJORADO
async function obtenerDireccion(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
        const data = await res.json();
        return data.display_name || "Dirección no encontrada";
    } catch { return "Error geocodificando"; }
}

document.getElementById('btn-ejecutar-busqueda').addEventListener('click', async () => {
    const tipo = document.getElementById('search-tipo').value;
    const valor = document.getElementById('search-valor').value;
    const contenedor = document.getElementById('contenedor-resultados');
    
    if(!valor) { contenedor.innerHTML = "<p style='color:red;'>Ingrese un valor.</p>"; return; }
    contenedor.innerHTML = "<p>Consultando base...</p>";
    
    const { data, error } = await db.from('personas').select('*').ilike(tipo, `%${valor}%`);

    if (error) contenedor.innerHTML = `<p style="color:red;">Error de conexión.</p>`;
    else if (data.length === 0) contenedor.innerHTML = `<p>No se encontraron registros.</p>`;
    else {
        contenedor.innerHTML = '';
        data.forEach(p => {
            const alertaHTML = p.tiene_antecedentes ? `<span style="color:#dc3545; font-weight:bold;">⚠️ ANTECEDENTES</span>` : `<span style="color:#28a745;">Limpio</span>`;
            
            contenedor.innerHTML += `
                <div class="ficha-resultado">
                    <div class="ficha-ubicacion">📍 ${p.padron_asociado}</div>
                    <h4 class="ficha-nombre">${p.nombre} ${p.apellido}</h4>
                    <p class="ficha-datos">C.I: ${p.documento_identidad} | Estado: ${alertaHTML}</p>
                    <div class="ficha-obs">${p.observaciones_seguridad}</div>
                    <button class="btn-primario" style="margin-top:10px; padding:5px; font-size:0.8rem;" onclick="alert('Funcionalidad de mapa vinculada a: ${p.padron_asociado}')">Ver en Mapa</button>
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
