#!/usr/bin/env bash
# Regenera cards.js a partir de cards.json, copia os arquivos do site para public/
# e publica no Cloudflare (Workers, só arquivos estáticos).
# Baralho.pdf, cards.json, CLAUDE.md e demais arquivos internos ficam de fora:
# o site lê os dados de cards.js e o PDF é baixado pelo link do QR "Compartilhe!".
#
# Uso:
#   ./preparar-public.sh              # monta public/ e faz deploy
#   ./preparar-public.sh --sem-deploy # só monta public/
#
# O nome do Worker vem da variável NOME_WORKER, definida no ambiente ou em
# .env.deploy (ignorado pelo git). Exemplo de .env.deploy:
#   NOME_WORKER=baralho-politico
set -euo pipefail

cd "$(dirname "$0")"

ARQUIVOS=(index.html style.css app.js cards.js)
if [[ -f .env.deploy ]]; then
  # shellcheck source=/dev/null
  source .env.deploy
fi
NOME_WORKER="${NOME_WORKER:-}"
DATA_COMPAT="2026-10-01"

# cards.json é a fonte de verdade; cards.js é gerado a partir dele.
python3 - <<'EOF'
import json
with open("cards.json", encoding="utf-8") as f:
    dados = json.load(f)
with open("cards.js", "w", encoding="utf-8") as f:
    f.write("// Gerado a partir de cards.json. Não editar à mão.\nwindow.BARALHO = "
            + json.dumps(dados, ensure_ascii=False, indent=2) + ";\n")
EOF

for arq in "${ARQUIVOS[@]}"; do
  if [[ ! -f "$arq" ]]; then
    echo "Arquivo ausente: $arq" >&2
    exit 1
  fi
done

rm -rf public
mkdir public
cp "${ARQUIVOS[@]}" public/

echo "public/ pronta: ${ARQUIVOS[*]}"

if [[ "${1:-}" == "--sem-deploy" ]]; then
  exit 0
fi

if [[ -z "$NOME_WORKER" ]]; then
  echo "Defina NOME_WORKER no ambiente ou em .env.deploy (ex.: NOME_WORKER=baralho-politico)." >&2
  exit 1
fi

npx wrangler deploy \
  --name "$NOME_WORKER" \
  --assets public \
  --compatibility-date "$DATA_COMPAT"
