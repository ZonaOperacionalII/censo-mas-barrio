// 1. CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = 'https://maalgmxakmikryrmhloz.supabase.co'; // Sin el /rest/v1/
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYWxnbXhha21pa3J5cm1obG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzEzNTQsImV4cCI6MjA5NjE0NzM1NH0.Hdoh3Sct07fHVDb7YrEKe_zvryPXxLOvCMGLv-iseCs';

// CAMBIO CLAVE: Renombramos a 'db' para evitar el choque con la librería global
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. REFERENCIAS A LA INTERFAZ
const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const loginError = document.getElementById('login-error');
const btnUbicar = document.getElementById('btn-ubicar');
const btnCensar = document.getElementById('btn-censar');
const resultadoPadron = document.getElementById('resultado-padron');

let map;
let marker;

// 3. SEGURIDAD: VERIFICAR SI YA ESTÁ LOGUEADO
async function checkSession() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        iniciarEntornoOperativo();
    }
}
checkSession();

// 4. LÓGICA DE INGRESO
btnLogin.addEventListener('click', async () => {
    const email = document.getElementById('doc').value;
    const password = document.getElementById('pass').value;
    
    btnLogin.innerText = "Verificando...";
    
    const { data, error } = await db.auth.signInWithPassword({
        email: email,
        password: password
    });
    
    if (error) {
        loginError.style.display = 'block';
        loginError.innerText = "Acceso denegado: " + error.message;
        btnLogin.innerText = "Ingresar";
    } else {
        loginError.style.display = 'none';
        iniciarEntornoOperativo();
    }
});

// 5. LÓGICA DE SALIDA
btnLogout.addEventListener('click', async () => {
    await db.auth.signOut();
    appView.style.display = 'none';
    loginView.style.display = 'flex';
    document.getElementById('pass').value = '';
    btnLogin.innerText = "Ingresar";
});

// 6. ACTIVAR ENTORNO OPERATIVO
function iniciarEntornoOperativo() {
    loginView.style.display = 'none';
    appView.style.display = 'flex';
    
    // Solo cargamos el mapa si no existe para ahorrar memoria
    if (!map) {
        // Centramos en Maldonado
        map = L.map('mapa').setView([-34.898, -54.945], 14);
        
        // Capa base limpia
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: 'Sistema de Inteligencia Territorial'
        }).addTo(map);
    }
    
    // Al iniciar, re-ajustar el tamaño del mapa 
    setTimeout(() => { map.invalidateSize(); }, 200);
}

// 7. RASTREO TÁCTICO: GPS A PADRÓN
btnUbicar.addEventListener('click', () => {
    if ("geolocation" in navigator) {
        btnUbicar.innerText = "Buscando satélites...";
        
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            // Actualizar marcador en el mapa
            if(marker) map.removeLayer(marker);
            marker = L.marker([lat, lon]).addTo(map);
            map.setView([lat, lon], 18); // Zoom profundo a la cuadra

            // Consultar a Supabase en qué polígono cayó
            const { data, error } = await db.rpc('padron_actual', {
                lon: lon,
                lat: lat
            });

            if (data && data.length > 0) {
                // El policía está dentro de una vivienda mapeada
                resultadoPadron.innerText = `Padrón / ID: ${data[0].numero_padron}`;
                btnCensar.style.display = 'block'; // Mostrar botón verde
                btnUbicar.innerText = "Actualizar posición GPS";
            } else {
                resultadoPadron.innerText = "Vía Pública / Fuera de zona";
                btnCensar.style.display = 'none'; // Ocultar botón de censo
                btnUbicar.innerText = "Reintentar GPS";
            }
        }, (error) => {
            alert("No se pudo obtener el GPS. Verifica los permisos de ubicación en el celular.");
            btnUbicar.innerText = "Detectar Padrón GPS";
        }, { enableHighAccuracy: true }); // Forzar máxima precisión
    } else {
        alert("El dispositivo no soporta geolocalización.");
    }
});

// 8. LÓGICA DEL FORMULARIO DE CENSO
const modalCenso = document.getElementById('modal-censo');
const btnCancelarCenso = document.getElementById('btn-cancelar-censo');
const btnGuardarCenso = document.getElementById('btn-guardar-censo');

// Variables temporales para guardar dónde estamos parados
let padronActualID = null;

// Cuando el PCOP detecta el padrón y hace clic en "Iniciar Relevamiento"
btnCensar.addEventListener('click', () => {
    modalCenso.style.display = 'flex';
});

btnCancelarCenso.addEventListener('click', () => {
    modalCenso.style.display = 'none';
});

// Guardar en la base de datos
btnGuardarCenso.addEventListener('click', async () => {
    btnGuardarCenso.innerText = "Guardando...";
    
    const ci = document.getElementById('censo-ci').value;
    const nombre = document.getElementById('censo-nombre').value;
    const apellido = document.getElementById('censo-apellido').value;
    const alias = document.getElementById('censo-alias').value;
    const antecedentes = document.getElementById('censo-antecedentes').checked;

    if(!ci || !nombre || !apellido) {
        alert("Cédula, Nombre y Apellido son obligatorios.");
        btnGuardarCenso.innerText = "Guardar";
        return;
    }

    // Insertar en la tabla 'personas'
    const { data, error } = await db
        .from('personas')
        .insert([{
            documento_identidad: ci,
            nombre: nombre,
            apellido: apellido,
            alias: alias,
            tiene_antecedentes: antecedentes
        }]);

    if (error) {
        if(error.code === '23505') {
            alert("Esta persona ya fue censada anteriormente.");
        } else {
            alert("Error al guardar: " + error.message);
        }
    } else {
        alert("Habitante registrado con éxito.");
        // Limpiar formulario y cerrar
        document.getElementById('censo-ci').value = '';
        document.getElementById('censo-nombre').value = '';
        document.getElementById('censo-apellido').value = '';
        document.getElementById('censo-alias').value = '';
        document.getElementById('censo-antecedentes').checked = false;
        modalCenso.style.display = 'none';
    }
    
    btnGuardarCenso.innerText = "Guardar";
});