#!/bin/bash
# Publica a app em GitHub Pages.
#   ./publicar.sh            → envia o código e actualiza o site
# O ramo main guarda o projecto todo; o ramo gh-pages só o conteúdo de app/,
# que é o que o GitHub Pages serve.
set -e
cd "$(dirname "$0")"

CONTA="maver1967"
REPO="financas-escolinhas"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "A criar o repositório $CONTA/$REPO…"
  gh repo create "$REPO" --public --source=. --remote=origin --push \
    --description "Gestão financeira das escolinhas de Maxixe"
else
  git push -u origin main
fi

echo "A publicar o conteúdo de app/ no ramo gh-pages…"
git subtree push --prefix app origin gh-pages

echo "A ligar o GitHub Pages…"
gh api -X POST "repos/$CONTA/$REPO/pages" \
  -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 \
  || gh api -X PUT "repos/$CONTA/$REPO/pages" \
       -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 \
  || echo "  (já estava ligado)"

echo ""
echo "Pronto: https://$CONTA.github.io/$REPO/"
echo "O primeiro arranque pode demorar um minuto."
