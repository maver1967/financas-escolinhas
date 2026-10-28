#!/bin/bash
# Publica uma alteração, do princípio ao fim.
#   ./atualizar.sh "o que mudou"
#
# Faz três coisas: envia o backend para o Apps Script, aponta a distribuição
# que já existe para a versão nova (o URL /exec nunca muda), e publica a app
# em GitHub Pages. As provas correm primeiro: se alguma falhar, não sai nada.
set -e
cd "$(dirname "$0")"

MOTIVO="${1:-actualização}"
DEPLOYMENT="AKfycbzK6AGPaRwl8K0aHDJUCH1T0J3HgiB8hL7DBS8gkWXBebGQJzM6SDknn7gvGP3lbWJuaQ"

echo "── provas ──────────────────────────────────────────"
for t in backend fase2 fase3 fase5; do
  printf "%-10s " "$t"
  node "test/$t.test.js" | tail -1
done
echo ""

echo "── backend → Apps Script ───────────────────────────"
clasp push --force
clasp redeploy "$DEPLOYMENT" -d "$MOTIVO"
echo ""

echo "── app → GitHub Pages ──────────────────────────────"
if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A
  git commit -q -m "$MOTIVO"
fi
git push -q origin main
git subtree push --prefix app origin gh-pages
echo ""

echo "── a confirmar que o backend novo responde ─────────"
sleep 3
curl -sL "https://script.google.com/macros/s/$DEPLOYMENT/exec"
echo ""
echo ""
echo "Pronto. https://maver1967.github.io/financas-escolinhas/"
echo "Nos telemóveis a versão nova entra ao reabrir a app."
