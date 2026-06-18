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
    let usuarioLogueado = "Desconocido";

    const limitesPlano = [[-34.8850, -54.9250], [-34.9080, -54.9120]];

    function cambiarVista(vistaDestino) {
        Object.values(views).forEach(v => v.style.display = 'none');
        views[vistaDestino].style.display = 'flex';
        if(vistaDestino === 'app' && map) setTimeout(() => { map.invalidateSize(); }, 200);
    }

    document.getElementById('logo-principal').addEventListener('click', () => cambiarVista('app'));

    async function registrarLog(accion, tabla) {
        if (usuarioLogueado === "Desconocido") return;
        await db.from('logs_auditoria').insert([{
            usuario_ci: usuarioLogueado,
            accion: accion,
            tabla_afectada: tabla
        }]);
    }

    async function checkSession() {
        const { data: { session } } = await db.auth.getSession();
        if (session) {
            validarRol(session.user.email);
            registrarLog('INICIO DE SESIÓN / APERTURA DE APP', 'Sistema');
        }
    }
    
    async function validarRol(email) {
        usuarioLogueado = email;
        const headerUser = document.getElementById('header-user');
        if(headerUser) headerUser.innerText = `Usuario: ${email}`;

        const { data } = await db.from('administradores').select('*').eq('email', email);
        if(data && data.length > 0) {
            document.getElementById('btn-admin-panel').style.display = 'block';
        }
        iniciarApp();
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
            registrarLog('INICIO DE SESIÓN MANUAL', 'Sistema');
        }
    });

    document.getElementById('btn-logout').addEventListener('click', async () => {
        registrarLog('CIERRE DE SESIÓN', 'Sistema');
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
            map = L.map('mapa').setView([-34.8960, -54.9180], 15);
            capaOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
            capaOSM.addTo(map);
            capaPlano = L.imageOverlay('plano_kennedy.png', limitesPlano, {
                opacity: 1, 
                interactive: false 
            });
            map.on('click', (e) => procesarUbicacion(e.latlng.lat, e.latlng.lng));
        }
    }

    document.getElementById('btn-modo-plano').addEventListener('click', () => {
        modoPlanoActivo = !modoPlanoActivo;
        const btn = document.getElementById('btn-modo-plano');
        
        if (modoPlanoActivo) {
            map.removeLayer(capaOSM);
            capaPlano.addTo(map);
            map.fitBounds(limitesPlano);
            btn.innerText = "🌍 Volver a Mapa GPS";
            btn.style.background = "#6c757d";
            document.getElementById('resultado-padron').innerText = "🗺️ Modo Plano Activo. Toque un lote.";
        } else {
            map.removeLayer(capaPlano);
            capaOSM.addTo(map);
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

    document.getElementById('censo-ci').addEventListener('input', async (e) => {
        const ciDigitada = e.target.value.trim();
        const datalist = document.getElementById('cedulas-sugeridas');
        datalist.innerHTML = '';

        if (ciDigitada.length >= 3) {
            const { data } = await db.from('personas').select('*').ilike('documento_identidad', `${ciDigitada}%`).limit(5);
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
            registrarLog(`GUARDADO/ACTUALIZACIÓN - CI: ${ci}`, 'personas');
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

    document.getElementById('btn-ejecutar-busqueda').addEventListener('click', async () => {
        const tipo = document.getElementById('search-tipo').value;
        const valor = document.getElementById('search-valor').value.trim();
        const contenedor = document.getElementById('contenedor-resultados');
        
        if(!valor) return;
        contenedor.innerHTML = "<p>Consultando base de inteligencia...</p>";
        registrarLog(`BÚSQUEDA TÁCTICA: ${tipo} = ${valor}`, 'personas');
        
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
                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <button class="btn-mapa" style="flex:1; background: var(--azul-ministerio); color: white; padding: 10px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">📍 Ver en Mapa</button>
                        <button class="btn-editar" style="flex:1; background: #ffc107; color: black; padding: 10px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">✏️ Modificar</button>
                        <button class="btn-pdf" style="flex:1; background: #dc3545; color: white; padding: 10px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">📄 PDF</button>
                    </div>
                `;
                
                // Botón: Ver en mapa
                ficha.querySelector('.btn-mapa').addEventListener('click', () => {
                    if (p.lat && p.lon) {
                        cambiarVista('app');
                        const esZonaRealojo = p.padron_asociado && p.padron_asociado.toUpperCase().includes('REALOJO');
                        if (esZonaRealojo && !modoPlanoActivo) document.getElementById('btn-modo-plano').click();
                        else if (!esZonaRealojo && modoPlanoActivo) document.getElementById('btn-modo-plano').click();
                        map.setView([p.lat, p.lon], 18);
                        if(marker) map.removeLayer(marker);
                        marker = L.marker([p.lat, p.lon]).addTo(map).bindPopup(`<b>${p.nombre} ${p.apellido}</b><br>${direccion}`).openPopup();
                    } else {
                        alert("Este censo histórico no cuenta con coordenadas GPS.");
                    }
                });

                // Botón: Modificar
                ficha.querySelector('.btn-editar').addEventListener('click', () => {
                    cambiarVista('app');
                    document.getElementById('censo-ci').value = p.documento_identidad || '';
                    document.getElementById('censo-nombre').value = p.nombre || '';
                    document.getElementById('censo-apellido').value = p.apellido || '';
                    document.getElementById('censo-alias').value = p.alias || '';
                    document.getElementById('censo-telefono').value = p.telefono || '';
                    document.getElementById('censo-padron-manual').value = p.padron_asociado || '';
                    document.getElementById('censo-familia').value = p.composicion_familiar || '';
                    document.getElementById('censo-vehiculos').value = p.vehiculos || '';
                    document.getElementById('censo-antecedentes').checked = p.tiene_antecedentes || false;
                    document.getElementById('c-estudios').checked = p.menores_estudiando || false;
                    if(p.servicios_basicos) {
                        document.getElementById('c-luz').checked = p.servicios_basicos.includes('Luz');
                        document.getElementById('c-agua').checked = p.servicios_basicos.includes('Agua');
                        document.getElementById('c-net').checked = p.servicios_basicos.includes('Net');
                    }
                    if(p.observaciones_seguridad) {
                        document.getElementById('c-mides').checked = p.observaciones_seguridad.includes('[BENEFICIARIO MIDES/IDM]');
                    }
                    document.getElementById('censo-arresto').value = p.arresto_domiciliario || 'No';
                    if (p.arresto_domiciliario === 'Parcial') {
                        document.getElementById('censo-arresto-horario').style.display = 'block';
                        document.getElementById('censo-arresto-horario').value = p.arresto_horario || '';
                    } else {
                        document.getElementById('censo-arresto-horario').style.display = 'none';
                    }
                    ultimaLat = p.lat;
                    ultimaLon = p.lon;
                    padronUbicacionActual = p.padron_asociado;
                    document.getElementById('modal-censo').style.display = 'flex';
                });

                // Botón: Generar PDF Oficial
                ficha.querySelector('.btn-pdf').addEventListener('click', () => {
                    const btn = ficha.querySelector('.btn-pdf');
                    btn.innerText = "⏳ Generando...";
                    
                    // Creamos una plantilla HTML "invisible" con formato oficial
                    const plantillaPDF = document.createElement('div');
                    plantillaPDF.style.padding = '40px';
                    plantillaPDF.style.fontFamily = 'Arial, sans-serif';
                    plantillaPDF.innerHTML = `
                        <div style="text-align:center; border-bottom: 3px solid #002855; padding-bottom: 15px; margin-bottom: 25px;">
                            <h2 style="color: #002855; margin: 0; text-transform: uppercase;">REPORTE DE INTELIGENCIA TERRITORIAL</h2>
                            <h3 style="margin: 5px 0; color: #333;">Sistema V.I.G.I.A. - Zona Operacional II</h3>
                            <p style="font-size: 0.85rem; color: #666; margin-top:10px;">Fecha de extracción: ${new Date().toLocaleString('es-UY')} <br> Operador Responsable: ${usuarioLogueado}</p>
                        </div>

                        <div style="margin-bottom: 20px;">
                            <h3 style="background-color: #002855; color: white; padding: 8px 15px; border-radius: 4px; margin-bottom: 10px; font-size: 1.1rem;">1. DATOS PERSONALES</h3>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Nombres y Apellidos:</b> ${p.nombre} ${p.apellido}</p>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Cédula de Identidad:</b> ${p.documento_identidad}</p>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Alias Conocido:</b> ${p.alias || 'Sin registrar'}</p>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Teléfono de Contacto:</b> ${p.telefono || 'Sin registrar'}</p>
                        </div>

                        <div style="margin-bottom: 20px;">
                            <h3 style="background-color: #002855; color: white; padding: 8px 15px; border-radius: 4px; margin-bottom: 10px; font-size: 1.1rem;">2. UBICACIÓN TERRITORIAL</h3>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Padrón / Vivienda:</b> ${p.padron_asociado}</p>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Georreferencia (Calle):</b> ${direccion}</p>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Observaciones de Ubicación:</b> ${p.observaciones_seguridad || 'Ninguna'}</p>
                        </div>

                        <div style="margin-bottom: 20px;">
                            <h3 style="background-color: #002855; color: white; padding: 8px 15px; border-radius: 4px; margin-bottom: 10px; font-size: 1.1rem;">3. PERFIL DE INTELIGENCIA Y SEGURIDAD</h3>
                            <p style="margin: 5px 0; font-size: 1rem; color: ${p.tiene_antecedentes ? '#dc3545' : '#000'};"><b>Antecedentes Penales:</b> ${p.tiene_antecedentes ? 'SÍ POSEE ANTECEDENTES' : 'NO REGISTRA'}</p>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Situación de Arresto:</b> ${p.arresto_domiciliario !== 'No' ? p.arresto_domiciliario.toUpperCase() + (p.arresto_horario ? ' (Horario: ' + p.arresto_horario + ')' : '') : 'Sin restricciones activas'}</p>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Vehículos Asociados:</b> ${p.vehiculos || 'Ninguno registrado'}</p>
                        </div>

                        <div style="margin-bottom: 20px;">
                            <h3 style="background-color: #002855; color: white; padding: 8px 15px; border-radius: 4px; margin-bottom: 10px; font-size: 1.1rem;">4. RELEVAMIENTO SOCIAL (PLAN +BARRIO)</h3>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Conexión a Servicios:</b> ${p.servicios_basicos || 'Carencia total'}</p>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Nivel de Vulnerabilidad:</b> ${p.vulnerabilidad ? 'ALTO RIESGO / CARENCIAS CRÍTICAS' : 'ESTABLE'}</p>
                            <p style="margin: 5px 0; font-size: 1rem;"><b>Núcleo Familiar:</b><br> ${p.composicion_familiar || 'Sin datos relevados'}</p>
                        </div>
                        
                        <div style="margin-top: 40px; text-align: center; border-top: 1px dashed #ccc; padding-top: 20px;">
                            <p style="font-size: 0.8rem; color: #888;">Documento generado automáticamente por el Sistema Táctico V.I.G.I.A.<br>Ministerio del Interior - Uruguay</p>
                        </div>
                    `;

                    // Opciones de configuración del PDF
                    const opcionesPDF = {
                        margin: 10,
                        filename: `Ficha_VIGIA_${p.documento_identidad}.pdf`,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2 }, // Mejora la nitidez del texto
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    };

                    // Ejecutar la librería
                    html2pdf().set(opcionesPDF).from(plantillaPDF).save().then(() => {
                        btn.innerText = "📄 PDF"; // Restaura el botón al terminar
                        registrarLog(`EXPORTACIÓN A PDF - CI: ${p.documento_identidad}`, 'personas');
                    });
                });

                contenedor.appendChild(ficha);
            }
        }
    });

    document.getElementById('btn-admin-panel').addEventListener('click', async () => {
        cambiarVista('admin');
        const { data } = await db.from('logs_auditoria').select('*').order('fecha_hora', { ascending: false }).limit(50);
        const tabla = document.getElementById('tabla-logs');
        tabla.innerHTML = '';
        if(data) data.forEach(l => {
            tabla.innerHTML += `<tr>
                <td style="padding:10px; border-bottom:1px solid #ddd; font-size:0.8rem;">${new Date(l.fecha_hora).toLocaleString('es-UY')}</td>
                <td style="border-bottom:1px solid #ddd; font-weight:bold; font-size:0.85rem;">${l.usuario_ci.split('@')[0]}</td>
                <td style="border-bottom:1px solid #ddd; font-size:0.8rem;">${l.accion}</td>
            </tr>`;
        });
    });

    checkSession();
});
