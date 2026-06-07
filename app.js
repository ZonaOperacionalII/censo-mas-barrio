// 1. CONFIGURACIÓN
const SUPABASE_URL = 'https://maalgmxakmikryrmhloz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYWxnbXhha21pa3J5cm1obG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzEzNTQsImV4cCI6MjA5NjE0NzM1NH0.Hdoh3Sct07fHVDb7YrEKe_zvryPXxLOvCMGLv-iseCs';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    const views = {
        login: document.getElementById('login-view'),
        app: document.getElementById('app-view'),
        admin: document.getElementById('admin-view'),
        search: document.getElementById('search-view')
    };

    let map, marker;
    let padronUbicacionActual = "Desconocido";
    let ultimaLat = null;
    let ultimaLon = null;

    // --- FUNCIONES DE NAVEGACIÓN ---
    function cambiarVista(vistaDestino) {
        Object.values(views).forEach(v => v.style.display = 'none');
        views[vistaDestino].style.display = 'flex';
        if(vistaDestino === 'app' && map) setTimeout(() => { map.invalidateSize(); }, 200);
    }

    // --- SEGURIDAD ---
    async function checkSession() {
        const { data: { session } } = await db.auth.getSession();
        if (session) validarRol(session.user.email);
    }
    
    async function validarRol(email) {
        const { data } = await db.from('administradores').select('*').eq('email', email);
        if(data && data.length > 0) {
            document.getElementById('btn-admin-panel').style.display = 'block';
        }
        iniciarApp();
    }

    // --- LISTENERS ---
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
            validarRol(e);
        }
    });

    document.getElementById('btn-logout').addEventListener('click', async () => {
        await db.auth.signOut();
        location.reload();
    });

    document.getElementById('btn-abrir-buscar').addEventListener('click', () => cambiarVista('search'));
    document.getElementById('btn-cerrar-buscar').addEventListener('click', () => cambiarVista('app'));
    document.getElementById('btn-cerrar-admin').addEventListener('click', () => cambiarVista('app'));

    // --- MOTOR DE MAPA ---
    async function procesarUbicacion(lat, lon) {
        ultimaLat = lat; ultimaLon = lon;
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
            document.getElementById('btn-crear-padron').style.display = 'block';
        }
    }

    document.getElementById('btn-ubicar').addEventListener('click', () => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                map.setView([pos.coords.latitude, pos.coords.longitude], 18);
                await procesarUbicacion(pos.coords.latitude, pos.coords.longitude);
            });
        }
    });

    document.getElementById('btn-crear-padron').addEventListener('click', () => {
        padronUbicacionActual = 'PROV-' + Math.floor(Math.random() * 1000000);
        document.getElementById('resultado-padron').innerText = `Alta Táctica: ${padronUbicacionActual}`;
        document.getElementById('btn-crear-padron').style.display = 'none';
        document.getElementById('btn-censar').style.display = 'block';
    });

    function iniciarApp() {
        cambiarVista('app');
        if (!map) {
            map = L.map('mapa').setView([-34.898, -54.945], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
            map.on('click', (e) => procesarUbicacion(e.latlng.lat, e.latlng.lng));
        }
    }

    // --- CENSO Y BÚSQUEDA ---
    document.getElementById('btn-censar').addEventListener('click', () => document.getElementById('modal-censo').style.display = 'flex');
    document.getElementById('btn-cancelar-censo').addEventListener('click', () => document.getElementById('modal-censo').style.display = 'none');

    document.getElementById('btn-guardar-censo').addEventListener('click', async () => {
        const btn = document.getElementById('btn-guardar-censo');
        const padron = document.getElementById('censo-padron-manual').value || padronUbicacionActual;
        const ci = document.getElementById('censo-ci').value;
        const nom = document.getElementById('censo-nombre').value;
        const ape = document.getElementById('censo-apellido').value;
        
        if(!ci || !nom || !ape) { alert("Complete CI, Nombre y Apellido."); return; }
        btn.innerText = "Guardando...";

        let obs = `[LOC] Padrón: ${padron} | Manzana: ${document.getElementById('censo-manzana').value || '-'} | Viv: ${document.getElementById('censo-vivienda').value || '-'} | [VEH] ${document.getElementById('censo-vehiculos').value} | [TEN] ${document.getElementById('censo-tenencia').value}`;
        if (padronUbicacionActual.startsWith('PROV-')) obs += ` | [GPS] ${ultimaLat}, ${ultimaLon}`;

        const { error } = await db.from('personas').insert([{
            documento_identidad: ci, nombre: nom, apellido: ape, 
            alias: document.getElementById('censo-alias').value,
            tiene_antecedentes: document.getElementById('censo-antecedentes').checked, 
            observaciones_seguridad: obs, padron_asociado: padron
        }]);

        if (error) alert("Error: " + error.message);
        else {
            alert("Guardado exitosamente.");
            document.getElementById('modal-censo').style.display = 'none';
        }
        btn.innerText = "Guardar Datos";
    });

    document.getElementById('btn-ejecutar-busqueda').addEventListener('click', async () => {
        const tipo = document.getElementById('search-tipo').value;
        const valor = document.getElementById('search-valor').value;
        const contenedor = document.getElementById('contenedor-resultados');
        if(!valor) return;
        contenedor.innerHTML = "<p>Consultando...</p>";
        const { data } = await db.from('personas').select('*').ilike(tipo, `%${valor}%`);
        contenedor.innerHTML = '';
        data.forEach(p => {
            contenedor.innerHTML += `
                <div class="ficha-resultado">
                    <div class="ficha-ubicacion">📍 ${p.padron_asociado}</div>
                    <h4>${p.nombre} ${p.apellido}</h4>
                    <p>C.I: ${p.documento_identidad} | ${p.tiene_antecedentes ? '⚠️ Antecedentes' : 'Limpio'}</p>
                    <div class="ficha-obs">${p.observaciones_seguridad}</div>
                </div>`;
        });
    });

    document.getElementById('btn-admin-panel').addEventListener('click', async () => {
        cambiarVista('admin');
        const { data } = await db.from('logs_auditoria').select('*').order('fecha_hora', { ascending: false }).limit(30);
        const tabla = document.getElementById('tabla-logs');
        tabla.innerHTML = '';
        if(data) data.forEach(l => tabla.innerHTML += `<tr><td>${new Date(l.fecha_hora).toLocaleDateString()}</td><td>${l.usuario_ci}</td><td>${l.accion}</td></tr>`);
    });

    checkSession();
});
