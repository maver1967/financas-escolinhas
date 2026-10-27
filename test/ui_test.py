# Prova dell'interfaccia: python3 test/ui_test.py (con dev_server.js in esecuzione)
import sys, os, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent
TOKEN = (ROOT / '.token').read_text().strip()
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'shots')
OUT.mkdir(exist_ok=True)
errors = []
fails = []

def check(label, cond):
    if not cond:
        fails.append(label); print('FALLITO:', label)

with sync_playwright() as p:
    # PW_CHROME aponta para o Chromium quando não é o que o playwright instala
    exe = os.environ.get('PW_CHROME', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome')
    b = p.chromium.launch(**({'executable_path': exe} if os.path.exists(exe) else {}))
    pg = b.new_page(viewport={'width': 1280, 'height': 860})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'gsi' not in m.text else None)
    pg.add_init_script("localStorage.setItem('fe_token', JSON.stringify('%s'))" % TOKEN)
    pg.goto('http://localhost:8787/#/inicio')
    pg.wait_for_selector('.cards .card')
    check('5 schede scuole', pg.locator('.cards .card').count() == 5)
    check('todo prezzi', pg.locator('.todo li').count() == 10)
    pg.screenshot(path=str(OUT / '1_inicio.png'), full_page=True)

    # prezzo mensalità Barrane
    pg.goto('http://localhost:8787/#/config/TabelaPrecos')
    pg.click('text=+ Novo')
    pg.select_option('.sub-panel select >> nth=1', 'B')
    pg.select_option('.sub-panel select >> nth=2', 'MENSALIDADE')
    pg.fill('.sub-panel input[type=number] >> nth=0', '1500')
    pg.click('.sub-panel >> text=Guardar')
    pg.wait_for_selector('.tbl td:has-text("1500,00 MT")')
    pg.screenshot(path=str(OUT / '2_precos.png'), full_page=True)

    # nuovo alunno
    pg.goto('http://localhost:8787/#/aluno/novo')
    pg.fill('.form input >> nth=0', 'Ana Maria Cossa')
    pg.select_option('.form select >> nth=0', 'B')
    pg.fill('.form input >> nth=1', 'Sala Girassol')
    pg.click('text=Guardar aluno')
    pg.wait_for_selector('.big-code:has-text("B001")')
    check('codice B001', pg.locator('.big-code').inner_text() == 'B001')

    # nuovo encarregado collegato
    pg.fill('.link-opts input[type=text]', 'Mãe')
    pg.click('text=+ Novo encarregado')
    sub = pg.locator('.novo-enc')
    sub.locator('input >> nth=0').fill('Maria Cossa')
    sub.locator('input >> nth=1').fill('84 123 4567')
    sub.locator('text=Criar e ligar').click()
    pg.wait_for_selector('.link-row a:has-text("Maria Cossa")')
    check('responsabile finanziario spuntato', pg.locator('.link-row input[type=checkbox] >> nth=0').is_checked())
    pg.screenshot(path=str(OUT / '3_aluno.png'), full_page=True)

    # sconto
    pg.click('text=+ Novo desconto')
    pg.fill('.sub-panel input[type=number]', '50')
    pg.fill('.sub-panel input >> nth=-2', 'Irmãos')
    pg.click('text=Guardar desconto')
    pg.wait_for_selector('.link-row strong:has-text("50%")')

    # ── fase 2 ──────────────────────────────────────────────
    # lo sconto e' arrivato dopo l'iscrizione: le cobranças esistono gia'
    # al prezzo pieno e vanno ricalcolate, come nella vita reale.
    pg.goto('http://localhost:8787/#/aluno/B001')
    pg.wait_for_selector('text=Situação financeira')
    sit = pg.locator('.panel', has=pg.locator('h2:text("Situação financeira")'))
    check('11 cobranças alla iscrizione', sit.locator('tbody tr').count() == 11)
    check('debito 16.000 MT', '16 000,00 MT' in sit.locator('.numeros').inner_text())
    pg.screenshot(path=str(OUT / '8_situacao_aluno.png'), full_page=True)

    pg.goto('http://localhost:8787/#/config/Cobrancas')
    pg.click('text=Ver o que muda')
    pg.wait_for_selector('text=mudam de valor')
    pg.click('text=Aplicar a')
    # l'avviso resta nel toast: il ricalcolo fa risincronizzare e ridisegna lo schermo
    pg.wait_for_selector('#toast.show:has-text("actualizadas")')
    pg.goto('http://localhost:8787/#/aluno/B001')
    pg.wait_for_selector('text=Situação financeira')
    sit = pg.locator('.panel', has=pg.locator('h2:text("Situação financeira")'))
    check('sconto 50% applicato al ricalcolo', '8 500,00 MT' in sit.locator('.numeros').inner_text())

    # ricevere un pagamento
    pg.goto('http://localhost:8787/#/receber')
    pg.fill('.search.grande', 'cossa')
    pg.wait_for_selector('.result.familia')
    check('famiglia trovata con il debito', '8 500,00 MT' in pg.locator('.result.familia').inner_text())
    pg.click('.result.familia')
    pg.wait_for_selector('.valor-grande')
    pg.fill('.valor-grande', '2000')
    pg.wait_for_timeout(200)
    righe = pg.locator('.aloc-tbl tbody tr')
    check('proposta sulle piu' + chr(39) + ' vecchie', righe.nth(0).locator('input').input_value() == '1000')
    check('resto sulla seconda', righe.nth(1).locator('input').input_value() == '750')
    pg.screenshot(path=str(OUT / '9_receber.png'), full_page=True)
    pg.once('dialog', lambda d: d.accept())
    pg.click('text=Confirmar e emitir recibo')
    pg.wait_for_selector('.recibo')
    check('numero del recibo', 'REC-' in pg.locator('h1').inner_text())
    check('due copie per foglio', pg.locator('.recibo').count() == 2)
    check('debito residuo nel recibo', '6 500,00 MT' in pg.locator('.recibo').first.inner_text())
    pg.screenshot(path=str(OUT / '10_recibo.png'), full_page=True)

    # coda offline: senza rete il pagamento resta nel telefono
    pg.goto('http://localhost:8787/#/receber/E0001')
    pg.wait_for_selector('.valor-grande')
    pg.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true})")
    pg.fill('.valor-grande', '500')
    pg.wait_for_timeout(200)
    pg.once('dialog', lambda d: d.accept())
    pg.click('text=Confirmar e emitir recibo')
    pg.wait_for_selector('.panel.aviso')
    check('pagamento in coda', pg.evaluate("JSON.parse(localStorage.getItem('fe_fila')||'[]').length") == 1)
    check('avviso della coda', 'por enviar' in pg.locator('.panel.aviso').inner_text())
    pg.screenshot(path=str(OUT / '11_fila_offline.png'), full_page=True)
    pg.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true})")
    pg.evaluate("flushFila().then(()=>sincronizar(true))")
    pg.wait_for_function("JSON.parse(localStorage.getItem('fe_fila')||'[]').length===0")
    check('coda svuotata senza doppioni', pg.evaluate("rows('Recebimentos').length") == 2)
    check('nessun pagamento rifiutato', pg.evaluate("JSON.parse(localStorage.getItem('fe_fila_erros')||'[]').length") == 0)

    # ── fase 3: spese e cassa ───────────────────────────────
    # saldo iniziale nella cassa comune, per poter spendere
    pg.goto('http://localhost:8787/#/config/Contas')
    pg.click('.tbl tbody tr:has-text("Caixa comum")')
    pg.fill('.sub-panel input[type=number] >> nth=0', '20000')
    pg.fill('.sub-panel input[type=date]', '2020-01-01')
    pg.click('.sub-panel >> text=Guardar')
    pg.wait_for_selector('#toast.show')

    # sottocategoria di spesa
    pg.goto('http://localhost:8787/#/config/Categorias')
    pg.click('text=+ Novo')
    pg.fill('.sub-panel input >> nth=0', 'DES_ALIM_ARROZ')
    pg.fill('.sub-panel input >> nth=1', 'Arroz')
    pg.select_option('.sub-panel select >> nth=0', 'despesa')
    pg.select_option('.sub-panel select >> nth=1', 'DES_ALIM')
    pg.click('.sub-panel >> text=Guardar')
    pg.wait_for_selector('.tbl td:has-text("Arroz")')

    # il pagamento della fase 2 e' gia' entrato in cassa: si parte da li'
    pg.goto('http://localhost:8787/#/caixa')
    pg.wait_for_selector('.card.conta')
    saldo0 = pg.evaluate("saldoDaConta('CX_COMUM')")
    check('il recibo in numerario e\' entrato in cassa (%s)' % saldo0, saldo0 == 22000)

    # il modulo della spesa ha solo cinque voci
    pg.goto('http://localhost:8787/#/despesas')
    pg.click('text=+ Nova despesa')
    pg.wait_for_selector('#slot-despesa .valor-grande')
    sub = pg.locator('#slot-despesa')
    etichette = sub.locator('.field label').all_inner_texts()
    check('cinque campi e basta: %s' % etichette,
          [e.replace(' *', '') for e in etichette] ==
          ['Data', 'Valor (MT)', 'Categoria', 'Escola', 'Comprovativo (foto ou PDF)'])
    check('la scuola parte da Todas', sub.locator('select').nth(1).input_value() == 'REDE')
    check('ma le scuole restano a disposizione', sub.locator('select').nth(1).locator('option').count() == 6)
    check('il conto da cui esce il denaro resta scritto',
          'Caixa comum' in sub.locator('p').first.inner_text())
    # categoria e sottocategoria in una sola tendina
    opzioni = sub.locator('select').nth(0).locator('option').all_inner_texts()
    check('le sottocategorie sono indentate sotto la loro', any('↳ Arroz' in o for o in opzioni), opzioni)
    sub.locator('select').nth(0).select_option('DES_ALIM>DES_ALIM_ARROZ')
    sub.locator('.valor-grande').fill('1200')
    pg.screenshot(path=str(OUT / '12_nova_despesa.png'), full_page=True)
    pg.once('dialog', lambda d: d.accept())
    sub.locator('text=Guardar despesa').click()
    pg.wait_for_selector('#toast.show:has-text("registada")')
    check('spesa in lista', pg.locator('.tbl tbody tr').count() == 1)
    check('senza descrizione prende il nome della sottocategoria',
          pg.evaluate("rows('Despesas')[0].descricao") == 'Arroz')
    check('e tiene categoria e sottocategoria',
          pg.evaluate("rows('Despesas')[0].categoria") == 'DES_ALIM' and
          pg.evaluate("rows('Despesas')[0].subcategoria") == 'DES_ALIM_ARROZ')
    check('la spesa e comune alla rete', pg.evaluate("rows('Despesas')[0].escola") == 'REDE')
    check('totale del mese', '1200,00 MT' in pg.locator('.count').inner_text())
    pg.screenshot(path=str(OUT / '13_despesas.png'), full_page=True)

    # conti: il saldo scende
    pg.goto('http://localhost:8787/#/caixa')
    pg.wait_for_selector('.card.conta')
    check('saldo della cassa dopo la spesa', pg.evaluate("saldoDaConta('CX_COMUM')") == saldo0 - 1200)
    pg.screenshot(path=str(OUT / '14_caixa.png'), full_page=True)

    # transferência cassa -> banca
    pg.click('text=Nova transferência')
    pg.wait_for_selector('#slot-caixa .valor-grande')
    tr = pg.locator('#slot-caixa')
    check('propone cassa verso banca', tr.locator('select').nth(0).input_value() == 'CX_COMUM')
    tr.locator('.valor-grande').fill('5000')
    tr.locator('input[type=text]').fill('Depósito de Outubro')
    pg.once('dialog', lambda d: d.accept())
    tr.locator('text=Registar transferência').click()
    pg.wait_for_selector('#toast.show:has-text("registada")')
    pg.wait_for_selector('.card.conta')
    check('saldo dopo il versamento', pg.evaluate("saldoDaConta('CX_COMUM')") == saldo0 - 6200)

    # fecho de caixa con differenza
    pg.click('text=Fecho de caixa')
    pg.wait_for_selector('#slot-caixa .valor-grande')
    fe = pg.locator('#slot-caixa')
    # si contano 250 MT in meno di quello che dice l'app
    fe.locator('.valor-grande').fill(str(saldo0 - 6200 - 250))
    pg.wait_for_timeout(200)
    check('mostra quanto manca', 'Falta' in fe.locator('.resumo-aloc').inner_text())
    check('mostra la differenza esatta', '250,00 MT' in fe.locator('.resumo-aloc').inner_text())
    pg.screenshot(path=str(OUT / '15_fecho_caixa.png'), full_page=True)
    fe.locator('text=Registar o fecho').click()
    pg.wait_for_selector('#toast.show:has-text("faltam")')
    check('il fecho non tocca il saldo', pg.evaluate("saldoDaConta('CX_COMUM')") == saldo0 - 6200)

    # estratto del conto, con saldo progressivo
    pg.goto('http://localhost:8787/#/caixa/CX_COMUM')
    pg.wait_for_selector('.numeros')
    check('estratto: entrate e uscite', 'Saiu' in pg.locator('.numeros').inner_text())
    check('estratto: recibo, spesa e transferência', pg.locator('tbody tr').count() == 3)
    pg.screenshot(path=str(OUT / '16_movimentos.png'), full_page=True)

    # coda offline per le spese
    pg.goto('http://localhost:8787/#/despesas')
    pg.click('text=+ Nova despesa')
    pg.wait_for_selector('#slot-despesa .valor-grande')
    pg.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true})")
    sub = pg.locator('#slot-despesa')
    sub.locator('select').nth(0).select_option('DES_ALIM')
    sub.locator('.valor-grande').fill('300')
    pg.once('dialog', lambda d: d.accept())
    sub.locator('text=Guardar despesa').click()
    pg.wait_for_selector('.panel.aviso')
    check('spesa in coda', pg.evaluate("JSON.parse(localStorage.getItem('fe_fila')||'[]')[0]._tipo") == 'despesa')
    check('il saldo locale scende subito', pg.evaluate("saldoDaConta('CX_COMUM')") == saldo0 - 6500)
    pg.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true})")
    pg.evaluate("flushFila().then(()=>sincronizar(true))")
    pg.wait_for_function("JSON.parse(localStorage.getItem('fe_fila')||'[]').length===0")
    check('spesa inviata senza doppioni', pg.evaluate("rows('Despesas').length") == 2)
    check("saldo coerente dopo l'invio", pg.evaluate("saldoDaConta('CX_COMUM')") == saldo0 - 6500)

    # ── fase 4: relatórios ──────────────────────────────────
    # i numeri dei report devono quadrare fra loro: e' questo che si controlla
    pg.goto('http://localhost:8787/#/relatorios/devedores')
    pg.wait_for_selector('.panel.imprimir')
    devedores = pg.locator('.panel.imprimir').inner_text()
    check('situazione debitoria con righe', pg.locator('tbody tr').count() >= 1)
    check('riga dei totali', pg.locator('tfoot').count() == 1)
    pg.screenshot(path=str(OUT / '17_devedores.png'), full_page=True)

    # L'invariante giusta e' il totale scoperto su TUTTE le cobranças:
    # sommare per famiglia perderebbe gli alunni senza responsabile finanziario
    # e conterebbe due volte i figli legati a due encarregados.
    divida_rel = pg.evaluate("relDevedores().totais[7].replace(',', '.')")
    divida_tot = pg.evaluate("""() => {
      const al = alocadoPorCobranca();
      return rows('Cobrancas').reduce((t, c) => c.estado === 'anulada' ? t
        : mt(t + Math.max(0, mt(Number(c.valor_liquido) - (al[c.id] || 0)))), 0);
    }""")
    check('il dovuto del report e tutto lo scoperto (%s / %s)' % (divida_rel, divida_tot),
          abs(float(divida_rel) - float(divida_tot)) < 0.01)

    pg.goto('http://localhost:8787/#/relatorios/previsto')
    pg.wait_for_selector('.panel.imprimir')
    falta = pg.evaluate("relPrevisto().totais[4].replace(',', '.')")
    check('previsto meno recebido = quello che si deve (%s)' % falta,
          abs(float(falta) - float(divida_rel)) < 0.01)
    pg.screenshot(path=str(OUT / '18_previsto.png'), full_page=True)

    pg.goto('http://localhost:8787/#/relatorios/recibos')
    pg.wait_for_selector('.panel.imprimir')
    recibos_val = pg.evaluate("relRecibos().totais[5].replace(',', '.')")
    check('nessun buco nella numerazione', pg.locator('.aviso-box').count() == 0)
    pg.goto('http://localhost:8787/#/relatorios/balancete')
    pg.wait_for_selector('.panel.imprimir')
    # il balancete del mese corrente deve contenere le ricevute di oggi
    entrou = pg.evaluate("relBalancete().sub")
    check('balancete del mese con le entrate (%s)' % entrou, 'Entrou' in entrou)
    pg.screenshot(path=str(OUT / '19_balancete.png'), full_page=True)

    pg.goto('http://localhost:8787/#/relatorios/mapa')
    pg.wait_for_selector('.tbl.compacta')
    check('mappa: una riga per alunno', pg.locator('.tbl.compacta tbody tr').count() == 1)
    check('mappa: colonne dei mesi', pg.locator('.tbl.compacta thead th').count() == 14)
    check('mappa colorata per stato', pg.locator('td.mapa').count() == 10)
    check('legenda presente', pg.locator('.legenda span').count() == 6)
    pg.screenshot(path=str(OUT / '20_mapa.png'), full_page=True)

    pg.goto('http://localhost:8787/#/relatorios/fluxo')
    pg.wait_for_selector('.panel.imprimir')
    saldo_rel = pg.evaluate("relFluxo().totais[6].replace(',', '.')")
    saldo_app = pg.evaluate("contasAtivas().reduce(function(t,c){return mt(t+saldoDaConta(c.codigo));},0)")
    check('il fluxo chiude sui saldi dei conti (%s / %s)' % (saldo_rel, saldo_app),
          abs(float(saldo_rel) - float(saldo_app)) < 0.01)

    pg.goto('http://localhost:8787/#/relatorios/descontos')
    pg.wait_for_selector('.panel.imprimir')
    desc_rel = pg.evaluate("relDescontos().totais[6].replace(',', '.')")
    desc_cob = pg.evaluate("rows('Cobrancas').reduce(function(t,c){return c.estado==='anulada'?t:mt(t+Number(c.valor_desconto));},0)")
    check('gli sconti del report sono quelli applicati (%s / %s)' % (desc_rel, desc_cob),
          abs(float(desc_rel) - float(desc_cob)) < 0.01)

    # estratto di una famiglia
    pg.goto('http://localhost:8787/#/relatorios/extrato')
    pg.wait_for_selector('.search')
    pg.fill('.search', 'cossa')
    pg.wait_for_selector('.result')
    pg.click('.result .btn')
    pg.wait_for_selector('.panel.imprimir')
    check('estratto della famiglia', 'Extrato de Maria Cossa' in pg.locator('.panel.imprimir h2').inner_text())
    check('estratto: cobranças e pagamenti', pg.locator('.panel.imprimir table').count() == 2)
    pg.screenshot(path=str(OUT / '21_extrato.png'), full_page=True)

    # esportazione: il file deve partire con il BOM e il punto e virgola
    pg.goto('http://localhost:8787/#/relatorios/devedores')
    pg.wait_for_selector('.panel.imprimir')
    csv = pg.evaluate("""async () => {
      let b = null; const o = URL.createObjectURL;
      URL.createObjectURL = x => { b = x; return o.call(URL, x); };
      const c = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      [...document.querySelectorAll('.actions .btn')].find(x => x.textContent === 'Exportar').click();
      await new Promise(r => setTimeout(r, 200));
      URL.createObjectURL = o; HTMLAnchorElement.prototype.click = c;
      const by = new Uint8Array(await b.arrayBuffer());
      return { bom: by[0] === 0xEF && by[1] === 0xBB && by[2] === 0xBF, txt: await b.text() };
    }""")
    check('CSV con il BOM per Excel', csv['bom'])
    check('CSV separato da punto e virgola', ';' in csv['txt'].split('\r\n')[0])
    check('CSV con la riga dei totali', csv['txt'].strip().split('\r\n')[-1].startswith('Total'))

    # stampa: resta solo il report
    pg.emulate_media(media='print')
    check('stampa: il menu sparisce', not pg.locator('#nav').is_visible())
    check('stampa: il report resta', pg.locator('.panel.imprimir').is_visible())
    check('stampa: i bottoni spariscono', not pg.locator('.actions.nao-imprimir').is_visible())
    pg.screenshot(path=str(OUT / '22_relatorio_impresso.png'), full_page=True)
    pg.emulate_media(media='screen')

    # ── barra delle scuole ──────────────────────────────────
    pg.goto('http://localhost:8787/#/alunos')
    pg.wait_for_selector('.escola-btn')
    check('un bottone per scuola piu Todas', pg.locator('.escola-btn').count() == 6)
    check('Todas e rosso e attivo', 'todas' in (pg.locator('.escola-btn.on').get_attribute('class') or ''))
    pg.locator('.escola-btn', has_text='Barrane').click()
    pg.wait_for_timeout(200)
    check('il bottone scelto resta acceso', pg.locator('.escola-btn.on').inner_text().endswith('Barrane'))
    check('la lista si filtra', pg.locator('.page-head p').inner_text() == 'Barrane')
    check('la scelta si ricorda', pg.evaluate("JSON.parse(localStorage.getItem('fe_escola'))") == 'B')
    check('il menu laterale parte sotto la barra',
          pg.evaluate("getComputedStyle(document.querySelector('#nav')).top") ==
          pg.evaluate("Math.round(document.querySelector('#topo').getBoundingClientRect().height) + 'px'"))
    pg.screenshot(path=str(OUT / '25_barra_escolas.png'), full_page=True)
    pg.locator('.escola-btn.todas').click()
    pg.wait_for_timeout(200)

    # ── fase 5: e-Mola ──────────────────────────────────────
    # si manda un SMS come farebbe il telefono Android e si guarda la coda
    chave = pg.evaluate("async () => (await api('emolaChave', {})).chave")
    def sms(testo, mittente='e-Mola'):
        return pg.evaluate("""async ([t, m, k]) => {
          const r = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'sms', chave: k, texto: t, remetente: m,
              recebido_em: new Date().toISOString().slice(0, 10) + ' 09:00:00' }) });
          return (await r.json());
        }""", [testo, mittente, chave])

    auto = sms('e-Mola: Recebeu 750.00MT de MARIA COSSA 841234567. Conteudo: B001. '
               'Transacao ID PP261023.5001.AA11. Saldo: 9,000.00MT')
    check('SMS col codice si registra da solo', auto['estado'] == 'registado' and auto.get('recibo'), auto)
    tel = sms('Recebeu 500MT de MARIA COSSA 841234567. Transacao ID PP261023.5002.BB22')
    check('SMS col solo telefono aspetta il clic', tel['estado'] == 'a_confirmar', tel)
    falso = sms('Recebeu 99,000.00MT de LADRAO 820001111. Conteudo: B001. '
                'Transacao ID PP261023.5003.CC33', '849990000')
    check('SMS da un mittente falso e messo di lato', falso['estado'] == 'ignorado', falso)
    lixo = sms('Movitel: aproveite o novo pacote de megas!')
    check('SMS incomprensibile resta in coda', lixo['estado'] == 'por_ler', lixo)
    rip = sms('e-Mola: Recebeu 750.00MT de MARIA COSSA 841234567. Conteudo: B001. '
              'Transacao ID PP261023.5001.AA11.')
    check('lo stesso ID non si registra due volte', rip.get('repetido') is True, rip)

    pg.evaluate("sincronizar(true)")
    pg.goto('http://localhost:8787/#/emola')
    pg.wait_for_selector('.panel.emola')
    check('tre SMS da trattare', pg.locator('.panel.emola').count() == 2, pg.locator('.panel.emola').count())
    check('il contatore nel menu', pg.locator('#nav .conta').inner_text() == '2')
    check('il testo originale e sempre visibile', pg.locator('.sms-cru').count() >= 1)
    check('i registrati stanno nello storico', 'Já tratados' in pg.locator('#view').inner_text())
    pg.screenshot(path=str(OUT / '23_emola.png'), full_page=True)

    # confermare quello riconosciuto dal telefono
    card = pg.locator('.panel.emola', has_text='A confirmar')
    check('propone gia la famiglia', 'Maria Cossa' in card.inner_text())
    pg.once('dialog', lambda d: d.accept())
    card.locator('text=Confirmar e emitir recibo').click()
    pg.wait_for_selector('.recibo')
    check('dalla conferma esce la ricevuta', 'REC-' in pg.locator('h1').inner_text())
    pg.goto('http://localhost:8787/#/emola')
    pg.wait_for_selector('#view')
    check('il contatore scende', pg.locator('#nav .conta').inner_text() == '1')

    # la chiave del telefono, pronta da incollare in Tasker
    pg.click('text=Ver a chave do aparelho')
    pg.wait_for_selector('.copiar input')
    check('mostra indirizzo e chiave', pg.locator('.copiar input').count() == 2)
    check('il corpo per Tasker contiene la chiave', chave in pg.locator('.passos pre').first.inner_text())
    pg.screenshot(path=str(OUT / '24_emola_tasker.png'), full_page=True)

    # lista alunni, ricerca per telefono
    pg.goto('http://localhost:8787/#/alunos')
    pg.fill('.search', '841234')
    check('ricerca per telefono', pg.locator('.tbl tbody tr').count() == 1)
    pg.screenshot(path=str(OUT / '4_alunos.png'), full_page=True)

    # mobile
    m = b.new_page(viewport={'width': 390, 'height': 800})
    m.on('pageerror', lambda e: errors.append(str(e)))
    m.add_init_script("localStorage.setItem('fe_token', JSON.stringify('%s'))" % TOKEN)
    m.goto('http://localhost:8787/#/alunos')
    m.wait_for_selector('.tbl tbody tr')
    m.screenshot(path=str(OUT / '5_mobile_alunos.png'), full_page=True)
    # la barra non ci sta in riga: scorre, e la scuola scelta va al centro
    m.locator('.escola-btn', has_text='São Lourenço').scroll_into_view_if_needed()
    m.locator('.escola-btn', has_text='São Lourenço').click()
    m.wait_for_timeout(300)
    check('la barra scorre nel telefono',
          m.evaluate("(b => b.scrollWidth > b.clientWidth)(document.querySelector('#escolas'))"))
    check('la scuola scelta resta visibile', m.evaluate("""() => {
      const b = document.querySelector('#escolas'), a = b.querySelector('.escola-btn.on');
      const cb = b.getBoundingClientRect(), ca = a.getBoundingClientRect();
      return ca.left >= cb.left - 1 && ca.right <= cb.right + 1;
    }"""))
    check('niente scroll orizzontale di pagina con la barra (%s)' % m.evaluate('document.documentElement.scrollWidth'),
          m.evaluate('document.documentElement.scrollWidth') <= 390)
    m.locator('.escola-btn.todas').click()
    m.wait_for_timeout(200)
    m.goto('http://localhost:8787/#/encarregado/E0001')
    m.wait_for_selector('.link-row')
    m.screenshot(path=str(OUT / '6_mobile_encarregado.png'), full_page=True)
    # Receber e' il primo schermo pensato per il telefono
    m.goto('http://localhost:8787/#/receber/E0001')
    m.wait_for_selector('.valor-grande')
    m.fill('.valor-grande', '1000')
    m.wait_for_timeout(200)
    m.screenshot(path=str(OUT / '8_mobile_receber.png'), full_page=True)
    check('niente scroll orizzontale in Receber (%s)' % m.evaluate('document.documentElement.scrollWidth'),
          m.evaluate('document.documentElement.scrollWidth') <= 390)
    # anche Despesas e' pensata prima di tutto per il telefono
    m.goto('http://localhost:8787/#/despesas')
    m.wait_for_selector('.tbl tbody tr')
    m.screenshot(path=str(OUT / '9_mobile_despesas.png'), full_page=True)
    check('niente scroll orizzontale in Despesas (%s)' % m.evaluate('document.documentElement.scrollWidth'),
          m.evaluate('document.documentElement.scrollWidth') <= 390)
    m.goto('http://localhost:8787/#/caixa')
    m.wait_for_selector('.card.conta')
    m.screenshot(path=str(OUT / '10_mobile_caixa.png'), full_page=True)
    # nei report del telefono ogni numero deve avere la sua etichetta
    m.goto('http://localhost:8787/#/relatorios/devedores')
    m.wait_for_selector('.panel.imprimir tbody tr')
    check('etichette sui numeri nel telefono',
          m.evaluate("getComputedStyle(document.querySelector('.panel.imprimir tbody td:nth-child(5)'),'::before').content") != 'none')
    m.screenshot(path=str(OUT / '11_mobile_relatorio.png'), full_page=True)
    # la mappa resta una griglia e scorre dentro il suo riquadro
    m.goto('http://localhost:8787/#/relatorios/mapa')
    m.wait_for_selector('.tbl.compacta')
    check('la mappa resta una griglia',
          m.evaluate("getComputedStyle(document.querySelector('.tbl.compacta td')).display") == 'table-cell')
    check('niente scroll orizzontale di pagina nella mappa (%s)' % m.evaluate('document.documentElement.scrollWidth'),
          m.evaluate('document.documentElement.scrollWidth') <= 390)
    m.screenshot(path=str(OUT / '12_mobile_mapa.png'), full_page=True)
    m.click('.menu-btn')
    m.wait_for_timeout(300)
    m.screenshot(path=str(OUT / '7_mobile_menu.png'))
    sw = m.evaluate('document.documentElement.scrollWidth')
    check('nessuno scroll orizzontale su mobile (%s)' % sw, sw <= 390)
    b.close()

errs = [e for e in errors if 'accounts.google.com' not in e]
check('nessun errore JS ' + repr(errs), not errs)
print('UI:', 'ok' if not fails else '%d falliti' % len(fails))
sys.exit(1 if fails else 0)
