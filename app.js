// ════════════════════════════════════════════════════════════
// FINANÇAS ESCOLINHAS — PWA — Fases 1 a 5
// Configuração, alunos, encarregados, descontos,
// cobranças, recebimentos, alocação, crédito, recibos e mensagens,
// despesas com comprovativo, contas, transferências, fecho de caixa
// os oito relatórios, com impressão e exportação para o Excel,
// e a fila dos pagamentos e-Mola que chegam por SMS.
// Convenção: sem template literals (backticks), só concatenação.
// ════════════════════════════════════════════════════════════

var CFG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzK6AGPaRwl8K0aHDJUCH1T0J3HgiB8hL7DBS8gkWXBebGQJzM6SDknn7gvGP3lbWJuaQ/exec',
  GOOGLE_CLIENT_ID: '200957289142-r2kimtq5aiv5iamjvd9drvci4sojas71.apps.googleusercontent.com',
  VERSAO: '5.0.1'
};

var S = { token: null, user: null, data: null, escola: 'TODAS', status: 'ok', desde: null, chaves: {},
  relAno: null, relMes: null, relDe: null, relAte: null, relEnc: null };
var SIM = 'sim', NAO = 'não';
var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto',
             'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
var ESTADOS = [['ativo', 'Activo'], ['transferido', 'Transferido'], ['desistente', 'Desistente'], ['concluiu', 'Concluiu']];
var PARENTESCOS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã', 'Irmão', 'Madrasta', 'Padrasto', 'Tutor', 'Outro'];
var METODOS = [['numerario', 'Numerário'], ['emola', 'e-Mola'], ['mpesa', 'M-Pesa'], ['banco', 'Banco']];
var METODO_NOME = { numerario: 'Numerário', emola: 'e-Mola', mpesa: 'M-Pesa', banco: 'Banco' };
var PRECISA_REF = ['emola', 'mpesa', 'banco'];

// ── utilidades ────────────────────────────────────────────────
function $(sel, root) { return (root || document).querySelector(sel); }

// h('div', {class:'x', onclick:fn}, filho1, [filho2, filho3], 'texto')
function h(tag, attrs) {
  var el = document.createElement(tag);
  attrs = attrs || {};
  for (var k in attrs) {
    var v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readOnly' || k === 'required') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  function add(c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(add); return; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  for (var i = 2; i < arguments.length; i++) add(arguments[i]);
  return el;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

function norm(s) {
  return String(s === undefined || s === null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
function fmtTel(t) {
  t = String(t || '');
  if (t.length === 9) return t.slice(0, 2) + ' ' + t.slice(2, 5) + ' ' + t.slice(5);
  return t;
}
// Dinheiro: duas casas, arredondado sempre da mesma maneira (como no servidor)
function mt(v) { return Math.round((Number(v) || 0) * 100) / 100; }

function fmtMT(n) {
  if (n === '' || n === null || n === undefined) return '—';
  var x = Number(n);
  return x.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MT';
}
function fmtData(d) {
  if (!d) return '';
  var p = String(d).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(d);
}
function hoje() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function waLink(tel, texto) {
  var t = String(tel || '');
  if (t.length === 9) t = '258' + t;
  return 'https://wa.me/' + t + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

var toastTimer = null;
function toast(msg, kind) {
  var t = $('#toast');
  t.textContent = msg;
  t.className = 'show ' + (kind || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = ''; }, kind === 'erro' ? 6000 : 3000);
}

// ── dados locais ─────────────────────────────────────────────
var KEYS = {
  Escolas: 'codigo', AnosLetivos: 'ano', TiposCobranca: 'codigo', TabelaPrecos: 'id', Categorias: 'codigo',
  Contas: 'codigo', RegrasMulta: 'id', Utilizadores: 'email', Alunos: 'codigo', Encarregados: 'codigo',
  AlunoEncarregado: 'id', Descontos: 'id',
  Cobrancas: 'id', Recebimentos: 'numero_recibo', Alocacoes: 'id',
  Despesas: 'id', Transferencias: 'id', Pagamentos_eMola: 'id'
};
// Folhas grandes: a app pede ao servidor só o que mudou desde a última vez.
var INCREMENTAIS = ['Cobrancas', 'Recebimentos', 'Alocacoes', 'Despesas', 'Transferencias', 'Pagamentos_eMola'];
function rows(t) { return (S.data && S.data[t]) || []; }
function find(t, val) {
  var k = KEYS[t];
  var list = rows(t);
  for (var i = 0; i < list.length; i++) if (String(list[i][k]) === String(val)) return list[i];
  return null;
}
function upsertLocal(t, rec, semGravar) {
  if (!S.data[t]) S.data[t] = [];
  var k = KEYS[t], list = S.data[t];
  for (var i = 0; i < list.length; i++) {
    if (String(list[i][k]) === String(rec[k])) { list[i] = rec; if (!semGravar) persist(); return; }
  }
  list.push(rec);
  if (!semGravar) persist();
}
function removeLocal(t, keyVal) {
  var k = KEYS[t];
  S.data[t] = rows(t).filter(function (r) { return String(r[k]) !== String(keyVal); });
  persist();
}
function persist() { store('fe_data', S.data); }

function escolaNome(c) {
  if (c === 'REDE') return 'Rede (comum)';
  var e = find('Escolas', c);
  return e ? e.nome : c;
}
function escolasAtivas() { return rows('Escolas').filter(function (e) { return e.ativa === SIM; }); }
function anoAtivo() { return rows('AnosLetivos').filter(function (a) { return a.ativo === SIM; })[0] || null; }
function isAdmin() { return S.user && S.user.papel === 'admin'; }
function filtroEscola(list) {
  if (S.escola === 'TODAS') return list;
  return list.filter(function (r) { return r.escola === S.escola; });
}
function linksDoAluno(cod) { return rows('AlunoEncarregado').filter(function (l) { return l.aluno === cod; }); }
function linksDoEncarregado(cod) { return rows('AlunoEncarregado').filter(function (l) { return l.encarregado === cod; }); }
function financeiroDoAluno(cod) {
  var l = linksDoAluno(cod).filter(function (x) { return x.responsavel_financeiro === SIM; })[0];
  return l ? find('Encarregados', l.encarregado) : null;
}

// ── API ──────────────────────────────────────────────────────
function api(action, payload) {
  var body = Object.assign({ action: action, token: S.token }, payload || {});
  return fetch(CFG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  }).then(function (r) {
    if (!r.ok) throw new Error('Servidor respondeu ' + r.status);
    return r.json();
  }).then(function (res) {
    if (!res.ok) {
      var e = new Error(res.error || 'Erro desconhecido');
      e.code = res.code; e.extra = res.extra;
      if (res.code === 'sessao') sair(true);
      throw e;
    }
    return res;
  });
}

// Grava um registo; trata pedidos de confirmação do servidor.
function gravar(table, rec, isNew, force) {
  if (!navigator.onLine) {
    toast('Sem ligação à internet. Tente de novo quando houver rede.', 'erro');
    return Promise.reject(new Error('offline'));
  }
  setStatus('sync');
  return api('save', { table: table, record: rec, isNew: !!isNew, force: !!force }).then(function (res) {
    upsertLocal(table, res.record);
    (res.changed || []).forEach(function (c) { upsertLocal(c.table, c.record); });
    setStatus('ok');
    toast('Guardado.', 'ok');
    return res.record;
  }).catch(function (e) {
    setStatus('ok');
    if (e.code === 'confirmar') {
      if (window.confirm(e.message + '\n\nContinuar mesmo assim?')) return gravar(table, rec, isNew, true);
      throw e;
    }
    if (e.message !== 'offline') toast(e.message, 'erro');
    throw e;
  });
}

// Guarda, por folha, o atualizado_em mais recente que já recebemos.
// O servidor responde com >= essa marca, por isso algumas linhas repetem-se:
// como se guardam pela chave, repetir não faz mal e nada se perde.
function marcarDesde(table, lista) {
  if (!lista.length) return;
  var m = S.desde[table] || '';
  lista.forEach(function (r) { if (String(r.atualizado_em || '') > m) m = String(r.atualizado_em); });
  S.desde[table] = m;
}

function sincronizar(silencioso) {
  if (!navigator.onLine) { setStatus('offline'); return Promise.resolve(); }
  setStatus('sync');
  if (!S.desde) S.desde = load('fe_desde') || {};
  var temDados = !!S.data;
  var pedido = {};
  if (temDados) INCREMENTAIS.forEach(function (t) { if (S.desde[t]) pedido[t] = S.desde[t]; });
  return flushFila().then(function () {
    return api('bootstrap', Object.keys(pedido).length ? { desde: pedido } : {});
  }).then(function (res) {
    S.user = res.user;
    if (!S.data) S.data = {};
    Object.keys(res.data).forEach(function (t) {
      if (res.parcial && res.parcial[t]) {
        res.data[t].forEach(function (r) { upsertLocal(t, r, true); });
      } else {
        S.data[t] = res.data[t];
      }
      if (INCREMENTAIS.indexOf(t) >= 0) marcarDesde(t, res.data[t]);
    });
    S.anoAtivo = res.ano_ativo;
    store('fe_user', S.user); store('fe_desde', S.desde); persist();
    setStatus('ok');
    if (!silencioso) toast('Dados actualizados.', 'ok');
    renderApp();
  }).catch(function (e) {
    setStatus('erro');
    if (e.code !== 'sessao') toast('Não foi possível sincronizar: ' + e.message, 'erro');
  });
}

// ── arranque e login ─────────────────────────────────────────
function start() {
  S.token = load('fe_token');
  S.user = load('fe_user');
  S.data = load('fe_data');
  S.escola = load('fe_escola') || 'TODAS';
  S.desde = load('fe_desde') || {};
  S.chaves = load('fe_chaves') || {};
  window.addEventListener('online', function () { sincronizar(true); });
  window.addEventListener('offline', function () { setStatus('offline'); });
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', medirTopo);
  if (!S.token) { renderLogin(); return; }
  if (S.data) renderApp();
  sincronizar(true);
}

function renderLogin(msg) {
  var app = clear($('#app'));
  var box = h('div', { class: 'login' },
    h('img', { src: 'icon-192.png', alt: '', width: 80, height: 80 }),
    h('h1', null, 'Finanças Escolinhas'),
    h('p', { class: 'muted' }, 'Barrane · Matadouro · Nhamaxaxa · Macupula · São Lourenço'),
    h('div', { id: 'gbtn' }),
    msg ? h('p', { class: 'erro' }, msg) : null,
    !navigator.onLine ? h('p', { class: 'erro' }, 'Sem ligação à internet. É precisa rede para entrar.') : null
  );
  app.appendChild(box);
  loadGoogle(function () {
    google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onGoogleCredential });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', locale: 'pt-PT' });
  });
}

function loadGoogle(cb) {
  if (window.google && google.accounts) { cb(); return; }
  var s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = cb;
  s.onerror = function () { toast('Não foi possível carregar o login Google.', 'erro'); };
  document.head.appendChild(s);
}

function onGoogleCredential(resp) {
  api('login', { idToken: resp.credential }).then(function (res) {
    S.token = res.token; S.user = res.user;
    store('fe_token', S.token); store('fe_user', S.user);
    return sincronizar(true);
  }).catch(function (e) { renderLogin(e.message); });
}

function sair(expirada) {
  if (!expirada && S.token && navigator.onLine) api('logout').catch(function () {});
  S.token = null; S.user = null; S.data = null; S.desde = {}; S.chaves = {};
  store('fe_token', null); store('fe_user', null); store('fe_data', null);
  store('fe_desde', null); store('fe_chaves', null);
  renderLogin(expirada ? 'A sessão expirou. Entre de novo.' : null);
}

// ── estrutura da app ─────────────────────────────────────────
var MENU = [
  ['inicio', 'Início', '⌂'],
  ['alunos', 'Alunos', '☺'],
  ['encarregados', 'Encarregados', '☏'],
  ['receber', 'Receber', '↓'],
  ['despesas', 'Despesas', '↑'],
  ['caixa', 'Caixa e contas', '▤'],
  ['relatorios', 'Relatórios', '▦'],
  ['emola', 'e-Mola', '✆'],
  ['config', 'Configuração', '⚙', 0, true]
];

function setStatus(s) {
  S.status = s;
  var el = $('#status');
  if (!el) return;
  var txt = { ok: 'Sincronizado', sync: 'A sincronizar…', offline: 'Sem rede', erro: 'Erro de ligação' }[s] || s;
  el.className = 'status ' + s;
  el.title = txt;
  $('#status-txt').textContent = txt;
}

function renderApp() {
  if (!S.data) return;
  var app = $('#app');
  if (!$('#shell')) {
    clear(app);
    app.appendChild(h('div', { id: 'shell' },
      h('div', { id: 'topo' },
        h('header', { class: 'top' },
          h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Menu', onclick: function () { document.body.classList.toggle('nav-open'); } }, '☰'),
          h('a', { class: 'brand', href: '#/inicio' }, h('img', { src: 'icon-192.png', alt: '' }), h('span', null, 'Finanças Escolinhas')),
          h('button', { id: 'status', class: 'status ok', onclick: function () { sincronizar(false); }, title: 'Sincronizar' },
            h('span', { class: 'dot' }), h('span', { id: 'status-txt' }, 'Sincronizado'))
        ),
        h('div', { id: 'escolas', class: 'escolas', role: 'tablist', 'aria-label': 'Escola' })
      ),
      h('nav', { id: 'nav' }),
      h('main', { id: 'view' }),
      h('div', { class: 'scrim', onclick: function () { document.body.classList.remove('nav-open'); } })
    ));
  }
  desenharEscolas();
  // menu
  var nav = clear($('#nav'));
  MENU.forEach(function (m) {
    if (m[4] && !isAdmin()) return;
    var porTratar = m[0] === 'emola' ? emolaPorTratar() : 0;
    nav.appendChild(h('a', { href: '#/' + m[0], 'data-r': m[0].split('/')[0] === 'breve' ? m[0] : m[0], class: m[3] ? 'soon' : '' },
      h('span', { class: 'ico', 'aria-hidden': 'true' }, m[2]), h('span', null, m[1]),
      m[3] ? h('small', null, 'fase ' + m[3]) : null,
      porTratar ? h('span', { class: 'conta' }, String(porTratar)) : null));
  });
  nav.appendChild(h('div', { class: 'nav-foot' },
    h('div', { class: 'who' }, h('strong', null, S.user ? S.user.nome : ''), h('small', null, S.user ? S.user.email + ' · ' + S.user.papel : '')),
    h('button', { class: 'link-btn', onclick: function () { sair(false); } }, 'Sair'),
    h('small', { class: 'muted' }, 'Versão ' + CFG.VERSAO)));
  setStatus(navigator.onLine ? S.status : 'offline');
  route();
}

// O contador da e-Mola vive no menu, que não se volta a desenhar a cada ecrã.
function actualizarContaEmola() {
  var a = document.querySelector('#nav a[data-r="emola"]');
  if (!a) return;
  var antigo = a.querySelector('.conta');
  if (antigo) antigo.remove();
  var n = emolaPorTratar();
  if (n) a.appendChild(h('span', { class: 'conta' }, String(n)));
}

// Um botão por escola, sempre à vista, mais "Todas" a vermelho.
// Muda-se de escola com um toque, sem abrir nada.
function escolherEscola(cod) {
  if (S.escola === cod) return;
  S.escola = cod;
  store('fe_escola', S.escola);
  desenharEscolas();
  route();
}

function desenharEscolas() {
  var barra = $('#escolas');
  if (!barra) return;
  clear(barra);
  if (S.escola !== 'TODAS' && !find('Escolas', S.escola)) S.escola = 'TODAS';
  barra.appendChild(h('button', { class: 'escola-btn todas' + (S.escola === 'TODAS' ? ' on' : ''),
    role: 'tab', 'aria-selected': S.escola === 'TODAS' ? 'true' : 'false',
    onclick: function () { escolherEscola('TODAS'); } }, 'Todas'));
  escolasAtivas().forEach(function (e) {
    barra.appendChild(h('button', { class: 'escola-btn' + (S.escola === e.codigo ? ' on' : ''),
      role: 'tab', 'aria-selected': S.escola === e.codigo ? 'true' : 'false',
      title: e.nome, onclick: function () { escolherEscola(e.codigo); } },
      h('span', { class: 'letra' }, e.codigo), h('span', null, e.nome)));
  });
  // No telefone os botões não cabem todos: a escola escolhida vai para o meio,
  // senão fica escondida à direita e ninguém sabe o que está a ver.
  var activo = barra.querySelector('.escola-btn.on');
  if (activo && barra.scrollWidth > barra.clientWidth) {
    barra.scrollLeft = Math.max(0, activo.offsetLeft - (barra.clientWidth - activo.offsetWidth) / 2);
  }
  medirTopo();
}

// O menu lateral e o véu encostam ao fundo da barra: mede-se, não se adivinha.
function medirTopo() {
  var topo = $('#topo');
  if (!topo) return;
  var alt = Math.round(topo.getBoundingClientRect().height);
  if (alt) document.documentElement.style.setProperty('--topo-h', alt + 'px');
}

function route() {
  if (!S.data || !$('#view')) return;
  document.body.classList.remove('nav-open');
  actualizarContaEmola();
  var hash = location.hash || '#/inicio';
  var p = hash.slice(2).split('/').map(decodeURIComponent);
  var v = clear($('#view'));
  var base = p[0] === 'aluno' ? 'alunos' : p[0] === 'encarregado' ? 'encarregados'
    : p[0] === 'breve' ? 'breve/' + p[1] : p[0] === 'recibo' ? 'receber' : p[0];
  Array.prototype.forEach.call(document.querySelectorAll('#nav a'), function (a) {
    a.classList.toggle('on', a.getAttribute('data-r') === base);
  });
  switch (p[0]) {
    case 'alunos': viewAlunos(v); break;
    case 'aluno': viewAluno(v, p[1]); break;
    case 'encarregados': viewEncarregados(v); break;
    case 'encarregado': viewEncarregado(v, p[1]); break;
    case 'receber': viewReceber(v, p[1]); break;
    case 'despesas': viewDespesas(v); break;
    case 'caixa': viewCaixa(v, p[1]); break;
    case 'relatorios': viewRelatorios(v, p[1]); break;
    case 'emola': viewEmola(v); break;
    case 'recibo': viewRecibo(v, p[1]); break;
    case 'config': if (isAdmin()) viewConfig(v, p[1] || 'Escolas'); else viewInicio(v); break;
    case 'breve': viewBreve(v, p[1]); break;
    default: viewInicio(v);
  }
  window.scrollTo(0, 0);
}

function pageHead(title, sub, actions) {
  return h('div', { class: 'page-head' },
    h('div', null, h('h1', null, title), sub ? h('p', { class: 'muted' }, sub) : null),
    actions ? h('div', { class: 'actions' }, actions) : null);
}

// ── Início ───────────────────────────────────────────────────
function viewInicio(v) {
  var ano = anoAtivo();
  v.appendChild(pageHead('Início', ano ? 'Ano lectivo ' + ano.ano + ' · ' + MESES[ano.mes_inicio - 1] + ' a ' + MESES[ano.mes_fim - 1]
    : 'Nenhum ano lectivo activo — defina-o em Configuração.'));

  var escolas = S.escola === 'TODAS' ? escolasAtivas() : escolasAtivas().filter(function (e) { return e.codigo === S.escola; });
  var grid = h('div', { class: 'cards' });
  var totAlunos = 0, totSemFin = 0;
  escolas.forEach(function (e) {
    var al = rows('Alunos').filter(function (a) { return a.escola === e.codigo && a.estado === 'ativo'; });
    var semFin = al.filter(function (a) { return !financeiroDoAluno(a.codigo); }).length;
    var preco = ano ? rows('TabelaPrecos').filter(function (p) {
      return String(p.ano) === String(ano.ano) && p.escola === e.codigo && p.tipo_cobranca === 'MENSALIDADE';
    })[0] : null;
    totAlunos += al.length; totSemFin += semFin;
    grid.appendChild(h('a', { class: 'card school', href: '#/alunos', onclick: function () {
      S.escola = e.codigo; store('fe_escola', S.escola); desenharEscolas();
    } },
      h('div', { class: 'card-top' }, h('span', { class: 'badge-school' }, e.codigo), h('h3', null, e.nome)),
      h('div', { class: 'big' }, String(al.length)), h('div', { class: 'muted' }, 'alunos activos'),
      h('div', { class: 'card-foot' },
        h('span', null, 'Mensalidade: ', h('strong', null, preco ? fmtMT(preco.valor) : 'por definir')),
        semFin ? h('span', { class: 'warn' }, semFin + ' sem responsável financeiro') : null)));
  });
  v.appendChild(grid);

  if (escolas.length > 1) {
    v.appendChild(h('p', { class: 'muted total' }, 'Total: ' + totAlunos + ' alunos activos' +
      (totSemFin ? ' · ' + totSemFin + ' sem responsável financeiro' : '')));
  }

  var pend = [];
  if (!ano) pend.push(['Definir o ano lectivo activo', '#/config/AnosLetivos']);
  else {
    escolasAtivas().forEach(function (e) {
      ['MATRICULA', 'MENSALIDADE'].forEach(function (t) {
        var ok = rows('TabelaPrecos').some(function (p) { return String(p.ano) === String(ano.ano) && p.escola === e.codigo && p.tipo_cobranca === t; });
        if (!ok) pend.push(['Preço de ' + (t === 'MATRICULA' ? 'matrícula' : 'mensalidade') + ' em ' + e.nome + ' (' + ano.ano + ')', '#/config/TabelaPrecos']);
      });
    });
  }
  v.appendChild(panelMesCorrente());
  var av = avisoFila();
  if (av) v.appendChild(av);

  if (pend.length && isAdmin()) {
    v.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Por fazer na configuração'),
      h('ul', { class: 'todo' }, pend.slice(0, 12).map(function (p) { return h('li', null, h('a', { href: p[1] }, p[0])); }))));
  }

  v.appendChild(h('section', { class: 'panel soft' }, h('h2', null, 'Próximas fases'),
    h('p', null, 'Fase 6: SMS automáticos para toda a gente e multas, se a escola decidir as regras.')));
}

// O mês corrente: quanto entrou, quanto falta, quem está em atraso.
function panelMesCorrente() {
  var mes = hoje().slice(0, 7);
  var p = h('section', { class: 'panel' }, h('h2', null, 'Mês de ' + MESES[Number(mes.slice(5, 7)) - 1]));
  var alunosEscola = {};
  rows('Alunos').forEach(function (a) { alunosEscola[a.codigo] = a.escola; });
  function daEscola(cod) { return S.escola === 'TODAS' || alunosEscola[cod] === S.escola; }

  var recebido = 0;
  rows('Recebimentos').forEach(function (r) {
    if (r.estado === 'anulado' || String(r.data).slice(0, 7) !== mes) return;
    if (S.escola !== 'TODAS') {
      // o recibo conta para a escola quando cobre cobranças dessa escola
      var toca = rows('Alocacoes').filter(function (a) { return a.recebimento === r.numero_recibo; })
        .some(function (a) { var c = find('Cobrancas', a.cobranca); return c && c.escola === S.escola; });
      if (!toca) return;
    }
    recebido = mt(recebido + Number(r.valor));
  });

  var al = alocadoPorCobranca();
  var emFalta = 0, atrasadas = 0, familias = {};
  rows('Cobrancas').forEach(function (c) {
    if (c.estado === 'anulada' || !daEscola(c.aluno)) return;
    var falta = mt(Math.max(0, mt(Number(c.valor_liquido) - (al[c.id] || 0))));
    if (falta <= 0.004) return;
    emFalta = mt(emFalta + falta);
    if (emAtraso(c)) {
      atrasadas++;
      var fin = financeiroDoAluno(c.aluno);
      if (fin) familias[fin.codigo] = true;
    }
  });

  var gasto = despesasTodas().reduce(function (t, d) {
    if (d.estado === 'anulada' || String(d.data).slice(0, 7) !== mes) return t;
    if (S.escola !== 'TODAS' && d.escola !== S.escola && d.escola !== 'REDE') return t;
    return mt(t + Number(d.valor));
  }, 0);
  var emCaixa = contasAtivas().filter(function (c) {
    return S.escola === 'TODAS' || c.escola === S.escola || c.escola === 'REDE';
  }).reduce(function (t, c) { return mt(t + saldoDaConta(c.codigo)); }, 0);

  p.appendChild(h('div', { class: 'numeros grande' },
    h('div', null, h('small', null, 'Recebido este mês'), h('strong', { class: 'ok' }, fmtMT(recebido))),
    h('div', null, h('small', null, 'Gasto este mês'), h('strong', { class: 'devedor' }, fmtMT(gasto))),
    h('div', null, h('small', null, 'Nas contas'), h('strong', { class: emCaixa < 0 ? 'devedor' : '' }, fmtMT(emCaixa))),
    h('div', null, h('small', null, 'Em falta no total'), h('strong', { class: emFalta > 0 ? 'devedor' : 'ok' }, fmtMT(emFalta))),
    h('div', null, h('small', null, 'Cobranças em atraso'), h('strong', null, String(atrasadas))),
    h('div', null, h('small', null, 'Famílias em atraso'), h('strong', null, String(Object.keys(familias).length)))));

  var ultimos = rows('Recebimentos').filter(function (r) { return r.estado !== 'anulado'; })
    .sort(function (a, b) { return String(a.data) > String(b.data) ? -1 : String(a.data) < String(b.data) ? 1 : (a.numero_recibo > b.numero_recibo ? -1 : 1); })
    .slice(0, 6);
  if (ultimos.length) {
    p.appendChild(h('h3', null, 'Últimos recibos'));
    var tb = h('tbody');
    ultimos.forEach(function (r) {
      var e = find('Encarregados', r.encarregado);
      tb.appendChild(h('tr', { onclick: function () { location.hash = '#/recibo/' + r.numero_recibo; } },
        h('td', { 'data-l': 'Data' }, fmtData(r.data)),
        h('td', { 'data-l': 'Recibo' }, h('span', { class: 'code' }, r.numero_recibo)),
        h('td', { 'data-l': 'Família' }, e ? e.nome_completo : r.encarregado),
        h('td', { 'data-l': 'Valor', class: 'num strong' }, fmtMT(r.valor))));
    });
    p.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Data', 'Recibo', 'Família', 'Valor'].map(function (t) { return h('th', null, t); }))), tb)));
  }
  return p;
}

function viewBreve(v, qual) {
  var nomes = { relatorios: ['Relatórios', 4] };
  var n = nomes[qual] || ['Em breve', 2];
  v.appendChild(pageHead(n[0]));
  v.appendChild(h('section', { class: 'panel soft' }, h('p', null, 'Este ecrã chega na fase ' + n[1] + '. A estrutura de dados já está pronta.')));
}

// ── formulários ──────────────────────────────────────────────
// campo: {n, l, t, req, o, full, ro, ph, min, max, step, list, help}
function optsFor(f) {
  var o = typeof f.o === 'function' ? f.o() : f.o;
  return (o || []).map(function (x) { return Array.isArray(x) ? x : [x, x]; });
}
var OPT = {
  simnao: [[SIM, 'Sim'], [NAO, 'Não']],
  escolas: function () { return rows('Escolas').map(function (e) { return [e.codigo, e.codigo + ' — ' + e.nome]; }); },
  escolasRede: function () { return OPT.escolas().concat([['REDE', 'REDE — comum a todas']]); },
  anos: function () { return rows('AnosLetivos').map(function (a) { return [String(a.ano), String(a.ano) + (a.ativo === SIM ? ' (activo)' : '')]; }); },
  tipos: function () { return rows('TiposCobranca').map(function (t) { return [t.codigo, t.nome]; }); },
  tiposTodos: function () { return [['TODOS', 'Todas as cobranças']].concat(OPT.tipos()); },
  meses: MESES.map(function (m, i) { return [String(i + 1), m]; }),
  catReceita: function () { return rows('Categorias').filter(function (c) { return c.tipo === 'receita'; }).map(function (c) { return [c.codigo, c.nome]; }); },
  catPai: function () { return [['', '— nenhuma —']].concat(rows('Categorias').filter(function (c) { return !c.categoria_pai; }).map(function (c) { return [c.codigo, c.nome + ' (' + c.tipo + ')']; })); }
};

function buildForm(fields, rec, opts) {
  opts = opts || {};
  var inputs = {};
  var form = h('form', { class: 'form', novalidate: true, onsubmit: function (ev) { ev.preventDefault(); } });
  var grid = h('div', { class: 'grid' });
  fields.forEach(function (f) {
    var val = rec && rec[f.n] !== undefined && rec[f.n] !== null ? String(rec[f.n]) : (f.def !== undefined ? String(f.def) : '');
    var id = 'f_' + f.n + '_' + Math.random().toString(36).slice(2, 7);
    var input;
    var ro = f.ro === true || (f.ro === 'edit' && opts.editing);
    if (f.t === 'select' || f.t === 'simnao') {
      input = h('select', { id: id, disabled: ro });
      if (!f.req && f.t !== 'simnao') input.appendChild(h('option', { value: '' }, '—'));
      optsFor(f.t === 'simnao' ? { o: OPT.simnao } : f).forEach(function (o) {
        input.appendChild(h('option', { value: o[0] }, o[1]));
      });
      if (val !== '') input.value = val;
      else if (f.t === 'simnao') input.value = SIM;
    } else if (f.t === 'textarea') {
      input = h('textarea', { id: id, rows: 3, readOnly: ro, value: val });
    } else {
      input = h('input', { id: id, type: f.t === 'tel' ? 'tel' : f.t || 'text', value: val, readOnly: ro,
        placeholder: f.ph || null, min: f.min, max: f.max, step: f.step, maxlength: f.maxlength,
        list: f.list ? id + '_l' : null, inputmode: f.t === 'tel' ? 'tel' : f.t === 'number' ? 'decimal' : null,
        autocomplete: 'off' });
    }
    inputs[f.n] = input;
    grid.appendChild(h('div', { class: 'field' + (f.full ? ' full' : '') },
      h('label', { for: id }, f.l, f.req ? h('span', { class: 'req' }, ' *') : null),
      input,
      f.list ? h('datalist', { id: id + '_l' }, f.list.map(function (x) { return h('option', { value: x }); })) : null,
      f.help ? h('small', { class: 'muted' }, f.help) : null));
  });
  form.appendChild(grid);
  return {
    el: form,
    inputs: inputs,
    get: function () {
      var o = {};
      fields.forEach(function (f) {
        var v = inputs[f.n].value;
        if (f.upper) v = v.toUpperCase();
        o[f.n] = typeof v === 'string' ? v.trim() : v;
      });
      return o;
    },
    check: function () {
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.req && !String(inputs[f.n].value).trim()) {
          inputs[f.n].focus();
          toast('Preencha: ' + f.l, 'erro');
          return false;
        }
      }
      return true;
    }
  };
}

function btn(label, onclick, kind, attrs) {
  return h('button', Object.assign({ type: 'button', class: 'btn ' + (kind || ''), onclick: onclick }, attrs || {}), label);
}

// Botão que fica "ocupado" enquanto a promessa corre
function busy(b, p) {
  b.disabled = true;
  var t = b.textContent;
  b.textContent = 'A guardar…';
  return p.then(function (r) { b.disabled = false; b.textContent = t; return r; },
                function (e) { b.disabled = false; b.textContent = t; throw e; });
}

// ── Alunos ───────────────────────────────────────────────────
var F_ALUNO = [
  { n: 'nome_completo', l: 'Nome completo', req: true, full: true },
  { n: 'escola', l: 'Escola', t: 'select', o: function () { return OPT.escolas(); }, req: true },
  { n: 'sala', l: 'Sala / turma' },
  { n: 'data_nascimento', l: 'Data de nascimento', t: 'date' },
  { n: 'sexo', l: 'Sexo', t: 'select', o: [['F', 'Feminino'], ['M', 'Masculino']] },
  { n: 'estado', l: 'Estado', t: 'select', o: ESTADOS, req: true, def: 'ativo' },
  { n: 'data_entrada', l: 'Data de entrada', t: 'date' },
  { n: 'data_saida', l: 'Data de saída', t: 'date' },
  { n: 'bairro', l: 'Bairro' },
  { n: 'endereco', l: 'Endereço', full: true },
  { n: 'observacoes', l: 'Observações', t: 'textarea', full: true }
];

function viewAlunos(v) {
  v.appendChild(pageHead('Alunos', S.escola === 'TODAS' ? 'Todas as escolas' : escolaNome(S.escola),
    btn('+ Novo aluno', function () { location.hash = '#/aluno/novo'; }, 'primary')));
  var q = h('input', { type: 'search', placeholder: 'Procurar: nome, código, encarregado, telefone…', class: 'search',
    value: load('fe_q_alunos') || '' });
  var est = h('select', { class: 'filter' },
    h('option', { value: 'ativo' }, 'Activos'), h('option', { value: '' }, 'Todos'),
    ESTADOS.slice(1).map(function (e) { return h('option', { value: e[0] }, e[1]); }));
  var list = h('div', { class: 'table-wrap' });
  v.appendChild(h('div', { class: 'toolbar' }, q, est));
  v.appendChild(list);

  function draw() {
    store('fe_q_alunos', q.value);
    var term = norm(q.value);
    var data = filtroEscola(rows('Alunos')).filter(function (a) { return !est.value || a.estado === est.value; });
    if (term) {
      data = data.filter(function (a) {
        var hay = [a.codigo, a.nome_completo, a.sala, a.bairro];
        linksDoAluno(a.codigo).forEach(function (l) {
          var e = find('Encarregados', l.encarregado);
          if (e) hay.push(e.nome_completo, e.telefone_1, e.telefone_2);
        });
        return norm(hay.join(' ')).indexOf(term) >= 0 || norm(hay.join(' ').replace(/\s/g, '')).indexOf(term.replace(/\s/g, '')) >= 0;
      });
    }
    data.sort(function (a, b) { return norm(a.nome_completo) < norm(b.nome_completo) ? -1 : 1; });
    clear(list);
    if (!data.length) { list.appendChild(h('p', { class: 'empty' }, rows('Alunos').length ? 'Nenhum aluno encontrado.' : 'Ainda não há alunos. Use “Novo aluno”.')); return; }
    var tb = h('tbody');
    data.forEach(function (a) {
      var fin = financeiroDoAluno(a.codigo);
      tb.appendChild(h('tr', { onclick: function () { location.hash = '#/aluno/' + a.codigo; } },
        h('td', { 'data-l': 'Código' }, h('span', { class: 'code' }, a.codigo)),
        h('td', { 'data-l': 'Nome', class: 'strong' }, a.nome_completo),
        h('td', { 'data-l': 'Escola' }, escolaNome(a.escola), a.sala ? h('small', { class: 'muted' }, ' · ' + a.sala) : null),
        h('td', { 'data-l': 'Responsável' }, fin ? fin.nome_completo : h('span', { class: 'warn' }, 'por definir')),
        h('td', { 'data-l': 'Telefone' }, fin ? fmtTel(fin.telefone_1) : ''),
        h('td', { 'data-l': 'Estado' }, a.estado === 'ativo' ? '' : h('span', { class: 'tag' }, a.estado))));
    });
    list.appendChild(h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Código', 'Nome', 'Escola', 'Responsável', 'Telefone', ''].map(function (t) { return h('th', null, t); }))),
      tb));
    list.appendChild(h('p', { class: 'muted count' }, data.length + ' aluno' + (data.length === 1 ? '' : 's')));
  }
  q.addEventListener('input', draw);
  est.addEventListener('change', draw);
  draw();
}

function viewAluno(v, cod) {
  var isNew = cod === 'novo';
  var a = isNew ? null : find('Alunos', cod);
  if (!isNew && !a) { v.appendChild(pageHead('Aluno não encontrado')); return; }
  v.appendChild(h('a', { class: 'back', href: '#/alunos' }, '← Alunos'));
  v.appendChild(pageHead(isNew ? 'Novo aluno' : a.nome_completo,
    isNew ? 'O código é atribuído automaticamente pela escola.' : null,
    isNew ? null : h('span', { class: 'code big-code' }, a.codigo)));

  var defs = isNew ? { escola: S.escola !== 'TODAS' ? S.escola : '', estado: 'ativo', data_entrada: hoje() } : a;
  var f = buildForm(F_ALUNO, defs, { editing: !isNew });
  var save = btn(isNew ? 'Guardar aluno' : 'Guardar alterações', function () {
    if (!f.check()) return;
    var rec = f.get();
    if (!isNew) rec.codigo = a.codigo;
    busy(save, gravar('Alunos', rec, isNew)).then(function (r) {
      if (isNew) location.hash = '#/aluno/' + r.codigo; else route();
    }).catch(function () {});
  }, 'primary');
  v.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Dados do aluno'), f.el, h('div', { class: 'form-actions' }, save)));

  if (isNew) return;
  v.appendChild(panelEncarregadosDoAluno(a));
  v.appendChild(panelSituacaoAluno(a));
  v.appendChild(panelDescontos(a));
}

function panelEncarregadosDoAluno(a) {
  var p = h('section', { class: 'panel' }, h('h2', null, 'Encarregados'));
  var links = linksDoAluno(a.codigo);
  if (!links.length) p.appendChild(h('p', { class: 'warn' }, 'Nenhum encarregado ligado. Ligue pelo menos o responsável financeiro.'));
  links.forEach(function (l) {
    var e = find('Encarregados', l.encarregado);
    if (!e) return;
    var fin = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: l.responsavel_financeiro === SIM, onchange: function () {
      updLink(l, { responsavel_financeiro: this.checked ? SIM : NAO });
    } }), 'Responsável financeiro');
    var pri = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: l.contacto_principal === SIM, onchange: function () {
      updLink(l, { contacto_principal: this.checked ? SIM : NAO });
    } }), 'Contacto principal');
    p.appendChild(h('div', { class: 'link-row' },
      h('div', { class: 'who' },
        h('a', { href: '#/encarregado/' + e.codigo, class: 'strong' }, e.nome_completo),
        h('small', { class: 'muted' }, (l.parentesco || 'parentesco?') + ' · ' + e.codigo),
        h('div', { class: 'tels' },
          h('a', { href: 'tel:+258' + e.telefone_1 }, fmtTel(e.telefone_1)),
          e.telefone_2 ? h('a', { href: 'tel:+258' + e.telefone_2 }, fmtTel(e.telefone_2)) : null,
          e.tem_whatsapp === SIM ? h('a', { href: waLink(e.telefone_1), target: '_blank', rel: 'noopener', class: 'wa' }, 'WhatsApp') : null)),
      h('div', { class: 'flags' }, fin, pri),
      btn('Remover', function () {
        if (!window.confirm('Remover a ligação de ' + e.nome_completo + ' a ' + a.nome_completo + '?')) return;
        if (!navigator.onLine) { toast('Sem ligação à internet.', 'erro'); return; }
        api('removeLink', { id: l.id }).then(function () { removeLocal('AlunoEncarregado', l.id); toast('Ligação removida.', 'ok'); route(); })
          .catch(function (err) { toast(err.message, 'erro'); });
      }, 'ghost small')));
  });
  p.appendChild(linkPicker(a));
  return p;
}

function updLink(l, changes) {
  gravar('AlunoEncarregado', Object.assign({}, l, changes), false).then(function () { route(); }, function () { route(); });
}

// Procurar encarregado existente ou criar novo e ligar ao aluno
function linkPicker(a) {
  var box = h('div', { class: 'picker' });
  var semFin = !financeiroDoAluno(a.codigo);
  var semPri = !linksDoAluno(a.codigo).some(function (l) { return l.contacto_principal === SIM; });
  var parent = h('input', { type: 'text', list: 'dl-parentesco', placeholder: 'Parentesco (Mãe, Pai…)' });
  var cFin = h('input', { type: 'checkbox', checked: semFin });
  var cPri = h('input', { type: 'checkbox', checked: semPri });
  var q = h('input', { type: 'search', placeholder: 'Procurar encarregado por nome ou telefone…', class: 'search' });
  var res = h('div', { class: 'results' });
  var novo = h('div', { class: 'novo-enc' });

  function ligar(codEnc) {
    return gravar('AlunoEncarregado', { aluno: a.codigo, encarregado: codEnc, parentesco: parent.value.trim(),
      responsavel_financeiro: cFin.checked ? SIM : NAO, contacto_principal: cPri.checked ? SIM : NAO }, true)
      .then(function () { route(); });
  }
  function draw() {
    clear(res);
    var t = norm(q.value).replace(/\s/g, '');
    if (t.length < 2) return;
    var ja = linksDoAluno(a.codigo).map(function (l) { return l.encarregado; });
    var found = rows('Encarregados').filter(function (e) {
      if (ja.indexOf(e.codigo) >= 0) return false;
      return norm(e.nome_completo).replace(/\s/g, '').indexOf(t) >= 0 || String(e.telefone_1).indexOf(t) >= 0 ||
        String(e.telefone_2 || '').indexOf(t) >= 0 || norm(e.codigo) === t;
    }).slice(0, 8);
    if (!found.length) res.appendChild(h('p', { class: 'muted' }, 'Nenhum encarregado encontrado — crie um novo abaixo.'));
    found.forEach(function (e) {
      var filhos = linksDoEncarregado(e.codigo).map(function (l) { var x = find('Alunos', l.aluno); return x ? x.nome_completo : l.aluno; });
      var b = btn('Ligar', function () { busy(b, ligar(e.codigo)).catch(function () {}); }, 'small');
      res.appendChild(h('div', { class: 'result' },
        h('div', null, h('strong', null, e.nome_completo), h('small', { class: 'muted' }, ' ' + fmtTel(e.telefone_1) + ' · ' + e.codigo),
          filhos.length ? h('div', null, h('small', { class: 'muted' }, 'Educandos: ' + filhos.join(', '))) : null), b));
    });
  }
  q.addEventListener('input', draw);

  var abrir = btn('+ Novo encarregado', function () {
    clear(novo);
    var f = buildForm(F_ENCARREGADO, { tem_whatsapp: SIM });
    var s = btn('Criar e ligar', function () {
      if (!f.check()) return;
      busy(s, gravar('Encarregados', f.get(), true).then(function (e) { return ligar(e.codigo); })).catch(function (err) {
        if (err && err.extra && err.extra.codigo) { q.value = err.extra.codigo; draw(); }
      });
    }, 'primary');
    novo.appendChild(h('div', { class: 'sub-panel' }, h('h3', null, 'Novo encarregado'), f.el,
      h('div', { class: 'form-actions' }, btn('Cancelar', function () { clear(novo); }, 'ghost'), s)));
  }, 'ghost');

  box.appendChild(h('h3', null, 'Ligar encarregado'));
  box.appendChild(h('div', { class: 'link-opts' }, parent,
    h('label', { class: 'chk' }, cFin, 'Responsável financeiro'),
    h('label', { class: 'chk' }, cPri, 'Contacto principal')));
  box.appendChild(h('datalist', { id: 'dl-parentesco' }, PARENTESCOS.map(function (x) { return h('option', { value: x }); })));
  box.appendChild(q);
  box.appendChild(res);
  box.appendChild(abrir);
  box.appendChild(novo);
  return box;
}

// ── Descontos ────────────────────────────────────────────────
var F_DESCONTO = [
  { n: 'tipo_cobranca', l: 'Aplica-se a', t: 'select', o: function () { return OPT.tiposTodos(); }, req: true, def: 'MENSALIDADE' },
  { n: 'modo', l: 'Modo', t: 'select', o: [['percentagem', 'Percentagem (%)'], ['valor', 'Valor fixo (MT)']], req: true },
  { n: 'valor', l: 'Valor', t: 'number', min: 0, step: 'any', req: true },
  { n: 'ano', l: 'Ano lectivo', t: 'select', o: function () { return OPT.anos(); }, req: true },
  { n: 'mes_de', l: 'Do mês', t: 'select', o: OPT.meses, req: true },
  { n: 'mes_ate', l: 'Até ao mês', t: 'select', o: OPT.meses, req: true },
  { n: 'motivo', l: 'Motivo', req: true, full: true, list: ['Irmãos', 'Filho de funcionário', 'Bolsa', 'Dificuldade económica', 'Isenção total'] },
  { n: 'autorizado_por', l: 'Autorizado por', full: true }
];

function descTexto(d) {
  var t = d.tipo_cobranca === 'TODOS' ? 'Todas as cobranças' : ((find('TiposCobranca', d.tipo_cobranca) || {}).nome || d.tipo_cobranca);
  var val = d.modo === 'percentagem' ? Number(d.valor) + '%' : fmtMT(d.valor);
  return t + ': ' + val + ' · ' + MESES[d.mes_de - 1] + ' a ' + MESES[d.mes_ate - 1] + ' ' + d.ano;
}

function panelDescontos(a) {
  var p = h('section', { class: 'panel' }, h('h2', null, 'Descontos e isenções'));
  var list = rows('Descontos').filter(function (d) { return d.aluno === a.codigo; });
  if (!list.length) p.appendChild(h('p', { class: 'muted' }, 'Sem descontos.'));
  list.forEach(function (d) {
    p.appendChild(h('div', { class: 'link-row' + (d.ativo === SIM ? '' : ' off') },
      h('div', { class: 'who' }, h('strong', null, descTexto(d)),
        h('small', { class: 'muted' }, d.motivo + (d.autorizado_por ? ' · autorizado por ' + d.autorizado_por : '') + (d.ativo === SIM ? '' : ' · desactivado'))),
      isAdmin() ? btn(d.ativo === SIM ? 'Desactivar' : 'Reactivar', function () {
        gravar('Descontos', Object.assign({}, d, { ativo: d.ativo === SIM ? NAO : SIM }), false).then(route, function () {});
      }, 'ghost small') : null));
  });
  if (!isAdmin()) { p.appendChild(h('p', { class: 'muted' }, 'Só o administrador pode conceder descontos.')); return p; }
  var slot = h('div');
  p.appendChild(btn('+ Novo desconto', function () {
    clear(slot);
    var ano = anoAtivo();
    var f = buildForm(F_DESCONTO, { ano: ano ? ano.ano : '', mes_de: ano ? ano.mes_inicio : 2, mes_ate: ano ? ano.mes_fim : 11,
      autorizado_por: S.user.nome, modo: 'percentagem' });
    var s = btn('Guardar desconto', function () {
      if (!f.check()) return;
      busy(s, gravar('Descontos', Object.assign({ aluno: a.codigo }, f.get()), true)).then(route, function () {});
    }, 'primary');
    slot.appendChild(h('div', { class: 'sub-panel' }, f.el, h('div', { class: 'form-actions' }, btn('Cancelar', function () { clear(slot); }, 'ghost'), s)));
  }, 'ghost'));
  p.appendChild(slot);
  return p;
}

// ── Encarregados ─────────────────────────────────────────────
var F_ENCARREGADO = [
  { n: 'nome_completo', l: 'Nome completo', req: true, full: true },
  { n: 'telefone_1', l: 'Telefone 1', t: 'tel', req: true, ph: '84 123 4567' },
  { n: 'telefone_2', l: 'Telefone 2', t: 'tel' },
  { n: 'tem_whatsapp', l: 'Tem WhatsApp no telefone 1?', t: 'simnao' },
  { n: 'profissao', l: 'Profissão' },
  { n: 'bairro', l: 'Bairro' },
  { n: 'endereco', l: 'Endereço', full: true },
  { n: 'observacoes', l: 'Observações', t: 'textarea', full: true }
];

function viewEncarregados(v) {
  v.appendChild(pageHead('Encarregados', S.escola === 'TODAS' ? 'Todas as escolas' : 'Com educandos em ' + escolaNome(S.escola),
    btn('+ Novo encarregado', function () { location.hash = '#/encarregado/novo'; }, 'primary')));
  var q = h('input', { type: 'search', placeholder: 'Procurar: nome, telefone, educando…', class: 'search' });
  var list = h('div', { class: 'table-wrap' });
  v.appendChild(h('div', { class: 'toolbar' }, q));
  v.appendChild(list);
  function draw() {
    var term = norm(q.value);
    var data = rows('Encarregados').map(function (e) {
      var al = linksDoEncarregado(e.codigo).map(function (l) { return find('Alunos', l.aluno); }).filter(Boolean);
      return { e: e, al: al };
    });
    if (S.escola !== 'TODAS') data = data.filter(function (x) { return x.al.some(function (a) { return a.escola === S.escola; }); });
    if (term) {
      var t2 = term.replace(/\s/g, '');
      data = data.filter(function (x) {
        var hay = norm([x.e.codigo, x.e.nome_completo, x.e.telefone_1, x.e.telefone_2].concat(x.al.map(function (a) { return a.nome_completo + ' ' + a.codigo; })).join(' '));
        return hay.indexOf(term) >= 0 || hay.replace(/\s/g, '').indexOf(t2) >= 0;
      });
    }
    data.sort(function (a, b) { return norm(a.e.nome_completo) < norm(b.e.nome_completo) ? -1 : 1; });
    clear(list);
    if (!data.length) { list.appendChild(h('p', { class: 'empty' }, 'Nenhum encarregado encontrado.')); return; }
    var tb = h('tbody');
    data.forEach(function (x) {
      tb.appendChild(h('tr', { onclick: function () { location.hash = '#/encarregado/' + x.e.codigo; } },
        h('td', { 'data-l': 'Código' }, h('span', { class: 'code' }, x.e.codigo)),
        h('td', { 'data-l': 'Nome', class: 'strong' }, x.e.nome_completo),
        h('td', { 'data-l': 'Telefone' }, fmtTel(x.e.telefone_1), x.e.tem_whatsapp === SIM ? h('span', { class: 'tag wa' }, 'WA') : null),
        h('td', { 'data-l': 'Educandos' }, x.al.length ? x.al.map(function (a) { return a.nome_completo.split(' ')[0] + ' (' + a.codigo + ')'; }).join(', ') : h('span', { class: 'warn' }, 'nenhum'))));
    });
    list.appendChild(h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Código', 'Nome', 'Telefone', 'Educandos'].map(function (t) { return h('th', null, t); }))), tb));
    list.appendChild(h('p', { class: 'muted count' }, data.length + ' encarregado' + (data.length === 1 ? '' : 's')));
  }
  q.addEventListener('input', draw);
  draw();
}

function viewEncarregado(v, cod) {
  var isNew = cod === 'novo';
  var e = isNew ? null : find('Encarregados', cod);
  if (!isNew && !e) { v.appendChild(pageHead('Encarregado não encontrado')); return; }
  v.appendChild(h('a', { class: 'back', href: '#/encarregados' }, '← Encarregados'));
  v.appendChild(pageHead(isNew ? 'Novo encarregado' : e.nome_completo, null, isNew ? null : h('span', { class: 'code big-code' }, e.codigo)));
  var f = buildForm(F_ENCARREGADO, isNew ? { tem_whatsapp: SIM } : e);
  var save = btn(isNew ? 'Guardar encarregado' : 'Guardar alterações', function () {
    if (!f.check()) return;
    var rec = f.get();
    if (!isNew) rec.codigo = e.codigo;
    busy(save, gravar('Encarregados', rec, isNew)).then(function (r) {
      if (isNew) location.hash = '#/encarregado/' + r.codigo; else route();
    }).catch(function (err) {
      if (err && err.extra && err.extra.codigo && window.confirm('Abrir o encarregado ' + err.extra.codigo + '?')) location.hash = '#/encarregado/' + err.extra.codigo;
    });
  }, 'primary');
  var acts = [];
  if (!isNew) {
    acts.push(h('a', { class: 'btn ghost', href: 'tel:+258' + e.telefone_1 }, 'Ligar'));
    if (e.tem_whatsapp === SIM) acts.push(h('a', { class: 'btn ghost', href: waLink(e.telefone_1), target: '_blank', rel: 'noopener' }, 'WhatsApp'));
  }
  v.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Dados'), f.el, h('div', { class: 'form-actions' }, acts, save)));
  if (isNew) return;

  var p = h('section', { class: 'panel' }, h('h2', null, 'Educandos'));
  var links = linksDoEncarregado(e.codigo);
  if (!links.length) p.appendChild(h('p', { class: 'muted' }, 'Sem educandos ligados. Abra a ficha do aluno para o ligar.'));
  links.forEach(function (l) {
    var a = find('Alunos', l.aluno);
    if (!a) return;
    p.appendChild(h('div', { class: 'link-row' },
      h('div', { class: 'who' }, h('a', { href: '#/aluno/' + a.codigo, class: 'strong' }, a.nome_completo),
        h('small', { class: 'muted' }, a.codigo + ' · ' + escolaNome(a.escola) + (a.sala ? ' · ' + a.sala : '') + ' · ' + (l.parentesco || ''))),
      h('div', { class: 'flags' },
        l.responsavel_financeiro === SIM ? h('span', { class: 'tag ok' }, 'Responsável financeiro') : null,
        l.contacto_principal === SIM ? h('span', { class: 'tag' }, 'Contacto principal') : null,
        a.estado !== 'ativo' ? h('span', { class: 'tag' }, a.estado) : null)));
  });
  v.appendChild(p);
  v.appendChild(panelSituacaoFamilia(e));
}

// ── Dinheiro: contas feitas sempre a partir dos movimentos ───
// Nunca se lê um saldo guardado à mão: dívida = cobranças válidas − alocações.

function fila() { return load('fe_fila') || []; }
function setFila(f) { store('fe_fila', f); }
function filaErros() { return load('fe_fila_erros') || []; }
function setFilaErros(f) { store('fe_fila_erros', f); }

function guardarChave(numero, chave) {
  if (!numero || !chave) return;
  S.chaves[numero] = chave;
  store('fe_chaves', S.chaves);
}

function linkRecibo(numero) {
  var k = S.chaves[numero];
  return k ? CFG.API_URL + '?recibo=' + encodeURIComponent(numero) + '&k=' + k : '';
}

// Quanto já está alocado a cada cobrança, contando a fila por enviar.
function alocadoPorCobranca() {
  var validos = {};
  rows('Recebimentos').forEach(function (r) { if (r.estado !== 'anulado') validos[r.numero_recibo] = true; });
  var m = {};
  rows('Alocacoes').forEach(function (a) {
    if (!validos[a.recebimento]) return;
    m[a.cobranca] = mt((m[a.cobranca] || 0) + Number(a.valor));
  });
  filaDe('receber').forEach(function (q) {
    (q.alocacoes || []).forEach(function (x) { m[x.cobranca] = mt((m[x.cobranca] || 0) + Number(x.valor)); });
  });
  return m;
}

function filhosDe(codEnc) {
  return rows('AlunoEncarregado').filter(function (l) { return l.encarregado === codEnc; })
    .map(function (l) { return find('Alunos', l.aluno); }).filter(Boolean);
}

function emAtraso(c) {
  return ['aberta', 'parcial'].indexOf(c.estado) >= 0 && String(c.data_vencimento) < hoje();
}

// Dívidas em aberto da família, da mais antiga para a mais recente.
function dividasFamilia(codEnc, alunoPrimeiro) {
  var al = alocadoPorCobranca();
  var filhos = {};
  filhosDe(codEnc).forEach(function (a) { filhos[a.codigo] = true; });
  var lista = rows('Cobrancas').filter(function (c) {
    return filhos[c.aluno] && c.estado !== 'anulada';
  }).map(function (c) {
    var pago = mt(al[c.id] || 0);
    return { cob: c, pago: pago, falta: mt(Math.max(0, mt(Number(c.valor_liquido) - pago))) };
  }).filter(function (d) { return d.falta > 0.004; });
  lista.sort(function (a, b) {
    if (alunoPrimeiro) {
      var pa = a.cob.aluno === alunoPrimeiro ? 0 : 1, pb = b.cob.aluno === alunoPrimeiro ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    if (a.cob.data_vencimento !== b.cob.data_vencimento) return a.cob.data_vencimento < b.cob.data_vencimento ? -1 : 1;
    return a.cob.id < b.cob.id ? -1 : 1;
  });
  return lista;
}

function dividaTotal(codEnc) {
  return dividasFamilia(codEnc).reduce(function (t, d) { return mt(t + d.falta); }, 0);
}

// Crédito: dinheiro recebido que ainda não cobre nenhuma cobrança.
function creditoFamilia(codEnc) {
  var porRec = {};
  rows('Alocacoes').forEach(function (a) { porRec[a.recebimento] = mt((porRec[a.recebimento] || 0) + Number(a.valor)); });
  var t = 0;
  rows('Recebimentos').forEach(function (r) {
    if (r.estado === 'anulado' || r.encarregado !== codEnc) return;
    t = mt(t + Math.max(0, mt(Number(r.valor) - (porRec[r.numero_recibo] || 0))));
  });
  filaDe('receber').forEach(function (q) {
    if (q.encarregado !== codEnc) return;
    var usado = (q.alocacoes || []).reduce(function (s, x) { return mt(s + Number(x.valor)); }, 0);
    t = mt(t + Math.max(0, mt(Number(q.valor) - usado)));
  });
  return t;
}

function recebimentosFamilia(codEnc) {
  var lista = rows('Recebimentos').filter(function (r) { return r.encarregado === codEnc; });
  filaDe('receber').forEach(function (q) {
    if (q.encarregado === codEnc) lista.push({ numero_recibo: q.ref_cliente, data: q.data, valor: q.valor,
      metodo: q.metodo, conta: q.conta, encarregado: q.encarregado, aluno: q.aluno, estado: 'valido', _fila: true });
  });
  lista.sort(function (a, b) { return String(a.data) > String(b.data) ? -1 : 1; });
  return lista;
}

function cobrancasDoAluno(cod) {
  var al = alocadoPorCobranca();
  return rows('Cobrancas').filter(function (c) { return c.aluno === cod; })
    .map(function (c) {
      var pago = mt(al[c.id] || 0);
      return { cob: c, pago: pago, falta: mt(Math.max(0, mt(Number(c.valor_liquido) - pago))) };
    })
    .sort(function (a, b) { return a.cob.data_vencimento < b.cob.data_vencimento ? -1 : 1; });
}

// Reparte um valor pelas dívidas: as mais antigas primeiro.
// O dinheiro novo entra primeiro; o crédito antigo cobre o que sobrar.
function propor(lista, dinheiro, credito) {
  var rd = mt(dinheiro), rc = mt(credito), aloc = [], cred = [];
  lista.forEach(function (d) {
    var falta = d.falta;
    if (falta <= 0.004) return;
    var vd = mt(Math.min(rd, falta));
    if (vd > 0.004) { aloc.push({ cobranca: d.cob.id, valor: vd }); rd = mt(rd - vd); falta = mt(falta - vd); }
    var vc = mt(Math.min(rc, falta));
    if (vc > 0.004) { cred.push({ cobranca: d.cob.id, valor: vc }); rc = mt(rc - vc); }
  });
  return { alocacoes: aloc, credito: cred };
}

// ── fila offline ─────────────────────────────────────────────
// Sem rede o pagamento fica no telefone com um número provisório;
// o número de recibo verdadeiro só chega quando o servidor o aceita.
function novaRefCliente() {
  return 'FILA-' + hoje().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// A fila guarda pagamentos, despesas e transferências.
// _tipo diz a quem enviar; o que está lá sem _tipo é um pagamento antigo.
function tipoDaFila(q) { return q._tipo || 'receber'; }
function filaDe(tipo) { return fila().filter(function (q) { return tipoDaFila(q) === tipo; }); }

function enfileirar(tipo, payload) {
  payload._tipo = tipo;
  var f = fila();
  f.push(payload);
  setFila(f);
}

function tirarDaFila(ref) {
  setFila(fila().filter(function (x) { return x.ref_cliente !== ref; }));
}

function guardarResposta(res) {
  if (res.recibo) upsertLocal('Recebimentos', res.recibo);
  (res.alocacoes || []).forEach(function (a) { upsertLocal('Alocacoes', a); });
  (res.cobrancas || []).forEach(function (c) { upsertLocal('Cobrancas', c); });
  if (res.despesa) upsertLocal('Despesas', res.despesa);
  if (res.transferencia) upsertLocal('Transferencias', res.transferencia);
  if (res.recibo) guardarChave(res.recibo.numero_recibo, res.chave);
}

// Envia a fila por ordem. Um pagamento que o servidor recusa sai da fila
// (reenviá-lo seria sempre em vão) e fica num aviso para o operador tratar.
function flushFila() {
  var f = fila();
  if (!f.length || !navigator.onLine || !S.token) return Promise.resolve();
  var q = f[0];
  return api(tipoDaFila(q), q).then(function (res) {
    tirarDaFila(q.ref_cliente);
    guardarResposta(res);
    return flushFila();
  }).catch(function (e) {
    if (['validacao', 'duplicado', 'permissao', 'naoexiste'].indexOf(e.code) >= 0) {
      tirarDaFila(q.ref_cliente);
      setFilaErros(filaErros().concat([{ lancamento: q, erro: e.message, quando: hoje() }]));
      return flushFila();
    }
    return Promise.resolve();   // falta de rede: fica na fila
  });
}

function avisoFila() {
  var f = fila(), er = filaErros();
  if (!f.length && !er.length) return null;
  var box = h('section', { class: 'panel aviso' });
  if (f.length) {
    box.appendChild(h('h2', null, f.length + ' lançamento' + (f.length === 1 ? '' : 's') + ' por enviar'));
    box.appendChild(h('p', { class: 'muted' }, 'Ficam guardados no telefone com número provisório. Vão sozinhos quando houver rede.'));
    f.forEach(function (q) {
      box.appendChild(h('div', { class: 'link-row' },
        h('div', { class: 'who' }, h('strong', null, fmtMT(q.valor)),
          h('small', { class: 'muted' }, resumoDaFila(q) + ' · ' + q.ref_cliente))));
    });
    box.appendChild(btn('Tentar enviar agora', function () {
      if (!navigator.onLine) { toast('Ainda sem rede.', 'erro'); return; }
      flushFila().then(function () { sincronizar(true); });
    }, 'ghost small'));
  }
  if (er.length) {
    box.appendChild(h('h2', { class: 'erro' }, er.length + ' lançamento' + (er.length === 1 ? ' recusado' : 's recusados')));
    er.forEach(function (x) {
      box.appendChild(h('div', { class: 'link-row' },
        h('div', { class: 'who' }, h('strong', null, fmtMT((x.lancamento || x.pagamento || {}).valor)),
          h('small', { class: 'erro' }, x.erro))));
    });
    box.appendChild(btn('Já tratei disto', function () {
      if (!window.confirm('Apagar os avisos dos lançamentos recusados?')) return;
      setFilaErros([]); route();
    }, 'ghost small'));
  }
  return box;
}

// ── Receber ──────────────────────────────────────────────────
function viewReceber(v, codEnc) {
  v.appendChild(pageHead('Receber', 'Procure a família pelo código do aluno, nome ou telefone.'));
  var aviso = avisoFila();
  if (aviso) v.appendChild(aviso);
  if (codEnc) { painelFamilia(v, codEnc); return; }

  var q = h('input', { type: 'search', class: 'search grande', placeholder: 'B014, nome do aluno, nome ou telefone do encarregado…',
    autofocus: true });
  var res = h('div', { class: 'results' });
  v.appendChild(h('div', { class: 'toolbar' }, q));
  v.appendChild(res);

  function draw() {
    clear(res);
    var t = norm(q.value), t2 = t.replace(/\s/g, '');
    if (t.length < 2) { res.appendChild(h('p', { class: 'muted' }, 'Escreva pelo menos duas letras ou o código do aluno.')); return; }
    var encs = {};
    rows('Alunos').forEach(function (a) {
      if (S.escola !== 'TODAS' && a.escola !== S.escola) return;
      var bateAluno = norm(a.codigo) === t2 || norm(a.nome_completo).replace(/\s/g, '').indexOf(t2) >= 0;
      linksDoAluno(a.codigo).forEach(function (l) {
        var e = find('Encarregados', l.encarregado);
        if (!e) return;
        var bateEnc = norm(e.nome_completo).replace(/\s/g, '').indexOf(t2) >= 0 ||
          String(e.telefone_1).indexOf(t2) >= 0 || String(e.telefone_2 || '').indexOf(t2) >= 0 || norm(e.codigo) === t2;
        if (bateAluno || bateEnc) encs[e.codigo] = true;
      });
    });
    var lista = Object.keys(encs).map(function (c) { return find('Encarregados', c); }).filter(Boolean);
    if (!lista.length) { res.appendChild(h('p', { class: 'empty' }, 'Ninguém encontrado. Experimente outro nome ou o código do aluno.')); return; }
    lista.sort(function (a, b) { return norm(a.nome_completo) < norm(b.nome_completo) ? -1 : 1; });
    lista.slice(0, 12).forEach(function (e) {
      var divida = dividaTotal(e.codigo), credito = creditoFamilia(e.codigo);
      res.appendChild(h('a', { class: 'result familia', href: '#/receber/' + e.codigo },
        h('div', null, h('strong', null, e.nome_completo),
          h('small', { class: 'muted' }, ' ' + fmtTel(e.telefone_1) + ' · ' + e.codigo),
          h('div', null, h('small', { class: 'muted' }, filhosDe(e.codigo).map(function (a) {
            return a.nome_completo + ' (' + a.codigo + ')'; }).join(' · ') || 'sem educandos'))),
        h('div', { class: 'saldo' },
          h('strong', { class: divida > 0 ? 'devedor' : 'ok' }, divida > 0 ? fmtMT(divida) : 'em dia'),
          credito > 0 ? h('small', { class: 'credito' }, 'crédito ' + fmtMT(credito)) : null)));
    });
  }
  q.addEventListener('input', draw);
  draw();
}

function painelFamilia(v, codEnc) {
  var e = find('Encarregados', codEnc);
  if (!e) { v.appendChild(h('p', { class: 'empty' }, 'Encarregado não encontrado.')); return; }
  v.appendChild(h('a', { class: 'back', href: '#/receber' }, '← Procurar outra família'));

  var divida = dividaTotal(codEnc), credito = creditoFamilia(codEnc);
  var filhos = filhosDe(codEnc);
  v.appendChild(h('section', { class: 'panel familia-topo' },
    h('div', null, h('h2', null, e.nome_completo),
      h('p', { class: 'muted' }, filhos.map(function (a) { return a.nome_completo + ' (' + a.codigo + ' · ' + escolaNome(a.escola) + ')'; }).join(' · ') || 'Sem educandos ligados'),
      h('div', { class: 'tels' }, h('a', { href: 'tel:+258' + e.telefone_1 }, fmtTel(e.telefone_1)),
        h('a', { href: '#/encarregado/' + e.codigo }, 'Ficha da família'))),
    h('div', { class: 'numeros' },
      h('div', null, h('small', null, 'Dívida em aberto'), h('strong', { class: divida > 0 ? 'devedor' : 'ok' }, fmtMT(divida))),
      credito > 0 ? h('div', null, h('small', null, 'Crédito'), h('strong', { class: 'credito' }, fmtMT(credito))) : null)));

  if (!filhos.length) {
    v.appendChild(h('section', { class: 'panel soft' }, h('p', null, 'Ligue esta pessoa a um aluno antes de receber pagamentos.')));
    return;
  }
  v.appendChild(formPagamento(e, divida, credito));
  v.appendChild(panelHistoricoFamilia(e));
}

function formPagamento(e, divida, credito) {
  var p = h('section', { class: 'panel' }, h('h2', null, 'Novo pagamento'));
  var offline = !navigator.onLine;
  var filhos = filhosDe(e.codigo);

  var fValor = h('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', class: 'valor-grande', placeholder: '0,00' });
  var fMetodo = h('select', null, METODOS.map(function (m) { return h('option', { value: m[0] }, m[1]); }));
  var fConta = h('select', null, rows('Contas').filter(function (c) { return c.ativa === SIM; })
    .map(function (c) { return h('option', { value: c.codigo }, c.nome); }));
  var fRef = h('input', { type: 'text', placeholder: 'Referência da transacção' });
  var fData = h('input', { type: 'date', value: hoje(), max: hoje() });
  var fObs = h('input', { type: 'text', placeholder: 'Observação (opcional)' });
  var fAluno = h('select', null, h('option', { value: '' }, 'Toda a família'),
    filhos.map(function (a) { return h('option', { value: a.codigo }, a.nome_completo); }));
  var usaCredito = h('input', { type: 'checkbox', checked: credito > 0 && !offline, disabled: credito <= 0 || offline });

  var linhaRef = h('div', { class: 'field' }, h('label', null, 'Referência'), fRef);
  var tabela = h('div', { class: 'aloc' });
  var resumo = h('div', { class: 'resumo-aloc' });
  var manual = {};          // cobrança → valor escrito à mão pelo operador

  function contaSugerida() {
    var m = fMetodo.value;
    var alvo = m === 'numerario' ? 'caixa' : m === 'emola' ? 'emola' : 'banco';
    var c = rows('Contas').filter(function (x) { return x.ativa === SIM && x.tipo === alvo; })[0];
    if (c) fConta.value = c.codigo;
  }

  function desenhar() {
    linhaRef.style.display = PRECISA_REF.indexOf(fMetodo.value) >= 0 ? '' : 'none';
    var dinheiro = mt(fValor.value || 0);
    var cred = usaCredito.checked ? credito : 0;
    var lista = dividasFamilia(e.codigo, fAluno.value || null);
    var auto = propor(lista, dinheiro, cred);
    var porCob = {};
    auto.alocacoes.forEach(function (x) { porCob[x.cobranca] = { dinheiro: x.valor, credito: 0 }; });
    auto.credito.forEach(function (x) {
      porCob[x.cobranca] = porCob[x.cobranca] || { dinheiro: 0, credito: 0 };
      porCob[x.cobranca].credito = x.valor;
    });

    clear(tabela);
    if (!lista.length) {
      tabela.appendChild(h('p', { class: 'muted' }, 'Esta família não tem dívidas em aberto. O pagamento fica como crédito.'));
    } else {
      var tb = h('tbody');
      lista.forEach(function (d) {
        var prop = porCob[d.cob.id] || { dinheiro: 0, credito: 0 };
        var usado = manual[d.cob.id] !== undefined ? mt(manual[d.cob.id]) : mt(prop.dinheiro + prop.credito);
        var inp = h('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', class: 'aloc-val',
          value: usado > 0 ? String(usado) : '' });
        inp.addEventListener('input', function () {
          manual[d.cob.id] = mt(this.value || 0);
          calcular();
        });
        var al = find('Alunos', d.cob.aluno);
        tb.appendChild(h('tr', { class: emAtraso(d.cob) ? 'atraso' : '' },
          h('td', { 'data-l': 'Aluno' }, al ? al.nome_completo.split(' ')[0] : d.cob.aluno,
            h('small', { class: 'muted' }, ' ' + d.cob.aluno)),
          h('td', { 'data-l': 'Referente a' }, d.cob.descricao,
            emAtraso(d.cob) ? h('span', { class: 'tag atraso' }, 'em atraso') : null,
            d.pago > 0 ? h('small', { class: 'muted' }, ' já pago ' + fmtMT(d.pago)) : null),
          h('td', { 'data-l': 'Em falta', class: 'num' }, fmtMT(d.falta)),
          h('td', { 'data-l': 'A pagar agora' }, inp)));
      });
      tabela.appendChild(h('table', { class: 'tbl aloc-tbl' },
        h('thead', null, h('tr', null, ['Aluno', 'Referente a', 'Em falta', 'A pagar agora'].map(function (t) { return h('th', null, t); }))), tb));
    }
    calcular();
  }

  function recolher() {
    var dinheiro = mt(fValor.value || 0);
    var cred = usaCredito.checked ? credito : 0;
    var lista = dividasFamilia(e.codigo, fAluno.value || null);
    // vale o que está escrito em cada linha, proposto ou corrigido à mão
    var pedidos = [];
    var inputs = tabela.querySelectorAll('.aloc-val');
    var ids = lista.map(function (d) { return d.cob.id; });
    var faltas = {};
    lista.forEach(function (d) { faltas[d.cob.id] = d.falta; });
    Array.prototype.forEach.call(inputs, function (inp, i) {
      var v = mt(inp.value || 0);
      if (v > 0.004) pedidos.push({ cobranca: ids[i], valor: Math.min(v, faltas[ids[i]]) });
    });
    // reparte cada pedido entre dinheiro e crédito
    var rd = dinheiro, rc = cred, aloc = [], usaCred = [];
    pedidos.forEach(function (x) {
      var vd = mt(Math.min(rd, x.valor));
      if (vd > 0.004) { aloc.push({ cobranca: x.cobranca, valor: vd }); rd = mt(rd - vd); }
      var resto = mt(x.valor - vd);
      var vc = mt(Math.min(rc, resto));
      if (vc > 0.004) { usaCred.push({ cobranca: x.cobranca, valor: vc }); rc = mt(rc - vc); }
    });
    return { dinheiro: dinheiro, credito: cred, alocacoes: aloc, usaCredito: usaCred,
      somaDinheiro: aloc.reduce(function (t, x) { return mt(t + x.valor); }, 0),
      somaCredito: usaCred.reduce(function (t, x) { return mt(t + x.valor); }, 0),
      pedido: pedidos.reduce(function (t, x) { return mt(t + x.valor); }, 0) };
  }

  function calcular() {
    var r = recolher();
    clear(resumo);
    var sobra = mt(r.dinheiro - r.somaDinheiro);
    resumo.appendChild(h('div', null, h('span', null, 'Pagamento'), h('strong', null, fmtMT(r.dinheiro))));
    if (r.somaCredito > 0) resumo.appendChild(h('div', null, h('span', null, 'Do crédito'), h('strong', { class: 'credito' }, fmtMT(r.somaCredito))));
    resumo.appendChild(h('div', null, h('span', null, 'Abate à dívida'), h('strong', null, fmtMT(mt(r.somaDinheiro + r.somaCredito)))));
    if (sobra > 0.004) resumo.appendChild(h('div', { class: 'credito' }, h('span', null, 'Fica em crédito'), h('strong', null, fmtMT(sobra))));
    if (r.pedido > mt(r.dinheiro + r.credito) + 0.004) {
      resumo.appendChild(h('p', { class: 'erro' }, 'As linhas somam ' + fmtMT(r.pedido) + ', mais do que o pagamento e o crédito.'));
    }
  }

  fValor.addEventListener('input', function () { manual = {}; desenhar(); });
  fAluno.addEventListener('change', function () { manual = {}; desenhar(); });
  usaCredito.addEventListener('change', function () { manual = {}; desenhar(); });
  fMetodo.addEventListener('change', function () { contaSugerida(); desenhar(); });

  var grid = h('div', { class: 'grid' },
    h('div', { class: 'field' }, h('label', null, 'Valor recebido (MT)', h('span', { class: 'req' }, ' *')), fValor),
    h('div', { class: 'field' }, h('label', null, 'Método'), fMetodo),
    h('div', { class: 'field' }, h('label', null, 'Conta'), fConta),
    linhaRef,
    h('div', { class: 'field' }, h('label', null, 'Data'), fData),
    h('div', { class: 'field' }, h('label', null, 'Pagamento para'), fAluno),
    h('div', { class: 'field full' }, h('label', null, 'Observação'), fObs));
  p.appendChild(grid);
  if (credito > 0) {
    p.appendChild(h('label', { class: 'chk destaque' }, usaCredito,
      'Usar o crédito de ' + fmtMT(credito) + ' nesta operação' + (offline ? ' (precisa de rede)' : '')));
  }
  p.appendChild(h('h3', null, 'Repartição pelas dívidas'));
  p.appendChild(tabela);
  p.appendChild(resumo);

  var confirmar = btn('Confirmar e emitir recibo', function () {
    var r = recolher();
    if (!(r.dinheiro > 0)) { toast('Indique o valor recebido.', 'erro'); fValor.focus(); return; }
    if (r.somaDinheiro > r.dinheiro + 0.004) { toast('A repartição é maior do que o valor recebido.', 'erro'); return; }
    if (PRECISA_REF.indexOf(fMetodo.value) >= 0 && !fRef.value.trim()) { toast('Indique a referência da transacção.', 'erro'); fRef.focus(); return; }
    var payload = { encarregado: e.codigo, aluno: fAluno.value || '', valor: r.dinheiro, metodo: fMetodo.value,
      conta: fConta.value, referencia_externa: fRef.value.trim(), observacao: fObs.value.trim(),
      data: fData.value || hoje(), alocacoes: r.alocacoes, ref_cliente: novaRefCliente() };
    if (r.usaCredito.length) payload.credito = r.usaCredito;
    var sobra = mt(r.dinheiro - r.somaDinheiro);
    var aviso = 'Receber ' + fmtMT(r.dinheiro) + ' de ' + e.nome_completo + '?' +
      (r.somaCredito > 0 ? '\n' + fmtMT(r.somaCredito) + ' saem do crédito.' : '') +
      (sobra > 0.004 ? '\n' + fmtMT(sobra) + ' ficam em crédito da família.' : '');
    if (!window.confirm(aviso)) return;

    if (!navigator.onLine) {
      if (payload.credito) { toast('Sem rede não é possível usar o crédito. Desligue essa opção.', 'erro'); return; }
      enfileirar('receber', payload);
      toast('Sem rede: o pagamento fica guardado e segue quando houver ligação.', 'ok');
      location.hash = '#/receber/' + e.codigo;
      route();
      return;
    }
    setStatus('sync');
    busy(confirmar, api('receber', payload).then(function (res) {
      setStatus('ok');
      guardarResposta(res);
      persist();
      toast('Recibo ' + res.recibo.numero_recibo + ' emitido.', 'ok');
      location.hash = '#/recibo/' + res.recibo.numero_recibo;
    })).catch(function (err) {
      setStatus('ok');
      toast(err.message, 'erro');
    });
  }, 'primary grande');

  p.appendChild(h('div', { class: 'form-actions' }, confirmar));
  if (offline) p.appendChild(h('p', { class: 'muted' }, 'Sem rede: o pagamento fica no telefone com número provisório e segue sozinho quando houver ligação.'));
  contaSugerida();
  desenhar();
  return p;
}

function panelHistoricoFamilia(e) {
  var p = h('section', { class: 'panel' }, h('h2', null, 'Pagamentos da família'));
  var lista = recebimentosFamilia(e.codigo);
  if (!lista.length) { p.appendChild(h('p', { class: 'muted' }, 'Ainda sem pagamentos.')); return p; }
  var tb = h('tbody');
  lista.slice(0, 20).forEach(function (r) {
    tb.appendChild(h('tr', { onclick: r._fila ? null : function () { location.hash = '#/recibo/' + r.numero_recibo; },
      class: r.estado === 'anulado' ? 'off' : '' },
      h('td', { 'data-l': 'Data' }, fmtData(r.data)),
      h('td', { 'data-l': 'Recibo' }, h('span', { class: 'code' }, r.numero_recibo),
        r._fila ? h('span', { class: 'tag' }, 'por enviar') : null,
        r.estado === 'anulado' ? h('span', { class: 'tag erro' }, 'anulado') : null),
      h('td', { 'data-l': 'Método' }, METODO_NOME[r.metodo] || r.metodo),
      h('td', { 'data-l': 'Valor', class: 'num strong' }, fmtMT(r.valor))));
  });
  p.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, ['Data', 'Recibo', 'Método', 'Valor'].map(function (t) { return h('th', null, t); }))), tb)));
  return p;
}

// ── Recibo ───────────────────────────────────────────────────
function primeiroNome(n) { return String(n || '').split(' ')[0]; }

function textoRecibo(enc, r, divida) {
  var l = linkRecibo(r.numero_recibo);
  return 'Bom dia, ' + primeiroNome(enc.nome_completo) + '. Recebemos ' + fmtMT(r.valor) +
    ' (recibo ' + r.numero_recibo + ').' +
    (divida > 0.004 ? ' Fica em falta ' + fmtMT(divida) + '.' : ' Está tudo pago, obrigado!') +
    (l ? ' ' + l : '');
}

function textoLembrete(enc, divida, atrasadas) {
  return 'Bom dia, ' + primeiroNome(enc.nome_completo) + '. Lembramos que há ' + fmtMT(divida) +
    ' por pagar' + (atrasadas ? ', sendo ' + atrasadas + ' mensalidade' + (atrasadas === 1 ? '' : 's') + ' em atraso' : '') +
    '. Agradecemos a sua atenção.';
}

function textoExtrato(enc) {
  var linhas = dividasFamilia(enc.codigo).map(function (d) {
    var a = find('Alunos', d.cob.aluno);
    return '· ' + (a ? primeiroNome(a.nome_completo) : d.cob.aluno) + ' — ' + d.cob.descricao + ': ' + fmtMT(d.falta);
  });
  var cred = creditoFamilia(enc.codigo);
  return 'Situação de ' + enc.nome_completo + ':\n' + (linhas.join('\n') || 'Sem dívidas em aberto.') +
    '\nTotal em falta: ' + fmtMT(dividaTotal(enc.codigo)) +
    (cred > 0 ? '\nCrédito a favor: ' + fmtMT(cred) : '');
}

function enviarWhatsApp(enc, texto, numeroRecibo) {
  window.open(waLink(enc.telefone_1, texto), '_blank');
  if (navigator.onLine) {
    api('mensagem', { encarregado: enc.codigo, canal: 'whatsapp', texto: texto, recibo: numeroRecibo || '' })
      .catch(function () {});
  }
}

function viewRecibo(v, numero) {
  var r = find('Recebimentos', numero);
  if (!r) {
    v.appendChild(pageHead('Recibo ' + numero));
    v.appendChild(h('section', { class: 'panel' }, h('p', null, 'Este recibo não está no telefone.'),
      btn('Procurar no servidor', function () {
        api('recibo', { numero: numero }).then(function (res) {
          guardarChave(numero, res.chave);
          upsertLocal('Recebimentos', res.recibo);
          route();
        }).catch(function (e) { toast(e.message, 'erro'); });
      }, 'primary')));
    return;
  }
  var enc = find('Encarregados', r.encarregado) || { nome_completo: r.encarregado, codigo: r.encarregado };
  var alocs = rows('Alocacoes').filter(function (a) { return a.recebimento === r.numero_recibo; });
  var divida = dividaTotal(enc.codigo);
  var credito = creditoFamilia(enc.codigo);

  v.appendChild(h('a', { class: 'back', href: '#/receber/' + enc.codigo }, '← ' + enc.nome_completo));
  var acts = [
    btn('Imprimir', function () { window.print(); }, 'primary'),
    btn('WhatsApp', function () { enviarWhatsApp(enc, textoRecibo(enc, r, divida), r.numero_recibo); }, 'ghost')
  ];
  if (isAdmin() && r.estado !== 'anulado') {
    acts.push(btn('Anular', function () {
      var motivo = window.prompt('Motivo da anulação do recibo ' + r.numero_recibo + ':');
      if (!motivo || !motivo.trim()) return;
      api('anularRecebimento', { numero: r.numero_recibo, motivo: motivo.trim() }).then(function (res) {
        upsertLocal('Recebimentos', res.recibo);
        (res.cobrancas || []).forEach(function (c) { upsertLocal('Cobrancas', c); });
        toast('Recibo anulado.', 'ok');
        route();
      }).catch(function (e) { toast(e.message, 'erro'); });
    }, 'ghost perigo'));
  }
  v.appendChild(pageHead('Recibo ' + r.numero_recibo,
    fmtData(r.data) + ' · ' + (METODO_NOME[r.metodo] || r.metodo) + (r.estado === 'anulado' ? ' · ANULADO' : ''), acts));

  if (r.estado === 'anulado') {
    v.appendChild(h('section', { class: 'panel anulado-aviso' },
      h('strong', null, 'Recibo anulado'), h('p', null, r.motivo_anulacao || '')));
  }
  v.appendChild(h('div', { class: 'folha-a4' }, copiaRecibo(r, enc, alocs, divida, credito, 'Original'),
    copiaRecibo(r, enc, alocs, divida, credito, 'Duplicado')));
}

function copiaRecibo(r, enc, alocs, divida, credito, qual) {
  var escolas = {};
  alocs.forEach(function (a) {
    var c = find('Cobrancas', a.cobranca);
    if (c) escolas[c.escola] = true;
  });
  var nomes = Object.keys(escolas).map(escolaNome);
  var somaAloc = alocs.reduce(function (t, a) { return mt(t + Number(a.valor)); }, 0);
  var sobra = mt(Number(r.valor) - somaAloc);
  var linhas = alocs.map(function (a) {
    var c = find('Cobrancas', a.cobranca) || {};
    var al = find('Alunos', c.aluno) || {};
    return h('tr', null,
      h('td', null, al.nome_completo || c.aluno || '', h('small', null, ' ' + (c.aluno || ''))),
      h('td', null, c.descricao || a.cobranca),
      h('td', { class: 'num' }, fmtMT(a.valor)));
  });
  return h('div', { class: 'recibo' + (r.estado === 'anulado' ? ' anulado' : '') },
    h('div', { class: 'recibo-top' },
      h('div', null, h('strong', null, 'Finanças Escolinhas'),
        h('small', null, nomes.join(' · ') || 'Rede de escolinhas')),
      h('div', { class: 'r' }, h('strong', null, r.numero_recibo), h('small', null, fmtData(r.data)),
        h('small', null, qual))),
    r.estado === 'anulado' ? h('div', { class: 'carimbo' }, 'ANULADO') : null,
    h('p', null, h('strong', null, enc.nome_completo), h('small', null, ' ' + fmtTel(enc.telefone_1 || ''))),
    linhas.length ? h('table', { class: 'tbl-recibo' },
      h('thead', null, h('tr', null, h('th', null, 'Aluno'), h('th', null, 'Referente a'), h('th', { class: 'num' }, 'Valor'))),
      h('tbody', null, linhas)) : h('p', { class: 'muted' }, 'Sem cobranças associadas.'),
    h('div', { class: 'recibo-tot' },
      h('div', null, h('span', null, 'Total pago (' + (METODO_NOME[r.metodo] || r.metodo) + ')'), h('strong', null, fmtMT(r.valor))),
      sobra > 0.004 ? h('div', null, h('span', null, 'Fica em crédito'), h('strong', null, fmtMT(sobra))) : null,
      h('div', null, h('span', null, 'Dívida ainda em aberto'), h('strong', null, fmtMT(divida)))),
    r.referencia_externa ? h('p', null, h('small', null, 'Referência: ' + r.referencia_externa)) : null,
    h('p', null, h('small', null, 'Operador: ' + (r.operador || '') + (r.observacao ? ' · ' + r.observacao : ''))));
}

// ── Situação financeira nas fichas ───────────────────────────
function panelSituacaoAluno(a) {
  var p = h('section', { class: 'panel' }, h('h2', null, 'Situação financeira'));
  var lista = cobrancasDoAluno(a.codigo);
  if (!lista.length) {
    p.appendChild(h('p', { class: 'muted' }, 'Ainda sem cobranças. São geradas na inscrição e na geração anual.'));
    return p;
  }
  var deve = lista.reduce(function (t, d) { return mt(t + (d.cob.estado === 'anulada' ? 0 : d.falta)); }, 0);
  var fin = financeiroDoAluno(a.codigo);
  p.appendChild(h('div', { class: 'numeros' },
    h('div', null, h('small', null, 'Em falta'), h('strong', { class: deve > 0 ? 'devedor' : 'ok' }, fmtMT(deve))),
    fin ? h('div', null, h('small', null, 'Paga'), h('strong', null, fin.nome_completo)) : null));
  if (fin) p.appendChild(h('div', { class: 'form-actions' },
    h('a', { class: 'btn primary', href: '#/receber/' + fin.codigo }, 'Receber pagamento')));
  var tb = h('tbody');
  lista.forEach(function (d) {
    var cls = d.cob.estado === 'anulada' ? 'off' : emAtraso(d.cob) ? 'atraso' : '';
    tb.appendChild(h('tr', { class: cls },
      h('td', { 'data-l': 'Referente a' }, d.cob.descricao),
      h('td', { 'data-l': 'Vence' }, fmtData(d.cob.data_vencimento)),
      h('td', { 'data-l': 'Valor', class: 'num' }, fmtMT(d.cob.valor_liquido),
        Number(d.cob.valor_desconto) > 0 ? h('small', { class: 'muted' }, ' desc. ' + fmtMT(d.cob.valor_desconto)) : null,
        Number(d.cob.valor_multa) > 0 ? h('small', { class: 'erro' }, ' multa ' + fmtMT(d.cob.valor_multa)) : null),
      h('td', { 'data-l': 'Pago', class: 'num' }, fmtMT(d.pago)),
      h('td', { 'data-l': 'Estado' }, h('span', { class: 'tag estado-' + d.cob.estado }, d.cob.estado),
        emAtraso(d.cob) ? h('span', { class: 'tag atraso' }, 'atraso') : null),
      h('td', null, isAdmin() && d.cob.estado === 'aberta' && d.pago === 0 ? btn('Anular', function () {
        var motivo = window.prompt('Motivo para anular "' + d.cob.descricao + '":');
        if (!motivo || !motivo.trim()) return;
        api('anularCobranca', { id: d.cob.id, motivo: motivo.trim() }).then(function (res) {
          upsertLocal('Cobrancas', res.cobranca); toast('Cobrança anulada.', 'ok'); route();
        }).catch(function (e) { toast(e.message, 'erro'); });
      }, 'ghost small') : null)));
  });
  p.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, ['Referente a', 'Vence', 'Valor', 'Pago', 'Estado', ''].map(function (t) { return h('th', null, t); }))), tb)));
  return p;
}

function panelSituacaoFamilia(e) {
  var p = h('section', { class: 'panel' }, h('h2', null, 'Situação da família'));
  var divida = dividaTotal(e.codigo), credito = creditoFamilia(e.codigo);
  var atrasadas = dividasFamilia(e.codigo).filter(function (d) { return emAtraso(d.cob); }).length;
  p.appendChild(h('div', { class: 'numeros' },
    h('div', null, h('small', null, 'Dívida em aberto'), h('strong', { class: divida > 0 ? 'devedor' : 'ok' }, fmtMT(divida))),
    credito > 0 ? h('div', null, h('small', null, 'Crédito'), h('strong', { class: 'credito' }, fmtMT(credito))) : null,
    atrasadas ? h('div', null, h('small', null, 'Em atraso'), h('strong', { class: 'devedor' }, String(atrasadas))) : null));
  var acts = [h('a', { class: 'btn primary', href: '#/receber/' + e.codigo }, 'Receber pagamento')];
  if (divida > 0) acts.push(btn('Lembrete por WhatsApp', function () {
    enviarWhatsApp(e, textoLembrete(e, divida, atrasadas));
  }, 'ghost'));
  acts.push(btn('Extrato por WhatsApp', function () { enviarWhatsApp(e, textoExtrato(e)); }, 'ghost'));
  p.appendChild(h('div', { class: 'form-actions' }, acts));

  var abertas = dividasFamilia(e.codigo);
  if (abertas.length) {
    var tb = h('tbody');
    abertas.forEach(function (d) {
      var a = find('Alunos', d.cob.aluno);
      tb.appendChild(h('tr', { class: emAtraso(d.cob) ? 'atraso' : '' },
        h('td', { 'data-l': 'Aluno' }, a ? a.nome_completo : d.cob.aluno),
        h('td', { 'data-l': 'Referente a' }, d.cob.descricao),
        h('td', { 'data-l': 'Vence' }, fmtData(d.cob.data_vencimento)),
        h('td', { 'data-l': 'Em falta', class: 'num strong' }, fmtMT(d.falta))));
    });
    p.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Aluno', 'Referente a', 'Vence', 'Em falta'].map(function (t) { return h('th', null, t); }))), tb)));
  } else {
    p.appendChild(h('p', { class: 'ok' }, 'Sem dívidas em aberto.'));
  }
  p.appendChild(panelHistoricoFamilia(e));
  return p;
}

// ── Configuração ─────────────────────────────────────────────
var CONF = {
  Escolas: { label: 'Escolas', cols: ['codigo', 'nome', 'responsavel', 'telefone', 'ativa'], fields: [
    { n: 'codigo', l: 'Código (uma letra)', req: true, ro: 'edit', maxlength: 1, upper: true, help: 'Aparece no código dos alunos: B014.' },
    { n: 'nome', l: 'Nome', req: true },
    { n: 'responsavel', l: 'Responsável' },
    { n: 'telefone', l: 'Telefone', t: 'tel' },
    { n: 'endereco', l: 'Endereço', full: true },
    { n: 'ativa', l: 'Activa', t: 'simnao' }] },
  AnosLetivos: { label: 'Anos lectivos', cols: ['ano', 'data_inicio', 'data_fim', 'mes_inicio', 'mes_fim', 'ativo'], fields: [
    { n: 'ano', l: 'Ano', t: 'number', req: true, ro: 'edit' },
    { n: 'mes_inicio', l: 'Primeiro mês de cobrança', t: 'select', o: OPT.meses, req: true, def: 2 },
    { n: 'mes_fim', l: 'Último mês de cobrança', t: 'select', o: OPT.meses, req: true, def: 11 },
    { n: 'data_inicio', l: 'Início das aulas', t: 'date' },
    { n: 'data_fim', l: 'Fim das aulas', t: 'date' },
    { n: 'ativo', l: 'Ano activo', t: 'simnao', help: 'Activar um ano desactiva os outros.' }] },
  TiposCobranca: { label: 'Tipos de cobrança', cols: ['codigo', 'nome', 'periodicidade', 'categoria', 'ativo'], fields: [
    { n: 'codigo', l: 'Código', req: true, ro: 'edit', upper: true, ph: 'EX: UNIFORME' },
    { n: 'nome', l: 'Nome', req: true },
    { n: 'periodicidade', l: 'Periodicidade', t: 'select', o: [['unica', 'Única (uma vez por ano)'], ['mensal', 'Mensal']], req: true },
    { n: 'categoria', l: 'Categoria de receita', t: 'select', o: function () { return OPT.catReceita(); } },
    { n: 'obrigatorio', l: 'Obrigatório para todos', t: 'simnao' },
    { n: 'ativo', l: 'Activo', t: 'simnao' }] },
  TabelaPrecos: { label: 'Preços', cols: ['ano', 'escola', 'tipo_cobranca', 'valor', 'dia_vencimento'], fields: [
    { n: 'ano', l: 'Ano lectivo', t: 'select', o: function () { return OPT.anos(); }, req: true },
    { n: 'escola', l: 'Escola', t: 'select', o: function () { return OPT.escolas(); }, req: true },
    { n: 'tipo_cobranca', l: 'Tipo de cobrança', t: 'select', o: function () { return OPT.tipos(); }, req: true },
    { n: 'valor', l: 'Valor (MT)', t: 'number', min: 0, step: 'any', req: true },
    { n: 'dia_vencimento', l: 'Dia de vencimento', t: 'number', min: 1, max: 28, def: 10, help: 'Para a mensalidade: dia do mês em que vence.' }] },
  Categorias: { label: 'Categorias', cols: ['codigo', 'nome', 'tipo', 'categoria_pai', 'ativa'], fields: [
    { n: 'codigo', l: 'Código', req: true, ro: 'edit', upper: true, ph: 'EX: DES_COMB' },
    { n: 'nome', l: 'Nome', req: true },
    { n: 'tipo', l: 'Tipo', t: 'select', o: [['despesa', 'Despesa'], ['receita', 'Receita']], req: true },
    { n: 'categoria_pai', l: 'Subcategoria de', t: 'select', o: function () { return OPT.catPai(); } },
    { n: 'ativa', l: 'Activa', t: 'simnao' }] },
  Contas: { label: 'Contas', cols: ['codigo', 'nome', 'tipo', 'escola', 'saldo_inicial', 'ativa'], fields: [
    { n: 'codigo', l: 'Código', req: true, ro: 'edit', upper: true },
    { n: 'nome', l: 'Nome', req: true },
    { n: 'tipo', l: 'Tipo', t: 'select', o: [['banco', 'Banco'], ['caixa', 'Caixa (dinheiro)'], ['emola', 'e-Mola']], req: true },
    { n: 'escola', l: 'Escola', t: 'select', o: function () { return OPT.escolasRede(); }, req: true },
    { n: 'saldo_inicial', l: 'Saldo inicial (MT)', t: 'number', step: 'any', def: 0 },
    { n: 'data_saldo_inicial', l: 'Data do saldo inicial', t: 'date' },
    { n: 'ativa', l: 'Activa', t: 'simnao' }] },
  RegrasMulta: { label: 'Multas', cols: ['ano', 'escola', 'dias_tolerancia', 'modo', 'valor', 'ativa'],
    note: 'As multas só são aplicadas a partir da fase 2 e apenas se a regra estiver activa.', fields: [
    { n: 'ano', l: 'Ano lectivo', t: 'select', o: function () { return OPT.anos(); }, req: true },
    { n: 'escola', l: 'Escola', t: 'select', o: function () { return OPT.escolasRede(); }, req: true },
    { n: 'dias_tolerancia', l: 'Dias de tolerância após o vencimento', t: 'number', min: 0, req: true, def: 15 },
    { n: 'modo', l: 'Modo', t: 'select', o: [['fixo', 'Valor fixo (MT)'], ['percentagem', 'Percentagem']], req: true },
    { n: 'valor', l: 'Valor', t: 'number', min: 0, step: 'any', req: true },
    { n: 'ativa', l: 'Activa', t: 'simnao', def: NAO }] },
  Utilizadores: { label: 'Utilizadores', cols: ['email', 'nome', 'papel', 'ativo'],
    note: 'Cada pessoa entra com a sua conta Google. Só os emails desta lista têm acesso.', fields: [
    { n: 'email', l: 'Email Google', req: true, ro: 'edit' },
    { n: 'nome', l: 'Nome', req: true },
    { n: 'papel', l: 'Papel', t: 'select', o: [['operador', 'Operador'], ['admin', 'Administrador']], req: true },
    { n: 'ativo', l: 'Activo', t: 'simnao' }] }
};

// ── Despesas e contas ────────────────────────────────────────
// Os saldos também aqui nascem dos movimentos, e contam o que
// ainda está na fila do telefone para o número bater com o bolso.

function resumoDaFila(q) {
  var t = tipoDaFila(q);
  if (t === 'despesa') return 'Despesa · ' + (q.descricao || '');
  if (t === 'transferencia') return 'Transferência · ' + nomeConta(q.conta_origem) + ' → ' + nomeConta(q.conta_destino);
  var e = find('Encarregados', q.encarregado);
  return 'Pagamento · ' + (e ? e.nome_completo : q.encarregado);
}

function nomeConta(cod) {
  var c = find('Contas', cod);
  return c ? c.nome : cod;
}
function contasAtivas() { return rows('Contas').filter(function (c) { return c.ativa === SIM; }); }
function categoriasDespesa() {
  return rows('Categorias').filter(function (c) { return c.tipo === 'despesa' && !c.categoria_pai && c.ativa === SIM; });
}
function subcategoriasDe(cod) {
  return rows('Categorias').filter(function (c) { return c.categoria_pai === cod && c.ativa === SIM; });
}
function nomeCategoria(cod) {
  var c = find('Categorias', cod);
  return c ? c.nome : (cod || '');
}

function despesasTodas() {
  return rows('Despesas').concat(filaDe('despesa').map(function (q) {
    return { id: q.ref_cliente, data: q.data, escola: q.escola, categoria: q.categoria,
      subcategoria: q.subcategoria, descricao: q.descricao, fornecedor: q.fornecedor, valor: q.valor,
      conta: q.conta, metodo: q.metodo, numero_documento: q.numero_documento, comprovativo_url: '',
      operador: S.user ? S.user.email : '', estado: 'valida', _fila: true };
  }));
}
function transferenciasTodas() {
  return rows('Transferencias').concat(filaDe('transferencia').map(function (q) {
    return { id: q.ref_cliente, data: q.data, conta_origem: q.conta_origem, conta_destino: q.conta_destino,
      valor: q.valor, descricao: q.descricao, estado: 'valida', _fila: true };
  }));
}

// Movimentos de uma conta: o mesmo cálculo que o servidor faz.
function movimentosDaConta(cod, de, ate) {
  var c = find('Contas', cod);
  if (!c) return [];
  var inicio = c.data_saldo_inicial || '';
  function dentro(d) {
    d = String(d).slice(0, 10);
    if (inicio && d < inicio) return false;
    if (de && d < de) return false;
    if (ate && d > ate) return false;
    return true;
  }
  var out = [];
  rows('Recebimentos').concat(filaDe('receber').map(function (q) {
    return { numero_recibo: q.ref_cliente, data: q.data, valor: q.valor, conta: q.conta,
      encarregado: q.encarregado, metodo: q.metodo, estado: 'valido', _fila: true };
  })).forEach(function (r) {
    if (r.estado === 'anulado' || r.conta !== cod || !dentro(r.data)) return;
    var e = find('Encarregados', r.encarregado);
    out.push({ data: String(r.data), tipo: 'recebimento', id: r.numero_recibo, fila: !!r._fila,
      descricao: 'Recibo ' + r.numero_recibo + (e ? ' · ' + e.nome_completo : ''), valor: mt(r.valor) });
  });
  despesasTodas().forEach(function (d) {
    if (d.estado === 'anulada' || d.conta !== cod || !dentro(d.data)) return;
    out.push({ data: String(d.data), tipo: 'despesa', id: d.id, fila: !!d._fila,
      descricao: d.descricao + (d.fornecedor ? ' · ' + d.fornecedor : ''), valor: -mt(d.valor) });
  });
  transferenciasTodas().forEach(function (t) {
    if (t.estado === 'anulada' || !dentro(t.data)) return;
    if (t.conta_destino === cod) out.push({ data: String(t.data), tipo: 'transferencia', id: t.id, fila: !!t._fila,
      descricao: 'De ' + nomeConta(t.conta_origem) + (t.descricao ? ' · ' + t.descricao : ''), valor: mt(t.valor) });
    if (t.conta_origem === cod) out.push({ data: String(t.data), tipo: 'transferencia', id: t.id, fila: !!t._fila,
      descricao: 'Para ' + nomeConta(t.conta_destino) + (t.descricao ? ' · ' + t.descricao : ''), valor: -mt(t.valor) });
  });
  out.sort(function (a, b) { return a.data !== b.data ? (a.data < b.data ? -1 : 1) : (a.id < b.id ? -1 : 1); });
  return out;
}

function saldoDaConta(cod, ate) {
  var c = find('Contas', cod);
  if (!c) return 0;
  return movimentosDaConta(cod, '', ate).reduce(function (s, m) { return mt(s + m.valor); }, mt(c.saldo_inicial));
}

// ── Despesas ─────────────────────────────────────────────────
function viewDespesas(v) {
  v.appendChild(pageHead('Despesas', S.escola === 'TODAS' ? 'Todas as escolas e a rede'
    : escolaNome(S.escola) + ' e as despesas comuns da rede',
    btn('+ Nova despesa', function () { abrirFormDespesa(v); }, 'primary')));
  var aviso = avisoFila();
  if (aviso) v.appendChild(aviso);
  var slot = h('div', { id: 'slot-despesa' });
  v.appendChild(slot);

  var mes = h('input', { type: 'month', class: 'filter', value: hoje().slice(0, 7) });
  var cat = h('select', { class: 'filter' }, h('option', { value: '' }, 'Todas as categorias'),
    categoriasDespesa().map(function (c) { return h('option', { value: c.codigo }, c.nome); }));
  var q = h('input', { type: 'search', class: 'search', placeholder: 'Procurar: descrição, fornecedor, documento…' });
  var lista = h('div', { class: 'table-wrap' });
  v.appendChild(h('div', { class: 'toolbar' }, q, mes, cat));
  v.appendChild(lista);

  function draw() {
    var termo = norm(q.value);
    var data = despesasTodas().filter(function (d) {
      if (S.escola !== 'TODAS' && d.escola !== S.escola && d.escola !== 'REDE') return false;
      if (mes.value && String(d.data).slice(0, 7) !== mes.value) return false;
      if (cat.value && d.categoria !== cat.value) return false;
      if (termo) {
        var hay = norm([d.descricao, d.fornecedor, d.numero_documento, nomeCategoria(d.categoria),
          nomeCategoria(d.subcategoria)].join(' '));
        if (hay.indexOf(termo) < 0) return false;
      }
      return true;
    });
    data.sort(function (a, b) { return String(a.data) > String(b.data) ? -1 : String(a.data) < String(b.data) ? 1 : (a.id > b.id ? -1 : 1); });
    clear(lista);
    if (!data.length) {
      lista.appendChild(h('p', { class: 'empty' }, 'Nenhuma despesa neste filtro.'));
      return;
    }
    var total = data.filter(function (d) { return d.estado !== 'anulada'; })
      .reduce(function (t, d) { return mt(t + Number(d.valor)); }, 0);
    var tb = h('tbody');
    data.forEach(function (d) {
      tb.appendChild(h('tr', { class: d.estado === 'anulada' ? 'off' : '' },
        h('td', { 'data-l': 'Data' }, fmtData(d.data)),
        h('td', { 'data-l': 'Descrição', class: 'strong' }, d.descricao,
          d.fornecedor ? h('small', { class: 'muted' }, ' · ' + d.fornecedor) : null,
          d._fila ? h('span', { class: 'tag' }, 'por enviar') : null,
          d.estado === 'anulada' ? h('span', { class: 'tag erro' }, 'anulada') : null),
        h('td', { 'data-l': 'Categoria' }, nomeCategoria(d.categoria),
          d.subcategoria ? h('small', { class: 'muted' }, ' · ' + nomeCategoria(d.subcategoria)) : null),
        h('td', { 'data-l': 'Escola' }, d.escola === 'REDE' ? 'Rede' : escolaNome(d.escola)),
        h('td', { 'data-l': 'Conta' }, nomeConta(d.conta)),
        h('td', { 'data-l': 'Valor', class: 'num strong' }, fmtMT(d.valor)),
        h('td', null,
          d.comprovativo_url ? h('a', { href: d.comprovativo_url, target: '_blank', rel: 'noopener', class: 'btn ghost small' }, 'Foto') : null,
          isAdmin() && d.estado !== 'anulada' && !d._fila ? btn('Anular', function () {
            var motivo = window.prompt('Motivo para anular "' + d.descricao + '":');
            if (!motivo || !motivo.trim()) return;
            api('anularDespesa', { id: d.id, motivo: motivo.trim() }).then(function (res) {
              upsertLocal('Despesas', res.despesa);
              toast('Despesa anulada.', 'ok');
              route();
            }).catch(function (e) { toast(e.message, 'erro'); });
          }, 'ghost small') : null)));
    });
    lista.appendChild(h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Data', 'Descrição', 'Categoria', 'Escola', 'Conta', 'Valor', ''].map(function (t) { return h('th', null, t); }))), tb));
    lista.appendChild(h('p', { class: 'muted count' }, data.length + ' despesa' + (data.length === 1 ? '' : 's') +
      ' · total ' + fmtMT(total)));
  }
  q.addEventListener('input', draw);
  mes.addEventListener('change', draw);
  cat.addEventListener('change', draw);
  draw();
}

// A foto encolhe no telefone antes de subir: a rede nas escolinhas é fraca.
function encolherFoto(file, cb) {
  if (file.type === 'application/pdf') {
    var fr0 = new FileReader();
    fr0.onload = function () { cb({ nome: file.name, tipo: file.type, dados: String(fr0.result).split(',')[1] }); };
    fr0.readAsDataURL(file);
    return;
  }
  var fr = new FileReader();
  fr.onload = function () {
    var img = new Image();
    img.onload = function () {
      var max = 1600;
      var escala = Math.min(1, max / Math.max(img.width, img.height));
      var cv = document.createElement('canvas');
      cv.width = Math.round(img.width * escala);
      cv.height = Math.round(img.height * escala);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cb({ nome: file.name, tipo: 'image/jpeg', dados: cv.toDataURL('image/jpeg', 0.7).split(',')[1] });
    };
    img.onerror = function () { cb(null); };
    img.src = String(fr.result);
  };
  fr.onerror = function () { cb(null); };
  fr.readAsDataURL(file);
}

function abrirFormDespesa(v) {
  var slot = clear($('#slot-despesa'));
  var offline = !navigator.onLine;

  var fData = h('input', { type: 'date', value: hoje(), max: hoje() });
  var fValor = h('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal',
    class: 'valor-grande', placeholder: '0,00' });
  // Categoria e subcategoria numa só lista: as filhas aparecem indentadas.
  var fCat = h('select', null, h('option', { value: '' }, '—'));
  categoriasDespesa().forEach(function (c) {
    fCat.appendChild(h('option', { value: c.codigo }, c.nome));
    subcategoriasDe(c.codigo).forEach(function (sc) {
      fCat.appendChild(h('option', { value: c.codigo + '>' + sc.codigo }, '\u00a0\u00a0\u00a0↳ ' + sc.nome));
    });
  });
  // Por omissão a despesa é comum a toda a rede; muda-se aqui se for de uma escola.
  var fEscola = h('select', null, h('option', { value: 'REDE' }, 'Todas (despesa comum da rede)'),
    escolasAtivas().map(function (e) { return h('option', { value: e.codigo }, e.nome); }));
  var fFoto = h('input', { type: 'file', accept: 'image/*,application/pdf', capture: 'environment' });
  var previa = h('div', { class: 'previa-foto' });
  var saldoAviso = h('p', { class: 'muted' });
  var foto = null;

  // A conta não é um campo, mas o dinheiro sai mesmo de algum lado:
  // fica à vista, para ninguém se enganar sobre onde foi buscar.
  function contaDeSaida() {
    return contasAtivas().filter(function (c) { return c.tipo === 'caixa'; })[0] || contasAtivas()[0] || null;
  }
  function verSaldo() {
    var c = contaDeSaida();
    if (!c) { saldoAviso.textContent = 'Não há nenhuma conta activa.'; saldoAviso.className = 'erro'; return; }
    var sai = mt(fValor.value || 0);
    var s = saldoDaConta(c.codigo);
    var depois = mt(s - sai);
    saldoAviso.textContent = 'Sai de ' + c.nome + ', em numerário · ' + fmtMT(s) + ' agora' +
      (sai > 0 ? ', ' + fmtMT(depois) + ' depois' : '');
    saldoAviso.className = depois < 0 && c.tipo === 'caixa' ? 'erro' : 'muted';
  }
  fValor.addEventListener('input', verSaldo);

  fFoto.addEventListener('change', function () {
    var f = this.files && this.files[0];
    clear(previa);
    foto = null;
    if (!f) return;
    previa.appendChild(h('small', { class: 'muted' }, 'A preparar a foto…'));
    encolherFoto(f, function (res) {
      clear(previa);
      if (!res) { previa.appendChild(h('small', { class: 'erro' }, 'Não foi possível ler o ficheiro.')); return; }
      foto = res;
      var kb = Math.round(res.dados.length * 3 / 4 / 1024);
      previa.appendChild(res.tipo === 'application/pdf'
        ? h('small', { class: 'muted' }, 'PDF pronto (' + kb + ' KB)')
        : h('img', { src: 'data:' + res.tipo + ';base64,' + res.dados, alt: 'Comprovativo', class: 'thumb' }));
      previa.appendChild(h('small', { class: 'muted' }, ' ' + kb + ' KB'));
    });
  });

  function enviarDespesa(botao, p) {
    setStatus('sync');
    busy(botao, api('despesa', p).then(function (res) {
      setStatus('ok');
      upsertLocal('Despesas', res.despesa);
      toast('Despesa registada. ' + nomeConta(res.despesa.conta) + ': ' + fmtMT(res.saldo), 'ok');
      route();
    })).catch(function (e) {
      setStatus('ok');
      if (e.code === 'confirmar') {
        if (window.confirm(e.message + '\n\nRegistar mesmo assim?')) {
          enviarDespesa(botao, Object.assign({}, p, { force: true }));
        }
        return;
      }
      toast(e.message, 'erro');
    });
  }

  var guardar = btn('Guardar despesa', function () {
    if (!fCat.value) { toast('Escolha a categoria.', 'erro'); fCat.focus(); return; }
    if (!(mt(fValor.value || 0) > 0)) { toast('Indique o valor.', 'erro'); fValor.focus(); return; }
    var conta = contaDeSaida();
    if (!conta) { toast('Não há nenhuma conta activa.', 'erro'); return; }
    var partes = fCat.value.split('>');
    var p = { data: fData.value || hoje(), escola: fEscola.value,
      categoria: partes[0], subcategoria: partes[1] || '',
      valor: mt(fValor.value), conta: conta.codigo, metodo: 'numerario',
      ref_cliente: novaRefCliente() };
    var nome = fCat.options[fCat.selectedIndex].textContent.replace(/^[\s\u00a0↳]+/, '');
    if (!window.confirm('Registar ' + fmtMT(p.valor) + ' de ' + nome + '?\nSai de ' + conta.nome + '.')) return;
    if (!navigator.onLine) {
      if (foto) { toast('Sem rede a foto não sobe. Guarde a despesa depois, com ligação.', 'erro'); return; }
      enfileirar('despesa', p);
      toast('Sem rede: a despesa fica guardada e segue quando houver ligação.', 'ok');
      route();
      return;
    }
    if (foto) p.foto = foto;
    enviarDespesa(guardar, p);
  }, 'primary grande');

  verSaldo();
  slot.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Nova despesa'),
    h('div', { class: 'grid' },
      h('div', { class: 'field' }, h('label', null, 'Data'), fData),
      h('div', { class: 'field' }, h('label', null, 'Valor (MT)', h('span', { class: 'req' }, ' *')), fValor),
      h('div', { class: 'field full' }, h('label', null, 'Categoria', h('span', { class: 'req' }, ' *')), fCat),
      h('div', { class: 'field full' }, h('label', null, 'Escola'), fEscola),
      h('div', { class: 'field full' }, h('label', null, 'Comprovativo (foto ou PDF)'), fFoto, previa)),
    saldoAviso,
    offline ? h('p', { class: 'muted' }, 'Sem rede: a despesa fica guardada no telefone, mas a foto só sobe com ligação.') : null,
    h('div', { class: 'form-actions' }, btn('Cancelar', function () { clear(slot); }, 'ghost'), guardar)));
  slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Caixa e contas ───────────────────────────────────────────
function viewCaixa(v, conta) {
  if (conta) { viewConta(v, conta); return; }
  v.appendChild(pageHead('Caixa e contas', 'Saldos de hoje, calculados a partir dos movimentos.'));
  var aviso = avisoFila();
  if (aviso) v.appendChild(aviso);
  var slot = h('div', { id: 'slot-caixa' });
  v.appendChild(h('div', { class: 'form-actions topo' },
    btn('Nova transferência', function () { formTransferencia(slot); }, 'primary'),
    btn('Fecho de caixa', function () { formFecho(slot); }, 'ghost')));
  v.appendChild(slot);

  var grid = h('div', { class: 'cards' });
  var total = 0;
  contasAtivas().filter(function (c) {
    return S.escola === 'TODAS' || c.escola === S.escola || c.escola === 'REDE';
  }).forEach(function (c) {
    var s = saldoDaConta(c.codigo);
    total = mt(total + s);
    grid.appendChild(h('a', { class: 'card conta', href: '#/caixa/' + c.codigo },
      h('div', { class: 'card-top' }, h('span', { class: 'badge-school' }, c.tipo === 'caixa' ? '◧' : c.tipo === 'emola' ? '✆' : '▤'),
        h('h3', null, c.nome)),
      h('div', { class: 'big ' + (s < 0 ? 'devedor' : '') }, fmtMT(s)),
      h('div', { class: 'muted' }, c.escola === 'REDE' ? 'Rede' : escolaNome(c.escola)),
      h('div', { class: 'card-foot' }, h('span', null, 'Ver movimentos →'))));
  });
  v.appendChild(grid);
  v.appendChild(h('p', { class: 'muted total' }, 'Total nas contas: ' + fmtMT(total)));
  v.appendChild(panelTransferencias());
}

function formTransferencia(slot) {
  clear(slot);
  var fData = h('input', { type: 'date', value: hoje(), max: hoje() });
  var fDe = h('select', null, contasAtivas().map(function (c) { return h('option', { value: c.codigo }, c.nome); }));
  var fPara = h('select', null, contasAtivas().map(function (c) { return h('option', { value: c.codigo }, c.nome); }));
  var fValor = h('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', class: 'valor-grande', placeholder: '0,00' });
  var fDesc = h('input', { type: 'text', placeholder: 'Ex.: depósito do mês' });
  var info = h('p', { class: 'muted' });
  var caixa = contasAtivas().filter(function (c) { return c.tipo === 'caixa'; })[0];
  var banco = contasAtivas().filter(function (c) { return c.tipo === 'banco'; })[0];
  if (caixa) fDe.value = caixa.codigo;
  if (banco) fPara.value = banco.codigo;

  function ver() {
    info.textContent = nomeConta(fDe.value) + ': ' + fmtMT(saldoDaConta(fDe.value)) +
      ' · ' + nomeConta(fPara.value) + ': ' + fmtMT(saldoDaConta(fPara.value));
  }
  fDe.addEventListener('change', ver);
  fPara.addEventListener('change', ver);
  ver();

  function enviar(botao, p) {
    setStatus('sync');
    busy(botao, api('transferencia', p).then(function (res) {
      setStatus('ok');
      upsertLocal('Transferencias', res.transferencia);
      toast('Transferência ' + res.transferencia.id + ' registada.', 'ok');
      route();
    })).catch(function (e) {
      setStatus('ok');
      if (e.code === 'confirmar') {
        if (window.confirm(e.message + '\n\nRegistar mesmo assim?')) enviar(botao, Object.assign({}, p, { force: true }));
        return;
      }
      toast(e.message, 'erro');
    });
  }

  var guardar = btn('Registar transferência', function () {
    var valor = mt(fValor.value || 0);
    if (!(valor > 0)) { toast('Indique o valor.', 'erro'); fValor.focus(); return; }
    if (fDe.value === fPara.value) { toast('As duas contas são a mesma.', 'erro'); return; }
    var p = { data: fData.value || hoje(), conta_origem: fDe.value, conta_destino: fPara.value,
      valor: valor, descricao: fDesc.value.trim(), ref_cliente: novaRefCliente() };
    if (!window.confirm('Transferir ' + fmtMT(valor) + ' de ' + nomeConta(p.conta_origem) + ' para ' + nomeConta(p.conta_destino) + '?')) return;
    if (!navigator.onLine) {
      enfileirar('transferencia', p);
      toast('Sem rede: a transferência fica guardada e segue quando houver ligação.', 'ok');
      route();
      return;
    }
    enviar(guardar, p);
  }, 'primary');

  slot.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Nova transferência'),
    h('div', { class: 'grid' },
      h('div', { class: 'field' }, h('label', null, 'De'), fDe),
      h('div', { class: 'field' }, h('label', null, 'Para'), fPara),
      h('div', { class: 'field' }, h('label', null, 'Valor (MT)', h('span', { class: 'req' }, ' *')), fValor),
      h('div', { class: 'field' }, h('label', null, 'Data'), fData),
      h('div', { class: 'field full' }, h('label', null, 'Descrição'), fDesc)),
    info,
    h('div', { class: 'form-actions' }, btn('Cancelar', function () { clear(slot); }, 'ghost'), guardar)));
  slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Fecho de caixa: contar o dinheiro e comparar com o que a app diz.
function formFecho(slot) {
  clear(slot);
  var caixas = contasAtivas().filter(function (c) { return c.tipo === 'caixa'; });
  if (!caixas.length) {
    slot.appendChild(h('section', { class: 'panel' }, h('p', null, 'Não há nenhuma conta de dinheiro.')));
    return;
  }
  var fConta = h('select', null, caixas.map(function (c) { return h('option', { value: c.codigo }, c.nome); }));
  var fData = h('input', { type: 'date', value: hoje(), max: hoje() });
  var fContado = h('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', class: 'valor-grande', placeholder: '0,00' });
  var fObs = h('input', { type: 'text', placeholder: 'Observação (opcional)' });
  var quadro = h('div', { class: 'resumo-aloc' });
  var historico = h('div');

  function ver() {
    var esperado = saldoDaConta(fConta.value, fData.value || hoje());
    var contado = fContado.value === '' ? null : mt(fContado.value);
    clear(quadro);
    quadro.appendChild(h('div', null, h('span', null, 'A app diz'), h('strong', null, fmtMT(esperado))));
    if (contado !== null) {
      var dif = mt(contado - esperado);
      quadro.appendChild(h('div', null, h('span', null, 'Contado'), h('strong', null, fmtMT(contado))));
      quadro.appendChild(h('div', { class: dif === 0 ? 'ok' : 'devedor' },
        h('span', null, dif === 0 ? 'Bate certo' : dif > 0 ? 'Sobra' : 'Falta'),
        h('strong', null, fmtMT(Math.abs(dif)))));
    }
  }
  function verHistorico() {
    clear(historico);
    if (!navigator.onLine) { historico.appendChild(h('p', { class: 'muted' }, 'Sem rede: o histórico dos fechos só se vê com ligação.')); return; }
    api('fechos', { conta: fConta.value, limite: 12 }).then(function (res) {
      clear(historico);
      if (!res.fechos.length) { historico.appendChild(h('p', { class: 'muted' }, 'Ainda sem fechos nesta caixa.')); return; }
      var tb = h('tbody');
      res.fechos.forEach(function (f) {
        tb.appendChild(h('tr', { class: f.diferenca === 0 ? '' : 'atraso' },
          h('td', { 'data-l': 'Data' }, fmtData(f.data)),
          h('td', { 'data-l': 'A app dizia', class: 'num' }, fmtMT(f.esperado)),
          h('td', { 'data-l': 'Contado', class: 'num' }, fmtMT(f.contado)),
          h('td', { 'data-l': 'Diferença', class: 'num strong' }, f.diferenca === 0 ? '—' : fmtMT(f.diferenca)),
          h('td', { 'data-l': 'Quem' }, f.operador, f.observacao ? h('small', { class: 'muted' }, ' · ' + f.observacao) : null)));
      });
      historico.appendChild(h('h3', null, 'Fechos anteriores'));
      historico.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['Data', 'A app dizia', 'Contado', 'Diferença', 'Quem'].map(function (t) { return h('th', null, t); }))), tb)));
    }).catch(function (e) {
      clear(historico);
      historico.appendChild(h('p', { class: 'erro' }, e.message));
    });
  }
  fConta.addEventListener('change', function () { ver(); verHistorico(); });
  fData.addEventListener('change', ver);
  fContado.addEventListener('input', ver);

  var guardar = btn('Registar o fecho', function () {
    if (fContado.value === '') { toast('Escreva quanto dinheiro foi contado.', 'erro'); fContado.focus(); return; }
    if (!navigator.onLine) { toast('O fecho de caixa precisa de rede.', 'erro'); return; }
    var p = { conta: fConta.value, data: fData.value || hoje(), contado: mt(fContado.value),
      observacao: fObs.value.trim() };
    busy(guardar, api('fechoCaixa', p).then(function (res) {
      var f = res.fecho;
      toast(f.diferenca === 0 ? 'Fecho registado: bate certo.'
        : 'Fecho registado: ' + (f.diferenca > 0 ? 'sobram ' : 'faltam ') + fmtMT(Math.abs(f.diferenca)) + '.',
        f.diferenca === 0 ? 'ok' : 'erro');
      fContado.value = ''; fObs.value = '';
      ver(); verHistorico();
    })).catch(function (e) { toast(e.message, 'erro'); });
  }, 'primary');

  ver();
  verHistorico();
  slot.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Fecho de caixa'),
    h('p', { class: 'muted' }, 'Conte o dinheiro que está na caixa e escreva aqui o total. A app compara com o que devia lá estar.'),
    h('div', { class: 'grid' },
      h('div', { class: 'field' }, h('label', null, 'Caixa'), fConta),
      h('div', { class: 'field' }, h('label', null, 'Data'), fData),
      h('div', { class: 'field' }, h('label', null, 'Dinheiro contado (MT)'), fContado),
      h('div', { class: 'field full' }, h('label', null, 'Observação'), fObs)),
    quadro,
    h('div', { class: 'form-actions' }, btn('Fechar', function () { clear(slot); }, 'ghost'), guardar),
    historico));
  slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function panelTransferencias() {
  var p = h('section', { class: 'panel' }, h('h2', null, 'Últimas transferências'));
  var lista = transferenciasTodas().slice();
  lista.sort(function (a, b) { return String(a.data) > String(b.data) ? -1 : String(a.data) < String(b.data) ? 1 : (a.id > b.id ? -1 : 1); });
  if (!lista.length) { p.appendChild(h('p', { class: 'muted' }, 'Ainda sem transferências.')); return p; }
  var tb = h('tbody');
  lista.slice(0, 15).forEach(function (t) {
    tb.appendChild(h('tr', { class: t.estado === 'anulada' ? 'off' : '' },
      h('td', { 'data-l': 'Data' }, fmtData(t.data)),
      h('td', { 'data-l': 'De' }, nomeConta(t.conta_origem)),
      h('td', { 'data-l': 'Para' }, nomeConta(t.conta_destino)),
      h('td', { 'data-l': 'Descrição' }, t.descricao || '',
        t._fila ? h('span', { class: 'tag' }, 'por enviar') : null,
        t.estado === 'anulada' ? h('span', { class: 'tag erro' }, 'anulada') : null),
      h('td', { 'data-l': 'Valor', class: 'num strong' }, fmtMT(t.valor)),
      h('td', null, isAdmin() && t.estado !== 'anulada' && !t._fila ? btn('Anular', function () {
        var motivo = window.prompt('Motivo para anular a transferência ' + t.id + ':');
        if (!motivo || !motivo.trim()) return;
        api('anularTransferencia', { id: t.id, motivo: motivo.trim() }).then(function (res) {
          upsertLocal('Transferencias', res.transferencia);
          toast('Transferência anulada.', 'ok');
          route();
        }).catch(function (e) { toast(e.message, 'erro'); });
      }, 'ghost small') : null)));
  });
  p.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, ['Data', 'De', 'Para', 'Descrição', 'Valor', ''].map(function (t) { return h('th', null, t); }))), tb)));
  return p;
}

function viewConta(v, cod) {
  var c = find('Contas', cod);
  if (!c) { v.appendChild(pageHead('Conta não encontrada')); return; }
  v.appendChild(h('a', { class: 'back', href: '#/caixa' }, '← Caixa e contas'));
  var mes = h('input', { type: 'month', class: 'filter', value: hoje().slice(0, 7) });
  v.appendChild(pageHead(c.nome, (c.tipo === 'caixa' ? 'Dinheiro' : c.tipo === 'emola' ? 'e-Mola' : 'Banco') +
    ' · ' + (c.escola === 'REDE' ? 'Rede' : escolaNome(c.escola))));
  var corpo = h('div');
  v.appendChild(h('div', { class: 'toolbar' }, mes));
  v.appendChild(corpo);

  function draw() {
    clear(corpo);
    var ate = mes.value ? ultimoDiaDoMes(mes.value) : '';
    var deM = mes.value ? mes.value + '-01' : '';
    var saldoFim = saldoDaConta(cod, ate);
    var saldoIni = deM ? saldoDaConta(cod, diaAntes(deM)) : mt(c.saldo_inicial);
    var movs = movimentosDaConta(cod, deM, ate);
    var entrou = movs.filter(function (m) { return m.valor > 0; }).reduce(function (t, m) { return mt(t + m.valor); }, 0);
    var saiu = movs.filter(function (m) { return m.valor < 0; }).reduce(function (t, m) { return mt(t - m.valor); }, 0);
    corpo.appendChild(h('section', { class: 'panel' }, h('div', { class: 'numeros grande' },
      h('div', null, h('small', null, 'Saldo no início'), h('strong', null, fmtMT(saldoIni))),
      h('div', null, h('small', null, 'Entrou'), h('strong', { class: 'ok' }, fmtMT(entrou))),
      h('div', null, h('small', null, 'Saiu'), h('strong', { class: 'devedor' }, fmtMT(saiu))),
      h('div', null, h('small', null, 'Saldo no fim'), h('strong', { class: saldoFim < 0 ? 'devedor' : '' }, fmtMT(saldoFim))))));
    if (!movs.length) {
      corpo.appendChild(h('p', { class: 'empty' }, 'Sem movimentos neste mês.'));
      return;
    }
    var corrente = saldoIni;
    var tb = h('tbody');
    movs.forEach(function (m) {
      corrente = mt(corrente + m.valor);
      tb.appendChild(h('tr', null,
        h('td', { 'data-l': 'Data' }, fmtData(m.data)),
        h('td', { 'data-l': 'Movimento' }, m.descricao,
          m.fila ? h('span', { class: 'tag' }, 'por enviar') : null),
        h('td', { 'data-l': 'Tipo' }, h('span', { class: 'tag' }, m.tipo)),
        h('td', { 'data-l': 'Valor', class: 'num strong ' + (m.valor < 0 ? 'devedor' : 'ok') }, fmtMT(m.valor)),
        h('td', { 'data-l': 'Saldo', class: 'num' }, fmtMT(corrente))));
    });
    corpo.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Data', 'Movimento', 'Tipo', 'Valor', 'Saldo'].map(function (t) { return h('th', null, t); }))), tb)));
  }
  mes.addEventListener('change', draw);
  draw();
}

function ultimoDiaDoMes(ym) {
  var a = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  var d = new Date(a, m, 0);
  return ym + '-' + ('0' + d.getDate()).slice(-2);
}
function diaAntes(data) {
  var p = data.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) - 1);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// ── e-Mola ───────────────────────────────────────────────────
// A fila dos SMS que o telefone Android mandou. O que traz código
// de aluno já virou recibo sozinho; o resto espera aqui por alguém.

var EMOLA_POR_TRATAR = ['a_confirmar', 'sem_familia', 'por_ler'];
var EMOLA_NOME = {
  registado: 'Registado', a_confirmar: 'A confirmar', sem_familia: 'Por ligar',
  por_ler: 'Não se percebeu', ignorado: 'De lado', repetido: 'Repetido'
};

function pagamentosEmola(estados) {
  return rows('Pagamentos_eMola').filter(function (p) { return estados.indexOf(p.estado) >= 0; })
    .sort(function (a, b) { return String(a.recebido_em) > String(b.recebido_em) ? -1 : 1; });
}
function emolaPorTratar() { return pagamentosEmola(EMOLA_POR_TRATAR).length; }

function viewEmola(v) {
  var pendentes = pagamentosEmola(EMOLA_POR_TRATAR);
  v.appendChild(pageHead('e-Mola', pendentes.length
    ? pendentes.length + (pendentes.length === 1 ? ' pagamento por tratar' : ' pagamentos por tratar')
    : 'Nada à espera. Os pagamentos com código de aluno entram sozinhos.'));

  var aviso = avisoFila();
  if (aviso) v.appendChild(aviso);

  if (!rows('Pagamentos_eMola').length) {
    v.appendChild(h('section', { class: 'panel soft' },
      h('h2', null, 'Ainda não chegou nenhum SMS'),
      h('p', null, 'Quando o telefone Android estiver a enviar os SMS da e-Mola, aparecem aqui. ' +
        'Em baixo está o que é preciso pôr no Tasker.')));
  }

  pendentes.forEach(function (p) { v.appendChild(cartaoEmola(p)); });

  var tratados = pagamentosEmola(['registado', 'ignorado', 'repetido']);
  if (tratados.length) v.appendChild(painelTratados(tratados));
  if (isAdmin()) v.appendChild(painelLigarTelefone());
}

function cartaoEmola(p) {
  var enc = p.encarregado ? find('Encarregados', p.encarregado) : null;
  var codigos = String(p.codigos || '').split(/\s+/).filter(Boolean);
  var painel = h('section', { class: 'panel emola ' + p.estado });
  var escolhido = { encarregado: p.encarregado || '' };

  painel.appendChild(h('div', { class: 'emola-topo' },
    h('div', null,
      h('div', { class: 'emola-valor' }, fmtMT(p.valor)),
      h('small', { class: 'muted' }, fmtData(String(p.recebido_em).slice(0, 10)) +
        ' · ' + (p.transacao || 'sem ID de transacção'))),
    h('div', null, h('span', { class: 'tag estado-' + p.estado }, EMOLA_NOME[p.estado] || p.estado))));

  var quem = [];
  if (p.nome_pagador) quem.push(p.nome_pagador);
  if (p.telefone_pagador) quem.push(fmtTel(p.telefone_pagador));
  painel.appendChild(h('p', null,
    quem.length ? h('strong', null, quem.join(' · ')) : h('span', { class: 'muted' }, 'Pagador desconhecido'),
    p.conteudo ? h('small', { class: 'muted' }, ' · Conteúdo: ' + p.conteudo) : null));
  if (codigos.length) {
    painel.appendChild(h('p', null, 'Códigos no SMS: ', codigos.map(function (c) {
      var a = find('Alunos', c);
      return h('a', { href: '#/aluno/' + c, class: 'code' }, c + (a ? ' ' + a.nome_completo : ''));
    })));
  }
  if (p.motivo) painel.appendChild(h('p', { class: 'aviso-box' }, p.motivo));

  // O texto original fica sempre à mão: é a prova do que chegou.
  painel.appendChild(h('details', { class: 'sms-cru' },
    h('summary', null, 'Ver o SMS como chegou'),
    h('pre', null, p.texto),
    h('small', { class: 'muted' }, 'Remetente: ' + (p.remetente || '—'))));

  var escolha = h('div');
  function desenhaEscolha() {
    clear(escolha);
    var e2 = escolhido.encarregado ? find('Encarregados', escolhido.encarregado) : null;
    if (e2) {
      var divida = dividaTotal(e2.codigo);
      escolha.appendChild(h('div', { class: 'emola-familia' },
        h('div', null, h('strong', null, e2.nome_completo),
          h('small', { class: 'muted' }, ' ' + fmtTel(e2.telefone_1) + ' · ' +
            (divida > 0 ? fmtMT(divida) + ' em dívida' : 'sem dívidas'))),
        btn('Trocar', function () { escolhido.encarregado = ''; desenhaEscolha(); }, 'ghost small')));
    } else {
      var q = h('input', { type: 'search', class: 'search', placeholder: 'Procurar a família: nome, telefone ou código do aluno…' });
      var res = h('div', { class: 'results' });
      q.addEventListener('input', function () {
        clear(res);
        var t = norm(q.value).replace(/\s/g, '');
        if (t.length < 2) return;
        rows('Encarregados').filter(function (e3) {
          if (norm(e3.nome_completo).replace(/\s/g, '').indexOf(t) >= 0) return true;
          if (String(e3.telefone_1).indexOf(t) >= 0 || String(e3.telefone_2 || '').indexOf(t) >= 0) return true;
          return filhosDe(e3.codigo).some(function (a) {
            return norm(a.codigo) === t || norm(a.nome_completo).replace(/\s/g, '').indexOf(t) >= 0;
          });
        }).slice(0, 8).forEach(function (e3) {
          res.appendChild(h('div', { class: 'result' },
            h('div', null, h('strong', null, e3.nome_completo),
              h('small', { class: 'muted' }, ' ' + fmtTel(e3.telefone_1) + ' · ' + fmtMT(dividaTotal(e3.codigo)) + ' em dívida')),
            btn('Escolher', function () { escolhido.encarregado = e3.codigo; desenhaEscolha(); }, 'small')));
        });
      });
      escolha.appendChild(q);
      escolha.appendChild(res);
    }
  }
  desenhaEscolha();
  painel.appendChild(escolha);

  var acoes = [];
  var confirmar = btn('Confirmar e emitir recibo', function () {
    if (!escolhido.encarregado) { toast('Escolha primeiro a família que pagou.', 'erro'); return; }
    if (!p.transacao) { toast('Este SMS não tem ID de transacção. Registe o pagamento em Receber.', 'erro'); return; }
    var e4 = find('Encarregados', escolhido.encarregado);
    if (!window.confirm('Registar ' + fmtMT(p.valor) + ' de ' + e4.nome_completo + '?')) return;
    busy(confirmar, api('emolaConfirmar', { id: p.id, encarregado: escolhido.encarregado }).then(function (res) {
      upsertLocal('Pagamentos_eMola', res.pagamento);
      guardarResposta({ recibo: res.recibo, alocacoes: res.alocacoes, cobrancas: res.cobrancas, chave: res.chave });
      toast('Recibo ' + res.recibo.numero_recibo + ' emitido.', 'ok');
      location.hash = '#/recibo/' + res.recibo.numero_recibo;
    })).catch(function (e5) { toast(e5.message, 'erro'); });
  }, 'primary');
  acoes.push(confirmar);
  acoes.push(btn('Tentar de novo', function () {
    api('emolaReprocessar', { id: p.id }).then(function (res) {
      if (res.pagamento) upsertLocal('Pagamentos_eMola', res.pagamento);
      toast('Relido: ' + (EMOLA_NOME[res.estado] || res.estado) + '.', 'ok');
      sincronizar(true);
    }).catch(function (e6) { toast(e6.message, 'erro'); });
  }, 'ghost'));
  acoes.push(btn('Pôr de lado', function () {
    var motivo = window.prompt('Porque é que este SMS fica de lado?');
    if (!motivo || !motivo.trim()) return;
    api('emolaIgnorar', { id: p.id, motivo: motivo.trim() }).then(function (res) {
      upsertLocal('Pagamentos_eMola', res.pagamento);
      toast('Posto de lado.', 'ok');
      route();
    }).catch(function (e7) { toast(e7.message, 'erro'); });
  }, 'ghost perigo'));
  painel.appendChild(h('div', { class: 'form-actions' }, acoes));
  return painel;
}

function painelTratados(lista) {
  var p = h('section', { class: 'panel' }, h('h2', null, 'Já tratados'));
  var tb = h('tbody');
  lista.slice(0, 30).forEach(function (x) {
    var enc = x.encarregado ? find('Encarregados', x.encarregado) : null;
    tb.appendChild(h('tr', { class: x.estado === 'registado' ? '' : 'off' },
      h('td', { 'data-l': 'Data' }, fmtData(String(x.recebido_em).slice(0, 10))),
      h('td', { 'data-l': 'Valor', class: 'num strong' }, fmtMT(x.valor)),
      h('td', { 'data-l': 'Família' }, enc ? enc.nome_completo : (x.nome_pagador || '—')),
      h('td', { 'data-l': 'Transacção' }, h('span', { class: 'code' }, x.transacao || '—')),
      h('td', { 'data-l': 'Estado' }, h('span', { class: 'tag estado-' + x.estado }, EMOLA_NOME[x.estado] || x.estado),
        x.motivo ? h('small', { class: 'muted' }, ' ' + x.motivo) : null),
      h('td', { 'data-l': 'Recibo' }, x.recibo
        ? h('a', { href: '#/recibo/' + x.recibo, class: 'code' }, x.recibo) : '')));
  });
  p.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, ['Data', 'Valor', 'Família', 'Transacção', 'Estado', 'Recibo']
      .map(function (t) { return h('th', null, t); }))), tb)));
  return p;
}

// ── ligar o telefone Android ─────────────────────────────────
function painelLigarTelefone() {
  var p = h('section', { class: 'panel' }, h('h2', null, 'Ligar o telefone que recebe os SMS'));
  p.appendChild(h('p', { class: 'muted' },
    'Um telefone Android com o SIM que recebe os SMS da e-Mola, com o Tasker. ' +
    'Reencaminha cada SMS para a app e envia os recibos por SMS. A chave é o que o identifica: ' +
    'quem a tiver pode mandar SMS para dentro, por isso não se põe em mais lado nenhum.'));
  var caixa = h('div');
  p.appendChild(btn('Ver a chave do aparelho', function () {
    busy(this, api('emolaChave', {}).then(function (res) { mostrarChave(caixa, res); }))
      .catch(function (e) { toast(e.message, 'erro'); });
  }, 'primary'));
  p.appendChild(caixa);
  return p;
}

function mostrarChave(caixa, res) {
  clear(caixa);
  function campo(rotulo, valor) {
    return h('div', { class: 'field full' }, h('label', null, rotulo),
      h('div', { class: 'copiar' },
        h('input', { type: 'text', value: valor, readOnly: true, onclick: function () { this.select(); } }),
        btn('Copiar', function () {
          try { navigator.clipboard.writeText(valor); toast('Copiado.', 'ok'); }
          catch (e) { toast('Copie à mão: toque no campo e seleccione.', 'erro'); }
        }, 'ghost small')));
  }
  caixa.appendChild(h('div', { class: 'grid' },
    campo('Endereço (URL do Apps Script)', res.url),
    campo('Chave do aparelho', res.chave)));
  caixa.appendChild(h('h3', null, 'No Tasker, duas tarefas'));
  caixa.appendChild(h('ol', { class: 'passos' },
    h('li', null, h('strong', null, 'SMS que chega'), ': perfil ', h('em', null, 'Event → Phone → Received Text'),
      ', com ', h('em', null, 'Sender'), ' a ', h('code', null, '*e-Mola*'),
      '. A tarefa faz um ', h('code', null, 'HTTP Request'), ' POST para o endereço acima, com ',
      h('code', null, 'Content-Type: text/plain'), ' e o corpo:',
      h('pre', null, '{"action":"sms","chave":"' + res.chave +
        '","remetente":"%SMSRF","texto":"%SMSRB","recebido_em":"%SMSRD"}')),
    h('li', null, h('strong', null, 'Recibos a sair'), ': de 5 em 5 minutos, POST com ',
      h('code', null, '{"action":"smsPendentes","chave":"…"}'),
      '; para cada mensagem, enviar o SMS e avisar a app com ',
      h('code', null, '{"action":"smsEnviado","chave":"…","id":"MS00001"}'), '.')));
  caixa.appendChild(h('p', { class: 'muted' },
    'Antes de confiar nisto: faça um pagamento de teste com *898# e outro pela app e-Mola. ' +
    'Os dois SMS aparecem aqui em cima, mesmo que a app não os perceba — e com o texto à vista ' +
    'ajusta-se a leitura.'));
  caixa.appendChild(h('div', { class: 'form-actions' }, btn('Renovar a chave', function () {
    if (!window.confirm('A chave antiga deixa de servir e o telefone precisa da nova. Continuar?')) return;
    api('emolaChave', { renovar: true }).then(function (r2) {
      mostrarChave(caixa, r2);
      toast('Chave nova. Actualize o Tasker no telefone.', 'ok');
    }).catch(function (e) { toast(e.message, 'erro'); });
  }, 'ghost perigo')));
}

// ── Relatórios ───────────────────────────────────────────────
// Tudo se calcula no telefone, a partir dos movimentos que já lá estão:
// os relatórios abrem sem rede e mostram sempre o mesmo que os ecrãs.

function mesesDoAno(a) {
  var out = [];
  for (var m = Number(a.mes_inicio); m <= Number(a.mes_fim); m++) out.push(m);
  return out;
}
function anoDoRelatorio() {
  return (S.relAno && find('AnosLetivos', S.relAno)) || anoAtivo() || rows('AnosLetivos')[0] || null;
}
function escolaDaFamilia(codEnc) {
  var f = filhosDe(codEnc);
  if (!f.length) return 'REDE';
  var e = f[0].escola;
  return f.every(function (a) { return a.escola === e; }) ? e : 'REDE';
}
function categoriaDaCobranca(c) {
  var t = find('TiposCobranca', c.tipo_cobranca);
  return t && t.categoria ? t.categoria : 'REC_OUT';
}
function naEscola(cod) { return S.escola === 'TODAS' || cod === S.escola; }

// Número para o Excel europeu: vírgula decimal, sem separador de milhares.
function csvNum(v) { return String(mt(v)).replace('.', ','); }

function exportarCSV(nome, cols, linhas) {
  var sep = ';';
  function esc(v) {
    var s = v === undefined || v === null ? '' : String(v);
    return (s.indexOf('"') >= 0 || s.indexOf(sep) >= 0 || s.indexOf('\n') >= 0)
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // O ﻿ à frente faz o Excel abrir o ficheiro em UTF-8 e não estragar os acentos.
  var txt = '﻿' + [cols.map(esc).join(sep)]
    .concat(linhas.map(function (l) { return l.map(esc).join(sep); })).join('\r\n');
  var a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })),
    download: nome + '.csv' });
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// ── situação devedora ────────────────────────────────────────
function relDevedores() {
  var ano = anoDoRelatorio();
  var al = alocadoPorCobranca();
  var grupos = {};
  rows('Cobrancas').forEach(function (c) {
    if (c.estado === 'anulada' || !naEscola(c.escola)) return;
    if (ano && String(c.ano) !== String(ano.ano)) return;
    var falta = mt(Math.max(0, mt(Number(c.valor_liquido) - (al[c.id] || 0))));
    if (falta <= 0.004) return;
    var fin = financeiroDoAluno(c.aluno);
    var k = fin ? fin.codigo : 'SEM_RESP_' + c.aluno;
    if (!grupos[k]) grupos[k] = { enc: fin, aluno: c.aluno, total: 0, atrasado: 0, atrasadas: 0,
      antiga: '', alunos: {}, escolas: {} };
    var g = grupos[k];
    g.total = mt(g.total + falta);
    g.alunos[c.aluno] = true;
    g.escolas[c.escola] = true;
    if (emAtraso(c)) {
      g.atrasadas++;
      g.atrasado = mt(g.atrasado + falta);
      if (!g.antiga || c.data_vencimento < g.antiga) g.antiga = c.data_vencimento;
    }
  });
  var lista = Object.keys(grupos).map(function (k) { return grupos[k]; })
    .sort(function (a, b) { return b.total - a.total; });

  var cols = ['Família', 'Telefone', 'Educandos', 'Escola', 'Valor vencido', 'Cobranças vencidas', 'Mais antiga', 'Total em dívida'];
  var linhas = lista.map(function (g) {
    var nomes = Object.keys(g.alunos).map(function (a) {
      var x = find('Alunos', a);
      return x ? x.nome_completo : a;
    });
    var esc = Object.keys(g.escolas).map(escolaNome).join(', ');
    var nome = g.enc ? g.enc.nome_completo : 'SEM RESPONSÁVEL FINANCEIRO';
    return {
      csv: [nome, g.enc ? g.enc.telefone_1 : '', nomes.join(' / '), esc, csvNum(g.atrasado),
            String(g.atrasadas), g.antiga ? fmtData(g.antiga) : '', csvNum(g.total)],
      el: [
        g.enc ? h('a', { href: '#/receber/' + g.enc.codigo, class: 'strong' }, nome)
              : h('span', { class: 'warn' }, nome),
        g.enc ? fmtTel(g.enc.telefone_1) : '',
        nomes.join(', '), esc,
        { num: true, v: g.atrasado ? fmtMT(g.atrasado) : '—' },
        { num: true, v: g.atrasadas ? String(g.atrasadas) : '—' },
        g.antiga ? fmtData(g.antiga) : '—',
        { num: true, v: h('strong', null, fmtMT(g.total)) }
      ],
      acao: g.enc && g.total > 0 ? btn('Lembrete', function () {
        enviarWhatsApp(g.enc, textoLembrete(g.enc, g.total, g.atrasadas));
      }, 'ghost small') : null,
      destaque: g.atrasadas > 0
    };
  });
  var total = lista.reduce(function (t, g) { return mt(t + g.total); }, 0);
  var atraso = lista.reduce(function (t, g) { return mt(t + g.atrasado); }, 0);
  return {
    titulo: 'Situação devedora',
    sub: lista.length + (lista.length === 1 ? ' família com dívida · ' : ' famílias com dívida · ') + fmtMT(total) + ' no total, dos quais ' + fmtMT(atraso) + ' já vencidos',
    cols: cols, linhas: linhas, comAcao: true,
    totais: ['Total', '', '', '', csvNum(atraso), '', '', csvNum(total)],
    totaisEl: ['Total de ' + lista.length + ' famílias', '', '', '', { num: true, v: fmtMT(atraso) }, '', '', { num: true, v: fmtMT(total) }]
  };
}

// ── mapa de mensalidades ─────────────────────────────────────
function relMapa() {
  var ano = anoDoRelatorio();
  if (!ano) return { titulo: 'Mapa de mensalidades', vazio: 'Defina o ano lectivo.' };
  var meses = mesesDoAno(ano);
  var al = alocadoPorCobranca();
  var alunos = rows('Alunos').filter(function (a) { return naEscola(a.escola) && a.estado === 'ativo'; })
    .sort(function (a, b) {
      if (a.escola !== b.escola) return a.escola < b.escola ? -1 : 1;
      return norm(a.nome_completo) < norm(b.nome_completo) ? -1 : 1;
    });
  var porAluno = {};
  rows('Cobrancas').forEach(function (c) {
    if (String(c.ano) !== String(ano.ano) || c.tipo_cobranca !== 'MENSALIDADE') return;
    var m = Number(String(c.mes_referencia).slice(5, 7));
    (porAluno[c.aluno] = porAluno[c.aluno] || {})[m] = c;
  });
  function estadoCelula(c) {
    if (!c) return { k: 'sem', t: '—' };
    if (c.estado === 'anulada') return { k: 'anulada', t: 'anul.' };
    var falta = mt(Math.max(0, mt(Number(c.valor_liquido) - (al[c.id] || 0))));
    if (falta <= 0.004) return { k: 'paga', t: 'paga' };
    if (emAtraso(c)) return { k: 'atraso', t: fmtMT(falta).replace(' MT', '') };
    if (mt(al[c.id] || 0) > 0) return { k: 'parcial', t: fmtMT(falta).replace(' MT', '') };
    return { k: 'aberta', t: fmtMT(falta).replace(' MT', '') };
  }
  var cols = ['Aluno', 'Código', 'Escola'].concat(meses.map(function (m) { return MESES[m - 1].slice(0, 3); })).concat(['Em falta']);
  var linhas = alunos.map(function (a) {
    var cells = [], csv = [a.nome_completo, a.codigo, escolaNome(a.escola)];
    var falta = 0;
    meses.forEach(function (m) {
      var c = (porAluno[a.codigo] || {})[m];
      var e = estadoCelula(c);
      if (c && c.estado !== 'anulada') falta = mt(falta + Math.max(0, mt(Number(c.valor_liquido) - (al[c.id] || 0))));
      cells.push({ cls: 'mapa ' + e.k, v: e.t });
      csv.push(e.k === 'sem' ? '' : e.k === 'paga' ? 'paga' : e.k === 'anulada' ? 'anulada' : csvNum(
        Math.max(0, mt(Number(c.valor_liquido) - (al[c.id] || 0)))));
    });
    csv.push(csvNum(falta));
    return {
      csv: csv,
      el: [h('a', { href: '#/aluno/' + a.codigo }, a.nome_completo), a.codigo, escolaNome(a.escola)]
        .concat(cells).concat([{ num: true, v: falta > 0 ? h('strong', null, fmtMT(falta)) : '—' }])
    };
  });
  return {
    titulo: 'Mapa de mensalidades ' + ano.ano,
    sub: alunos.length + ' alunos activos · ' + MESES[meses[0] - 1] + ' a ' + MESES[meses[meses.length - 1] - 1],
    cols: cols, linhas: linhas, compacto: true,
    legenda: [['paga', 'Paga'], ['parcial', 'Parcial'], ['aberta', 'Em aberto'], ['atraso', 'Em atraso'],
              ['anulada', 'Anulada'], ['sem', 'Sem cobrança']]
  };
}

// ── receitas previstas vs recebidas ──────────────────────────
function relPrevisto() {
  var ano = anoDoRelatorio();
  if (!ano) return { titulo: 'Receitas previstas vs recebidas', vazio: 'Defina o ano lectivo.' };
  var al = alocadoPorCobranca();
  var meses = mesesDoAno(ano);
  var escolas = (S.escola === 'TODAS' ? escolasAtivas() : escolasAtivas().filter(function (e) { return e.codigo === S.escola; }));
  var dados = {};
  rows('Cobrancas').forEach(function (c) {
    if (c.estado === 'anulada' || String(c.ano) !== String(ano.ano) || !naEscola(c.escola)) return;
    var m = Number(String(c.data_vencimento).slice(5, 7));
    var k = c.escola + '|' + m;
    if (!dados[k]) dados[k] = { previsto: 0, recebido: 0 };
    dados[k].previsto = mt(dados[k].previsto + Number(c.valor_liquido));
    dados[k].recebido = mt(dados[k].recebido + mt(al[c.id] || 0));
  });
  var cols = ['Escola', 'Mês', 'Previsto', 'Recebido', 'Em falta', '% recebido'];
  var linhas = [];
  var tp = 0, tr = 0;
  escolas.forEach(function (e) {
    meses.forEach(function (m) {
      var d = dados[e.codigo + '|' + m];
      if (!d || (!d.previsto && !d.recebido)) return;
      var falta = mt(d.previsto - d.recebido);
      var pct = d.previsto > 0 ? Math.round(d.recebido / d.previsto * 100) : 0;
      tp = mt(tp + d.previsto); tr = mt(tr + d.recebido);
      linhas.push({
        csv: [e.nome, MESES[m - 1], csvNum(d.previsto), csvNum(d.recebido), csvNum(falta), String(pct)],
        el: [e.nome, MESES[m - 1], { num: true, v: fmtMT(d.previsto) }, { num: true, v: fmtMT(d.recebido) },
             { num: true, v: falta > 0.004 ? h('span', { class: 'devedor' }, fmtMT(falta)) : '—' },
             { num: true, v: barraPct(pct) }]
      });
    });
  });
  var tf = mt(tp - tr);
  return {
    titulo: 'Receitas previstas vs recebidas ' + ano.ano,
    sub: 'Previsto ' + fmtMT(tp) + ' · recebido ' + fmtMT(tr) + ' · em falta ' + fmtMT(tf),
    cols: cols, linhas: linhas,
    totais: ['Total', '', csvNum(tp), csvNum(tr), csvNum(tf), tp > 0 ? String(Math.round(tr / tp * 100)) : '0'],
    totaisEl: ['Total', '', { num: true, v: fmtMT(tp) }, { num: true, v: fmtMT(tr) },
               { num: true, v: fmtMT(tf) }, { num: true, v: (tp > 0 ? Math.round(tr / tp * 100) : 0) + '%' }]
  };
}

function barraPct(p) {
  return h('span', { class: 'pct' }, h('span', { class: 'barra' },
    h('span', { style: 'width:' + Math.min(100, Math.max(0, p)) + '%' })), String(p) + '%');
}

// ── descontos e isenções ─────────────────────────────────────
function relDescontos() {
  var ano = anoDoRelatorio();
  if (!ano) return { titulo: 'Descontos e isenções', vazio: 'Defina o ano lectivo.' };
  var porAluno = {};
  rows('Cobrancas').forEach(function (c) {
    if (c.estado === 'anulada' || String(c.ano) !== String(ano.ano) || !naEscola(c.escola)) return;
    var d = mt(c.valor_desconto);
    if (d <= 0.004) return;
    if (!porAluno[c.aluno]) porAluno[c.aluno] = { escola: c.escola, total: 0, bruto: 0, n: 0 };
    porAluno[c.aluno].total = mt(porAluno[c.aluno].total + d);
    porAluno[c.aluno].bruto = mt(porAluno[c.aluno].bruto + Number(c.valor_bruto));
    porAluno[c.aluno].n++;
  });
  var cols = ['Aluno', 'Código', 'Escola', 'Motivo', 'Cobranças', 'Valor cheio', 'Desconto', '% do cheio'];
  var linhas = Object.keys(porAluno).map(function (cod) {
    var g = porAluno[cod];
    var a = find('Alunos', cod) || { nome_completo: cod, codigo: cod };
    var motivos = rows('Descontos').filter(function (d) {
      return d.aluno === cod && String(d.ano) === String(ano.ano) && d.ativo === SIM;
    }).map(function (d) { return d.motivo; });
    var pct = g.bruto > 0 ? Math.round(g.total / g.bruto * 100) : 0;
    return {
      g: g,
      csv: [a.nome_completo, cod, escolaNome(g.escola), motivos.join(' / '), String(g.n),
            csvNum(g.bruto), csvNum(g.total), String(pct)],
      el: [h('a', { href: '#/aluno/' + cod }, a.nome_completo), cod, escolaNome(g.escola),
           motivos.join(', ') || h('span', { class: 'muted' }, 'sem motivo registado'),
           { num: true, v: String(g.n) }, { num: true, v: fmtMT(g.bruto) },
           { num: true, v: h('strong', { class: 'credito' }, fmtMT(g.total)) },
           { num: true, v: pct + '%' }]
    };
  }).sort(function (a, b) { return b.g.total - a.g.total; });
  var total = linhas.reduce(function (t, l) { return mt(t + l.g.total); }, 0);
  var bruto = linhas.reduce(function (t, l) { return mt(t + l.g.bruto); }, 0);
  return {
    titulo: 'Descontos e isenções ' + ano.ano,
    sub: linhas.length + (linhas.length === 1 ? ' aluno com desconto · ' : ' alunos com desconto · ') +
      (S.escola === 'TODAS' ? 'a rede abdica de ' : escolaNome(S.escola) + ' abdica de ') + fmtMT(total),
    cols: cols, linhas: linhas,
    totais: ['Total', '', '', '', '', csvNum(bruto), csvNum(total), bruto > 0 ? String(Math.round(total / bruto * 100)) : '0'],
    totaisEl: ['Total', '', '', '', '', { num: true, v: fmtMT(bruto) }, { num: true, v: fmtMT(total) },
               { num: true, v: (bruto > 0 ? Math.round(total / bruto * 100) : 0) + '%' }]
  };
}

// ── recibos emitidos e anulados ──────────────────────────────
function relRecibos() {
  var ano = anoDoRelatorio();
  var pref = ano ? 'REC-' + ano.ano + '-' : '';
  var lista = rows('Recebimentos').filter(function (r) { return !pref || String(r.numero_recibo).indexOf(pref) === 0; })
    .sort(function (a, b) { return a.numero_recibo < b.numero_recibo ? -1 : 1; });
  // Buracos na numeração: um número que nunca apareceu é um aviso a sério.
  var numeros = lista.map(function (r) { return Number(String(r.numero_recibo).slice(-5)); });
  var buracos = [];
  for (var i = 1; i <= (numeros.length ? numeros[numeros.length - 1] : 0); i++) {
    if (numeros.indexOf(i) < 0) buracos.push(pref + ('0000' + i).slice(-5));
  }
  var cols = ['Recibo', 'Data', 'Família', 'Método', 'Conta', 'Valor', 'Estado', 'Motivo da anulação', 'Operador'];
  var linhas = lista.map(function (r) {
    var e = find('Encarregados', r.encarregado);
    return {
      anulado: r.estado === 'anulado',
      bruto: mt(r.valor),
      valor: r.estado === 'anulado' ? 0 : mt(r.valor),
      csv: [r.numero_recibo, r.data, e ? e.nome_completo : r.encarregado, METODO_NOME[r.metodo] || r.metodo,
            nomeConta(r.conta), csvNum(r.valor), r.estado, r.motivo_anulacao || '', r.operador || ''],
      el: [h('a', { href: '#/recibo/' + r.numero_recibo, class: 'code' }, r.numero_recibo), fmtData(r.data),
           e ? e.nome_completo : r.encarregado, METODO_NOME[r.metodo] || r.metodo, nomeConta(r.conta),
           { num: true, v: r.estado === 'anulado' ? h('s', null, fmtMT(r.valor)) : h('strong', null, fmtMT(r.valor)) },
           r.estado === 'anulado' ? h('span', { class: 'tag erro' }, 'anulado') : h('span', { class: 'tag ok' }, 'válido'),
           r.motivo_anulacao || '', r.operador || '']
    };
  });
  var validos = linhas.filter(function (l) { return !l.anulado; });
  var somaV = validos.reduce(function (t, l) { return mt(t + l.valor); }, 0);
  var somaA = linhas.filter(function (l) { return l.anulado; })
    .reduce(function (t, l) { return mt(t + l.bruto); }, 0);
  return {
    titulo: 'Recibos emitidos e anulados' + (ano ? ' ' + ano.ano : ''),
    sub: lista.length + (lista.length === 1 ? ' recibo · ' : ' recibos · ') +
      validos.length + (validos.length === 1 ? ' válido (' : ' válidos (') + fmtMT(somaV) + ') · ' +
      (lista.length - validos.length) + (lista.length - validos.length === 1 ? ' anulado (' : ' anulados (') + fmtMT(somaA) + ')',
    aviso: buracos.length ? 'Faltam números na sequência: ' + buracos.join(', ') +
      '. Um recibo nunca deve desaparecer — verifique na folha.' : null,
    cols: cols, linhas: linhas,
    totais: ['Total válido', '', '', '', '', csvNum(somaV), '', '', ''],
    totaisEl: ['Total válido', '', '', '', '', { num: true, v: fmtMT(somaV) }, '', '', '']
  };
}

// ── balancete mensal ─────────────────────────────────────────
// Contabilidade de caixa: a receita conta no mês em que o dinheiro entrou.
// A repartição por categoria vem das alocações desse recibo; o que ainda
// não cobre nenhuma cobrança fica em "Adiantamentos".
function relBalancete() {
  var mes = S.relMes || hoje().slice(0, 7);
  var alocsPorRec = {};
  rows('Alocacoes').forEach(function (a) {
    (alocsPorRec[a.recebimento] = alocsPorRec[a.recebimento] || []).push(a);
  });
  var receitas = {}, despesas = {}, porEscola = {};
  function somaE(escola, campo, v) {
    if (!porEscola[escola]) porEscola[escola] = { receita: 0, despesa: 0 };
    porEscola[escola][campo] = mt(porEscola[escola][campo] + v);
  }
  function add(mapa, cat, sub, escola, v, campo) {
    if (!naEscola(escola) && escola !== 'REDE') return;
    if (S.escola !== 'TODAS' && escola === 'REDE' && campo === 'receita') return;
    var k = cat + '|' + (sub || '');
    if (!mapa[k]) mapa[k] = { cat: cat, sub: sub || '', valor: 0 };
    mapa[k].valor = mt(mapa[k].valor + v);
    somaE(escola, campo, v);
  }

  rows('Recebimentos').forEach(function (r) {
    if (r.estado === 'anulado' || String(r.data).slice(0, 7) !== mes) return;
    var usado = 0;
    (alocsPorRec[r.numero_recibo] || []).forEach(function (a) {
      var c = find('Cobrancas', a.cobranca);
      if (!c) return;
      usado = mt(usado + Number(a.valor));
      add(receitas, categoriaDaCobranca(c), c.tipo_cobranca, c.escola, mt(a.valor), 'receita');
    });
    var resto = mt(Number(r.valor) - usado);
    if (resto > 0.004) add(receitas, r.categoria || 'REC_ADIANT', '', escolaDaFamilia(r.encarregado), resto, 'receita');
  });
  despesasTodas().forEach(function (d) {
    if (d.estado === 'anulada' || String(d.data).slice(0, 7) !== mes) return;
    add(despesas, d.categoria, d.subcategoria, d.escola, mt(d.valor), 'despesa');
  });

  function nomeCat(c) {
    if (c === 'REC_ADIANT') return 'Adiantamentos (ainda por aplicar)';
    return nomeCategoria(c) || c;
  }
  function nomeSub(cat, sub) {
    if (!sub) return '';
    var t = find('TiposCobranca', sub);
    return t ? t.nome : (nomeCategoria(sub) || sub);
  }
  function linhasDe(mapa, classe) {
    return Object.keys(mapa).sort().map(function (k) {
      var x = mapa[k];
      return {
        csv: [classe, nomeCat(x.cat), nomeSub(x.cat, x.sub), csvNum(x.valor)],
        el: [h('span', { class: 'tag ' + (classe === 'Receita' ? 'ok' : 'erro') }, classe),
             nomeCat(x.cat), nomeSub(x.cat, x.sub) || h('span', { class: 'muted' }, '—'),
             { num: true, v: h('strong', null, fmtMT(x.valor)) }]
      };
    });
  }
  var lr = linhasDe(receitas, 'Receita'), ld = linhasDe(despesas, 'Despesa');
  var tr = Object.keys(receitas).reduce(function (t, k) { return mt(t + receitas[k].valor); }, 0);
  var td = Object.keys(despesas).reduce(function (t, k) { return mt(t + despesas[k].valor); }, 0);

  var resumo = h('div', { class: 'numeros grande' },
    h('div', null, h('small', null, 'Entrou'), h('strong', { class: 'ok' }, fmtMT(tr))),
    h('div', null, h('small', null, 'Saiu'), h('strong', { class: 'devedor' }, fmtMT(td))),
    h('div', null, h('small', null, 'Resultado do mês'),
      h('strong', { class: mt(tr - td) < 0 ? 'devedor' : 'ok' }, fmtMT(mt(tr - td)))));

  var porEsc = null;
  if (S.escola === 'TODAS' && Object.keys(porEscola).length > 1) {
    var tb = h('tbody');
    Object.keys(porEscola).sort().forEach(function (e) {
      var x = porEscola[e];
      tb.appendChild(h('tr', null,
        h('td', { 'data-l': 'Escola' }, e === 'REDE' ? 'Rede (comum)' : escolaNome(e)),
        h('td', { 'data-l': 'Entrou', class: 'num' }, fmtMT(x.receita)),
        h('td', { 'data-l': 'Saiu', class: 'num' }, fmtMT(x.despesa)),
        h('td', { 'data-l': 'Resultado', class: 'num strong ' + (mt(x.receita - x.despesa) < 0 ? 'devedor' : 'ok') },
          fmtMT(mt(x.receita - x.despesa)))));
    });
    porEsc = h('div', null, h('h3', null, 'Por escola'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['Escola', 'Entrou', 'Saiu', 'Resultado'].map(function (t) { return h('th', null, t); }))), tb)));
  }

  return {
    titulo: 'Balancete de ' + MESES[Number(mes.slice(5, 7)) - 1] + ' de ' + mes.slice(0, 4),
    sub: 'Entrou ' + fmtMT(tr) + ' · saiu ' + fmtMT(td) + ' · resultado ' + fmtMT(mt(tr - td)),
    antes: [resumo], depois: porEsc ? [porEsc] : null,
    cols: ['Tipo', 'Categoria', 'Detalhe', 'Valor'],
    linhas: lr.concat(ld),
    totais: ['Resultado', '', '', csvNum(mt(tr - td))],
    totaisEl: ['Resultado do mês', '', '', { num: true, v: fmtMT(mt(tr - td)) }]
  };
}

// ── fluxo de caixa ───────────────────────────────────────────
function relFluxo() {
  var de = S.relDe || (hoje().slice(0, 7) + '-01');
  var ate = S.relAte || hoje();
  var contas = contasAtivas().filter(function (c) { return naEscola(c.escola) || c.escola === 'REDE'; });
  var cols = ['Conta', 'Tipo', 'Escola', 'Saldo inicial', 'Entrou', 'Saiu', 'Saldo final'];
  var ti = 0, te = 0, ts = 0, tf = 0;
  var linhas = contas.map(function (c) {
    var movs = movimentosDaConta(c.codigo, de, ate);
    var ini = saldoDaConta(c.codigo, diaAntes(de));
    var ent = movs.filter(function (m) { return m.valor > 0; }).reduce(function (t, m) { return mt(t + m.valor); }, 0);
    var sai = movs.filter(function (m) { return m.valor < 0; }).reduce(function (t, m) { return mt(t - m.valor); }, 0);
    var fim = mt(ini + ent - sai);
    ti = mt(ti + ini); te = mt(te + ent); ts = mt(ts + sai); tf = mt(tf + fim);
    return {
      csv: [c.nome, c.tipo, c.escola === 'REDE' ? 'Rede' : escolaNome(c.escola), csvNum(ini), csvNum(ent), csvNum(sai), csvNum(fim)],
      el: [h('a', { href: '#/caixa/' + c.codigo, class: 'strong' }, c.nome),
           c.tipo === 'caixa' ? 'Dinheiro' : c.tipo === 'emola' ? 'e-Mola' : 'Banco',
           c.escola === 'REDE' ? 'Rede' : escolaNome(c.escola),
           { num: true, v: fmtMT(ini) },
           { num: true, v: ent ? h('span', { class: 'ok' }, fmtMT(ent)) : '—' },
           { num: true, v: sai ? h('span', { class: 'devedor' }, fmtMT(sai)) : '—' },
           { num: true, v: h('strong', { class: fim < 0 ? 'devedor' : '' }, fmtMT(fim)) }]
    };
  });
  return {
    titulo: 'Fluxo de caixa',
    sub: 'De ' + fmtData(de) + ' a ' + fmtData(ate) + ' · entrou ' + fmtMT(te) + ', saiu ' + fmtMT(ts),
    cols: cols, linhas: linhas,
    totais: ['Total', '', '', csvNum(ti), csvNum(te), csvNum(ts), csvNum(tf)],
    totaisEl: ['Total', '', '', { num: true, v: fmtMT(ti) }, { num: true, v: fmtMT(te) },
               { num: true, v: fmtMT(ts) }, { num: true, v: fmtMT(tf) }]
  };
}

// ── extrato do encarregado ───────────────────────────────────
function relExtrato() {
  var cod = S.relEnc;
  if (!cod) return { titulo: 'Extrato do encarregado', escolherFamilia: true };
  var e = find('Encarregados', cod);
  if (!e) return { titulo: 'Extrato do encarregado', vazio: 'Família não encontrada.' };
  var al = alocadoPorCobranca();
  var filhos = filhosDe(cod);
  var alunos = {};
  filhos.forEach(function (a) { alunos[a.codigo] = a; });
  var cobs = rows('Cobrancas').filter(function (c) { return alunos[c.aluno]; })
    .sort(function (a, b) { return a.data_vencimento < b.data_vencimento ? -1 : 1; });
  var recs = recebimentosFamilia(cod);
  var divida = dividaTotal(cod), credito = creditoFamilia(cod);

  var cols = ['Aluno', 'Referente a', 'Vence', 'Valor cheio', 'Desconto', 'Multa', 'A pagar', 'Pago', 'Em falta', 'Estado'];
  var linhas = cobs.map(function (c) {
    var pago = mt(al[c.id] || 0);
    var falta = c.estado === 'anulada' ? 0 : mt(Math.max(0, mt(Number(c.valor_liquido) - pago)));
    return {
      csv: [(alunos[c.aluno] || {}).nome_completo || c.aluno, c.descricao, c.data_vencimento,
            csvNum(c.valor_bruto), csvNum(c.valor_desconto), csvNum(c.valor_multa),
            csvNum(c.valor_liquido), csvNum(pago), csvNum(falta), c.estado],
      el: [(alunos[c.aluno] || {}).nome_completo || c.aluno, c.descricao, fmtData(c.data_vencimento),
           { num: true, v: fmtMT(c.valor_bruto) },
           { num: true, v: Number(c.valor_desconto) > 0 ? h('span', { class: 'credito' }, fmtMT(c.valor_desconto)) : '—' },
           { num: true, v: Number(c.valor_multa) > 0 ? h('span', { class: 'devedor' }, fmtMT(c.valor_multa)) : '—' },
           { num: true, v: fmtMT(c.valor_liquido) }, { num: true, v: fmtMT(pago) },
           { num: true, v: falta > 0.004 ? h('strong', { class: 'devedor' }, fmtMT(falta)) : '—' },
           h('span', { class: 'tag estado-' + c.estado }, c.estado)],
      destaque: emAtraso(c)
    };
  });

  var cabecalho = h('div', null,
    h('div', { class: 'numeros grande' },
      h('div', null, h('small', null, 'Família'), h('strong', null, e.nome_completo)),
      h('div', null, h('small', null, 'Telefone'), h('strong', null, fmtTel(e.telefone_1))),
      h('div', null, h('small', null, 'Em dívida'), h('strong', { class: divida > 0 ? 'devedor' : 'ok' }, fmtMT(divida))),
      credito > 0 ? h('div', null, h('small', null, 'Crédito'), h('strong', { class: 'credito' }, fmtMT(credito))) : null),
    h('p', { class: 'muted' }, 'Educandos: ' + (filhos.map(function (a) {
      return a.nome_completo + ' (' + a.codigo + ' · ' + escolaNome(a.escola) + ')';
    }).join(' · ') || 'nenhum')));

  var tbP = h('tbody');
  recs.forEach(function (r) {
    tbP.appendChild(h('tr', { class: r.estado === 'anulado' ? 'off' : '' },
      h('td', { 'data-l': 'Data' }, fmtData(r.data)),
      h('td', { 'data-l': 'Recibo' }, h('span', { class: 'code' }, r.numero_recibo),
        r._fila ? h('span', { class: 'tag' }, 'por enviar') : null,
        r.estado === 'anulado' ? h('span', { class: 'tag erro' }, 'anulado') : null),
      h('td', { 'data-l': 'Método' }, METODO_NOME[r.metodo] || r.metodo),
      h('td', { 'data-l': 'Valor', class: 'num strong' }, fmtMT(r.valor))));
  });
  var pagamentos = h('div', null, h('h3', null, 'Pagamentos recebidos'),
    recs.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Data', 'Recibo', 'Método', 'Valor'].map(function (t) { return h('th', null, t); }))), tbP))
      : h('p', { class: 'muted' }, 'Ainda sem pagamentos.'));

  return {
    titulo: 'Extrato de ' + e.nome_completo,
    sub: 'Em dívida ' + fmtMT(divida) + (credito > 0 ? ' · crédito ' + fmtMT(credito) : ''),
    antes: [cabecalho], depois: [pagamentos],
    cols: cols, linhas: linhas,
    acoes: [btn('Extrato por WhatsApp', function () { enviarWhatsApp(e, textoExtrato(e)); }, 'ghost'),
            h('a', { class: 'btn ghost', href: '#/receber/' + e.codigo }, 'Receber pagamento')],
    trocarFamilia: true
  };
}

// ── o ecrã dos relatórios ────────────────────────────────────
// Todos têm a mesma moldura: filtros, tabela, imprimir e exportar.
var RELATORIOS = {
  devedores: { label: 'Situação devedora', build: relDevedores, filtros: ['ano'] },
  extrato: { label: 'Extrato do encarregado', build: relExtrato, filtros: [] },
  mapa: { label: 'Mapa de mensalidades', build: relMapa, filtros: ['ano'] },
  balancete: { label: 'Balancete mensal', build: relBalancete, filtros: ['mes'] },
  fluxo: { label: 'Fluxo de caixa', build: relFluxo, filtros: ['periodo'] },
  previsto: { label: 'Previsto vs recebido', build: relPrevisto, filtros: ['ano'] },
  descontos: { label: 'Descontos e isenções', build: relDescontos, filtros: ['ano'] },
  recibos: { label: 'Recibos emitidos', build: relRecibos, filtros: ['ano'] }
};

function viewRelatorios(v, qual) {
  if (!RELATORIOS[qual]) qual = 'devedores';
  var r = RELATORIOS[qual];
  v.appendChild(pageHead('Relatórios', S.escola === 'TODAS' ? 'Todas as escolas' : escolaNome(S.escola)));
  v.appendChild(h('div', { class: 'tabs', role: 'tablist' }, Object.keys(RELATORIOS).map(function (k) {
    return h('a', { href: '#/relatorios/' + k, class: k === qual ? 'on' : '', role: 'tab' }, RELATORIOS[k].label);
  })));

  var filtros = h('div', { class: 'toolbar filtros' });
  var corpo = h('div');
  v.appendChild(filtros);
  v.appendChild(corpo);

  function campoAno() {
    var s = h('select', { class: 'filter' }, rows('AnosLetivos').map(function (a) {
      return h('option', { value: String(a.ano) }, String(a.ano) + (a.ativo === SIM ? ' (activo)' : ''));
    }));
    var atual = anoDoRelatorio();
    if (atual) s.value = String(atual.ano);
    s.addEventListener('change', function () { S.relAno = this.value; desenhar(); });
    return h('label', { class: 'f' }, 'Ano ', s);
  }
  function campoMes() {
    var i = h('input', { type: 'month', class: 'filter', value: S.relMes || hoje().slice(0, 7) });
    i.addEventListener('change', function () { S.relMes = this.value; desenhar(); });
    return h('label', { class: 'f' }, 'Mês ', i);
  }
  function campoPeriodo() {
    var a = h('input', { type: 'date', class: 'filter', value: S.relDe || (hoje().slice(0, 7) + '-01') });
    var b = h('input', { type: 'date', class: 'filter', value: S.relAte || hoje() });
    a.addEventListener('change', function () { S.relDe = this.value; desenhar(); });
    b.addEventListener('change', function () { S.relAte = this.value; desenhar(); });
    return h('span', { class: 'f' }, 'De ', a, ' até ', b);
  }

  function desenhar() {
    clear(filtros);
    (r.filtros || []).forEach(function (f) {
      filtros.appendChild(f === 'ano' ? campoAno() : f === 'mes' ? campoMes() : campoPeriodo());
    });
    var dados = r.build();
    clear(corpo);
    if (dados.escolherFamilia || dados.trocarFamilia) corpo.appendChild(escolherFamilia(desenhar));
    if (dados.escolherFamilia) return;
    if (dados.vazio) { corpo.appendChild(h('p', { class: 'empty' }, dados.vazio)); return; }
    corpo.appendChild(desenharRelatorio(dados, qual));
  }
  desenhar();
}

function escolherFamilia(aoEscolher) {
  var box = h('section', { class: 'panel' }, h('h2', null, 'Escolher a família'));
  var q = h('input', { type: 'search', class: 'search', placeholder: 'Nome do encarregado, telefone ou código do aluno…' });
  var res = h('div', { class: 'results' });
  function draw() {
    clear(res);
    var t = norm(q.value).replace(/\s/g, '');
    if (t.length < 2) return;
    var achados = rows('Encarregados').filter(function (e) {
      if (norm(e.nome_completo).replace(/\s/g, '').indexOf(t) >= 0) return true;
      if (String(e.telefone_1).indexOf(t) >= 0) return true;
      return filhosDe(e.codigo).some(function (a) {
        return norm(a.codigo) === t || norm(a.nome_completo).replace(/\s/g, '').indexOf(t) >= 0;
      });
    }).slice(0, 10);
    if (!achados.length) { res.appendChild(h('p', { class: 'muted' }, 'Ninguém encontrado.')); return; }
    achados.forEach(function (e) {
      res.appendChild(h('div', { class: 'result' },
        h('div', null, h('strong', null, e.nome_completo),
          h('small', { class: 'muted' }, ' ' + fmtTel(e.telefone_1) + ' · ' + fmtMT(dividaTotal(e.codigo)) + ' em dívida')),
        btn('Ver extrato', function () { S.relEnc = e.codigo; aoEscolher(); }, 'small')));
    });
  }
  q.addEventListener('input', draw);
  box.appendChild(q);
  box.appendChild(res);
  return box;
}

function celula(c) {
  if (c === null || c === undefined) return h('td', null, '');
  if (typeof c === 'object' && !c.nodeType) {
    var td = h('td', { class: (c.num ? 'num ' : '') + (c.cls || '') });
    var val = c.v === undefined ? '' : c.v;
    td.appendChild(typeof val === 'object' ? val : document.createTextNode(String(val)));
    return td;
  }
  return h('td', null, c);
}

function desenharRelatorio(d, nome) {
  var painel = h('section', { class: 'panel imprimir' });
  painel.appendChild(h('div', { class: 'rel-cab' },
    h('div', null, h('h2', null, d.titulo), d.sub ? h('p', { class: 'muted' }, d.sub) : null,
      h('p', { class: 'muted so-impressao' }, 'Finanças Escolinhas · ' + fmtData(hoje()) +
        (S.escola === 'TODAS' ? '' : ' · ' + escolaNome(S.escola)))),
    h('div', { class: 'actions nao-imprimir' },
      (d.acoes || []).concat([
        btn('Imprimir', function () { window.print(); }, 'ghost'),
        btn('Exportar', function () {
          var linhas = d.linhas.map(function (l) { return l.csv; });
          if (d.totais) linhas.push(d.totais);
          exportarCSV('financas-' + nome + '-' + hoje(), d.cols, linhas);
          toast('Ficheiro descarregado. Abre no Excel.', 'ok');
        }, 'primary')]))));

  if (d.aviso) painel.appendChild(h('div', { class: 'aviso-box' }, d.aviso));
  (d.antes || []).forEach(function (x) { painel.appendChild(x); });

  if (!d.linhas.length) {
    painel.appendChild(h('p', { class: 'empty' }, 'Nada a mostrar com estes filtros.'));
  } else {
    var tb = h('tbody');
    d.linhas.forEach(function (l) {
      var tr = h('tr', { class: l.destaque ? 'atraso' : '' });
      l.el.forEach(function (c, i) {
        var td = celula(c);
        td.setAttribute('data-l', d.cols[i] || '');
        tr.appendChild(td);
      });
      if (d.comAcao) tr.appendChild(h('td', { class: 'nao-imprimir' }, l.acao || null));
      tb.appendChild(tr);
    });
    var cabecalho = d.cols.map(function (c) { return h('th', null, c); });
    if (d.comAcao) cabecalho.push(h('th', { class: 'nao-imprimir' }, ''));
    var tabela = h('table', { class: 'tbl' + (d.compacto ? ' compacta' : '') },
      h('thead', null, h('tr', null, cabecalho)), tb);
    if (d.totaisEl) {
      var trT = h('tr', { class: 'totais' });
      d.totaisEl.forEach(function (c) { trT.appendChild(celula(c)); });
      if (d.comAcao) trT.appendChild(h('td', { class: 'nao-imprimir' }));
      tabela.appendChild(h('tfoot', null, trT));
    }
    painel.appendChild(h('div', { class: 'table-wrap' }, tabela));
  }
  if (d.legenda) {
    painel.appendChild(h('div', { class: 'legenda' }, d.legenda.map(function (x) {
      return h('span', null, h('i', { class: 'mapa ' + x[0] }), x[1]);
    })));
  }
  (d.depois || []).forEach(function (x) { painel.appendChild(x); });
  painel.appendChild(h('p', { class: 'muted nao-imprimir' },
    'Calculado no telefone a partir dos movimentos sincronizados' +
    (navigator.onLine ? '.' : ' — sem rede, pode faltar o que outros operadores lançaram.')));
  return painel;
}

// ── Configuração → Cobranças ─────────────────────────────────
// Os três comandos que só o administrador corre: gerar o ano,
// recalcular depois de mudar um preço e aplicar as multas.
function viewConfigCobrancas(v) {
  var ano = anoAtivo();
  v.appendChild(h('section', { class: 'panel' },
    h('h2', null, 'Gerar cobranças do ano'),
    h('p', { class: 'muted' }, 'Cria a matrícula e as mensalidades que faltam a cada aluno activo, ' +
      'do mês de entrada até ao fim do ano. Correr duas vezes não duplica nada.'),
    comandoGerar()));
  v.appendChild(h('section', { class: 'panel' },
    h('h2', null, 'Recalcular depois de mudar um preço'),
    h('p', { class: 'muted' }, 'Só toca cobranças ainda abertas e sem nenhum pagamento. ' +
      'As pagas e as parciais ficam como estão.'),
    comandoRecalcular()));
  v.appendChild(h('section', { class: 'panel' },
    h('h2', null, 'Multas'),
    h('p', { class: 'muted' }, 'Aplica a multa às cobranças vencidas há mais dias do que a tolerância. ' +
      'Nada acontece enquanto a regra do ano estiver desactivada em Configuração → Multas.'),
    comandoMultas()));
  if (!ano) v.appendChild(h('p', { class: 'erro' }, 'Defina primeiro o ano lectivo activo.'));
}

function selAno() {
  var a = anoAtivo();
  var s = h('select', null, OPT.anos().map(function (o) { return h('option', { value: o[0] }, o[1]); }));
  if (a) s.value = String(a.ano);
  return s;
}
function selEscolaTodas() {
  return h('select', null, h('option', { value: 'TODAS' }, 'Todas as escolas'),
    OPT.escolas().map(function (o) { return h('option', { value: o[0] }, o[1]); }));
}

function comandoGerar() {
  var ano = selAno(), escola = selEscolaTodas();
  var saida = h('div', { class: 'saida-cmd' });
  var confirmar = null;

  function mostrar(res, feito) {
    clear(saida);
    if (res.precos_em_falta && res.precos_em_falta.length) {
      saida.appendChild(h('div', { class: 'aviso-box' },
        h('strong', null, 'Faltam preços — estes alunos ficam de fora:'),
        h('ul', null, res.precos_em_falta.map(function (x) {
          return h('li', null, escolaNome(x.escola) + ' · ' + ((find('TiposCobranca', x.tipo_cobranca) || {}).nome || x.tipo_cobranca));
        })),
        h('a', { href: '#/config/TabelaPrecos' }, 'Ir aos preços')));
    }
    var total = feito ? res.criadas : res.total;
    if (!total) {
      saida.appendChild(h('p', { class: 'ok' }, feito ? 'Nada a criar: já estava tudo gerado.' : 'Não falta nenhuma cobrança.'));
      return;
    }
    var tb = h('tbody');
    (res.resumo || []).forEach(function (r) {
      tb.appendChild(h('tr', null,
        h('td', { 'data-l': 'Escola' }, escolaNome(r.escola)),
        h('td', { 'data-l': 'Tipo' }, (find('TiposCobranca', r.tipo_cobranca) || {}).nome || r.tipo_cobranca),
        h('td', { 'data-l': 'Alunos', class: 'num' }, String(r.alunos)),
        h('td', { 'data-l': 'Cobranças', class: 'num' }, String(r.quantidade)),
        h('td', { 'data-l': 'Total bruto', class: 'num strong' }, fmtMT(r.total))));
    });
    saida.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Escola', 'Tipo', 'Alunos', 'Cobranças', 'Total bruto'].map(function (t) { return h('th', null, t); }))), tb)));
    saida.appendChild(h('p', { class: feito ? 'ok' : 'muted' },
      feito ? total + ' cobranças criadas.' : total + ' cobranças por criar. Confira o resumo antes de confirmar.'));
    if (!feito) {
      confirmar = btn('Confirmar e gerar ' + total, function () {
        if (!window.confirm('Criar ' + total + ' cobranças?')) return;
        busy(confirmar, api('gerarCobrancas', { ano: Number(ano.value), escola: escola.value, confirmar: true })
          .then(function (r2) {
            mostrar(r2, true);
            // a sincronização volta a desenhar o ecrã: o aviso vai no toast,
            // que fica fora da vista e por isso sobrevive.
            toast(r2.criadas + ' cobranças criadas.', 'ok');
            return sincronizar(true);
          })).catch(function (e) { toast(e.message, 'erro'); });
      }, 'primary');
      saida.appendChild(h('div', { class: 'form-actions' }, confirmar));
    }
  }

  var simular = btn('Ver o que falta', function () {
    busy(simular, api('gerarCobrancas', { ano: Number(ano.value), escola: escola.value, confirmar: false })
      .then(function (res) { mostrar(res, false); })).catch(function (e) { toast(e.message, 'erro'); });
  }, 'primary');

  return h('div', null,
    h('div', { class: 'grid' },
      h('div', { class: 'field' }, h('label', null, 'Ano lectivo'), ano),
      h('div', { class: 'field' }, h('label', null, 'Escola'), escola)),
    h('div', { class: 'form-actions' }, simular), saida);
}

function comandoRecalcular() {
  var ano = selAno(), escola = selEscolaTodas();
  var tipo = h('select', null, h('option', { value: 'TODOS' }, 'Todos os tipos'),
    OPT.tipos().map(function (o) { return h('option', { value: o[0] }, o[1]); }));
  var saida = h('div', { class: 'saida-cmd' });
  var aplicar = null;

  var simular = btn('Ver o que muda', function () {
    busy(simular, api('recalcularCobrancas', { ano: Number(ano.value), escola: escola.value, tipo: tipo.value, confirmar: false })
      .then(function (res) {
        clear(saida);
        if (!res.total) { saida.appendChild(h('p', { class: 'ok' }, 'Nenhuma cobrança muda de valor.')); return; }
        saida.appendChild(h('p', null, h('strong', null, res.total + ' cobranças'), ' mudam de valor. Por exemplo:'));
        saida.appendChild(h('ul', null, (res.exemplos || []).map(function (x) {
          var a = find('Alunos', x.aluno);
          return h('li', null, (a ? a.nome_completo : x.aluno) + ': ' + fmtMT(x.de) + ' → ' + fmtMT(x.para));
        })));
        aplicar = btn('Aplicar a ' + res.total, function () {
          if (!window.confirm('Recalcular ' + res.total + ' cobranças?')) return;
          busy(aplicar, api('recalcularCobrancas', { ano: Number(ano.value), escola: escola.value, tipo: tipo.value, confirmar: true })
            .then(function (r2) {
              clear(saida);
              saida.appendChild(h('p', { class: 'ok' }, r2.alteradas + ' cobranças actualizadas.'));
              toast(r2.alteradas + ' cobranças actualizadas.', 'ok');
              return sincronizar(true);
            })).catch(function (e) { toast(e.message, 'erro'); });
        }, 'primary');
        saida.appendChild(h('div', { class: 'form-actions' }, aplicar));
      })).catch(function (e) { toast(e.message, 'erro'); });
  }, 'ghost');

  return h('div', null,
    h('div', { class: 'grid' },
      h('div', { class: 'field' }, h('label', null, 'Ano lectivo'), ano),
      h('div', { class: 'field' }, h('label', null, 'Escola'), escola),
      h('div', { class: 'field' }, h('label', null, 'Tipo de cobrança'), tipo)),
    h('div', { class: 'form-actions' }, simular), saida);
}

function comandoMultas() {
  var ano = selAno();
  var saida = h('div', { class: 'saida-cmd' });
  var aplicar = null;
  var simular = btn('Ver quantas levariam multa', function () {
    busy(simular, api('aplicarMultas', { ano: Number(ano.value), confirmar: false }).then(function (res) {
      clear(saida);
      if (res.sem_regra) {
        saida.appendChild(h('p', { class: 'muted' }, 'Não há regra de multa activa para este ano. Nada acontece.'));
        saida.appendChild(h('a', { href: '#/config/RegrasMulta' }, 'Ver as regras de multa'));
        return;
      }
      if (!res.aplicadas) { saida.appendChild(h('p', { class: 'ok' }, 'Nenhuma cobrança passou a tolerância.')); return; }
      saida.appendChild(h('p', null, h('strong', null, res.aplicadas + ' cobranças'), ' levariam multa.'));
      aplicar = btn('Aplicar as multas', function () {
        if (!window.confirm('Aplicar multa a ' + res.aplicadas + ' cobranças?')) return;
        busy(aplicar, api('aplicarMultas', { ano: Number(ano.value), confirmar: true }).then(function (r2) {
          clear(saida);
          saida.appendChild(h('p', { class: 'ok' }, r2.aplicadas + ' multas aplicadas.'));
          toast(r2.aplicadas + ' multas aplicadas.', 'ok');
          return sincronizar(true);
        })).catch(function (e) { toast(e.message, 'erro'); });
      }, 'primary perigo');
      saida.appendChild(h('div', { class: 'form-actions' }, aplicar));
    })).catch(function (e) { toast(e.message, 'erro'); });
  }, 'ghost');
  return h('div', null,
    h('div', { class: 'grid' }, h('div', { class: 'field' }, h('label', null, 'Ano lectivo'), ano)),
    h('div', { class: 'form-actions' }, simular), saida);
}

function confCell(table, col, r) {
  var v = r[col];
  if (col === 'escola') return escolaNome(v);
  if (col === 'tipo_cobranca') { var t = find('TiposCobranca', v); return t ? t.nome : v; }
  if (col === 'categoria' || col === 'categoria_pai') { var c = find('Categorias', v); return c ? c.nome : (v || ''); }
  if (col === 'valor' || col === 'saldo_inicial') return table === 'RegrasMulta' && r.modo === 'percentagem' ? v + '%' : fmtMT(v);
  if (col === 'mes_inicio' || col === 'mes_fim') return MESES[v - 1] || v;
  if (col.indexOf('data_') === 0) return fmtData(v);
  if (col === 'ativa' || col === 'ativo') return v === SIM ? 'Sim' : h('span', { class: 'tag' }, 'Não');
  return v;
}

function viewConfig(v, table) {
  if (table !== 'Cobrancas' && !CONF[table]) table = 'Escolas';
  v.appendChild(pageHead('Configuração'));
  var abas = Object.keys(CONF).map(function (k) {
    return h('a', { href: '#/config/' + k, class: k === table ? 'on' : '', role: 'tab' }, CONF[k].label);
  });
  abas.push(h('a', { href: '#/config/Cobrancas', class: table === 'Cobrancas' ? 'on' : '', role: 'tab' }, 'Cobranças'));
  v.appendChild(h('div', { class: 'tabs', role: 'tablist' }, abas));
  if (table === 'Cobrancas') { viewConfigCobrancas(v); return; }
  var c = CONF[table];
  var slot = h('div');
  var list = h('div', { class: 'table-wrap' });
  var panel = h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, c.label), btn('+ Novo', function () { editar(null); }, 'primary small')),
    c.note ? h('p', { class: 'muted' }, c.note) : null, slot, list);
  v.appendChild(panel);

  function editar(rec) {
    clear(slot);
    var defs = rec;
    if (!rec) {
      defs = {};
      var ano = anoAtivo();
      if (ano && (table === 'TabelaPrecos' || table === 'RegrasMulta')) defs.ano = ano.ano;
      if (table === 'Contas') defs.data_saldo_inicial = hoje();
    }
    var f = buildForm(c.fields, defs, { editing: !!rec });
    var s = btn('Guardar', function () {
      if (!f.check()) return;
      var data = f.get();
      if (rec) data = Object.assign({}, rec, data);
      busy(s, gravar(table, data, !rec)).then(function () { route(); }, function () {});
    }, 'primary');
    slot.appendChild(h('div', { class: 'sub-panel' }, h('h3', null, rec ? 'Editar' : 'Novo registo'), f.el,
      h('div', { class: 'form-actions' }, btn('Cancelar', function () { clear(slot); }, 'ghost'), s)));
    slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  var data = rows(table).slice();
  if (table === 'TabelaPrecos') {
    data.sort(function (a, b) {
      if (String(a.ano) !== String(b.ano)) return Number(b.ano) - Number(a.ano);
      var ka = a.escola + '|' + a.tipo_cobranca, kb = b.escola + '|' + b.tipo_cobranca;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }
  if (table === 'Categorias') {
    data.sort(function (a, b) {
      function k(x) { return x.tipo + '|' + (x.categoria_pai || x.codigo) + '|' + (x.categoria_pai ? '1' : '0') + x.nome; }
      return k(a) < k(b) ? -1 : 1;
    });
  }
  if (!data.length) { list.appendChild(h('p', { class: 'empty' }, 'Ainda sem registos.')); return; }
  var labels = {};
  c.fields.forEach(function (f) { labels[f.n] = f.l.replace(/ \(.*\)$/, ''); });
  var tb = h('tbody');
  data.forEach(function (r) {
    tb.appendChild(h('tr', { onclick: function () { editar(r); } }, c.cols.map(function (col) {
      var cell = confCell(table, col, r);
      if (table === 'Categorias' && col === 'nome' && r.categoria_pai) cell = '↳ ' + cell;
      return h('td', { 'data-l': labels[col] || col }, cell);
    })));
  });
  list.appendChild(h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, c.cols.map(function (col) { return h('th', null, labels[col] || col); }))), tb));
}

// ── service worker ───────────────────────────────────────────
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}
document.addEventListener('DOMContentLoaded', start);
