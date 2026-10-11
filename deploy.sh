#!/bin/bash
# ============================================================
# Deploy do itcost — COPIA os fontes para o servidor Linux e
# EXECUTA o build/restart (via run.sh no servidor).
# Rode este script no Git Bash da sua máquina (Windows), a
# partir da pasta do projeto:  ./deploy.sh
#
# Uso:
#   ./deploy.sh                              copia + build/restart
#   ./deploy.sh migration_x.sql [outra.sql]  copia + roda essas migrations + build
# ============================================================
set -e
HOST="ayabe@172.25.103.128"
REMOTE="~/Documentos/TIC/itcost-pg"
DBUSER="itcost_app"
DBPASS="itcost123"
cd "$(dirname "$0")"

echo "== [1/2] Enviando fontes para $HOST:$REMOTE =="
tar czf - app components lib messages i18n public migration_*.sql run.sh deploy.sh \
  middleware.ts tailwind.config.js postcss.config.js next.config.js \
  | ssh "$HOST" "cd $REMOTE && tar xzf - && chmod +x run.sh deploy.sh 2>/dev/null; echo '   enviado.'"

# Monta um único comando remoto: migrations (se houver) + build — 1 só conexão SSH.
RCMD="cd $REMOTE"
for f in "$@"; do
  RCMD="$RCMD && echo '== migration: $f ==' && PGPASSWORD=$DBPASS psql -h localhost -p 5433 -U $DBUSER -d itcost -f $f"
done
RCMD="$RCMD && echo '== build + restart ==' && ./run.sh build"

echo "== [2/2] Migrations + build no servidor =="
ssh "$HOST" "$RCMD"

echo ""
echo "== FIM — app em http://172.25.103.128:3000 (Ctrl+Shift+R no navegador) =="
