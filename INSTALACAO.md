# Finanças Escolinhas — Fasi 1-5: installazione

La fase 1 contiene configurazione, alunni, encarregados e sconti. La fase 2 aggiunge le cobranças, lo schermo Receber, l'alocação, il crédito, le ricevute e i messaggi. La fase 3 aggiunge le spese con il comprovativo, i conti, le transferências e il fecho de caixa. La fase 4 aggiunge gli otto report, con stampa ed esportazione. La fase 5 aggiunge la e-Mola: gli SMS dei pagamenti entrano da soli. Il foglio ha i 20 fogli previsti dalla specifica più `Pagamentos_eMola`, che la fase 5 aggiunge.

```
financas-escolinhas/
├── backend/Code.gs        → Apps Script legato al Google Sheet
├── app/                   → PWA da pubblicare su GitHub Pages
│   ├── index.html, app.js, style.css
│   ├── manifest.json, sw.js
│   └── icon-192.png, icon-512.png
├── test/                  → collaudo in locale (facoltativo)
└── INSTALACAO.md
```

Servono circa 30 minuti. L'ordine conta: l'ID client Google serve sia allo script sia all'app.

## Provarla prima, senza installare niente

Con [Node.js](https://nodejs.org) sul computer:

```
node test/demo.js
```

Poi apri **http://localhost:8787**. L'app si apre già aperta come amministratore, con una rete finta ma completa: cinque escolinhas, quindici alunni (uno entrato a metà anno, tre scontati, uno esente), famiglie con più figli, mensilità già scadute, pagamenti parziali, un anticipo che resta in crédito, una ricevuta anullata, le spese del mese, un versamento in banca e un fecho de caixa con 150 MT che mancano.

Serve per vedere tutti gli schermi con dati veri prima di decidere. Un paio di cose da provare:

- **Receber** → cerca `cossa`: è la famiglia con quattro educandi, si vede come il pagamento si ripartisce fra i fratelli dal debito più vecchio.
- **Receber** → cerca `Teresa`: ha 5 000 MT di crédito da un anticipo, e si vede come si usano.
- **Relatórios → Mapa de mensalidades**: la griglia colorata di tutta la rete.
- **Relatórios → Situação devedora**: in arancione i cinque alunni **senza responsabile finanziario**.
- **Relatórios → Exportar**: scarica il CSV e aprilo in Excel.
- **La barra delle scuole in alto**: un bottone per scuola e **Todas** in rosso. Filtra tutte le schermate; sul telefono scorre di lato e la scuola scelta si mette al centro.
- **e-Mola**: ci sono sei SMS finti, uno per ogni caso — due entrati da soli col codice dell'alunno, uno riconosciuto solo dal telefono, uno da collegare a mano, uno incomprensibile e uno da un mittente falso messo di lato.

I dati stanno solo nella memoria del computer: quando fermi il server con `Ctrl+C` spariscono, e rilanciando il comando ricominci da capo. Niente di questo tocca Google.

## 1. Il foglio e lo script

1. In Google Drive crea un nuovo Google Sheet chiamato **Finanças Escolinhas**.
2. *Extensões → Apps Script*. Cancella il contenuto di `Código.gs` e incolla tutto `backend/Code.gs`. Salva.
3. *Impostazioni progetto* (l'ingranaggio) → spunta **Mostra il file manifest appsscript.json**. Torna all'editor, apri `appsscript.json` e incolla tutto `backend/appsscript.json`. Salva.

   Questo passo **non è facoltativo**: dichiara i permessi che servono. Senza, Google non chiede quello per le richieste esterne, e il login fallisce con *«Não tem autorização para chamar UrlFetchApp.fetch»* — un errore che si vede solo al primo tentativo di accesso, non durante l'installazione.
4. Dal menu delle funzioni scegli **instalar** e premi *Executar*. Google chiede le autorizzazioni: foglio, Drive per i backup e per i comprovativi delle spese, **connessione a un servizio esterno** per verificare il login, trigger.
5. Torna al foglio: devono esserci 21 fogli. Il tuo indirizzo è già in `Utilizadores` come amministratore. Le 5 scuole, l'anno 2027 (febbraio–novembre), le categorie, i tipi di cobrança e i conti sono già caricati.

`instalar()` si può rieseguire senza danni: non duplica nulla, aggiunge solo eventuali colonne mancanti.

## 2. L'ID client per il login Google

1. Apri [console.cloud.google.com](https://console.cloud.google.com) e crea un progetto, per esempio *Financas Escolinhas*.
2. *Google Auth Platform → Branding*: nome dell'app, la tua email di assistenza, salva.
3. *Audience*: tipo **External**, poi **Pubblica l'app** (in produzione). Con i soli dati di base (email e nome) Google non chiede verifiche.
4. *Clients → Create client*: tipo **Web application**. In *Authorized JavaScript origins* aggiungi `https://maver1967.github.io` (solo il dominio, senza percorso).
5. Copia il **Client ID** (finisce con `.apps.googleusercontent.com`).
6. Incollalo in `Code.gs`, nella riga `GOOGLE_CLIENT_ID`, e salva.

## 3. Pubblicare lo script come app web

1. Nell'editor Apps Script: *Implementar → Nova implementação → App da Web*.
2. *Executar como*: **Eu**. *Quem tem acesso*: **Qualquer pessoa**.
3. Copia l'URL che finisce con `/exec`.

L'URL è pubblico, ma senza una sessione valida lo script risponde solo con un errore. Una sessione si ottiene unicamente con il login Google di un'email presente in `Utilizadores`.

Per gli aggiornamenti futuri usa sempre *Gerir implementações → Editar → Nova versão*: così l'URL resta lo stesso.

## 4. Configurare e pubblicare l'app

1. In `app/app.js`, in cima al file, compila le due righe:
   ```js
   API_URL: 'https://script.google.com/macros/s/…/exec',
   GOOGLE_CLIENT_ID: '….apps.googleusercontent.com',
   ```
2. Su GitHub crea un repository, per esempio `financas-escolinhas`, e carica il **contenuto** della cartella `app/` nella radice.
3. *Settings → Pages*: sorgente *Deploy from a branch*, ramo `main`, cartella `/ (root)`.
4. Dopo un minuto l'app è su `https://maver1967.github.io/financas-escolinhas/`.

Sul telefono, apri l'indirizzo in Chrome e scegli *Adicionar ao ecrã inicial*: si installa come un'app.

## 5. Primo accesso

1. Entra con il tuo account Google.
2. In **Início** compare l'elenco di ciò che manca: i prezzi di matrícula e mensalidade per ogni scuola.
3. *Configuração → Preços*: inserisci i 10 prezzi (2 per scuola) per il 2027.
4. *Configuração → Utilizadores*: aggiungi gli altri operatori con la loro email Google e il ruolo *Operador*.
5. *Configuração → Contas*: correggi nomi, tipo e saldo iniziale dei conti, se servono.

Gli alunni si possono inserire quando volete. Il codice viene assegnato in automatico: B001, M001, N001, C001, S001…

Appena un alunno è iscritto, l'app gli crea da sola la matrícula e le mensalità dal mese di entrata fino a novembre, ai prezzi della sua scuola. Perché funzioni, i prezzi dell'anno devono già essere in *Configuração → Preços*: senza prezzo l'alunno resta senza cobranças e il riepilogo della generazione lo segnala.

## Cosa fa già la fase 1

| Area | Funzioni |
| --- | --- |
| Alunos | Iscrizione, codice automatico per scuola, cambio di scuola che conserva il codice, ricerca per nome, codice, encarregado o telefono, filtro per stato |
| Encarregados | Anagrafica, telefono normalizzato a 9 cifre, avviso se il telefono esiste già, collegamento a più figli, pulsanti chiama e WhatsApp |
| Collegamenti | Parentela, un solo responsabile finanziario e un solo contatto principale per alunno |
| Descontos | In percentuale o valore fisso, per tipo di cobrança o tutti, per intervallo di mesi; solo l'amministratore li concede |
| Configuração | Scuole, anni, tipi di cobrança, prezzi, categorie a due livelli, conti, multe (disattivate), utenti |
| Sicurezza | Login Google, sessione di 30 giorni, ruoli admin e operador, registro di ogni modifica in `Auditoria` |
| Backup | Ogni notte alle 2 una copia del foglio nella cartella Drive *Backups Finanças Escolinhas*; restano le ultime 30, più una copia permanente il primo di ogni mese |
| Offline | L'app si apre e si consulta senza rete; gli alunni e la configurazione si salvano solo online, i pagamenti anche offline |

## Cosa fa già la fase 2

| Area | Funzioni |
| --- | --- |
| Cobranças | Matrícula e mensalità create all'iscrizione dal mese di entrata; generazione annuale con riepilogo da confermare prima di scrivere; sconti applicati alla generazione; isenção totale come sconto del 100% |
| Uscita dell'alunno | Le cobranças future ancora aperte e senza pagamenti si anullano da sole, con il motivo |
| Prezzi cambiati | *Ricalcolo* delle sole cobranças aperte e senza pagamenti, con anteprima |
| Receber | Ricerca per codice alunno, nome o telefono; debiti di tutti i figli; proposta di ripartizione dalle più vecchie; valori correggibili a mano; pagamento parziale e anticipato |
| Crédito | Quello che avanza resta a favore della famiglia e si usa sulle cobranças successive, anche nella stessa operazione |
| Ricevute | Numero `REC-AAAA-NNNNN` unico per tutta la rete, due copie per foglio A4, ristampa con la scritta ANULADO |
| Link della ricevuta | Pagina di sola lettura con un codice difficile da indovinare, senza dati di altre famiglie |
| Messaggi | WhatsApp con tre modelli: ricevuta, promemoria ed estratto; ogni invio resta in `Mensagens` |
| Multe | Comando pronto; non calcola nulla finché la regola dell'anno è `ativa = não` |
| Anulações | Ricevute e cobranças si anullano con motivo, mai si cancellano; i debiti si ricalcolano da soli |
| Coda offline | Senza rete il pagamento resta nel telefono con un numero provvisorio e parte da solo quando torna la connessione; un reinvio non crea due ricevute |

## Cosa fa già la fase 3

| Area | Funzioni |
| --- | --- |
| Despesas | Modulo corto: **data, valore, categoria, scuola, comprovativo**. La categoria e la sottocategoria stanno in una sola tendina (le figlie indentate sotto la loro). La scuola parte da *Todas (despesa comum da rede)* e si cambia dalla stessa tendina |
| Conto della spesa | Non è un campo: la spesa esce sempre dalla **caixa comum in numerário**, e sotto il modulo c'è scritto da dove esce e quanto resta. Per una spesa pagata dalla banca o per e-Mola, si registra e poi si corregge in *Caixa e contas* con una transferência |
| Comprovativo | Foto dal telefono o PDF; l'app la rimpicciolisce prima di inviarla e la salva in Drive in una cartella per anno e mese |
| Elenco | Filtri per mese, categoria e scuola, ricerca su descrizione, fornitore e documento, totale del filtro |
| Contas | Saldo di ogni conto calcolato dai movimenti, estratto mensile con saldo progressivo, entrate e uscite del mese |
| Transferências | Versamenti in banca e passaggi fra conti; propone caixa → banco, che è il caso di tutti i mesi |
| Caixa negativa | Se una spesa o una transferência manda la cassa sotto zero, l'app lo dice prima e chiede conferma |
| Fecho de caixa | Si conta il contante e l'app mostra subito quanto manca o quanto sopra; resta lo storico con chi ha contato |
| Anulações | Spese e transferências si anullano con motivo; i saldi si rifanno da soli |
| Coda offline | Anche spese e transferências stanno in coda; il saldo sullo schermo le conta già, così il numero corrisponde al denaro in cassa |

## Cosa fa già la fase 4

Gli otto report della specifica, tutti con **Imprimir** e **Exportar**:

| Report | Cosa mostra |
| --- | --- |
| Situação devedora | Ogni famiglia con quanto deve, quanto è già scaduto, da quando, e il bottone del promemoria WhatsApp. Segnala in arancione gli alunni **senza responsabile finanziario**, che altrimenti non compaiono in nessuna lista |
| Extrato do encarregado | Conto completo di una famiglia: ogni cobrança con sconto, multa, pagato e residuo, più tutte le ricevute |
| Mapa de mensalidades | Griglia alunni × mesi, verde pagata, giallo parziale, rosso in ritardo, con l'importo residuo nella cella |
| Balancete mensal | Entrate e uscite del mese per categoria, più il riepilogo per scuola e il risultato |
| Fluxo de caixa | Per ogni conto: saldo iniziale, entrate, uscite, saldo finale nel periodo |
| Previsto vs recebido | Per scuola e mese: quanto si doveva incassare, quanto è entrato, la percentuale |
| Descontos e isenções | Quanto ogni scuola rinuncia, per quale alunno e con quale motivo |
| Recibos emitidos | Tutte le ricevute in ordine di numero, con le anulações e il **controllo dei buchi nella numerazione** |

I report si calcolano **nel telefono**, dai movimenti già sincronizzati: si aprono anche senza rete. In fondo a ogni report c'è scritto se i dati sono aggiornati.

**Esportazione**: il bottone *Exportar* scarica un `.csv` con il separatore punto e virgola e il segno UTF-8 davanti, così Excel lo apre con le colonne giuste e gli accenti giusti, con un doppio clic e senza procedure di importazione. I numeri hanno la virgola decimale.

**Stampa**: *Imprimir* lascia sul foglio solo il report, con data e scuola in alto, e ripete l'intestazione della tabella su ogni pagina.

## Cosa fa già la fase 5 (e-Mola)

Un telefono Android con il SIM che riceve gli SMS della e-Mola, con Tasker, inoltra ogni SMS all'app. Lo schermo **e-Mola** mostra la coda; il numero arancione nel menu dice quanti aspettano.

| Livello | Quando | Cosa succede |
| --- | --- | --- |
| 1 | Nel *Conteúdo* c'è il codice dell'alunno (`B014`, anche più d'uno: `B014 B015`) | Si registra **da solo**: ricevuta emessa, debiti più vecchi coperti per primi, SMS di conferma in coda |
| 2 | Nessun codice, ma il telefono di chi paga è in `Encarregados` | Resta **in attesa di un clic**: l'app propone la famiglia, l'operatore conferma |
| 3 | Né codice né telefono riconosciuti | Resta **da collegare a mano**: l'operatore cerca la famiglia e conferma |

Regole che non si piegano:

- **Un SMS non si perde mai.** Anche quello che l'app non capisce resta in `Pagamentos_eMola` con il testo originale e il motivo. *Tentar de novo* lo rilegge dopo che hai corretto l'anagrafica.
- **Lo stesso ID transazione non genera due ricevute**, nemmeno se il telefono rimanda lo stesso SMS, e nemmeno se il pagamento era già stato registrato a mano.
- **Solo gli SMS della operadora contano.** Un SMS da un altro numero viene messo di lato: è la difesa contro i pagamenti falsi. I mittenti accettati sono in `CONFIG.EMOLA_REMETENTES`.
- **Si registra da solo solo il livello 1.** Il telefono da solo non basta: ci vuole un essere umano.

### Collegare il telefono

*e-Mola → Ver a chave do aparelho* mostra l'indirizzo e la **chiave**, con il testo pronto da incollare in Tasker. La chiave identifica il telefono: chi ce l'ha può mandare SMS dentro l'app, quindi non va messa altrove. Si può rinnovare da lì.

Due tarefas in Tasker: una sul profilo *Received Text* con mittente `*e-Mola*`, che fa un POST con `action: "sms"`; una ogni 5 minuti che chiede `smsPendentes`, manda gli SMS e risponde `smsEnviado`.

### Prima di fidarsi

Fai **un pagamento di prova con `*898#` e uno con l'app e-Mola**. I due SMS compaiono nello schermo e-Mola in ogni caso, anche se l'app non li capisce, e lì vedi il testo esatto. Se la lettura sbaglia, si aggiustano i `EMOLA_PADROES` in cima alla sezione fase 5 di `Code.gs`: sono espressioni regolari con un commento che spiega cosa cerca ognuna, e non c'è altro da toccare.

Il fecho de caixa **non cambia il saldo**: registra la conta e la differenza, e sta all'operatore trovare l'errore. La specifica fissa 20 fogli, quindi la registrazione del fecho sta in `Auditoria`, che già conserva data, operatore e il prima/dopo di tutto il resto.

I comprovativi **non sono pubblici**: il file in Drive viene condiviso in sola lettura con gli indirizzi presenti in `Utilizadores` con *ativo = sim*. Chi viene aggiunto dopo non vede le foto già caricate; in quel caso si condivide la cartella a mano.

## Aggiornare l'app

Quando cambi i file su GitHub, modifica anche la riga `var CACHE = 'fe-v8'` in `sw.js`, per esempio `fe-v9`. Così i telefoni scaricano la nuova versione.

## Collaudo in locale (facoltativo)

Con Node.js installato:

```
node test/backend.test.js        # 43 controlli sulle regole della fase 1
node test/fase2.test.js          # 115 controlli su cobranças, pagamenti, crédito e ricevute
node test/fase3.test.js          # 81 controlli su spese, conti, transferências e fecho
node test/fase5.test.js          # 89 controlli sulla lettura degli SMS e sull'abbinamento
node test/dev_server.js          # app + backend simulato, vuoto
node test/demo.js                # lo stesso, ma già pieno di dati da provare
```

I report non hanno un file di prova a parte: si calcolano nell'app, e `ui_test.py` controlla che i loro numeri quadrino fra loro e con gli schermi (il dovuto del report = la somma delle schede famiglia; previsto meno recebido = il dovuto; il fluxo chiude sui saldi dei conti).

Con `dev_server.js` in esecuzione, `python3 test/ui_test.py` ripercorre l'interfaccia in un browser vero e lascia gli screenshot in `test/shots` (serve `pip install playwright`; con `PW_CHROME` si indica un Chromium già installato).

L'ultima prova di `fase2.test.js` rifà i conti su tutte le righe: ogni stato di cobrança deve corrispondere alle alocações, nessuna cobrança può ricevere più di quanto deve e nessuna ricevuta può allocare più di quanto ha incassato. Quella di `fase3.test.js` fa lo stesso con i conti: per ognuno, saldo iniziale più tutto quello che è valido deve dare il saldo che l'app mostra.

## Problemi comuni

| Sintomo | Causa probabile |
| --- | --- |
| Il pulsante Google non compare | Client ID mancante in `app.js`, oppure dominio non inserito tra le *Authorized JavaScript origins* |
| "Token emitido para outra aplicação" | Il Client ID in `Code.gs` è diverso da quello in `app.js` |
| "O utilizador … não tem acesso" | L'email non è in `Utilizadores` o è con *ativo = não* |
| "Falta a folha …" | `instalar()` non è stato eseguito sul foglio giusto |
| Modifiche allo script senza effetto | È stata creata una nuova implementazione invece di una *Nova versão* della stessa |
| "Não tem autorização para chamar UrlFetchApp.fetch" | Manca `appsscript.json`, o l'autorizzazione è quella vecchia. Incolla il manifest, poi revoca l'accesso in [myaccount.google.com/permissions](https://myaccount.google.com/permissions), riesegui `instalar` e accetta di nuovo: Google non richiede i permessi se crede di averli già dati |
| "Token emitido para outra aplicação" al login | Il `Code.gs` nell'editor è una versione vecchia, senza l'ID client. Ricopialo e rifai una *Nova versão* |
| L'alunno non ha cobranças | Mancava il prezzo della sua scuola quando è stato iscritto: metti il prezzo e usa *Configuração → Cobranças → Ver o que falta* |
| Lo sconto non si vede sulle cobranças | Lo sconto è arrivato dopo la generazione: *Configuração → Cobranças → Ver o que muda* ricalcola quelle ancora aperte e senza pagamenti |
| "A cobrança … só tem X MT por pagar" | Qualcun altro ha già incassato quella quota: sincronizza e rifai la ripartizione |
| Pagamento in coda che non parte | Resta in coda finché non c'è rete; se il server lo rifiuta esce dalla coda e appare fra i *lançamentos recusados* in Início |
| La spesa è uscita dalla cassa ma l'ho pagata in banca | Il modulo corto manda tutto sulla caixa comum: registra una transferência dalla banca alla cassa per pareggiare, oppure anulla la spesa e rifalla con l'API |
| "A Caixa comum tem … o saldo fica negativo" | La cassa non ha abbastanza contante: o manca un incasso da registrare, o la spesa va su un altro conto. Si può confermare lo stesso se il lancio è fuori ordine |
| La foto del comprovativo non si carica | Senza rete la spesa si salva ma la foto no: salvala e aggiungi il comprovativo con una spesa corretta quando c'è linea |
| Un operatore non vede i comprovativi | È stato aggiunto a `Utilizadores` dopo il caricamento: condividi con lui la cartella *Comprovativos Finanças Escolinhas* in Drive |
| Il report non corrisponde a quello che vedo | I report usano i dati scaricati sul telefono: tocca il pallino in alto a destra per sincronizzare e riaprilo |
| "Faltam números na sequência" nei recibos | Una ricevuta è stata cancellata a mano dal foglio. Le ricevute si anullano, non si cancellano: cerca la riga nei backup |
| Excel apre il CSV tutto in una colonna | Il computer non usa il punto e virgola come separatore: apri Excel, *Dati → Da testo*, e scegli `;` |
| Gli SMS della e-Mola non arrivano | Controlla in Tasker che il profilo sia attivo e che la chiave sia quella giusta: se è stata rinnovata, il telefono ha quella vecchia |
| "Chave do aparelho inválida" | La chiave nel Tasker non è più quella dell'app: riaprila in *e-Mola → Ver a chave* e ricopiala |
| Un pagamento vero finisce in *Não se percebeu* | L'SMS ha una forma che i `EMOLA_PADROES` non coprono: apri *Ver o SMS como chegou*, copia il testo e aggiusta l'espressione |
| Un SMS vero è finito *De lado* | Il mittente non è fra quelli accettati: aggiungilo a `CONFIG.EMOLA_REMETENTES` e usa *Tentar de novo* |
