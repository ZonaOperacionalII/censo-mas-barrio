// 1. CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = 'https://maalgmxakmikryrmhloz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYWxnbXhha21pa3J5cm1obG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzEzNTQsImV4cCI6MjA5NjE0NzM1NH0.Hdoh3Sct07fHVDb7YrEKe_zvryPXxLOvCMGLv-iseCs';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. REFERENCIAS A LA INTERFAZ
const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const adminView = document.getElementById('admin-view');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const loginError = document.getElementById('login-error');
const btnUbicar = document.getElementById('btn-ubicar');
const btnCensar = document.getElementById('btn-censar');
const resultadoPadron = document.getElementById('resultado-padron');
const btnAdminPanel = document.getElementById('btn-admin-panel');
const btnCerrarAdmin = document.getElementById('btn-cerrar-admin');

let map;
let marker;

// 3. SEGURIDAD: VERIFICAR SESIÓN Y ROL
async function checkSession() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        validarRol(session.user.email);
    }
}
checkSession();

async function validarRol(email) {
    const { data, error } = await db.from('administradores').select('*').eq('email', email);
    const esAdmin = data && data.length > 0;
    iniciarEntornoOperativo(esAdmin);
}

// 4. LÓGICA DE INGRESO
btnLogin.addEventListener('click', async () => {
    const email = document.getElementById('doc').value;
    const password = document.getElementById('pass').value;
    
    btnLogin.innerText = "Verificando...";
    const { data, error } = await db.auth.signInWithPassword({ email: email, password: password });
    
    if (error) {
        loginError.style.display = 'block';
        loginError.innerText = "Acceso denegado.";
        btnLogin.innerText = "Ingresar";
    } else {
        loginError.style.display = 'none';
        validarRol(email);
    }
});

// 5. LÓGICA DE SALIDA
btnLogout.addEventListener('click', async () => {
    await db.auth.signOut();
    appView.style.display = 'none';
    adminView.style.display = 'none';
    loginView.style.display = 'flex';
    document.getElementById('pass').value = '';
    btnLogin.innerText = "Ingresar";
    btnAdminPanel.style.display = 'none';
});

// 6. ACTIVAR ENTORNO OPERATIVO
function iniciarEntornoOperativo(esAdmin = false) {
    loginView.style.display = 'none';
    adminView.style.display = 'none';
    appView.style.display = 'flex';
    
    if(esAdmin) btnAdminPanel.style.display = 'block';

    if (!map) {
        map = L.map('mapa').setView([-34.898, -54.945], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'S.I.C.T.' }).addTo(map);
    }
    setTimeout(() => { map.invalidateSize(); }, 200);
}

// 7. PANEL DE AUDITORÍA (SOLO SUPERUSUARIO)
btnAdminPanel.addEventListener('click', async () => {
    appView.style.display = 'none';
    adminView.style.display = 'flex';
    
    const { data, error } = await db.from('logs_auditoria').select('*').order('fecha_hora', { ascending: false }).limit(50);
    const tabla = document.getElementById('tabla-logs');
    tabla.innerHTML = ''; 
    
    if(data) {
        data.forEach(log => {
            const fecha = new Date(log.fecha_hora).toLocaleString('es-UY');
            let detalle = log.detalles?.documento_identidad ? `CI: ${log.detalles.documento_identidad}` : '-';
            tabla.innerHTML += `
                <tr>
                    <td>${fecha}</td>
                    <td style="font-weight:bold; color:var(--azul-ministerio);">${log.usuario_ci}</td>
                    <td><span style="background:#e9ecef; padding:2px 5px; border-radius:3px;">${log.accion}</span></td>
                    <td>${detalle}</td>
                </tr>`;
        });
    }
});

btnCerrarAdmin.addEventListener('click', () => {
    adminView.style.display = 'none';
    appView.style.display = 'flex';
    setTimeout(() => { map.invalidateSize(); }, 200);
});

// 8. RASTREO TÁCTICO: GPS A PADRÓN
btnUbicar.addEventListener('click', () => {
    if ("geolocation" in navigator) {
        btnUbicar.innerText = "Buscando...";
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            if(marker) map.removeLayer(marker);
            marker = L.marker([lat, lon]).addTo(map);
            map.setView([lat, lon], 18);

            const { data, error } = await db.rpc('padron_actual', { lon: lon, lat: lat });

            if (data && data.length > 0) {
                resultadoPadron.innerText = `Padrón: ${data[0].numero_padron}`;
                btnCensar.style.display = 'block';
            } else {
                resultadoPadron.innerText = "Vía Pública";
            }
            btnUbicar.innerText = "Actualizar GPS";
        }, (error) => {
            alert("Error GPS."); btnUbicar.innerText = "Detectar GPS";
        }, { enableHighAccuracy: true });
    }
});

// 9. FORMULARIO DE CENSO (EMPAQUETADO DE INTELIGENCIA)
const modalCenso = document.getElementById('modal-censo');
document.getElementById('btn-censar').addEventListener('click', () => modalCenso.style.display = 'flex');
document.getElementById('btn-cancelar-censo').addEventListener('click', () => modalCenso.style.display = 'none');

document.getElementById('btn-guardar-censo').addEventListener('click', async () => {
    const btnGuardar = document.getElementById('btn-guardar-censo');
    btnGuardar.innerText = "Guardando...";
    
    // Captura Datos Personales
    const ci = document.getElementById('censo-ci').value;
    const nombre = document.getElementById('censo-nombre').value;
    const apellido = document.getElementById('censo-apellido').value;
    const alias = document.getElementById('censo-alias').value;
    const antecedentes = document.getElementById('censo-antecedentes').checked;

    if(!ci || !nombre || !apellido) {
        alert("Cédula, Nombre y Apellido son obligatorios.");
        btnGuardar.innerText = "Guardar Datos"; return;
    }

    // Captura y Empaquetado de Inteligencia y Social
    const vehiculos = document.getElementById('censo-vehiculos').value || "Ninguno";
    const camaras = document.getElementById('censo-camaras').checked ? "Sí" : "No";
    const perros = document.getElementById('censo-perros').checked ? "Sí" : "No";
    const armas = document.getElementById('censo-armas').checked ? "Sí" : "No";
    const tenencia = document.getElementById('censo-tenencia').value;
    const ute = document.getElementById('censo-ute').checked ? "Sí" : "No";
    const ose = document.getElementById('censo-ose').checked ? "Sí" : "No";
    const menores = document.getElementById('censo-menores').value;
    const escuela = document.getElementById('censo-escolaridad').checked ? "Sí" : "No";
    const discap = document.getElementById('censo-discapacidad').checked ? "Sí" : "No";

    // Construimos un bloque de texto estructurado para guardar todo sin alterar la base de datos
    const observaciones_completas = `
    [INTELIGENCIA] Vehículos: ${vehiculos} | Cámaras: ${camaras} | Perros: ${perros} | Armas: ${armas}
    [SOCIAL] Tenencia: ${tenencia} | UTE: ${ute} - OSE: ${ose} | Menores: ${menores} (Escolarizados: ${escuela}) | Discapacidad: ${discap}
    `.trim();

    // Enviar a Supabase
    const { data, error } = await db.from('personas').insert([{
        documento_identidad: ci, nombre: nombre, apellido: apellido, alias: alias,
        tiene_antecedentes: antecedentes,
        observaciones_seguridad: observaciones_completas
    }]);

    if (error) {
        alert(error.code === '23505' ? "Esta persona ya fue censada." : "Error: " + error.message);
    } else {
        alert("Habitante registrado con éxito.");
        modalCenso.style.display = 'none';
        // Limpiar campos principales
        document.getElementById('censo-ci').value = '';
        document.getElementById('censo-nombre').value = '';
        document.getElementById('censo-apellido').value = '';
        document.getElementById('censo-vehiculos').value = '';
        document.getElementById('censo-antecedentes').checked = false;
    }
    btnGuardar.innerText = "Guardar Datos";
});
