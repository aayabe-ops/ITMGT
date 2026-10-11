#!/bin/bash
# IT Cost Manager — startup de PRODUÇÃO (npm run build + npm start).
# Uso:
#   ./run.sh          → sobe produção (faz build só se .next não existir)
#   ./run.sh build    → força rebuild limpo (rm -rf .next) e sobe
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$APP_DIR/itcost.log"
PORT=3000
cd "$APP_DIR"

echo "================================================"
echo "  IT Cost Manager — Produção"
echo "================================================"

# ── 1. PostgreSQL (porta 5433) ───────────────────────
echo ""
echo "[1/5] Verificando PostgreSQL..."
if pg_isready -h localhost -p 5433 -q 2>/dev/null; then
  echo "  OK — PostgreSQL na porta 5433"
else
  echo "  Iniciando PostgreSQL..."
  sudo systemctl start postgresql 2>/dev/null || sudo service postgresql start 2>/dev/null || true
  sleep 3
  pg_isready -h localhost -p 5433 -q 2>/dev/null \
    && echo "  OK — PostgreSQL iniciado" \
    || echo "  AVISO — PostgreSQL pode não estar na 5433; verifique manualmente"
fi

# ── 2. Ollama (opcional — análise IA) ────────────────
echo ""
echo "[2/5] Verificando Ollama (opcional)..."
if command -v ollama >/dev/null 2>&1; then
  if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "  OK — Ollama já rodando"
  else
    ollama serve > /tmp/ollama.log 2>&1 &
    sleep 2
    curl -s http://localhost:11434/api/tags >/dev/null 2>&1 \
      && echo "  OK — Ollama iniciado" \
      || echo "  AVISO — Ollama não respondeu (IA indisponível)"
  fi
else
  echo "  Ignorado — Ollama não instalado (IA indisponível)"
fi

# ── 3. Parar instâncias antigas (dev ou prod) ────────
# Truque do colchete: "next[-]server" casa com o processo real, mas não
# com a própria linha de comando, evitando auto-kill.
echo ""
echo "[3/5] Encerrando instâncias anteriores..."
pkill -9 -f "next[-]server" 2>/dev/null || true
pkill -9 -f "next [d]ev"    2>/dev/null || true
pkill -9 -f "npm [r]un dev" 2>/dev/null || true
if command -v fuser >/dev/null 2>&1; then fuser -k ${PORT}/tcp 2>/dev/null || true; fi
sleep 2
if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "  ERRO — porta ${PORT} ainda ocupada. Veja quem segura:"
  ss -ltnp 2>/dev/null | grep ":${PORT} " || true
  exit 1
fi
echo "  OK — porta ${PORT} livre"

# ── 4. Build de produção (condicional) ───────────────
echo ""
if [ "$1" = "build" ] || [ ! -f "$APP_DIR/.next/BUILD_ID" ]; then
  echo "[4/5] Build de produção (rm -rf .next && npm run build)..."
  rm -rf .next
  npm run build
else
  echo "[4/5] Build existente reutilizado (use './run.sh build' para refazer)."
fi

# ── 5. Iniciar em produção ───────────────────────────
echo ""
echo "[5/5] Iniciando aplicação (npm start)..."
setsid nohup npm start > "$LOG" 2>&1 < /dev/null &
echo $! > "$APP_DIR/.pid"

echo "  Aguardando 'Ready'..."
for i in $(seq 1 40); do
  sleep 2
  if grep -qE "Ready|started server on" "$LOG" 2>/dev/null; then
    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    echo ""
    echo "================================================"
    echo "  Pronto!"
    echo "  http://${IP:-localhost}:${PORT}"
    echo "  http://localhost:${PORT}"
    echo "  Log:   tail -f $LOG"
    echo "  Parar: kill \$(cat $APP_DIR/.pid)   (ou ./run.sh reinicia)"
    echo "================================================"
    exit 0
  fi
  if grep -q "EADDRINUSE" "$LOG" 2>/dev/null; then
    echo "  ERRO — EADDRINUSE na porta ${PORT}. Log:"; tail -15 "$LOG"; exit 1
  fi
done

echo "  TIMEOUT — servidor não ficou pronto. Log:"; tail -20 "$LOG"; exit 1
