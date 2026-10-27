# Dove siamo — 27 ottobre 2026

## Fatto

- **App completa**, fasi 1-5, 336 prove automatiche verdi
- **Pubblicata** su https://maver1967.github.io/financas-escolinhas/
- **Codice** su https://github.com/maver1967/financas-escolinhas
- **Foglio Google** creato, `instalar()` eseguito, 21 schede a posto
- **ID client Google** creato e già dentro `backend/Code.gs` e `app/app.js`
- **Apps Script** distribuito, URL `/exec` ottenuto (vedi sotto)

## Mancano quattro gesti nel browser

L'URL del backend:
```
https://script.google.com/macros/s/AKfycbzK6AGPaRwl8K0aHDJUCH1T0J3HgiB8hL7DBS8gkWXBebGQJzM6SDknn7gvGP3lbWJuaQ/exec
```

1. **Revoca** l'accesso di «Progetto senza titolo» su
   https://myaccount.google.com/permissions
2. **Incolla il Code.gs aggiornato** nell'editor Apps Script
   (`pbcopy < backend/Code.gs`, poi Cmd+A Cmd+V Cmd+S).
   La riga 14 deve finire con `sojas71.apps.googleusercontent.com`,
   non con `COLAR-AQUI`.
3. **Esegui `instalar`** e accetta le autorizzazioni. Nell'elenco deve
   esserci «Connettersi a un servizio esterno»: è quella che mancava.
4. **Gestisci deployment** → matita → *Nuova versione* → distribuisci.

## Come si verifica che è a posto

```
curl -sL -H "Content-Type: text/plain" \
  -d '{"action":"login","idToken":"falso"}' \
  "https://script.google.com/macros/s/AKfycbzK6AGPaRwl8K0aHDJUCH1T0J3HgiB8hL7DBS8gkWXBebGQJzM6SDknn7gvGP3lbWJuaQ/exec"
```

- `Token Google inválido` → **a posto**, si può mettere l'URL in `app.js`
- `Não tem autorização para chamar UrlFetchApp.fetch` → l'autorizzazione
  è ancora quella vecchia, rifare i passi 1 e 3

## Poi

- Mettere l'URL `/exec` in `app/app.js` (riga `API_URL`)
- `./publicar.sh`
- L'app è viva

## Rimasto in sospeso

- **Pubblicazione OAuth**: l'app è in modalità *Test*. Il pulsante
  «Pubblica app» è disattivato perché la pagina *Branding* è incompleta.
  Non è urgente: aggiungendo gli operatori come **utenti di prova**
  (fino a 100) entrano lo stesso.
- **clasp**: da valutare, permetterebbe di caricare il codice e fare i
  deployment da riga di comando, senza più toccare l'editor.

## Per provare l'app intanto

```
node test/demo.js
```
http://localhost:8787 — rete finta completa, nessun Google di mezzo.
