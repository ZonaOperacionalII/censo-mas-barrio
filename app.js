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
        // Mostrar el usuario en el header si existe el elemento en el HTML
        const headerUser = document.getElementById('header-user');
        if(headerUser) headerUser.innerText = `Usuario: ${email}`;

        const { data } = await db.from('administradores').select('*').eq('email', email);
        if(data && data.length > 0) {
            document.getElementById('btn-admin-panel').style.display = 'block';
        }
        iniciarApp();
    }

    // --- LISTENERS DE SESIÓN Y NAVEGACIÓN ---
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
        location.reload();
    });

    document.getElementById('btn-abrir-buscar').addEventListener('click', () => cambiarVista('search'));
    document.getElementById('btn-cerrar-buscar').addEventListener('click', () => cambiarVista('app'));
    document.getElementById('btn-cerrar-admin').addEventListener('click', () => cambiarVista('app'));

    // --- MOTOR DE GEOCODIFICACIÓN (CALLES) ---
    async function obtenerCalle(lat, lon) {
        if (!lat || !lon) return "Ubicación GPS no guardada";
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
            const data = await res.json();
            return data.address ? `${data.address.road || 'Calle sin nombre'}, ${data.address.suburb || 'Maldonado'}` : 'Ubicación detectada';
        } catch { return "Dirección no disponible"; }
    }

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
            document.getElementById('btn-ubicar').innerText = "Satélites...";
            navigator.geolocation.getCurrentPosition(async (pos) => {
                map.setView([pos.coords.latitude, pos.coords.longitude], 18);
                await procesarUbicacion(pos.coords.latitude, pos.coords.longitude);
                document.getElementById('btn-ubicar').innerText = "Ubicar Posición GPS";
            }, () => { document.getElementById('btn-ubicar').innerText = "Error GPS"; }, { enableHighAccuracy: true });
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

    // --- CENSO PLAN +BARRIO ---
    document.getElementById('btn-censar').addEventListener('click', () => document.getElementById('modal-censo').style.display = 'flex');
    document.getElementById('btn-cancelar-censo').addEventListener('click', () => document.getElementById('modal-censo').style.display = 'none');

    document.getElementById('btn-guardar-censo').addEventListener('click', async () => {
        const btn = document.getElementById('btn-guardar-censo');
        const padronMan = document.getElementById('censo-padron-manual')?.value || '';
        const padronFinal = padronMan || padronUbicacionActual;
        
        const ci = document.getElementById('censo-ci')?.value || '';
        const nom = document.getElementById('censo-nombre')?.value || '';
        const ape = document.getElementById('censo-apellido')?.value || '';
        
        if(!ci || !nom || !ape) { alert("Complete CI, Nombre y Apellido del Titular."); return; }
        
        btn.innerText = "Guardando...";

        // Captura Plan +Barrio
        const luz = document.getElementById('c-luz')?.checked || false;
        const agua = document.getElementById('c-agua')?.checked || false;
        const net = document.getElementById('c-net')?.checked || false;
        const studies = document.getElementById('c-estudios')?.checked || false;
        
        // Algoritmo de vulnerabilidad
        const esVulnerable = (!luz || !agua || !net || !studies);
        const servicios = [luz?'Luz':'', agua?'Agua':'', net?'Net':''].filter(Boolean).join(', ');

        // Agrupar observaciones y ubicación manual
        let obs = `[LOC] Mz: ${document.getElementById('censo-manzana')?.value || '-'} | Viv: ${document.getElementById('censo-vivienda')?.value || '-'} | [VEH] ${document.getElementById('censo-vehiculos')?.value || ''} | [TEN] ${document.getElementById('censo-tenencia')?.value || ''}`;
        
        const { error } = await db.from('personas').insert([{
            documento_identidad: ci, 
            nombre: nom, 
            apellido: ape, 
            alias: document.getElementById('censo-alias')?.value || '',
            tiene_antecedentes: document.getElementById('censo-antecedentes')?.checked || false, 
            observaciones_seguridad: obs, 
            padron_asociado: padronFinal,
            servicios_basicos: servicios,
            composicion_familiar: document.getElementById('censo-familia')?.value || '',
            menores_estudiando: studies,
            vulnerabilidad: esVulnerable,
            lat: ultimaLat,
            lon: ultimaLon
        }]);

        if (error) alert("Error: " + error.message);
        else {
            alert("Censo Guardado. Nivel de Vulnerabilidad: " + (esVulnerable ? "ALTA ⚠️" : "BAJA ✅"));
            document.getElementById('modal-censo').style.display = 'none';
            
            // Limpieza del modal
            const camposLimpiar = ['censo-ci','censo-nombre','censo-apellido','censo-alias','censo-vehiculos','censo-padron-manual','censo-manzana','censo-vivienda', 'censo-familia'];
            camposLimpiar.forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
            ['c-luz', 'c-agua', 'c-net', 'c-estudios', 'censo-antecedentes'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).checked = false; });
            if(document.getElementById('censo-tenencia')) document.getElementById('censo-tenencia').value = "No especifica";
        }
        btn.innerText = "Guardar Datos";
    });

    // --- BÚSQUEDA TÁCTICA MEJORADA ---
    document.getElementById('btn-ejecutar-busqueda').addEventListener('click', async () => {
        const tipo = document.getElementById('search-tipo').value;
        const valor = document.getElementById('search-valor').value;
        const contenedor = document.getElementById('contenedor-resultados');
        
        if(!valor) return;
        contenedor.innerHTML = "<p>Consultando base...</p>";
        
        const { data, error } = await db.from('personas').select('*').ilike(tipo, `%${valor}%`);

        if (error) contenedor.innerHTML = `<p style="color:red;">Error de conexión.</p>`;
        else if (data.length === 0) contenedor.innerHTML = `<p>No se encontraron registros.</p>`;
        else {
            contenedor.innerHTML = '';
            for (const p of data) {
                // Traducción de coordenadas a calle (OSM Nominatim)
                const direccion = await obtenerCalle(p.lat, p.lon);
                
                // Alertas visuales
                const alertaVuln = p.vulnerabilidad ? `<span style="color:#dc3545; font-weight:bold;">⚠️ VULNERABLE</span>` : `<span style="color:#28a745;">Estable</span>`;
                const alertaAnt = p.tiene_antecedentes ? `<span style="color:#dc3545; font-weight:bold;">| ⚠️ ANTECEDENTES</span>` : ``;
                
                const ficha = document.createElement('div');
                ficha.className = `ficha-resultado ${p.vulnerabilidad || p.tiene_antecedentes ? 'alerta' : ''}`;
                ficha.innerHTML = `
                    <div class="ficha-ubicacion">📍 Padrón: ${p.padron_asociado} - ${direccion}</div>
                    <h4 class="ficha-nombre">${p.nombre} ${p.apellido} ${p.alias ? `("${p.alias}")` : ''}</h4>
                    <p class="ficha-datos">C.I: ${p.documento_identidad} | Estado: ${alertaVuln} ${alertaAnt}</p>
                    <p class="ficha-datos"><b>Servicios:</b> ${p.servicios_basicos || 'Sin registrar'}</p>
                    <div class="ficha-obs">${p.observaciones_seguridad || ''}</div>
                    <div class="ficha-obs" style="margin-top:5px;"><b>Grupo Familiar:</b><br>${p.composicion_familiar || 'No registrado'}</div>
                    <button class="btn-primario" style="margin-top:10px; padding:8px; font-size:0.9rem;">Ver Ubicación en Mapa</button>
                `;
                
                // Botón para saltar al mapa
                ficha.querySelector('button').addEventListener('click', () => {
                    if (p.lat && p.lon) {
                        cambiarVista('app');
                        map.setView([p.lat, p.lon], 18);
                        if(marker) map.removeLayer(marker);
                        marker = L.marker([p.lat, p.lon]).addTo(map).bindPopup(`<b>${p.nombre} ${p.apellido}</b><br>${direccion}`).openPopup();
                    } else {
                        alert("Este registro fue guardado sin coordenadas GPS.");
                    }
                });
                
                contenedor.appendChild(ficha);
            }
        }
    });

    // --- PANEL DE ADMINISTRADOR ---
    document.getElementById('btn-admin-panel').addEventListener('click', async () => {
        cambiarVista('admin');
        const { data } = await db.from('logs_auditoria').select('*').order('fecha_hora', { ascending: false }).limit(30);
        const tabla = document.getElementById('tabla-logs');
        tabla.innerHTML = '';
        if(data) data.forEach(l => {
            tabla.innerHTML += `<tr>
                <td style="padding:10px; border-bottom:1px solid #ddd;">${new Date(l.fecha_hora).toLocaleDateString('es-UY')}</td>
                <td style="border-bottom:1px solid #ddd; font-weight:bold;">${l.usuario_ci}</td>
                <td style="border-bottom:1px solid #ddd; font-size:0.8rem;">${l.accion} en ${l.tabla_afectada}</td>
            </tr>`;
        });
    });

    checkSession();
});
