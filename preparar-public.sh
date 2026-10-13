#!/usr/bin/env bash
# Regenera cards.js a partir de cards.json, copia os arquivos do site para public/
# e publica no Cloudflare (Workers, só arquivos estáticos).
# Baralho.pdf, cards.json, CLAUDE.md e demais arquivos internos ficam de fora:
# o site lê os dados de cards.js e o PDF é baixado pelo link do QR "Compartilhe!".
#
# Uso:
#   ./preparar-public.sh              # monta public/ e faz deploy em produção
#   ./preparar-public.sh --sem-deploy # só monta public/
#
# Nome do Worker, domínio (baralhodaverdade.org) e data de compatibilidade
# ficam em wrangler.jsonc. Em produção o deploy roda pelo GitHub Actions
# (.github/workflows/deploy.yml) a cada push na main; este script serve para
# montar e testar localmente, ou para um deploy manual (exige `wrangler login`).
set -euo pipefail

cd "$(dirname "$0")"

ARQUIVOS=(index.html style.css leque.js app.js cards.js)
PASTAS=(assets)
WRANGLER="4.147.0"   # mesma versão do workflow de deploy

# cards.json é a fonte de verdade; cards.js é gerado a partir dele.
python3 - <<'EOF'
import json
with open("cards.json", encoding="utf-8") as f:
    dados = json.load(f)
with open("cards.js", "w", encoding="utf-8") as f:
    f.write("// Gerado a partir de cards.json. Não editar à mão.\nwindow.BARALHO = "
            + json.dumps(dados, ensure_ascii=False, indent=2) + ";\n")
EOF

for arq in "${ARQUIVOS[@]}" "${PASTAS[@]}"; do
  if [[ ! -e "$arq" ]]; then
    echo "Arquivo ausente: $arq" >&2
    exit 1
  fi
done

rm -rf public
mkdir public
cp "${ARQUIVOS[@]}" public/
cp -r "${PASTAS[@]}" public/

echo "public/ pronta: ${ARQUIVOS[*]} ${PASTAS[*]}/"

if [[ "${1:-}" == "--sem-deploy" ]]; then
  exit 0
fi

npx --yes "wrangler@$WRANGLER" deploy
