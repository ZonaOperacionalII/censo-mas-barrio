import requests
import json
from supabase import create_client, Client

# ==========================================
# 1. TUS CREDENCIALES DE SUPABASE
# ==========================================
SUPABASE_URL = "https://maalgmxakmikryrmhloz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYWxnbXhha21pa3J5cm1obG96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU3MTM1NCwiZXhwIjoyMDk2MTQ3MzU0fQ.Syg_EqRfLml94ltgjsx6_pWFVnh7cKek_ew3Ww4PMC0"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. CONSULTA A LOS SERVIDORES DE MAPAS (OVERPASS API)
# ==========================================
print("⏳ Conectando con los satélites de OpenStreetMap...")

overpass_url = "http://overpass-api.de/api/interpreter"

# Bounding Box: Ampliamos la red de captura para atrapar toda la periferia
overpass_query = """
[out:json][timeout:120];
(
  way["building"](-34.9600, -55.0500, -34.8000, -54.8500);
);
out geom;
"""

headers = {
    'User-Agent': 'CensoMasBarrio_App/1.0 (Uruguay)'
}

try:
    respuesta = requests.post(overpass_url, data={'data': overpass_query}, headers=headers)

    if respuesta.status_code == 200:
        datos_mapa = respuesta.json()
        viviendas_encontradas = len(datos_mapa.get('elements', []))
        print(f"✅ ¡Éxito! Se descargaron {viviendas_encontradas} geometrías de viviendas.")
        
        print("🚀 Iniciando inyección en Supabase...")
        contador = 0
        
        for elemento in datos_mapa.get('elements', []):
            if 'geometry' in elemento:
                coordenadas = elemento['geometry']
                
                if coordenadas[0] != coordenadas[-1]:
                    coordenadas.append(coordenadas[0])
                    
                texto_coordenadas = ", ".join([f"{punto['lon']} {punto['lat']}" for punto in coordenadas])
                poligono_wkt = f"POLYGON(({texto_coordenadas}))"
                numero_provisorio = f"OSM-{elemento['id']}"

                datos_insertar = {
                    "numero_padron": numero_provisorio,
                    "geometria": poligono_wkt,
                    "zona_conflicto": False
                }

                try:
                    supabase.table("padrones").insert(datos_insertar).execute()
                    contador += 1
                    
                    if contador % 50 == 0:
                        print(f"   -> Insertadas {contador} viviendas...")
                        
                except Exception as e:
                    print(f"⚠️ Error al insertar padrón {numero_provisorio}: {e}")
        
        print(f"🎯 Proceso finalizado. Se inyectaron {contador} viviendas en Supabase.")

    else:
        print(f"❌ Error de conexión con el mapa. Código: {respuesta.status_code}")

except Exception as e:
    print(f"❌ Error crítico en el script: {e}")
