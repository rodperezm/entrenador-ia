#!/usr/bin/env bash
# Copia de seguridad diaria de la base de KETTAI en un servidor propio (Linux con Docker).
#
# Qué hace este instalador:
#   1. Crea la carpeta ~/kettai-copia, privada para tu usuario.
#   2. Genera una clave para el acceso de solo lectura «kettai_backup» y te pide registrarla en Supabase.
#   3. Hace la primera copia y la prueba restaurándola en una base temporal.
#   4. Deja programada una copia diaria (04:30 de Chile) y borra las de más de 30 días.
#
# El acceso «kettai_backup» puede leer la base, pero no modificarla ni borrarla.
# No necesita la clave principal de la base. Se puede volver a ejecutar sin problema.
set -euo pipefail

REF="uzehvdheatciusnhfyjr"
ROL="kettai_backup"
IMAGEN="postgres:17"
DIR="$HOME/kettai-copia"
ENV="$DIR/.env"
DIAS=30

paso() { printf '\n\033[1;32m== %s\033[0m\n' "$1"; }
falla() { printf '\n\033[1;31mNo se pudo: %s\033[0m\n' "$1" >&2; exit 1; }

command -v docker >/dev/null || falla "este servidor no tiene Docker."
docker info >/dev/null 2>&1 || falla "tu usuario no puede usar Docker (falta estar en el grupo docker)."

paso "1 de 6 · Preparando la carpeta $DIR"
mkdir -p "$DIR/copias"
chmod 700 "$DIR" "$DIR/copias"
docker pull -q "$IMAGEN" >/dev/null || falla "no se pudo descargar la herramienta de copias ($IMAGEN)."
echo "Listo."

# ---------- Clave del acceso de solo lectura ----------
if [ -f "$ENV" ] && grep -q '^PGPASSWORD=' "$ENV"; then
  CLAVE="$(grep '^PGPASSWORD=' "$ENV" | cut -d= -f2-)"
  paso "2 de 6 · Ya había una clave guardada: se reutiliza"
else
  CLAVE="$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  paso "2 de 6 · Registra la clave en Supabase"
  cat <<TEXTO
Abre esta página en tu navegador (con tu sesión de Supabase):

  https://supabase.com/dashboard/project/$REF/sql/new

Pega esta línea completa y presiona «Run»:

  alter role $ROL with password '$CLAVE';

Debe responder «Success». Esa clave solo sirve para leer la base y queda
guardada en este servidor, en $ENV.
TEXTO
  read -r -p $'\nCuando Supabase responda «Success», presiona Enter aquí... ' _
fi

# ---------- Por dónde conectarse ----------
# El plan gratis solo da conexión directa por IPv6; si el servidor no la tiene, se usa el
# conector compartido de la región, que funciona por IPv4.
probar() { # host puerto usuario
  local tmp
  tmp="$(mktemp)"
  printf 'PGHOST=%s\nPGPORT=%s\nPGUSER=%s\nPGPASSWORD=%s\nPGDATABASE=postgres\nPGSSLMODE=require\nPGCONNECT_TIMEOUT=12\n' \
    "$1" "$2" "$3" "$CLAVE" >"$tmp"
  if docker run --rm --env-file "$tmp" "$IMAGEN" psql -Atqc 'select 1' >/dev/null 2>"$DIR/ultimo-error.txt"; then
    mv "$tmp" "$ENV"
    chmod 600 "$ENV"
    return 0
  fi
  rm -f "$tmp"
  return 1
}

conectar() {
  probar "db.$REF.supabase.co" 5432 "$ROL" && return 0
  probar "aws-0-sa-east-1.pooler.supabase.com" 5432 "$ROL.$REF" && return 0
  probar "aws-1-sa-east-1.pooler.supabase.com" 5432 "$ROL.$REF" && return 0
  return 1
}

paso "3 de 6 · Probando la conexión con la base"
until conectar; do
  echo "Todavía no se pudo entrar. Lo que respondió la base:"
  sed 's/^/   /' "$DIR/ultimo-error.txt" | tail -3
  echo "Lo más común: la línea «alter role» aún no se ejecutó en Supabase, o se pegó incompleta."
  echo
  echo "  alter role $ROL with password '$CLAVE';"
  read -r -p $'\nEjecútala en Supabase y presiona Enter para reintentar (Ctrl+C para salir)... ' _
done
rm -f "$DIR/ultimo-error.txt"
echo "Conectado por $(grep '^PGHOST=' "$ENV" | cut -d= -f2)."

# ---------- El programa de la copia ----------
paso "4 de 6 · Instalando el programa de la copia"
cat >"$DIR/copia.sh" <<'PROGRAMA'
#!/usr/bin/env bash
# Copia diaria de la base de KETTAI. La instala tools/copia/instalar.sh.
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
DIR="$HOME/kettai-copia"
IMAGEN="postgres:17"
DIAS=30
ahora() { date -u +%FT%TZ; }
archivo="$DIR/copias/kettai-$(date -u +%F_%H%M).dump"
trap 'echo "$(ahora) ERROR la copia no se completó"; rm -f "$archivo.tmp"' ERR

# Esquemas con los datos: «public» (la app) y «auth» (las cuentas).
docker run --rm --env-file "$DIR/.env" "$IMAGEN" \
  pg_dump -Fc --schema=public --schema=auth --no-owner --no-privileges >"$archivo.tmp"
[ -s "$archivo.tmp" ]
# Una copia que no se puede leer no sirve: se revisa su índice antes de darla por buena.
docker run --rm -i "$IMAGEN" pg_restore -l <"$archivo.tmp" >/dev/null
mv "$archivo.tmp" "$archivo"
chmod 600 "$archivo"

find "$DIR/copias" -name 'kettai-*.dump' -mtime +"$DIAS" -delete
# Avisa a la base que hubo copia: el panel alerta si pasan dos días sin esta marca.
docker run --rm --env-file "$DIR/.env" "$IMAGEN" psql -Atqc 'select public.backup_heartbeat()' >/dev/null ||
  echo "$(ahora) AVISO la copia quedó hecha, pero no se pudo marcar la fecha en la base"
echo "$(ahora) OK $(basename "$archivo") $(du -h "$archivo" | cut -f1) · copias guardadas: $(find "$DIR/copias" -name 'kettai-*.dump' | wc -l)"
PROGRAMA
sed -i "s/^DIAS=30$/DIAS=$DIAS/" "$DIR/copia.sh"
chmod 700 "$DIR/copia.sh"
echo "Listo."

paso "5 de 6 · Primera copia y prueba de restauración"
"$DIR/copia.sh" | tee -a "$DIR/copia.log"
ULTIMA="$(find "$DIR/copias" -name 'kettai-*.dump' -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"
[ -n "$ULTIMA" ] || falla "no quedó ninguna copia en $DIR/copias."

# Se restaura en una base temporal dentro de este servidor y se comparan las cantidades.
CONTAR="select (select count(*) from auth.users) || ' cuentas, ' || (select count(*) from public.user_items) || ' datos respaldados, ' || (select count(*) from public.ai_generations) || ' consultas de IA'"
ORIGEN="$(docker run --rm --env-file "$ENV" "$IMAGEN" psql -Atqc "$CONTAR")"
PRUEBA="kettai-prueba-$$"
docker rm -f "$PRUEBA" >/dev/null 2>&1 || true
docker run -d --rm --name "$PRUEBA" -e POSTGRES_PASSWORD=prueba "$IMAGEN" >/dev/null
trap 'docker rm -f "$PRUEBA" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 40); do
  docker exec "$PRUEBA" psql -U postgres -Atqc 'select 1' >/dev/null 2>&1 && break
  sleep 1
done
# Lo que la base original da por hecho: los roles de Supabase y el esquema de extensiones.
docker exec "$PRUEBA" psql -U postgres -q -c "create role anon; create role authenticated; create role service_role; create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists \"uuid-ossp\" with schema extensions;" >/dev/null
ERRORES="$(docker exec -i "$PRUEBA" pg_restore -U postgres -d postgres --no-owner --no-privileges <"$ULTIMA" 2>&1 | grep -c 'error:' || true)"
COPIA="$(docker exec "$PRUEBA" psql -U postgres -Atqc "$CONTAR" 2>&1 || true)"
docker rm -f "$PRUEBA" >/dev/null 2>&1 || true
trap - EXIT

echo "En la base real:        $ORIGEN"
echo "En la copia restaurada: $COPIA"
if [ "$ORIGEN" = "$COPIA" ]; then
  echo "La copia se restauró completa (avisos menores al restaurar: $ERRORES)."
  RESULTADO="LA COPIA SIRVE"
else
  echo "Las cantidades no coinciden (avisos al restaurar: $ERRORES)."
  RESULTADO="REVISAR: la copia se hizo, pero la prueba de restauración no coincidió"
fi

paso "6 de 6 · Programando la copia diaria"
# 07:30 UTC = 04:30 en Chile (horario de verano).
( crontab -l 2>/dev/null | grep -v 'kettai-copia/copia.sh' || true
  echo "30 7 * * * $DIR/copia.sh >> $DIR/copia.log 2>&1" ) | crontab -
echo "Quedó programada todos los días a las 04:30 de Chile."

printf '\n\033[1;32m================ RESUMEN ================\033[0m\n'
echo "Resultado:        $RESULTADO"
echo "Copias en:        $DIR/copias  (se conservan $DIAS días)"
echo "Última copia:     $(basename "$ULTIMA")  $(du -h "$ULTIMA" | cut -f1)"
echo "Registro diario:  $DIR/copia.log"
echo "Hacer una ahora:  $DIR/copia.sh"
echo "========================================="
