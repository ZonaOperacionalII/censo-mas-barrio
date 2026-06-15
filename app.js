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

    let map, marker, capaOSM, capaPlano;
    let modoPlanoActivo = false;
    let padronUbicacionActual = "Desconocido";
    let ultimaLat = null;
    let ultimaLon = null;

    // Coordenadas fijas para la imagen (no importa si no coinciden perfecto con el mundo real ahora)
    const limitesPlano = [[-34.8960, -54.9270], [-34.9045, -54.9160]];

    // --- FUNCIONES DE NAVEGACIÓN ---
    function cambiarVista(vistaDestino) {
        Object.values(views).forEach(v => v.style.display = 'none');
        views[vistaDestino].style.display = 'flex';
        if(vistaDestino === 'app' && map) setTimeout(() => { map.invalidateSize(); }, 200);
    }

    document.getElementById('logo-principal').addEventListener('click', () => cambiarVista('app'));

    // --- SEGURIDAD ---
    async function checkSession() {
        const { data: { session } } = await db.auth.getSession();
        if (session) validarRol(session.user.email);
    }
    
    async function validarRol(email) {
        const headerUser = document.getElementById('header-user');
        if(headerUser) headerUser.innerText = `Usuario: ${email}`;

        const { data } = await db.from('administradores').select('*').eq('email', email);
        if(data && data.length > 0) {
            document.getElementById('btn-admin-panel').style.display = 'block';
        }
        iniciarApp();
    }

    // --- LISTENERS DE SESIÓN Y VISTAS ---
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

    document.getElementById('censo-arresto').addEventListener('change', (e) => {
        const campoHorario = document.getElementById('censo-arresto-horario');
        campoHorario.style.display = (e.target.value === 'Parcial') ? 'block' : 'none';
    });

    async function obtenerCalle(lat, lon) {
        if (!lat || !lon) return "Ubicación GPS no guardada";
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
            const data = await res.json();
            return data.address ? `${data.address.road || 'Calle sin nombre'}, ${data.address.suburb || 'Maldonado'}` : 'Ubicación detectada';
        } catch { return "Dirección no disponible"; }
    }

    // --- MOTOR DE MAPA Y CAPAS ---
    async function procesarUbicacion(lat, lon) {
        ultimaLat = lat; ultimaLon = lon;
        if(marker) map.removeLayer(marker);
        marker = L.marker([lat, lon]).addTo(map);
        
        document.getElementById('resultado-padron').innerText = "📍 Analizando sector...";
        document.getElementById('btn-censar').style.display = 'none';
        document.getElementById('btn-crear-padron').style.display = 'none';

        const { data } = await db.rpc('padron_actual', { lon: lon, lat: lat });
        
        if (data && data.length > 0 && !modoPlanoActivo) {
            padronUbicacionActual = data[0].numero_padron;
            document.getElementById('resultado-padron').innerText = `Padrón / Vivienda: ${padronUbicacionActual}`;
            document.getElementById('btn-censar').style.display = 'block';
        } else {
            padronUbicacionActual = modoPlanoActivo ? "Padrón Realojo (Manual)" : "Vía Pública";
            document.getElementById('resultado-padron').innerText = modoPlanoActivo ? "📍 Sector del Plano Seleccionado" : "Vía Pública / Fuera de cartografía";
            document.getElementById('btn-crear-padron').style.display = 'block';
        }
    }

    function iniciarApp() {
        cambiarVista('app');
        if (!map) {
            map = L.map('mapa').setView([-34.9000, -54.9220], 15);
            
            // Capa 1: Satélite / Calles normal
            capaOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
            capaOSM.addTo(map);
            
            // Capa 2: La imagen en PNG (con opacidad 100% para verse perfecta sola)
            capaPlano = L.imageOverlay('plano_kennedy.png', limitesPlano, {
                opacity: 1, 
                interactive: false 
            });

            map.on('click', (e) => procesarUbicacion(e.latlng.lat, e.latlng.lng));
        }
    }

    // LÓGICA DEL BOTÓN ALTERNAR MAPA/PLANO
    document.getElementById('btn-modo-plano').addEventListener('click', () => {
        modoPlanoActivo = !modoPlanoActivo;
        const btn = document.getElementById('btn-modo-plano');
        
        if (modoPlanoActivo) {
            map.removeLayer(capaOSM); // Apagamos el mundo real
            capaPlano.addTo(map);     // Encendemos el dibujo
            map.fitBounds(limitesPlano); // Zoom automático al barrio
            btn.innerText = "🌍 Volver a Mapa GPS";
            btn.style.background = "#6c757d";
            document.getElementById('resultado-padron').innerText = "🗺️ Modo Plano Activo. Toque un lote.";
        } else {
            map.removeLayer(capaPlano); // Apagamos el dibujo
            capaOSM.addTo(map);         // Encendemos el mundo real
            btn.innerText = "🗺️ Ver Plano Realojo";
            btn.style.background = "#17a2b8";
        }
    });

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
        padronUbicacionActual = modoPlanoActivo ? 'REALOJO-' + Math.floor(Math.random() * 10000) : 'PROV-' + Math.floor(Math.random() * 1000000);
        document.getElementById('resultado-padron').innerText = `Padrón Asignado: ${padronUbicacionActual}`;
        document.getElementById('btn-crear-padron').style.display = 'none';
        document.getElementById('btn-censar').style.display = 'block';
    });

    // --- BUSCADOR / AUTOCOMPLETADO DE CÉDULAS EN TIEMPO REAL ---
    document.getElementById('censo-ci').addEventListener('input', async (e) => {
        const ciDigitada = e.target.value.trim();
        const datalist = document.getElementById('cedulas-sugeridas');
        datalist.innerHTML = '';

        if (ciDigitada.length >= 3) {
            const { data } = await db.from('personas').select('documento_identidad, nombre, apellido, alias, telefono, observaciones_seguridad, padron_asociado, servicios_basicos, composicion_familiar, menores_estudiando, tiene_antecedentes, arresto_domiciliario, arresto_horario, vehiculos').ilike('documento_identidad', `${ciDigitada}%`).limit(5);
            
            if (data) {
                data.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.documento_identidad;
                    option.innerText = `${p.nombre} ${p.apellido} ${p.alias ? `(Alias: ${p.alias})` : ''}`;
                    datalist.appendChild(option);
                });

                const coincidenciaExacta = data.find(p => p.documento_identidad === ciDigitada);
                if (coincidenciaExacta) {
                    document.getElementById('censo-nombre').value = coincidenciaExacta.nombre || '';
                    document.getElementById('censo-apellido').value = coincidenciaExacta.apellido || '';
                    document.getElementById('censo-alias').value = coincidenciaExacta.alias || '';
                    document.getElementById('censo-telefono').value = coincidenciaExacta.telefono || '';
                    document.getElementById('censo-padron-manual').value = coincidenciaExacta.padron_asociado || '';
                    document.getElementById('censo-familia').value = coincidenciaExacta.composicion_familiar || '';
                    document.getElementById('censo-vehiculos').value = coincidenciaExacta.vehiculos || '';
                    
                    document.getElementById('censo-antecedentes').checked = coincidenciaExacta.tiene_antecedentes || false;
                    document.getElementById('c-estudios').checked = coincidenciaExacta.menores_estudiando || false;
                    
                    if(coincidenciaExacta.servicios_basicos) {
                        document.getElementById('c-luz').checked = coincidenciaExacta.servicios_basicos.includes('Luz');
                        document.getElementById('c-agua').checked = coincidenciaExacta.servicios_basicos.includes('Agua');
                        document.getElementById('c-net').checked = coincidenciaExacta.servicios_basicos.includes('Net');
                    }
                    
                    if(coincidenciaExacta.observaciones_seguridad) {
                        document.getElementById('c-mides').checked = coincidenciaExacta.observaciones_seguridad.includes('[BENEFICIARIO MIDES/IDM]');
                    }

                    document.getElementById('censo-arresto').value = coincidenciaExacta.arresto_domiciliario || 'No';
                    if (coincidenciaExacta.arresto_domiciliario === 'Parcial') {
                        document.getElementById('censo-arresto-horario').style.display = 'block';
                        document.getElementById('censo-arresto-horario').value = coincidenciaExacta.arresto_horario || '';
                    } else {
                        document.getElementById('censo-arresto-horario').style.display = 'none';
                    }
                }
            }
        }
    });

    // --- RELEVAMIENTO PLAN +BARRIO Y OPERATIVO ---
    document.getElementById('btn-censar').addEventListener('click', () => document.getElementById('modal-censo').style.display = 'flex');
    document.getElementById('btn-cancelar-censo').addEventListener('click', () => document.getElementById('modal-censo').style.display = 'none');

    document.getElementById('btn-guardar-censo').addEventListener('click', async () => {
        const btn = document.getElementById('btn-guardar-censo');
        const ci = document.getElementById('censo-ci').value.trim();
        const nom = document.getElementById('censo-nombre').value.trim();
        const ape = document.getElementById('censo-apellido').value.trim();
        
        if(!ci || !nom || !ape) { alert("Ingrese Cédula, Nombre y Apellido."); return; }
        btn.innerText = "Guardando...";

        const luz = document.getElementById('c-luz').checked;
        const agua = document.getElementById('c-agua').checked;
        const net = document.getElementById('c-net').checked;
        const mides = document.getElementById('c-mides').checked;
        const studies = document.getElementById('c-estudios').checked;
        const arrestoTipo = document.getElementById('censo-arresto').value;
        const arrestoHora = document.getElementById('censo-arresto-horario').value;

        const esVulnerable = (!luz || !agua || !net || !studies);
        const servicios = [luz?'Luz':'', agua?'Agua':'', net?'Net':''].filter(Boolean).join(', ');

        let obs = `[LOC] Mz: ${document.getElementById('censo-manzana').value || '-'} | Viv: ${document.getElementById('censo-vivienda').value || '-'} `;
        if (mides) obs += `| [BENEFICIARIO MIDES/IDM] `;
        if (arrestoTipo !== 'No') obs += `| [ARRESTO DOMICILIARIO: ${arrestoTipo}] ${arrestoTipo === 'Parcial' ? `Horario: ${arrestoHora}` : ''} `;

        const payload = {
            documento_identidad: ci,
            nombre: nom,
            apellido: ape,
            alias: document.getElementById('censo-alias').value,
            telefono: document.getElementById('censo-telefono').value,
            tiene_antecedentes: document.getElementById('censo-antecedentes').checked,
            observaciones_seguridad: obs,
            padron_asociado: document.getElementById('censo-padron-manual').value || padronUbicacionActual,
            servicios_basicos: servicios,
            composicion_familiar: document.getElementById('censo-familia').value,
            menores_estudiando: studies,
            vulnerabilidad: esVulnerable,
            arresto_domiciliario: arrestoTipo,
            arresto_horario: arrestoTipo === 'Parcial' ? arrestoHora : null,
            vehiculos: document.getElementById('censo-vehiculos').value
        };

        if(ultimaLat && ultimaLon) {
            payload.lat = ultimaLat;
            payload.lon = ultimaLon;
        }

        const { error } = await db.from('personas').upsert([payload], { onConflict: 'documento_identidad' });

        if (error) alert("Error: " + error.message);
        else {
            alert("Registro procesado correctamente. Vulnerabilidad: " + (esVulnerable ? "ALTA ⚠️" : "BAJA ✅"));
            document.getElementById('modal-censo').style.display = 'none';
            
            const camposLimpiar = ['censo-ci','censo-nombre','censo-apellido','censo-alias','censo-telefono','censo-padron-manual','censo-manzana','censo-vivienda', 'censo-familia', 'censo-vehiculos', 'censo-arresto-horario'];
            camposLimpiar.forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
            ['c-luz', 'c-agua', 'c-net', 'c-mides', 'c-estudios', 'censo-antecedentes'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).checked = false; });
            document.getElementById('censo-arresto').value = "No";
            document.getElementById('censo-arresto-horario').style.display = 'none';
        }
        btn.innerText = "Guardar Datos";
    });

    // --- CONSULTAS Y CONSULTORÍA TÁCTICA AVANZADA ---
    document.getElementById('btn-ejecutar-busqueda').addEventListener('click', async () => {
        const tipo = document.getElementById('search-tipo').value;
        const valor = document.getElementById('search-valor').value.trim();
        const contenedor = document.getElementById('contenedor-resultados');
        
        if(!valor) return;
        contenedor.innerHTML = "<p>Consultando base de inteligencia...</p>";
        
        let query = db.from('personas').select('*');

        if (tipo === 'texto_libre') {
            query = query.or(`nombre.ilike.%${valor}%,apellido.ilike.%${valor}%,alias.ilike.%${valor}%,observaciones_seguridad.ilike.%${valor}%,composicion_familiar.ilike.%${valor}%`);
        } else if (tipo === 'vehiculos') {
            query = query.ilike('vehiculos', `%${valor}%`);
        } else {
            query = query.ilike(tipo, `%${valor}%`);
        }
        
        const { data, error } = await query;

        if (error) contenedor.innerHTML = `<p style="color:red;">Error de comunicación con la base.</p>`;
        else if (!data || data.length === 0) contenedor.innerHTML = `<p>No se localizaron registros coincidentes.</p>`;
        else {
            contenedor.innerHTML = '';
            for (const p of data) {
                const direccion = await obtenerCalle(p.lat, p.lon);
                
                const alertaVuln = p.vulnerabilidad ? `<span style="color:#dc3545; font-weight:bold;">⚠️ REGISTRO VULNERABLE</span>` : `<span style="color:#28a745;">Entorno Estable</span>`;
                const alertaAnt = p.tiene_antecedentes ? `<span style="color:#dc3545; font-weight:bold;">| ⚠️ POSEE ANTECEDENTES</span>` : ``;
                const alertaArresto = (p.arresto_domiciliario && p.arresto_domiciliario !== 'No') ? `<span style="background:#dc3545; color:white; padding:2px 6px; border-radius:3px; font-weight:bold; font-size:0.75rem; display:inline-block; margin-top:5px;">🚨 ARRESTO DOMICILIARIO ${p.arresto_domiciliario.toUpperCase()} ${p.arresto_horario ? `(${p.arresto_horario})` : ''}</span>` : ``;

                const ficha = document.createElement('div');
                ficha.className = `ficha-resultado ${p.vulnerabilidad || p.tiene_antecedentes || (p.arresto_domiciliario !== 'No') ? 'alerta' : ''}`;
                ficha.innerHTML = `
                    <div class="ficha-ubicacion">📍 Padrón: ${p.padron_asociado} - ${direccion}</div>
                    <h4 class="ficha-nombre">${p.nombre} ${p.apellido} ${p.alias ? `("${p.alias}")` : ''}</h4>
                    <p class="ficha-datos"><b>C.I:</b> ${p.documento_identidad} | <b>Tel:</b> ${p.telefono || 'Sin registrar'}</p>
                    <p class="ficha-datos"><b>Estado:</b> ${alertaVuln} ${alertaAnt}</p>
                    ${alertaArresto}
                    <p class="ficha-datos" style="margin-top:8px;"><b>Servicios:</b> ${p.servicios_basicos || 'Ninguno'}</p>
                    <p class="ficha-datos"><b>Vehículos:</b> ${p.vehiculos || 'Ninguno registrado'}</p>
                    <div class="ficha-obs"><b>Detalles de ubicación:</b><br>${p.observaciones_seguridad || ''}</div>
                    <div class="ficha-obs"><b>Composición de Familia:</b><br>${p.composicion_familiar || 'Sin datos de núcleo'}</div>
                    <button class="btn-primario" style="margin-top:10px; padding:8px; font-size:0.9rem;">Ver Ubicación en Mapa</button>
                `;
                
                ficha.querySelector('button').addEventListener('click', () => {
                    if (p.lat && p.lon) {
                        cambiarVista('app');
                        if (modoPlanoActivo) document.getElementById('btn-modo-plano').click(); // Si estaba en el plano, lo saca para ver la calle real
                        map.setView([p.lat, p.lon], 18);
                        if(marker) map.removeLayer(marker);
                        marker = L.marker([p.lat, p.lon]).addTo(map).bindPopup(`<b>${p.nombre} ${p.apellido}</b><br>${direccion}`).openPopup();
                    } else {
                        alert("Este censo histórico no cuenta con coordenadas GPS.");
                    }
                });
                contenedor.appendChild(ficha);
            }
        }
    });

    // --- PANEL DE AUDITORÍA (ADMIN) ---
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
