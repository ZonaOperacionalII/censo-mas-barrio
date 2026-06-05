import requests
import json
from supabase import create_client, Client

# ==========================================
# 1. TUS CREDENCIALES DE SUPABASE
# ==========================================
# URL LIMPIA (Sin el /rest/v1/ al final)
SUPABASE_URL = "https://maalgmxakmikryrmhloz.supabase.co"

# ¡ATENCIÓN! Reemplaza este texto por tu SERVICE_ROLE KEY secreta de Supabase.
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYWxnbXhha21pa3J5cm1obG96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU3MTM1NCwiZXhwIjoyMDk2MTQ3MzU0fQ.Syg_EqRfLml94ltgjsx6_pWFVnh7cKek_ew3Ww4PMC0"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. CONSULTA A LOS SERVIDORES DE MAPAS (OVERPASS API)
# ==========================================
print("⏳ Conectando con los satélites de OpenStreetMap...")

overpass_url = "http://overpass-api.de/api/interpreter"

# Aumentamos el timeout a 90 segundos para evitar cortes
overpass_query = """
[out:json][timeout:90];
area["name"="Maldonado"]->.searchArea;
(
  way["building"](area.searchArea);
);
out geom;
"""

# FUNDAMENTAL: Nos identificamos para que el servidor no nos bloquee
headers = {
    'User-Agent': 'CensoMasBarrio_App/1.0 (Uruguay)'
}

try:
    # Hacemos la petición enviando nuestra "identificación"
    respuesta = requests.post(overpass_url, data={'data': overpass_query}, headers=headers)

    # Verificamos que el servidor haya respondido con un "OK" (Código 200)
    if respuesta.status_code == 200:
        datos_mapa = respuesta.json()
        viviendas_encontradas = len(datos_mapa.get('elements', []))
        print(f"✅ ¡Éxito! Se descargaron {viviendas_encontradas} geometrías de viviendas.")
        
        # ==========================================
        # 3. PROCESAR Y ENVIAR A SUPABASE
        # ==========================================
        print("🚀 Iniciando inyección en Supabase...")
        contador = 0
        
        for elemento in datos_mapa.get('elements', []):
            if 'geometry' in elemento:
                # CORRECCIÓN DE INDENTACIÓN AQUÍ
                coordenadas = elemento['geometry']
                
                # FORZAR CIERRE: Si el último punto no es idéntico al primero, lo clonamos al final
                if coordenadas[0] != coordenadas[-1]:
                    coordenadas.append(coordenadas[0])
                    
                # Formatear a WKT para PostGIS
                texto_coordenadas = ", ".join([f"{punto['lon']} {punto['lat']}" for punto in coordenadas])
                poligono_wkt = f"POLYGON(({texto_coordenadas}))"
                numero_provisorio = f"OSM-{elemento['id']}"

                datos_insertar = {
                    "numero_padron": numero_provisorio,
                    "geometria": poligono_wkt,
                    "zona_conflicto": False
                }

                # CORRECCIÓN DE INDENTACIÓN AQUÍ
                try:
                    # Insertar en base de datos
                    supabase.table("padrones").insert(datos_insertar).execute()
                    contador += 1
                    
                    # Bajamos el aviso a 50 para que veas que avanza más rápido
                    if contador % 50 == 0:
                        print(f"   -> Insertadas {contador} viviendas...")
                        
                except Exception as e:
                    # Quitamos el 'pass' y le pedimos que nos grite el error
                    print(f"⚠️ Error al insertar padrón {numero_provisorio}: {e}")
        
        print(f"🎯 Proceso finalizado. Se inyectaron {contador} viviendas en Supabase.")

    else:
        print(f"❌ Error de conexión con el mapa. Código: {respuesta.status_code}")

except Exception as e:
    print(f"❌ Error general: {e}")