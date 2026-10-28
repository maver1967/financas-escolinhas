// ════════════════════════════════════════════════════════════
// FINANÇAS ESCOLINHAS — backend Google Apps Script
// Fase 1: configuração, alunos, encarregados, descontos.
// Fase 2: cobranças, recebimentos, alocação, crédito, recibos e mensagens.
// Fase 3: despesas com comprovativo, contas, transferências e fecho de caixa.
// Fase 5: recepção dos SMS da e-Mola, ligação automática e fila por ligar.
//
// Convenção: sem template literals (backticks), só concatenação.
// Instalação: ver INSTALACAO.md
// ════════════════════════════════════════════════════════════

var CONFIG = {
  SHEET_ID: '',   // vazio = o script está ligado à folha (Extensões → Apps Script)
  GOOGLE_CLIENT_ID: '200957289142-r2kimtq5aiv5iamjvd9drvci4sojas71.apps.googleusercontent.com',
  SESSION_DAYS: 30,
  BACKUP_FOLDER_NAME: 'Backups Finanças Escolinhas',
  COMPROVATIVOS_FOLDER: 'Comprovativos Finanças Escolinhas',
  COMPROVATIVO_MAX_KB: 2048,
  // O SMS só conta como pagamento se vier de um destes remetentes.
  // Confirmar com um pagamento de teste: é a defesa contra SMS falsos.
  EMOLA_REMETENTES: ['e-mola', 'emola', 'e-mola mz', 'movitel', '898'],
  EMOLA_CONTA: 'EMOLA',
  BACKUP_KEEP: 30,
  TZ: 'Africa/Maputo',
  METODOS: ['numerario', 'emola', 'mpesa', 'banco'],
  VERSAO: '5.0.1'
};

var SIM = 'sim', NAO = 'não';
var AUDIT_COLS = ['atualizado_em', 'atualizado_por'];
var ESTADOS_ALUNO = ['ativo', 'transferido', 'desistente', 'concluiu'];

// perm: 'admin' = só administrador escreve; 'operador' = todos;
//       'system' = só o próprio sistema (fases seguintes).
// adminRead: só o administrador lê.
var SCHEMA = {
  Escolas: { key: 'codigo', perm: 'admin', audit: true,
    cols: ['codigo', 'nome', 'endereco', 'responsavel', 'telefone', 'ativa'] },
  AnosLetivos: { key: 'ano', perm: 'admin', audit: true,
    cols: ['ano', 'data_inicio', 'data_fim', 'mes_inicio', 'mes_fim', 'ativo'] },
  TiposCobranca: { key: 'codigo', perm: 'admin', audit: true,
    cols: ['codigo', 'nome', 'periodicidade', 'categoria', 'obrigatorio', 'ativo'] },
  TabelaPrecos: { key: 'id', prefix: 'PR', perm: 'admin', audit: true,
    cols: ['id', 'ano', 'escola', 'tipo_cobranca', 'valor', 'dia_vencimento'] },
  Categorias: { key: 'codigo', perm: 'admin', audit: true,
    cols: ['codigo', 'nome', 'tipo', 'categoria_pai', 'ativa'] },
  Contas: { key: 'codigo', perm: 'admin', audit: true,
    cols: ['codigo', 'nome', 'tipo', 'escola', 'saldo_inicial', 'data_saldo_inicial', 'ativa'] },
  RegrasMulta: { key: 'id', prefix: 'MU', perm: 'admin', audit: true,
    cols: ['id', 'ano', 'escola', 'dias_tolerancia', 'modo', 'valor', 'ativa'] },
  Utilizadores: { key: 'email', perm: 'admin', audit: true, adminRead: true,
    cols: ['email', 'nome', 'papel', 'ativo'] },
  Contadores: { key: 'chave', perm: 'system', adminRead: true,
    cols: ['chave', 'ultimo_valor'] },

  Alunos: { key: 'codigo', perm: 'operador', audit: true,
    cols: ['codigo', 'nome_completo', 'data_nascimento', 'sexo', 'escola', 'sala',
           'data_entrada', 'data_saida', 'estado', 'endereco', 'bairro', 'observacoes'] },
  Encarregados: { key: 'codigo', perm: 'operador', audit: true,
    cols: ['codigo', 'nome_completo', 'telefone_1', 'telefone_2', 'tem_whatsapp',
           'endereco', 'bairro', 'profissao', 'observacoes'] },
  AlunoEncarregado: { key: 'id', prefix: 'AE', perm: 'operador', audit: true,
    cols: ['id', 'aluno', 'encarregado', 'parentesco', 'responsavel_financeiro', 'contacto_principal'] },
  Descontos: { key: 'id', prefix: 'DS', perm: 'admin', audit: true,
    cols: ['id', 'aluno', 'ano', 'tipo_cobranca', 'modo', 'valor', 'mes_de', 'mes_ate',
           'motivo', 'autorizado_por', 'ativo'] },

  Cobrancas: { key: 'id', prefix: 'CB', perm: 'system', audit: true,
    cols: ['id', 'ano', 'aluno', 'escola', 'tipo_cobranca', 'mes_referencia', 'descricao',
           'valor_bruto', 'valor_desconto', 'valor_multa', 'valor_liquido', 'data_vencimento',
           'estado', 'motivo_anulacao'] },
  Recebimentos: { key: 'numero_recibo', perm: 'system', audit: true,
    cols: ['numero_recibo', 'data', 'encarregado', 'aluno', 'categoria', 'valor', 'metodo',
           'conta', 'referencia_externa', 'observacao', 'operador', 'estado', 'motivo_anulacao',
           'ref_cliente'] },
  Alocacoes: { key: 'id', prefix: 'AL', perm: 'system', audit: true,
    cols: ['id', 'recebimento', 'cobranca', 'valor', 'data', 'operador'] },
  Despesas: { key: 'id', prefix: 'DP', perm: 'system', audit: true,
    cols: ['id', 'data', 'escola', 'categoria', 'subcategoria', 'descricao', 'fornecedor',
           'valor', 'conta', 'metodo', 'numero_documento', 'comprovativo_url', 'operador',
           'estado', 'motivo_anulacao', 'ref_cliente'] },
  Transferencias: { key: 'id', prefix: 'TR', perm: 'system', audit: true,
    cols: ['id', 'data', 'conta_origem', 'conta_destino', 'valor', 'descricao', 'operador',
           'estado', 'motivo_anulacao', 'ref_cliente'] },

  Pagamentos_eMola: { key: 'id', prefix: 'EM', perm: 'system', audit: true,
    cols: ['id', 'recebido_em', 'remetente', 'texto', 'transacao', 'valor', 'telefone_pagador',
           'nome_pagador', 'conteudo', 'codigos', 'estado', 'encarregado', 'recibo', 'motivo', 'operador'] },
  Mensagens: { key: 'id', prefix: 'MS', perm: 'system',
    cols: ['id', 'data', 'encarregado', 'telefone', 'canal', 'texto', 'recibo', 'estado', 'enviado_em'] },
  Auditoria: { key: 'data_hora', perm: 'system', adminRead: true,
    cols: ['data_hora', 'operador', 'acao', 'tabela', 'registo_id', 'antes', 'depois'] }
};

// Tabelas enviadas à app no arranque
var BOOTSTRAP_TABLES = ['Escolas', 'AnosLetivos', 'TiposCobranca', 'TabelaPrecos', 'Categorias',
  'Contas', 'RegrasMulta', 'Utilizadores', 'Alunos', 'Encarregados', 'AlunoEncarregado', 'Descontos',
  'Cobrancas', 'Recebimentos', 'Alocacoes', 'Despesas', 'Transferencias', 'Pagamentos_eMola'];

// Tabelas grandes: a app pede só o que mudou desde a última sincronização.
var INCREMENTAIS = ['Cobrancas', 'Recebimentos', 'Alocacoes', 'Despesas', 'Transferencias', 'Pagamentos_eMola'];

var ESTADOS_COBRANCA = ['aberta', 'parcial', 'paga', 'anulada'];

var NUM_COL = /^(valor|valor_.+|saldo_inicial|dia_vencimento|mes_inicio|mes_fim|mes_de|mes_ate|ano|dias_tolerancia|ultimo_valor)$/;

// Dinheiro: duas casas decimais, sempre arredondado da mesma maneira.
function mt_(v) { return Math.round((Number(v) || 0) * 100) / 100; }

// ── utilidades ────────────────────────────────────────────────
function fail_(code, message) {
  var e = new Error(message);
  e.code = code;
  return e;
}
function isNum_(col) { return NUM_COL.test(col); }
function colsOf_(name) {
  var sc = SCHEMA[name];
  return sc.audit ? sc.cols.concat(AUDIT_COLS) : sc.cols.slice();
}
function now_() { return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd'); }
function pad_(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }
function trim_(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function norm_(s) {
  return trim_(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function simnao_(v, def) {
  var s = norm_(v);
  if (s === 'sim' || s === 'true' || s === 's' || s === '1') return SIM;
  if (s === 'nao' || s === 'false' || s === 'n' || s === '0') return NAO;
  return def;
}
// Telefone moçambicano: guarda 9 dígitos (8XXXXXXXX)
function phone9_(v) {
  var d = trim_(v).replace(/\D/g, '');
  if (d.indexOf('00258') === 0) d = d.slice(5);
  if (d.indexOf('258') === 0 && d.length === 12) d = d.slice(3);
  return d;
}

var _ss = null, _cache = {};
function ss_() {
  if (!_ss) _ss = CONFIG.SHEET_ID ? SpreadsheetApp.openById(CONFIG.SHEET_ID)
                                  : SpreadsheetApp.getActiveSpreadsheet();
  return _ss;
}
function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw fail_('setup', 'Falta a folha "' + name + '". Execute instalar() no editor do Apps Script.');
  return sh;
}
function header_(sh) {
  var lc = sh.getLastColumn();
  if (lc < 1) return [];
  return sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return String(h).trim(); });
}
function cell_(v) {
  if (v instanceof Date) {
    var hasTime = v.getHours() || v.getMinutes() || v.getSeconds();
    return Utilities.formatDate(v, CONFIG.TZ, hasTime ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  return v;
}

// Lê uma folha inteira como lista de objectos ({_row} = linha na folha)
function readTable_(name) {
  if (_cache[name]) return _cache[name];
  var sh = sheet_(name);
  var head = header_(sh);
  var last = sh.getLastRow();
  var rows = [];
  if (last >= 2 && head.length) {
    var vals = sh.getRange(2, 1, last - 1, head.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      var empty = true;
      var o = { _row: i + 2 };
      for (var c = 0; c < head.length; c++) {
        if (!head[c]) continue;
        var v = cell_(r[c]);
        if (v !== '' && v !== null) empty = false;
        o[head[c]] = v === null ? '' : v;
      }
      if (!empty) rows.push(o);
    }
  }
  _cache[name] = { head: head, rows: rows, sheet: sh };
  return _cache[name];
}
function strip_(o) {
  var r = {};
  for (var k in o) if (k !== '_row') r[k] = o[k];
  return r;
}

// Um objecto na ordem das colunas da folha, com os números como números
function toRow_(head, obj) {
  var arr = head.map(function (c) {
    var v = obj[c];
    if (v === undefined || v === null) return '';
    if (isNum_(c)) {
      if (v === '') return '';
      var n = Number(String(v).replace(',', '.'));
      return isNaN(n) ? '' : n;
    }
    return String(v);
  });
  head.forEach(function (c, i) { if (c) obj[c] = arr[i]; });
  return arr;
}

// Escreve um objecto numa linha (rowNum) ou no fim (rowNum vazio)
function writeObj_(name, obj, rowNum) {
  var t = readTable_(name);
  var arr = toRow_(t.head, obj);
  var row = rowNum || (t.sheet.getLastRow() + 1);
  t.sheet.getRange(row, 1, 1, arr.length).setValues([arr]);
  obj._row = row;
  if (!rowNum) t.rows.push(obj);
  return obj;
}

// Acrescenta muitas linhas de uma só vez (a geração do ano cria milhares)
function writeMany_(name, objs) {
  if (!objs.length) return objs;
  var t = readTable_(name);
  var arrs = objs.map(function (o) { return toRow_(t.head, o); });
  var row = t.sheet.getLastRow() + 1;
  t.sheet.getRange(row, 1, arrs.length, t.head.length).setValues(arrs);
  objs.forEach(function (o, i) { o._row = row + i; t.rows.push(o); });
  return objs;
}

function findBy_(name, col, val) {
  var rows = readTable_(name).rows;
  for (var i = 0; i < rows.length; i++) if (String(rows[i][col]) === String(val)) return rows[i];
  return null;
}

// Contador sequencial; nunca devolve um número abaixo de minVal+1
function nextCounter_(chave, minVal) {
  var t = readTable_('Contadores');
  var r = findBy_('Contadores', 'chave', chave);
  var cur = r ? Number(r.ultimo_valor) || 0 : 0;
  var next = Math.max(cur, minVal || 0) + 1;
  if (r) { r.ultimo_valor = next; writeObj_('Contadores', r, r._row); }
  else writeObj_('Contadores', { chave: chave, ultimo_valor: next });
  return next;
}

// Reserva n números de uma vez e devolve o primeiro
function reserveCounter_(chave, n, minVal) {
  if (n <= 0) return 0;
  var r = findBy_('Contadores', 'chave', chave);
  var cur = r ? Number(r.ultimo_valor) || 0 : 0;
  var ini = Math.max(cur, minVal || 0) + 1;
  var fim = ini + n - 1;
  if (r) { r.ultimo_valor = fim; writeObj_('Contadores', r, r._row); }
  else writeObj_('Contadores', { chave: chave, ultimo_valor: fim });
  return ini;
}

function audit_(user, acao, tabela, id, antes, depois) {
  function j(o) {
    if (!o) return '';
    var s = JSON.stringify(strip_(o));
    return s.length > 5000 ? s.slice(0, 5000) + '…' : s;
  }
  writeObj_('Auditoria', { data_hora: now_(), operador: user ? user.email : 'sistema',
    acao: acao, tabela: tabela, registo_id: String(id || ''), antes: j(antes), depois: j(depois) });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── instalação ───────────────────────────────────────────────
// Executar UMA vez no editor: instalar()
// Cria as 20 folhas, os dados iniciais, o administrador e o backup nocturno.
function instalar() {
  var email = Session.getEffectiveUser().getEmail();
  var log = setup_(email, 'Administrador');
  Logger.log(log.join('\n'));
  return log;
}

function setup_(adminEmail, adminNome) {
  var ss = ss_();
  var log = [];
  Object.keys(SCHEMA).forEach(function (name) {
    var cols = colsOf_(name);
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      log.push('Criada a folha ' + name);
    } else {
      var head = header_(sh);
      var missing = cols.filter(function (c) { return head.indexOf(c) < 0; });
      if (missing.length) {
        sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
        log.push('Folha ' + name + ': colunas acrescentadas ' + missing.join(', '));
      }
    }
    formatSheet_(sh);
  });
  _cache = {};
  seed_(adminEmail, adminNome, log);
  // apaga a folha vazia inicial
  ['Folha1', 'Página1', 'Sheet1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) { ss.deleteSheet(s); log.push('Apagada ' + n); }
  });
  installTriggers_(log);
  return log;
}

function formatSheet_(sh) {
  var head = header_(sh);
  if (!head.length) return;
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  var rows = Math.max(sh.getMaxRows(), 2);
  head.forEach(function (c, i) {
    if (!isNum_(c)) sh.getRange(2, i + 1, rows - 1, 1).setNumberFormat('@');
  });
}

function seedIfEmpty_(name, rows, log) {
  if (readTable_(name).rows.length) return;
  rows.forEach(function (r) {
    if (SCHEMA[name].audit) { r.atualizado_em = now_(); r.atualizado_por = 'instalação'; }
    writeObj_(name, r);
  });
  log.push('Dados iniciais em ' + name + ': ' + rows.length);
}

function seed_(adminEmail, adminNome, log) {
  var hoje = today_();
  var escolas = [['B', 'Barrane'], ['M', 'Matadouro'], ['N', 'Nhamaxaxa'], ['C', 'Macupula'], ['S', 'São Lourenço']];
  seedIfEmpty_('Escolas', escolas.map(function (e) {
    return { codigo: e[0], nome: e[1], ativa: SIM };
  }), log);
  var ano = new Date().getMonth() >= 9 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  seedIfEmpty_('AnosLetivos', [{ ano: ano, data_inicio: ano + '-02-01', data_fim: ano + '-11-30',
    mes_inicio: 2, mes_fim: 11, ativo: SIM }], log);
  seedIfEmpty_('Categorias', [
    { codigo: 'REC_MAT', nome: 'Matrículas', tipo: 'receita', ativa: SIM },
    { codigo: 'REC_MENS', nome: 'Mensalidades', tipo: 'receita', ativa: SIM },
    { codigo: 'REC_OUT', nome: 'Outras receitas', tipo: 'receita', ativa: SIM },
    { codigo: 'DES_ALIM', nome: 'Produtos alimentares', tipo: 'despesa', ativa: SIM },
    { codigo: 'DES_LIMP', nome: 'Produtos de limpeza', tipo: 'despesa', ativa: SIM },
    { codigo: 'DES_UTIL', nome: 'Utilidades', tipo: 'despesa', ativa: SIM }
  ], log);
  seedIfEmpty_('TiposCobranca', [
    { codigo: 'MATRICULA', nome: 'Matrícula', periodicidade: 'unica', categoria: 'REC_MAT', obrigatorio: SIM, ativo: SIM },
    { codigo: 'MENSALIDADE', nome: 'Mensalidade', periodicidade: 'mensal', categoria: 'REC_MENS', obrigatorio: SIM, ativo: SIM }
  ], log);
  var contas = escolas.map(function (e) {
    return { codigo: 'CT_' + e[0], nome: 'Conta ' + e[1], tipo: 'banco', escola: e[0],
      saldo_inicial: 0, data_saldo_inicial: hoje, ativa: SIM };
  });
  contas.push({ codigo: 'CX_COMUM', nome: 'Caixa comum', tipo: 'caixa', escola: 'REDE',
    saldo_inicial: 0, data_saldo_inicial: hoje, ativa: SIM });
  contas.push({ codigo: 'EMOLA', nome: 'e-Mola', tipo: 'emola', escola: 'REDE',
    saldo_inicial: 0, data_saldo_inicial: hoje, ativa: SIM });
  seedIfEmpty_('Contas', contas, log);
  if (adminEmail) {
    seedIfEmpty_('Utilizadores', [{ email: String(adminEmail).toLowerCase(), nome: adminNome || 'Administrador',
      papel: 'admin', ativo: SIM }], log);
  }
}

function installTriggers_(log) {
  var has = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'backupNocturno';
  });
  if (!has) {
    ScriptApp.newTrigger('backupNocturno').timeBased().everyDays(1).atHour(2).create();
    log.push('Backup nocturno activado (02:00)');
  }
}

// ── backup ───────────────────────────────────────────────────
// Cópia diária (guarda as últimas BACKUP_KEEP) + cópia mensal permanente no dia 1.
function backupNocturno() {
  var ss = ss_();
  var file = DriveApp.getFileById(ss.getId());
  var it = DriveApp.getFoldersByName(CONFIG.BACKUP_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.BACKUP_FOLDER_NAME);
  var hoje = today_();
  file.makeCopy('Diário ' + hoje + ' — ' + ss.getName(), folder);
  if (hoje.slice(8) === '01') file.makeCopy('Mensal ' + hoje.slice(0, 7) + ' — ' + ss.getName(), folder);
  var diarios = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf('Diário ') === 0) diarios.push(f);
  }
  diarios.sort(function (a, b) { return b.getName() < a.getName() ? -1 : 1; });
  diarios.slice(CONFIG.BACKUP_KEEP).forEach(function (f) { f.setTrashed(true); });
}

// ── sessões e login ──────────────────────────────────────────
function props_() { return PropertiesService.getScriptProperties(); }

function login_(idToken) {
  if (!idToken) throw fail_('login', 'Falta o token Google.');
  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' +
    encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw fail_('login', 'Token Google inválido.');
  var info = JSON.parse(resp.getContentText());
  if (info.aud !== CONFIG.GOOGLE_CLIENT_ID) throw fail_('login', 'Token emitido para outra aplicação.');
  if (String(info.email_verified) !== 'true') throw fail_('login', 'Email Google não verificado.');
  var email = String(info.email).toLowerCase();
  var u = findBy_('Utilizadores', 'email', email);
  if (!u || u.ativo !== SIM) throw fail_('login', 'O utilizador ' + email + ' não tem acesso. Peça ao administrador.');
  cleanSessions_();
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props_().setProperty('S_' + token, JSON.stringify({ email: email,
    exp: Date.now() + CONFIG.SESSION_DAYS * 864e5 }));
  return { ok: true, token: token, user: publicUser_(u) };
}

function cleanSessions_() {
  var all = props_().getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props_().deleteProperty(k); }
    catch (e) { props_().deleteProperty(k); }
  });
}

function userFromToken_(token) {
  if (!token) throw fail_('sessao', 'Sessão em falta. Entre de novo.');
  var raw = props_().getProperty('S_' + token);
  if (!raw) throw fail_('sessao', 'Sessão expirada. Entre de novo.');
  var s = JSON.parse(raw);
  if (s.exp < Date.now()) { props_().deleteProperty('S_' + token); throw fail_('sessao', 'Sessão expirada. Entre de novo.'); }
  var u = findBy_('Utilizadores', 'email', s.email);
  if (!u || u.ativo !== SIM) throw fail_('sessao', 'Acesso desactivado.');
  return u;
}

function publicUser_(u) { return { email: u.email, nome: u.nome, papel: u.papel }; }

// ── API ──────────────────────────────────────────────────────
// A app envia POST com Content-Type text/plain e corpo JSON:
//   {action, token, ...}
function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); }
  catch (x) { return json_({ ok: false, code: 'pedido', error: 'Pedido inválido.' }); }
  try { return json_(route_(req)); }
  catch (err) { return json_({ ok: false, code: err.code || 'erro', error: err.message || String(err), extra: err.extra || null }); }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.recibo) return paginaRecibo_(p.recibo, trim_(p.k));
  return json_({ ok: true, app: 'Finanças Escolinhas', versao: CONFIG.VERSAO, hora: now_() });
}

function route_(req) {
  _cache = {};
  if (req.action === 'login') return login_(req.idToken);
  // O telefone Android que recebe os SMS não entra com conta Google:
  // identifica-se com a chave do aparelho e só pode fazer estas três coisas.
  if (req.action === 'sms') return withLock_(function () { _cache = {}; return receberSMS_(req); });
  if (req.action === 'smsPendentes') return smsPendentes_(req);
  if (req.action === 'smsEnviado') return withLock_(function () { _cache = {}; return smsEnviado_(req); });
  var user = userFromToken_(req.token);
  switch (req.action) {
    case 'bootstrap': return bootstrap_(user, req.desde);
    case 'logout':
      props_().deleteProperty('S_' + req.token);
      return { ok: true };
    case 'save':
      return withLock_(function () { _cache = {}; return save_(user, req.table, req.record || {}, !!req.isNew, !!req.force); });
    case 'removeLink':
      return withLock_(function () { _cache = {}; return removeLink_(user, req.id); });

    // fase 2
    case 'gerarCobrancas':
      return withLock_(function () { _cache = {}; return gerarCobrancas_(user, req.ano, req.escola, !!req.confirmar); });
    case 'recalcularCobrancas':
      return withLock_(function () { _cache = {}; return recalcularCobrancas_(user, req.ano, req.escola, req.tipo, !!req.confirmar); });
    case 'receber':
      return withLock_(function () { _cache = {}; return receber_(user, req); });
    case 'anularRecebimento':
      return withLock_(function () { _cache = {}; return anularRecebimento_(user, req.numero, req.motivo); });
    case 'anularCobranca':
      return withLock_(function () { _cache = {}; return anularCobranca_(user, req.id, req.motivo); });
    case 'aplicarMultas':
      return withLock_(function () { _cache = {}; return aplicarMultas_(user, req.ano, !!req.confirmar); });
    case 'removerMulta':
      return withLock_(function () { _cache = {}; return removerMulta_(user, req.id, req.motivo); });
    // fase 3
    case 'despesa':
      return withLock_(function () { _cache = {}; return despesa_(user, req); });
    case 'anularDespesa':
      return withLock_(function () { _cache = {}; return anularDespesa_(user, req.id, req.motivo); });
    case 'transferencia':
      return withLock_(function () { _cache = {}; return transferencia_(user, req); });
    case 'anularTransferencia':
      return withLock_(function () { _cache = {}; return anularTransferencia_(user, req.id, req.motivo); });
    case 'saldos':
      return { ok: true, saldos: saldos_(req.ate), hora: now_() };
    case 'movimentos':
      return { ok: true, movimentos: movimentosDaConta_(req.conta, req.de, req.ate) };
    case 'fechoCaixa':
      return withLock_(function () { _cache = {}; return fechoCaixa_(user, req); });
    case 'fechos':
      return { ok: true, fechos: fechosDe_(req.conta, req.limite) };

    case 'usarCredito':
      return withLock_(function () { _cache = {}; return usarCredito_(user, req); });
    case 'emolaConfirmar':
      return withLock_(function () { _cache = {}; return confirmarEmola_(user, req); });
    case 'emolaIgnorar':
      return withLock_(function () { _cache = {}; return ignorarEmola_(user, req.id, req.motivo); });
    case 'emolaChave':
      return chaveAparelho_(user, !!req.renovar);
    case 'emolaReprocessar':
      return withLock_(function () { _cache = {}; return reprocessarEmola_(user, req.id); });
    case 'mensagem':
      return withLock_(function () { _cache = {}; return registarMensagem_(user, req); });
    case 'recibo':
      return reciboDados_(req.numero);
  }
  throw fail_('acao', 'Acção desconhecida: ' + req.action);
}

// desde = {Cobrancas: '2027-03-01 10:00:00', …}: a app só recebe o que mudou.
// Nada se apaga nestas folhas, por isso basta comparar atualizado_em.
// A comparação é >= de propósito: a hora só tem segundos, e uma linha gravada
// no mesmo segundo da última sincronização perder-se-ia para sempre com >.
// Repetir algumas linhas não faz mal: a app guarda-as pela chave.
function bootstrap_(user, desde) {
  var data = {}, parcial = {};
  desde = desde || {};
  BOOTSTRAP_TABLES.forEach(function (name) {
    if (SCHEMA[name].adminRead && user.papel !== 'admin') return;
    var rows = readTable_(name).rows;
    var d = INCREMENTAIS.indexOf(name) >= 0 ? trim_(desde[name]) : '';
    if (d) {
      parcial[name] = true;
      rows = rows.filter(function (r) { return String(r.atualizado_em || '') >= d; });
    }
    data[name] = rows.map(strip_);
  });
  return { ok: true, user: publicUser_(user), data: data, parcial: parcial,
    hora: now_(), versao: CONFIG.VERSAO, ano_ativo: activeYear_() ? Number(activeYear_().ano) : null };
}

// ── gravação genérica com regras por tabela ──────────────────
function save_(user, table, rec, isNew, force) {
  var sc = SCHEMA[table];
  if (!sc || sc.perm === 'system') throw fail_('tabela', 'Tabela não editável: ' + table);
  if (sc.perm === 'admin' && user.papel !== 'admin') throw fail_('permissao', 'Só o administrador pode alterar ' + table + '.');

  // só as colunas conhecidas, sem as de auditoria
  var clean = {};
  sc.cols.forEach(function (c) { if (rec[c] !== undefined) clean[c] = typeof rec[c] === 'string' ? rec[c].trim() : rec[c]; });
  var key = sc.key;
  if (table === 'Utilizadores' && clean.email) clean.email = clean.email.toLowerCase();
  if (['Escolas', 'TiposCobranca', 'Categorias', 'Contas'].indexOf(table) >= 0 && clean[key]) {
    clean[key] = String(clean[key]).toUpperCase();
  }

  var existing = clean[key] !== undefined && clean[key] !== '' ? findBy_(table, key, clean[key]) : null;
  var generated = !!sc.prefix || table === 'Alunos' || table === 'Encarregados';
  if (isNew && existing) throw fail_('duplicado', 'Já existe um registo com ' + key + ' = ' + clean[key] + '.');
  if (!isNew && !existing) {
    if (generated || !clean[key]) throw fail_('naoexiste', 'Registo não encontrado.');
    throw fail_('naoexiste', 'Não existe ' + key + ' = ' + clean[key] + '.');
  }
  if (isNew && !generated && !clean[key]) throw fail_('validacao', 'Falta o campo ' + key + '.');

  var obj = existing ? Object.assign({}, existing, clean) : defaults_(table, clean);
  validate_(table, obj, existing, user, force);

  if (!existing && generated) obj[key] = newKey_(table, obj);
  if (sc.audit) { obj.atualizado_em = now_(); obj.atualizado_por = user.email; }

  var saved = writeObj_(table, obj, existing ? existing._row : null);
  _novoAluno = !existing;
  afterSave_(table, saved, user);
  audit_(user, existing ? 'alterar' : 'criar', table, saved[key], existing, saved);
  return { ok: true, record: strip_(saved), changed: changedOthers_(table) };
}

function defaults_(table, o) {
  var r = Object.assign({}, o);
  (SCHEMA[table].cols).forEach(function (c) {
    if ((c === 'ativa' || c === 'ativo') && !r[c]) r[c] = (table === 'RegrasMulta') ? NAO : SIM;
  });
  if (table === 'Alunos') {
    if (!r.estado) r.estado = 'ativo';
    if (!r.data_entrada) r.data_entrada = today_();
  }
  if (table === 'AlunoEncarregado') {
    if (!r.responsavel_financeiro) r.responsavel_financeiro = NAO;
    if (!r.contacto_principal) r.contacto_principal = NAO;
  }
  if (table === 'Descontos' && !r.ano) {
    var a = activeYear_();
    if (a) r.ano = a.ano;
  }
  if (table === 'TabelaPrecos' && !r.dia_vencimento) r.dia_vencimento = 10;
  return r;
}

function activeYear_() {
  var rows = readTable_('AnosLetivos').rows;
  for (var i = 0; i < rows.length; i++) if (rows[i].ativo === SIM) return rows[i];
  return null;
}

function escolaValida_(cod, allowRede) {
  if (allowRede && cod === 'REDE') return true;
  return !!findBy_('Escolas', 'codigo', cod);
}

function req_(o, fields) {
  fields.forEach(function (f) {
    if (o[f] === undefined || o[f] === null || String(o[f]).trim() === '') {
      throw fail_('validacao', 'Campo obrigatório em falta: ' + f + '.');
    }
  });
}

function validate_(table, o, existing, user, force) {
  ['ativa', 'ativo', 'obrigatorio', 'responsavel_financeiro', 'contacto_principal', 'tem_whatsapp'].forEach(function (c) {
    if (o[c] !== undefined && o[c] !== '') o[c] = simnao_(o[c], o[c]);
  });
  ['data_inicio', 'data_fim', 'data_nascimento', 'data_entrada', 'data_saida', 'data_saldo_inicial'].forEach(function (c) {
    if (o[c] && !isDate_(String(o[c]))) throw fail_('validacao', 'Data inválida em ' + c + ' (use AAAA-MM-DD).');
  });

  switch (table) {
    case 'Escolas':
      req_(o, ['codigo', 'nome']);
      if (!/^[A-Z]$/.test(o.codigo)) throw fail_('validacao', 'O código da escola é uma só letra.');
      break;

    case 'AnosLetivos':
      req_(o, ['ano', 'mes_inicio', 'mes_fim']);
      if (!/^\d{4}$/.test(String(o.ano))) throw fail_('validacao', 'Ano inválido.');
      var mi = Number(o.mes_inicio), mf = Number(o.mes_fim);
      if (!(mi >= 1 && mi <= 12 && mf >= mi && mf <= 12)) throw fail_('validacao', 'Meses inválidos.');
      break;

    case 'TiposCobranca':
      req_(o, ['codigo', 'nome', 'periodicidade']);
      if (!/^[A-Z0-9_]+$/.test(o.codigo)) throw fail_('validacao', 'Código: só maiúsculas, números e _.');
      if (['unica', 'mensal'].indexOf(o.periodicidade) < 0) throw fail_('validacao', 'Periodicidade: unica ou mensal.');
      if (o.categoria && !findBy_('Categorias', 'codigo', o.categoria)) throw fail_('validacao', 'Categoria inexistente.');
      break;

    case 'TabelaPrecos':
      req_(o, ['ano', 'escola', 'tipo_cobranca', 'valor']);
      if (!escolaValida_(o.escola)) throw fail_('validacao', 'Escola inexistente.');
      if (!findBy_('TiposCobranca', 'codigo', o.tipo_cobranca)) throw fail_('validacao', 'Tipo de cobrança inexistente.');
      if (!(Number(o.valor) >= 0)) throw fail_('validacao', 'Valor inválido.');
      var d = Number(o.dia_vencimento);
      if (!(d >= 1 && d <= 28)) throw fail_('validacao', 'Dia de vencimento entre 1 e 28.');
      readTable_('TabelaPrecos').rows.forEach(function (r) {
        if (String(r.ano) === String(o.ano) && r.escola === o.escola && r.tipo_cobranca === o.tipo_cobranca &&
            (!existing || r.id !== existing.id)) {
          throw fail_('duplicado', 'Já existe preço para ' + o.tipo_cobranca + ' em ' + o.escola + ' no ano ' + o.ano + '.');
        }
      });
      break;

    case 'Categorias':
      req_(o, ['codigo', 'nome', 'tipo']);
      if (!/^[A-Z0-9_]+$/.test(o.codigo)) throw fail_('validacao', 'Código: só maiúsculas, números e _.');
      if (['receita', 'despesa'].indexOf(o.tipo) < 0) throw fail_('validacao', 'Tipo: receita ou despesa.');
      if (o.categoria_pai) {
        var p = findBy_('Categorias', 'codigo', o.categoria_pai);
        if (!p || p.tipo !== o.tipo || o.categoria_pai === o.codigo) throw fail_('validacao', 'Categoria-mãe inválida.');
        if (p.categoria_pai) throw fail_('validacao', 'Só são permitidos dois níveis de categoria.');
      }
      break;

    case 'Contas':
      req_(o, ['codigo', 'nome', 'tipo', 'escola']);
      if (['caixa', 'banco', 'emola'].indexOf(o.tipo) < 0) throw fail_('validacao', 'Tipo: caixa, banco ou emola.');
      if (!escolaValida_(o.escola, true)) throw fail_('validacao', 'Escola inválida (use o código ou REDE).');
      break;

    case 'RegrasMulta':
      req_(o, ['ano', 'escola', 'dias_tolerancia', 'modo', 'valor']);
      if (!escolaValida_(o.escola, true)) throw fail_('validacao', 'Escola inválida.');
      if (['fixo', 'percentagem'].indexOf(o.modo) < 0) throw fail_('validacao', 'Modo: fixo ou percentagem.');
      break;

    case 'Utilizadores':
      req_(o, ['email', 'nome', 'papel']);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) throw fail_('validacao', 'Email inválido.');
      if (['admin', 'operador'].indexOf(o.papel) < 0) throw fail_('validacao', 'Papel: admin ou operador.');
      if (o.email === user.email && (o.papel !== 'admin' || o.ativo !== SIM)) {
        throw fail_('validacao', 'Não pode retirar a si próprio o acesso de administrador.');
      }
      break;

    case 'Alunos':
      req_(o, ['nome_completo', 'escola']);
      if (!escolaValida_(o.escola)) throw fail_('validacao', 'Escola inexistente.');
      if (ESTADOS_ALUNO.indexOf(o.estado) < 0) throw fail_('validacao', 'Estado inválido.');
      if (o.sexo && ['F', 'M'].indexOf(o.sexo) < 0) throw fail_('validacao', 'Sexo: F ou M.');
      if (existing && existing.escola !== o.escola && !force) {
        throw fail_('confirmar', 'Vai mudar a escola de ' + existing.escola + ' para ' + o.escola + '. O código ' + existing.codigo + ' mantém-se.');
      }
      if (!existing && !force) {
        var nn = norm_(o.nome_completo);
        var dup = readTable_('Alunos').rows.filter(function (r) { return norm_(r.nome_completo) === nn; })[0];
        if (dup) throw fail_('confirmar', 'Já existe um aluno com este nome: ' + dup.codigo + ' (' + dup.escola + ').');
      }
      break;

    case 'Encarregados':
      req_(o, ['nome_completo', 'telefone_1']);
      o.telefone_1 = phone9_(o.telefone_1);
      o.telefone_2 = phone9_(o.telefone_2);
      if (!/^(8\d{8}|2\d{7})$/.test(o.telefone_1)) throw fail_('validacao', 'Telefone 1 inválido (celular: 9 dígitos começando por 8).');
      if (o.telefone_2 && !/^(8\d{8}|2\d{7})$/.test(o.telefone_2)) throw fail_('validacao', 'Telefone 2 inválido.');
      if (!force) {
        var phones = [o.telefone_1, o.telefone_2].filter(Boolean);
        var other = readTable_('Encarregados').rows.filter(function (r) {
          if (existing && r.codigo === existing.codigo) return false;
          return phones.indexOf(String(r.telefone_1)) >= 0 || (r.telefone_2 && phones.indexOf(String(r.telefone_2)) >= 0);
        })[0];
        if (other) {
          var e1 = fail_('confirmar', 'O telefone já pertence a ' + other.nome_completo + ' (' + other.codigo + ').');
          e1.extra = { codigo: other.codigo };
          throw e1;
        }
      }
      break;

    case 'AlunoEncarregado':
      req_(o, ['aluno', 'encarregado']);
      if (!findBy_('Alunos', 'codigo', o.aluno)) throw fail_('validacao', 'Aluno inexistente.');
      if (!findBy_('Encarregados', 'codigo', o.encarregado)) throw fail_('validacao', 'Encarregado inexistente.');
      readTable_('AlunoEncarregado').rows.forEach(function (r) {
        if (r.aluno === o.aluno && r.encarregado === o.encarregado && (!existing || r.id !== existing.id)) {
          throw fail_('duplicado', 'Este encarregado já está ligado ao aluno.');
        }
      });
      break;

    case 'Descontos':
      req_(o, ['aluno', 'ano', 'tipo_cobranca', 'modo', 'valor', 'mes_de', 'mes_ate', 'motivo']);
      if (!findBy_('Alunos', 'codigo', o.aluno)) throw fail_('validacao', 'Aluno inexistente.');
      if (o.tipo_cobranca !== 'TODOS' && !findBy_('TiposCobranca', 'codigo', o.tipo_cobranca)) throw fail_('validacao', 'Tipo de cobrança inexistente.');
      if (['percentagem', 'valor'].indexOf(o.modo) < 0) throw fail_('validacao', 'Modo: percentagem ou valor.');
      var v = Number(o.valor);
      if (!(v > 0) || (o.modo === 'percentagem' && v > 100)) throw fail_('validacao', 'Valor do desconto inválido.');
      var a = Number(o.mes_de), b = Number(o.mes_ate);
      if (!(a >= 1 && a <= 12 && b >= a && b <= 12)) throw fail_('validacao', 'Meses inválidos.');
      if (!o.autorizado_por) o.autorizado_por = user.nome || user.email;
      break;
  }
}

// Outras linhas alteradas como consequência (a app actualiza-as)
var _changed = [], _novoAluno = false;
function changedOthers_(table) {
  var out = _changed;
  _changed = [];
  return out;
}

function afterSave_(table, saved, user) {
  _changed = [];
  // Inscrição: matrícula e mensalidades a partir do mês de entrada.
  // Saída: as cobranças futuras ainda sem pagamento anulam-se com motivo.
  if (table === 'Alunos') {
    if (_novoAluno) {
      gerarParaAluno_(user, saved).forEach(function (c) { _changed.push({ table: 'Cobrancas', record: c }); });
    } else if (saved.estado !== 'ativo') {
      anularFuturas_(user, saved, 'Aluno ' + saved.estado).forEach(function (c) {
        _changed.push({ table: 'Cobrancas', record: c });
      });
    }
  }
  // Só um ano lectivo activo
  if (table === 'AnosLetivos' && saved.ativo === SIM) {
    readTable_('AnosLetivos').rows.forEach(function (r) {
      if (String(r.ano) !== String(saved.ano) && r.ativo === SIM) {
        r.ativo = NAO; r.atualizado_em = now_(); r.atualizado_por = user.email;
        writeObj_('AnosLetivos', r, r._row);
        _changed.push({ table: 'AnosLetivos', record: strip_(r) });
      }
    });
  }
  // Só um responsável financeiro e um contacto principal por aluno
  if (table === 'AlunoEncarregado') {
    ['responsavel_financeiro', 'contacto_principal'].forEach(function (c) {
      if (saved[c] !== SIM) return;
      readTable_('AlunoEncarregado').rows.forEach(function (r) {
        if (r.aluno === saved.aluno && r.id !== saved.id && r[c] === SIM) {
          r[c] = NAO; r.atualizado_em = now_(); r.atualizado_por = user.email;
          writeObj_('AlunoEncarregado', r, r._row);
          _changed.push({ table: 'AlunoEncarregado', record: strip_(r) });
        }
      });
    });
  }
}

function newKey_(table, o) {
  if (table === 'Alunos') {
    var L = o.escola;
    var max = 0;
    readTable_('Alunos').rows.forEach(function (r) {
      var m = String(r.codigo).match(/^([A-Z])(\d+)$/);
      if (m && m[1] === L) max = Math.max(max, Number(m[2]));
    });
    return L + pad_(nextCounter_('ALUNO_' + L, max), 3);
  }
  if (table === 'Encarregados') {
    var maxE = 0;
    readTable_('Encarregados').rows.forEach(function (r) {
      var m = String(r.codigo).match(/^E(\d+)$/);
      if (m) maxE = Math.max(maxE, Number(m[1]));
    });
    return 'E' + pad_(nextCounter_('ENCARREGADO', maxE), 4);
  }
  var p = SCHEMA[table].prefix;
  return p + pad_(nextCounter_(p, 0), 5);
}

// Remover uma ligação aluno ↔ encarregado (única remoção física permitida)
function removeLink_(user, id) {
  var r = findBy_('AlunoEncarregado', 'id', id);
  if (!r) throw fail_('naoexiste', 'Ligação não encontrada.');
  sheet_('AlunoEncarregado').deleteRow(r._row);
  audit_(user, 'remover', 'AlunoEncarregado', id, r, null);
  return { ok: true, id: id };
}

// ════════════════════════════════════════════════════════════
// FASE 2 — cobranças, recebimentos, alocação, crédito, recibos
// ════════════════════════════════════════════════════════════

// ── leitura auxiliar ─────────────────────────────────────────
function anoDe_(ano) {
  var a = findBy_('AnosLetivos', 'ano', ano);
  if (!a) throw fail_('validacao', 'Ano lectivo ' + ano + ' inexistente.');
  return a;
}

function preco_(ano, escola, tipo) {
  var rows = readTable_('TabelaPrecos').rows;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.ano) === String(ano) && r.escola === escola && r.tipo_cobranca === tipo) return r;
  }
  return null;
}

// Soma dos descontos activos que tocam (aluno, ano, tipo, mês), limitada ao valor bruto.
function descontoDe_(aluno, ano, tipo, mes, bruto) {
  var total = 0;
  readTable_('Descontos').rows.forEach(function (d) {
    if (d.ativo !== SIM) return;
    if (d.aluno !== aluno || String(d.ano) !== String(ano)) return;
    if (d.tipo_cobranca !== 'TODOS' && d.tipo_cobranca !== tipo) return;
    if (mes < Number(d.mes_de) || mes > Number(d.mes_ate)) return;
    total += d.modo === 'percentagem' ? mt_(bruto) * Number(d.valor) / 100 : Number(d.valor);
  });
  if (!(total > 0)) return 0;
  return mt_(Math.min(total, mt_(bruto)));
}

// Quanto já está alocado a cada cobrança (só recibos válidos).
function alocadoPorCobranca_() {
  var validos = {};
  readTable_('Recebimentos').rows.forEach(function (r) {
    if (r.estado !== 'anulado') validos[r.numero_recibo] = true;
  });
  var m = {};
  readTable_('Alocacoes').rows.forEach(function (a) {
    if (!validos[a.recebimento]) return;
    m[a.cobranca] = mt_((m[a.cobranca] || 0) + Number(a.valor));
  });
  return m;
}

// O estado nasce sempre dos movimentos, nunca é escrito à mão.
function estadoPor_(cob, alocado) {
  if (cob.estado === 'anulada') return 'anulada';
  var liq = mt_(cob.valor_liquido), al = mt_(alocado || 0);
  if (liq <= 0) return 'paga';
  if (al <= 0) return 'aberta';
  return al + 0.004 >= liq ? 'paga' : 'parcial';
}

// Recalcula e grava o estado das cobranças tocadas por um movimento.
function refrescarCobrancas_(ids, user) {
  var m = alocadoPorCobranca_();
  var out = [], vistos = {};
  ids.forEach(function (id) {
    if (vistos[id]) return;
    vistos[id] = true;
    var c = findBy_('Cobrancas', 'id', id);
    if (!c) return;
    var e = estadoPor_(c, m[id]);
    if (c.estado !== e) {
      c.estado = e; c.atualizado_em = now_(); c.atualizado_por = user.email;
      writeObj_('Cobrancas', c, c._row);
    }
    out.push(strip_(c));
  });
  return out;
}

function indiceCobrancas_() {
  var m = {};
  readTable_('Cobrancas').rows.forEach(function (c) {
    m[String(c.ano) + '|' + c.aluno + '|' + c.tipo_cobranca + '|' + c.mes_referencia] = c;
  });
  return m;
}

function mesRef_(ano, mes) { return String(ano) + '-' + pad_(mes, 2); }
function venc_(ano, mes, dia) { return mesRef_(ano, mes) + '-' + pad_(Math.min(Math.max(Number(dia) || 10, 1), 28), 2); }

// ── planear as cobranças que faltam a um aluno ───────────────
// Devolve os objectos a criar; não escreve nada.
function planearAluno_(aluno, anoRow, idx, saida, faltam) {
  if (aluno.estado !== 'ativo') return;
  var ano = Number(anoRow.ano);
  var mi = Number(anoRow.mes_inicio), mf = Number(anoRow.mes_fim);

  var ent = String(aluno.data_entrada || '');
  var mesEnt = mi;
  if (isDate_(ent)) {
    var aEnt = Number(ent.slice(0, 4));
    if (aEnt > ano) return;                                   // entra num ano posterior
    if (aEnt === ano) mesEnt = Math.max(mi, Number(ent.slice(5, 7)));
  }
  var sai = String(aluno.data_saida || '');
  var mesSai = mf;
  if (isDate_(sai)) {
    var aSai = Number(sai.slice(0, 4));
    if (aSai < ano) return;                                   // saiu antes deste ano
    if (aSai === ano) mesSai = Math.min(mf, Number(sai.slice(5, 7)));
  }
  if (mesEnt > mesSai) return;

  readTable_('TiposCobranca').rows.forEach(function (t) {
    if (t.ativo !== SIM || t.obrigatorio !== SIM) return;
    var p = preco_(ano, aluno.escola, t.codigo);
    if (!p) { faltam[aluno.escola + '|' + t.codigo] = true; return; }
    var meses = [];
    if (t.periodicidade === 'unica') meses = [mesEnt];
    else for (var m = mesEnt; m <= mesSai; m++) meses.push(m);
    meses.forEach(function (m) {
      var ref = mesRef_(ano, m);
      if (idx[ano + '|' + aluno.codigo + '|' + t.codigo + '|' + ref]) return;
      var venci = t.periodicidade === 'unica' && isDate_(ent) && Number(ent.slice(0, 4)) === ano
        ? ent : venc_(ano, m, p.dia_vencimento);
      saida.push({ ano: ano, aluno: aluno.codigo, escola: aluno.escola, tipo_cobranca: t.codigo,
        mes: m, mes_referencia: ref, valor_bruto: mt_(p.valor),
        descricao: t.nome + (t.periodicidade === 'unica' ? ' ' + ano : ' de ' + MESES_PT[m - 1] + ' ' + ano),
        data_vencimento: venci });
      idx[ano + '|' + aluno.codigo + '|' + t.codigo + '|' + ref] = true;
    });
  });
}

var MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto',
                'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Transforma os planos em linhas da folha, numa só escrita.
function criarCobrancas_(user, planos) {
  if (!planos.length) return [];
  var inicio = reserveCounter_('CB', planos.length, 0);
  var objs = planos.map(function (o, i) {
    var bruto = mt_(o.valor_bruto);
    var desc = descontoDe_(o.aluno, o.ano, o.tipo_cobranca, o.mes, bruto);
    var liq = mt_(bruto - desc);
    return { id: 'CB' + pad_(inicio + i, 5), ano: o.ano, aluno: o.aluno, escola: o.escola,
      tipo_cobranca: o.tipo_cobranca, mes_referencia: o.mes_referencia, descricao: o.descricao,
      valor_bruto: bruto, valor_desconto: desc, valor_multa: 0, valor_liquido: liq,
      data_vencimento: o.data_vencimento, estado: liq <= 0 ? 'paga' : 'aberta', motivo_anulacao: '',
      atualizado_em: now_(), atualizado_por: user.email };
  });
  return writeMany_('Cobrancas', objs);
}

// ── geração do ano ───────────────────────────────────────────
// confirmar = false → só o resumo, sem escrever nada.
function gerarCobrancas_(user, ano, escola, confirmar) {
  if (user.papel !== 'admin') throw fail_('permissao', 'Só o administrador gera cobranças.');
  var anoRow = anoDe_(ano);
  var idx = indiceCobrancas_();
  var planos = [], faltam = {};
  readTable_('Alunos').rows.forEach(function (a) {
    if (escola && escola !== 'TODAS' && a.escola !== escola) return;
    planearAluno_(a, anoRow, idx, planos, faltam);
  });
  var resumo = {};
  planos.forEach(function (p) {
    var k = p.escola + '|' + p.tipo_cobranca;
    if (!resumo[k]) resumo[k] = { escola: p.escola, tipo_cobranca: p.tipo_cobranca, quantidade: 0, total: 0, alunos: {} };
    resumo[k].quantidade++;
    resumo[k].total = mt_(resumo[k].total + mt_(p.valor_bruto));
    resumo[k].alunos[p.aluno] = true;
  });
  var lista = Object.keys(resumo).map(function (k) {
    var r = resumo[k];
    return { escola: r.escola, tipo_cobranca: r.tipo_cobranca, quantidade: r.quantidade,
      total: r.total, alunos: Object.keys(r.alunos).length };
  });
  lista.sort(function (a, b) { return (a.escola + a.tipo_cobranca) < (b.escola + b.tipo_cobranca) ? -1 : 1; });
  var precosEmFalta = Object.keys(faltam).map(function (k) {
    var p = k.split('|');
    return { escola: p[0], tipo_cobranca: p[1] };
  });
  if (!confirmar) {
    return { ok: true, simulacao: true, ano: Number(ano), total: planos.length,
      resumo: lista, precos_em_falta: precosEmFalta };
  }
  criarCobrancas_(user, planos);
  audit_(user, 'gerar', 'Cobrancas', String(ano), null,
    { ano: Number(ano), escola: escola || 'TODAS', criadas: planos.length });
  return { ok: true, simulacao: false, ano: Number(ano), criadas: planos.length,
    resumo: lista, precos_em_falta: precosEmFalta };
}

// Matrícula e mensalidades à inscrição do aluno (chamado pelo save de Alunos).
function gerarParaAluno_(user, aluno) {
  var anoRow = activeYear_();
  if (!anoRow) return [];
  var planos = [], faltam = {};
  planearAluno_(aluno, anoRow, indiceCobrancas_(), planos, faltam);
  return criarCobrancas_(user, planos).map(strip_);
}

// Aluno que sai: as cobranças futuras ainda abertas anulam-se com motivo.
function anularFuturas_(user, aluno, motivo) {
  var hoje = today_();
  var alocado = alocadoPorCobranca_();
  var out = [];
  readTable_('Cobrancas').rows.forEach(function (c) {
    if (c.aluno !== aluno.codigo || c.estado === 'anulada' || c.estado === 'paga') return;
    if (mt_(alocado[c.id] || 0) > 0) return;                  // já tem pagamento: não se toca
    if (String(c.data_vencimento) < hoje) return;             // vencidas ficam em dívida
    c.estado = 'anulada';
    c.motivo_anulacao = motivo;
    c.atualizado_em = now_(); c.atualizado_por = user.email;
    writeObj_('Cobrancas', c, c._row);
    out.push(strip_(c));
  });
  return out;
}

// Preço alterado a meio do ano: só as cobranças abertas e sem pagamentos.
function recalcularCobrancas_(user, ano, escola, tipo, confirmar) {
  if (user.papel !== 'admin') throw fail_('permissao', 'Só o administrador recalcula cobranças.');
  var alocado = alocadoPorCobranca_();
  var alvo = [];
  readTable_('Cobrancas').rows.forEach(function (c) {
    if (String(c.ano) !== String(ano) || c.estado === 'anulada') return;
    if (escola && escola !== 'TODAS' && c.escola !== escola) return;
    if (tipo && tipo !== 'TODOS' && c.tipo_cobranca !== tipo) return;
    if (mt_(alocado[c.id] || 0) > 0) return;
    var p = preco_(ano, c.escola, c.tipo_cobranca);
    if (!p) return;
    var mes = Number(String(c.mes_referencia).slice(5, 7));
    var bruto = mt_(p.valor);
    var desc = descontoDe_(c.aluno, ano, c.tipo_cobranca, mes, bruto);
    var liq = mt_(bruto - desc);
    if (mt_(c.valor_bruto) === bruto && mt_(c.valor_desconto) === desc) return;
    alvo.push({ cob: c, bruto: bruto, desc: desc, liq: liq });
  });
  if (!confirmar) {
    return { ok: true, simulacao: true, total: alvo.length,
      exemplos: alvo.slice(0, 5).map(function (x) {
        return { id: x.cob.id, aluno: x.cob.aluno, de: mt_(x.cob.valor_liquido), para: mt_(x.liq + mt_(x.cob.valor_multa)) };
      }) };
  }
  alvo.forEach(function (x) {
    var c = x.cob;
    c.valor_bruto = x.bruto; c.valor_desconto = x.desc;
    c.valor_liquido = mt_(x.liq + mt_(c.valor_multa));
    c.estado = estadoPor_(c, 0);
    c.atualizado_em = now_(); c.atualizado_por = user.email;
    writeObj_('Cobrancas', c, c._row);
  });
  audit_(user, 'recalcular', 'Cobrancas', String(ano), null, { alteradas: alvo.length, escola: escola, tipo: tipo });
  return { ok: true, simulacao: false, alteradas: alvo.length };
}

// ── recebimentos ─────────────────────────────────────────────
function proximoRecibo_() {
  var a = activeYear_();
  var ano = a ? Number(a.ano) : Number(today_().slice(0, 4));
  return 'REC-' + ano + '-' + pad_(nextCounter_('RECIBO_' + ano, 0), 5);
}

function alocacoesDe_(numero) {
  return readTable_('Alocacoes').rows.filter(function (a) { return a.recebimento === numero; }).map(strip_);
}

function receber_(user, p) {
  p = p || {};
  // A fila offline pode reenviar o mesmo pagamento: o ref_cliente evita o duplicado.
  var refC = trim_(p.ref_cliente);
  if (refC) {
    var ja = findBy_('Recebimentos', 'ref_cliente', refC);
    if (ja) return { ok: true, repetido: true, recibo: strip_(ja), alocacoes: alocacoesDe_(ja.numero_recibo), cobrancas: [] };
  }
  var enc = findBy_('Encarregados', 'codigo', trim_(p.encarregado));
  if (!enc) throw fail_('validacao', 'Encarregado inexistente.');
  var valor = mt_(p.valor);
  if (!(valor > 0)) throw fail_('validacao', 'O valor do pagamento tem de ser maior que zero.');
  var metodo = trim_(p.metodo);
  if (CONFIG.METODOS.indexOf(metodo) < 0) throw fail_('validacao', 'Método inválido (numerario, emola, mpesa ou banco).');
  var conta = findBy_('Contas', 'codigo', trim_(p.conta));
  if (!conta || conta.ativa !== SIM) throw fail_('validacao', 'Conta inexistente ou desactivada.');
  var data = isDate_(trim_(p.data)) ? trim_(p.data) : today_();
  if (data > today_()) throw fail_('validacao', 'A data do pagamento não pode estar no futuro.');
  var aluno = trim_(p.aluno);
  if (aluno && !findBy_('Alunos', 'codigo', aluno)) throw fail_('validacao', 'Aluno inexistente.');
  var ref = trim_(p.referencia_externa);
  if (ref) {
    var dup = readTable_('Recebimentos').rows.filter(function (r) {
      return r.estado !== 'anulado' && trim_(r.referencia_externa) === ref;
    })[0];
    if (dup) throw fail_('duplicado', 'A referência ' + ref + ' já está no recibo ' + dup.numero_recibo + '.');
  }
  if (['emola', 'mpesa', 'banco'].indexOf(metodo) >= 0 && !ref) {
    throw fail_('validacao', 'Indique a referência da transacção.');
  }

  var filhos = filhosDe_(enc.codigo);
  var jaAloc = alocadoPorCobranca_();
  var tocadas = validarAlocacoes_(enc, filhos, p.alocacoes, jaAloc);
  var soma = tocadas.reduce(function (t, x) { return mt_(t + x.valor); }, 0);
  if (soma > valor + 0.004) throw fail_('validacao', 'As alocações (' + soma.toFixed(2) + ') somam mais do que o pagamento (' + valor.toFixed(2) + ').');
  // Crédito de pagamentos anteriores usado nesta mesma operação:
  // planeado aqui, antes de qualquer escrita, para que falte ou não falte
  // crédito a folha fique sempre coerente.
  var doCredito = validarAlocacoes_(enc, filhos, p.credito, jaAloc);
  var categoria = trim_(p.categoria);
  if (categoria) {
    var cat = findBy_('Categorias', 'codigo', categoria);
    if (!cat || cat.tipo !== 'receita') throw fail_('validacao', 'Categoria de receita inválida.');
  } else if (!tocadas.length && !aluno) {
    throw fail_('validacao', 'Um pagamento sem alocações precisa de uma categoria de receita.');
  }

  var planoCredito = planearCredito_(user, enc, doCredito, data);

  var numero = proximoRecibo_();
  var rec = writeObj_('Recebimentos', { numero_recibo: numero, data: data, encarregado: enc.codigo,
    aluno: aluno, categoria: categoria, valor: valor, metodo: metodo, conta: conta.codigo,
    referencia_externa: ref, observacao: trim_(p.observacao), operador: user.email,
    estado: 'valido', motivo_anulacao: '', ref_cliente: refC,
    atualizado_em: now_(), atualizado_por: user.email });

  var alocs = [];
  if (tocadas.length) {
    var ini = reserveCounter_('AL', tocadas.length, 0);
    alocs = writeMany_('Alocacoes', tocadas.map(function (t, i) {
      return { id: 'AL' + pad_(ini + i, 5), recebimento: numero, cobranca: t.cobranca,
        valor: t.valor, data: data, operador: user.email,
        atualizado_em: now_(), atualizado_por: user.email };
    })).map(strip_);
  }
  if (planoCredito.length) alocs = alocs.concat(escreverAlocacoes_(user, planoCredito));
  var todas = tocadas.concat(doCredito).map(function (t) { return t.cobranca; });
  var cobr = refrescarCobrancas_(todas, user);
  audit_(user, 'receber', 'Recebimentos', numero, null, rec);
  return { ok: true, recibo: strip_(rec), alocacoes: alocs, cobrancas: cobr,
    credito: creditoDoEncarregado_(enc.codigo), sobra: mt_(valor - soma), chave: chaveRecibo_(numero) };
}

// Valida alocações contra as cobranças da família.
// jaAloc é actualizado à medida: duas listas não podem gastar o mesmo saldo.
function validarAlocacoes_(enc, filhos, pedidos, jaAloc) {
  var out = [];
  (pedidos || []).forEach(function (x) {
    var c = findBy_('Cobrancas', 'id', trim_(x.cobranca));
    if (!c) throw fail_('validacao', 'Cobrança ' + x.cobranca + ' inexistente.');
    if (c.estado === 'anulada') throw fail_('validacao', 'A cobrança ' + c.id + ' está anulada.');
    if (!filhos[c.aluno]) throw fail_('validacao', 'A cobrança ' + c.id + ' não é de um educando de ' + enc.nome_completo + '.');
    var v = mt_(x.valor);
    if (!(v > 0)) throw fail_('validacao', 'Valor de alocação inválido em ' + c.id + '.');
    var falta = mt_(mt_(c.valor_liquido) - mt_(jaAloc[c.id] || 0));
    if (v > falta + 0.004) throw fail_('validacao', 'A cobrança ' + c.id + ' só tem ' + falta.toFixed(2) + ' MT por pagar.');
    jaAloc[c.id] = mt_(mt_(jaAloc[c.id] || 0) + v);
    out.push({ cobranca: c.id, valor: v });
  });
  return out;
}

function filhosDe_(codEnc) {
  var m = {};
  readTable_('AlunoEncarregado').rows.forEach(function (l) { if (l.encarregado === codEnc) m[l.aluno] = true; });
  return m;
}

// Recibos da família com dinheiro ainda por aplicar, do mais antigo para o mais novo.
function creditoDisponivel_(codEnc) {
  var porRec = {};
  readTable_('Alocacoes').rows.forEach(function (a) {
    porRec[a.recebimento] = mt_((porRec[a.recebimento] || 0) + Number(a.valor));
  });
  var out = [];
  readTable_('Recebimentos').rows.forEach(function (r) {
    if (r.estado === 'anulado' || r.encarregado !== codEnc) return;
    var livre = mt_(mt_(r.valor) - mt_(porRec[r.numero_recibo] || 0));
    if (livre > 0.004) out.push({ recibo: r.numero_recibo, data: String(r.data), livre: livre });
  });
  out.sort(function (a, b) { return a.data !== b.data ? (a.data < b.data ? -1 : 1) : (a.recibo < b.recibo ? -1 : 1); });
  return out;
}

function creditoDoEncarregado_(codEnc) {
  return creditoDisponivel_(codEnc).reduce(function (t, f) { return mt_(t + f.livre); }, 0);
}

// O adiantamento paga cobranças seguintes: novas alocações sobre recibos antigos.
// Planear é puro de propósito — valida o crédito ANTES de se gravar o que quer
// que seja, para que um erro nunca deixe meio pagamento na folha.
function planearCredito_(user, enc, lista, data) {
  if (!lista.length) return [];
  var fontes = creditoDisponivel_(enc.codigo);
  var total = fontes.reduce(function (t, f) { return mt_(t + f.livre); }, 0);
  var precisa = lista.reduce(function (t, x) { return mt_(t + x.valor); }, 0);
  if (precisa > total + 0.004) {
    throw fail_('validacao', 'A família só tem ' + total.toFixed(2) + ' MT de crédito (pedidos ' + precisa.toFixed(2) + ' MT).');
  }
  var linhas = [], fi = 0;
  lista.forEach(function (t) {
    var resto = t.valor;
    while (resto > 0.004 && fi < fontes.length) {
      var f = fontes[fi];
      var v = mt_(Math.min(resto, f.livre));
      linhas.push({ recebimento: f.recibo, cobranca: t.cobranca, valor: v, data: data, operador: user.email });
      f.livre = mt_(f.livre - v);
      resto = mt_(resto - v);
      if (f.livre <= 0.004) fi++;
    }
  });
  return linhas;
}

function escreverAlocacoes_(user, linhas) {
  if (!linhas.length) return [];
  var ini = reserveCounter_('AL', linhas.length, 0);
  return writeMany_('Alocacoes', linhas.map(function (l, i) {
    l.id = 'AL' + pad_(ini + i, 5);
    l.atualizado_em = now_(); l.atualizado_por = user.email;
    return l;
  })).map(strip_);
}

// Usar crédito sem dinheiro novo (adiantamento aplicado mais tarde).
function usarCredito_(user, p) {
  p = p || {};
  var enc = findBy_('Encarregados', 'codigo', trim_(p.encarregado));
  if (!enc) throw fail_('validacao', 'Encarregado inexistente.');
  var lista = validarAlocacoes_(enc, filhosDe_(enc.codigo), p.alocacoes, alocadoPorCobranca_());
  if (!lista.length) throw fail_('validacao', 'Indique as cobranças a pagar com o crédito.');
  var alocs = escreverAlocacoes_(user, planearCredito_(user, enc, lista, isDate_(trim_(p.data)) ? trim_(p.data) : today_()));
  var cobr = refrescarCobrancas_(lista.map(function (t) { return t.cobranca; }), user);
  audit_(user, 'usar crédito', 'Alocacoes', enc.codigo, null, { alocacoes: lista });
  return { ok: true, alocacoes: alocs, cobrancas: cobr, credito: creditoDoEncarregado_(enc.codigo) };
}

function anularRecebimento_(user, numero, motivo) {
  if (user.papel !== 'admin') throw fail_('permissao', 'Só o administrador pode anular recibos.');
  if (!trim_(motivo)) throw fail_('validacao', 'Indique o motivo da anulação.');
  var r = findBy_('Recebimentos', 'numero_recibo', trim_(numero));
  if (!r) throw fail_('naoexiste', 'Recibo não encontrado.');
  if (r.estado === 'anulado') throw fail_('validacao', 'O recibo ' + r.numero_recibo + ' já está anulado.');
  var antes = strip_(r);
  r.estado = 'anulado'; r.motivo_anulacao = trim_(motivo);
  r.atualizado_em = now_(); r.atualizado_por = user.email;
  writeObj_('Recebimentos', r, r._row);
  var ids = readTable_('Alocacoes').rows.filter(function (a) { return a.recebimento === r.numero_recibo; })
    .map(function (a) { return a.cobranca; });
  var cobr = refrescarCobrancas_(ids, user);
  audit_(user, 'anular', 'Recebimentos', r.numero_recibo, antes, r);
  return { ok: true, recibo: strip_(r), cobrancas: cobr };
}

function anularCobranca_(user, id, motivo) {
  if (user.papel !== 'admin') throw fail_('permissao', 'Só o administrador pode anular cobranças.');
  if (!trim_(motivo)) throw fail_('validacao', 'Indique o motivo da anulação.');
  var c = findBy_('Cobrancas', 'id', trim_(id));
  if (!c) throw fail_('naoexiste', 'Cobrança não encontrada.');
  if (c.estado === 'anulada') throw fail_('validacao', 'A cobrança já está anulada.');
  if (mt_(alocadoPorCobranca_()[c.id] || 0) > 0) {
    throw fail_('validacao', 'A cobrança ' + c.id + ' já tem pagamentos. Anule primeiro o recibo.');
  }
  var antes = strip_(c);
  c.estado = 'anulada'; c.motivo_anulacao = trim_(motivo);
  c.atualizado_em = now_(); c.atualizado_por = user.email;
  writeObj_('Cobrancas', c, c._row);
  audit_(user, 'anular', 'Cobrancas', c.id, antes, c);
  return { ok: true, cobranca: strip_(c) };
}

// ── multas (regra pronta, desligada até a escola decidir) ────
function aplicarMultas_(user, ano, confirmar) {
  if (user.papel !== 'admin') throw fail_('permissao', 'Só o administrador aplica multas.');
  var regras = readTable_('RegrasMulta').rows.filter(function (r) {
    return r.ativa === SIM && String(r.ano) === String(ano);
  });
  if (!regras.length) return { ok: true, simulacao: !confirmar, aplicadas: 0, sem_regra: true };
  function regraDe_(escola) {
    return regras.filter(function (r) { return r.escola === escola; })[0] ||
           regras.filter(function (r) { return r.escola === 'REDE'; })[0] || null;
  }
  var hoje = today_(), alvo = [];
  readTable_('Cobrancas').rows.forEach(function (c) {
    if (String(c.ano) !== String(ano)) return;
    if (['aberta', 'parcial'].indexOf(c.estado) < 0) return;
    if (mt_(c.valor_multa) > 0) return;
    var rg = regraDe_(c.escola);
    if (!rg) return;
    var lim = somaDias_(String(c.data_vencimento), Number(rg.dias_tolerancia) || 0);
    if (hoje <= lim) return;
    var base = mt_(c.valor_bruto) - mt_(c.valor_desconto);
    var multa = rg.modo === 'percentagem' ? mt_(base * Number(rg.valor) / 100) : mt_(rg.valor);
    if (!(multa > 0)) return;
    alvo.push({ cob: c, multa: multa });
  });
  if (!confirmar) return { ok: true, simulacao: true, aplicadas: alvo.length };
  var alocado = alocadoPorCobranca_();
  alvo.forEach(function (x) {
    var c = x.cob;
    c.valor_multa = x.multa;
    c.valor_liquido = mt_(mt_(c.valor_bruto) - mt_(c.valor_desconto) + x.multa);
    c.estado = estadoPor_(c, alocado[c.id]);
    c.atualizado_em = now_(); c.atualizado_por = user.email;
    writeObj_('Cobrancas', c, c._row);
  });
  audit_(user, 'multas', 'Cobrancas', String(ano), null, { aplicadas: alvo.length });
  return { ok: true, simulacao: false, aplicadas: alvo.length };
}

function removerMulta_(user, id, motivo) {
  if (user.papel !== 'admin') throw fail_('permissao', 'Só o administrador retira multas.');
  if (!trim_(motivo)) throw fail_('validacao', 'Indique o motivo.');
  var c = findBy_('Cobrancas', 'id', trim_(id));
  if (!c) throw fail_('naoexiste', 'Cobrança não encontrada.');
  if (!(mt_(c.valor_multa) > 0)) throw fail_('validacao', 'Esta cobrança não tem multa.');
  var antes = strip_(c);
  c.valor_multa = 0;
  c.valor_liquido = mt_(mt_(c.valor_bruto) - mt_(c.valor_desconto));
  c.estado = estadoPor_(c, alocadoPorCobranca_()[c.id]);
  c.atualizado_em = now_(); c.atualizado_por = user.email;
  writeObj_('Cobrancas', c, c._row);
  audit_(user, 'retirar multa: ' + trim_(motivo), 'Cobrancas', c.id, antes, c);
  return { ok: true, cobranca: strip_(c) };
}

function somaDias_(data, dias) {
  var p = String(data).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + (Number(dias) || 0));
  return d.getFullYear() + '-' + pad_(d.getMonth() + 1, 2) + '-' + pad_(d.getDate(), 2);
}

// ── mensagens ────────────────────────────────────────────────
function registarMensagem_(user, p) {
  p = p || {};
  var enc = findBy_('Encarregados', 'codigo', trim_(p.encarregado));
  if (!enc) throw fail_('validacao', 'Encarregado inexistente.');
  var canal = trim_(p.canal) || 'whatsapp';
  if (['whatsapp', 'sms'].indexOf(canal) < 0) throw fail_('validacao', 'Canal: whatsapp ou sms.');
  var m = novaMensagem_(enc, canal, trim_(p.texto), trim_(p.recibo));
  if (trim_(p.telefone)) { m.telefone = phone9_(p.telefone); writeObj_('Mensagens', m, m._row); }
  return { ok: true, mensagem: strip_(m) };
}

// ── recibo: dados e página pública ───────────────────────────
function segredoRecibos_() {
  var k = props_().getProperty('RECIBO_KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); props_().setProperty('RECIBO_KEY', k); }
  return k;
}

function chaveRecibo_(numero) {
  var sig = Utilities.computeHmacSha256Signature(String(numero), segredoRecibos_());
  var s = '';
  for (var i = 0; i < sig.length && s.length < 12; i++) {
    s += ('0' + (((sig[i] % 256) + 256) % 256).toString(16)).slice(-2);
  }
  return s.slice(0, 12);
}

function reciboDados_(numero) {
  var r = findBy_('Recebimentos', 'numero_recibo', trim_(numero));
  if (!r) throw fail_('naoexiste', 'Recibo não encontrado.');
  var enc = findBy_('Encarregados', 'codigo', r.encarregado) || { nome_completo: r.encarregado };
  var linhas = alocacoesDe_(r.numero_recibo).map(function (a) {
    var c = findBy_('Cobrancas', 'id', a.cobranca) || {};
    var al = findBy_('Alunos', 'codigo', c.aluno) || {};
    return { cobranca: a.cobranca, valor: mt_(a.valor), descricao: c.descricao || '',
      mes_referencia: c.mes_referencia || '', aluno: c.aluno || '', aluno_nome: al.nome_completo || '',
      escola: c.escola || '' };
  });
  var somaAloc = linhas.reduce(function (s, l) { return mt_(s + l.valor); }, 0);
  var escolas = {};
  linhas.forEach(function (l) { if (l.escola) escolas[l.escola] = true; });
  var nomes = Object.keys(escolas).map(function (c) {
    var e = findBy_('Escolas', 'codigo', c);
    return e ? e.nome : c;
  });
  return { ok: true, recibo: strip_(r), encarregado: { codigo: enc.codigo, nome_completo: enc.nome_completo,
      telefone_1: enc.telefone_1 }, linhas: linhas, sobra: mt_(mt_(r.valor) - somaAloc),
    credito: creditoDoEncarregado_(r.encarregado),
    divida: dividaDoEncarregado_(r.encarregado), escolas: nomes, chave: chaveRecibo_(r.numero_recibo) };
}

// Dívida da família: cobranças válidas menos alocações válidas.
function dividaDoEncarregado_(codEnc) {
  var filhos = filhosDe_(codEnc);
  var alocado = alocadoPorCobranca_();
  var total = 0;
  readTable_('Cobrancas').rows.forEach(function (c) {
    if (c.estado === 'anulada' || !filhos[c.aluno]) return;
    total = mt_(total + Math.max(0, mt_(mt_(c.valor_liquido) - mt_(alocado[c.id] || 0))));
  });
  return total;
}

function esc_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function mtTxt_(v) {
  var n = mt_(v).toFixed(2).split('.');
  return n[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + n[1] + ' MT';
}

// Página de leitura do recibo (o link enviado ao encarregado).
function paginaRecibo_(numero, chave) {
  var d;
  try { d = reciboDados_(numero); }
  catch (e) { return htmlSimples_('Recibo', '<p class=e>Recibo não encontrado.</p>'); }
  if (chave !== d.chave) return htmlSimples_('Recibo', '<p class=e>Ligação inválida.</p>');
  var r = d.recibo;
  var corpo = '';
  if (r.estado === 'anulado') corpo += '<p class="anulado">ANULADO — ' + esc_(r.motivo_anulacao) + '</p>';
  corpo += '<h1>Recibo ' + esc_(r.numero_recibo) + '</h1>';
  corpo += '<p class=sub>' + esc_(d.escolas.join(' · ') || 'Escolinhas') + ' · ' + esc_(r.data) + '</p>';
  corpo += '<p><b>Encarregado:</b> ' + esc_(d.encarregado.nome_completo) + '</p>';
  if (d.linhas.length) {
    corpo += '<table><tr><th>Aluno</th><th>Referente a</th><th class=r>Valor</th></tr>';
    d.linhas.forEach(function (l) {
      corpo += '<tr><td>' + esc_(l.aluno_nome) + ' <small>' + esc_(l.aluno) + '</small></td><td>' +
        esc_(l.descricao) + '</td><td class=r>' + mtTxt_(l.valor) + '</td></tr>';
    });
    corpo += '</table>';
  }
  corpo += '<p class=tot><b>Total pago:</b> ' + mtTxt_(r.valor) + ' <small>(' + esc_(r.metodo) + ')</small></p>';
  if (d.credito > 0) corpo += '<p>Crédito a favor da família: <b>' + mtTxt_(d.credito) + '</b></p>';
  corpo += '<p>Dívida em aberto: <b>' + mtTxt_(d.divida) + '</b></p>';
  return htmlSimples_('Recibo ' + r.numero_recibo, corpo);
}

function htmlSimples_(titulo, corpo) {
  var css = 'body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:0 auto;padding:1.5rem;color:#17251f}' +
    'h1{font-size:1.4rem;margin:.2rem 0}.sub{color:#5c6b64;margin:.2rem 0 1rem}' +
    'table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{padding:.45rem .3rem;border-bottom:1px solid #dde5e1;text-align:left}' +
    '.r{text-align:right;white-space:nowrap}small{color:#5c6b64}' +
    '.tot{font-size:1.15rem;background:#eef5f1;padding:.6rem;border-radius:.5rem}' +
    '.anulado{background:#b3261e;color:#fff;padding:.5rem;text-align:center;font-weight:700;border-radius:.4rem}' +
    '.e{color:#b3261e}';
  var html = '<!DOCTYPE html><html lang=pt><head><meta charset=utf-8>' +
    '<meta name=viewport content="width=device-width,initial-scale=1">' +
    '<title>' + esc_(titulo) + '</title><style>' + css + '</style></head><body>' + corpo +
    '<p class=sub>Finanças Escolinhas</p></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ════════════════════════════════════════════════════════════
// FASE 3 — despesas, contas, transferências e fecho de caixa
// ════════════════════════════════════════════════════════════

// ── saldos: também aqui o saldo nasce dos movimentos ─────────
// saldo = saldo_inicial + recebimentos − despesas + entradas − saídas,
// contando só o que aconteceu a partir da data do saldo inicial.
function contaValida_(cod) {
  var c = findBy_('Contas', 'codigo', trim_(cod));
  if (!c) throw fail_('validacao', 'Conta inexistente: ' + cod + '.');
  return c;
}

function dentroDoPeriodo_(data, de, ate) {
  var d = String(data).slice(0, 10);
  if (de && d < de) return false;
  if (ate && d > ate) return false;
  return true;
}

// Todos os movimentos de uma conta, por ordem de data.
// valor positivo = entrou; negativo = saiu.
function movimentosDaConta_(cod, de, ate) {
  var c = contaValida_(cod);
  de = trim_(de); ate = trim_(ate);
  var inicio = isDate_(String(c.data_saldo_inicial)) ? String(c.data_saldo_inicial) : '';
  var out = [];
  readTable_('Recebimentos').rows.forEach(function (r) {
    if (r.estado === 'anulado' || r.conta !== c.codigo) return;
    if (inicio && String(r.data) < inicio) return;
    if (!dentroDoPeriodo_(r.data, de, ate)) return;
    var enc = findBy_('Encarregados', 'codigo', r.encarregado);
    out.push({ data: String(r.data), tipo: 'recebimento', id: r.numero_recibo,
      descricao: 'Recibo ' + r.numero_recibo + (enc ? ' · ' + enc.nome_completo : ''),
      valor: mt_(r.valor), metodo: r.metodo });
  });
  readTable_('Despesas').rows.forEach(function (d) {
    if (d.estado === 'anulada' || d.conta !== c.codigo) return;
    if (inicio && String(d.data) < inicio) return;
    if (!dentroDoPeriodo_(d.data, de, ate)) return;
    out.push({ data: String(d.data), tipo: 'despesa', id: d.id,
      descricao: d.descricao + (d.fornecedor ? ' · ' + d.fornecedor : ''),
      valor: -mt_(d.valor), metodo: d.metodo, escola: d.escola, categoria: d.categoria });
  });
  readTable_('Transferencias').rows.forEach(function (t) {
    if (t.estado === 'anulada') return;
    if (inicio && String(t.data) < inicio) return;
    if (!dentroDoPeriodo_(t.data, de, ate)) return;
    if (t.conta_destino === c.codigo) {
      out.push({ data: String(t.data), tipo: 'transferencia', id: t.id,
        descricao: 'De ' + nomeConta_(t.conta_origem) + (t.descricao ? ' · ' + t.descricao : ''),
        valor: mt_(t.valor) });
    }
    if (t.conta_origem === c.codigo) {
      out.push({ data: String(t.data), tipo: 'transferencia', id: t.id,
        descricao: 'Para ' + nomeConta_(t.conta_destino) + (t.descricao ? ' · ' + t.descricao : ''),
        valor: -mt_(t.valor) });
    }
  });
  out.sort(function (a, b) { return a.data !== b.data ? (a.data < b.data ? -1 : 1) : (a.id < b.id ? -1 : 1); });
  return out;
}

function nomeConta_(cod) {
  var c = findBy_('Contas', 'codigo', cod);
  return c ? c.nome : cod;
}

function saldoDaConta_(cod, ate) {
  var c = contaValida_(cod);
  var s = mt_(c.saldo_inicial);
  movimentosDaConta_(cod, '', ate).forEach(function (m) { s = mt_(s + m.valor); });
  return s;
}

function saldos_(ate) {
  return readTable_('Contas').rows.map(function (c) {
    return { codigo: c.codigo, nome: c.nome, tipo: c.tipo, escola: c.escola,
      ativa: c.ativa, saldo: saldoDaConta_(c.codigo, ate) };
  });
}

// ── despesas ─────────────────────────────────────────────────
function categoriaDespesa_(cod, sub) {
  var c = findBy_('Categorias', 'codigo', trim_(cod));
  if (!c || c.tipo !== 'despesa') throw fail_('validacao', 'Categoria de despesa inválida.');
  if (c.categoria_pai) throw fail_('validacao', 'Escolha a categoria principal e depois a subcategoria.');
  sub = trim_(sub);
  if (sub) {
    var s = findBy_('Categorias', 'codigo', sub);
    if (!s || s.categoria_pai !== c.codigo) {
      throw fail_('validacao', 'A subcategoria não pertence a ' + c.nome + '.');
    }
    if (s.ativa !== SIM) throw fail_('validacao', 'A subcategoria ' + s.nome + ' está desactivada.');
  }
  if (c.ativa !== SIM) throw fail_('validacao', 'A categoria ' + c.nome + ' está desactivada.');
  return c;
}

// A caixa não pode ficar negativa sem o operador saber: avisa-se e,
// se ele confirmar, grava-se à mesma (pode ser um lançamento fora de ordem).
function avisaSaldoNegativo_(conta, valor, force) {
  if (force || conta.tipo !== 'caixa') return;
  var s = saldoDaConta_(conta.codigo);
  if (mt_(s - mt_(valor)) < 0) {
    throw fail_('confirmar', 'A ' + conta.nome + ' tem ' + mt_(s).toFixed(2) +
      ' MT e esta operação é de ' + mt_(valor).toFixed(2) + ' MT. O saldo fica negativo.');
  }
}

function despesa_(user, p) {
  p = p || {};
  var refC = trim_(p.ref_cliente);
  if (refC) {
    var ja = findBy_('Despesas', 'ref_cliente', refC);
    if (ja) return { ok: true, repetido: true, despesa: strip_(ja) };
  }
  var data = isDate_(trim_(p.data)) ? trim_(p.data) : today_();
  if (data > today_()) throw fail_('validacao', 'A data da despesa não pode estar no futuro.');
  var escola = trim_(p.escola).toUpperCase();
  if (!escolaValida_(escola, true)) throw fail_('validacao', 'Escola inválida (use o código ou REDE).');
  var cat = categoriaDespesa_(p.categoria, p.subcategoria);
  var valor = mt_(p.valor);
  if (!(valor > 0)) throw fail_('validacao', 'O valor da despesa tem de ser maior que zero.');
  var metodo = trim_(p.metodo);
  if (CONFIG.METODOS.indexOf(metodo) < 0) throw fail_('validacao', 'Método inválido.');
  var conta = contaValida_(p.conta);
  if (conta.ativa !== SIM) throw fail_('validacao', 'A conta ' + conta.nome + ' está desactivada.');
  // A descrição é opcional: o formulário simples só pede a categoria,
  // e então a categoria (ou a subcategoria) é que dá o nome à despesa.
  var descricao = trim_(p.descricao);
  if (!descricao) {
    var sub = trim_(p.subcategoria);
    var cs = sub ? findBy_('Categorias', 'codigo', sub) : null;
    descricao = cs ? cs.nome : cat.nome;
  }
  avisaSaldoNegativo_(conta, valor, p.force);

  var id = 'DP' + pad_(nextCounter_('DP', 0), 5);
  var url = trim_(p.comprovativo_url);
  if (p.foto && p.foto.dados) url = guardarComprovativo_(p.foto, id, data);

  var d = writeObj_('Despesas', { id: id, data: data, escola: escola, categoria: cat.codigo,
    subcategoria: trim_(p.subcategoria), descricao: descricao, fornecedor: trim_(p.fornecedor),
    valor: valor, conta: conta.codigo, metodo: metodo, numero_documento: trim_(p.numero_documento),
    comprovativo_url: url, operador: user.email, estado: 'valida', motivo_anulacao: '', ref_cliente: refC,
    atualizado_em: now_(), atualizado_por: user.email });
  audit_(user, 'despesa', 'Despesas', id, null, d);
  return { ok: true, despesa: strip_(d), saldo: saldoDaConta_(conta.codigo) };
}

function anularDespesa_(user, id, motivo) {
  if (user.papel !== 'admin') throw fail_('permissao', 'Só o administrador pode anular despesas.');
  if (!trim_(motivo)) throw fail_('validacao', 'Indique o motivo da anulação.');
  var d = findBy_('Despesas', 'id', trim_(id));
  if (!d) throw fail_('naoexiste', 'Despesa não encontrada.');
  if (d.estado === 'anulada') throw fail_('validacao', 'A despesa ' + d.id + ' já está anulada.');
  var antes = strip_(d);
  d.estado = 'anulada'; d.motivo_anulacao = trim_(motivo);
  d.atualizado_em = now_(); d.atualizado_por = user.email;
  writeObj_('Despesas', d, d._row);
  audit_(user, 'anular', 'Despesas', d.id, antes, d);
  return { ok: true, despesa: strip_(d), saldo: saldoDaConta_(d.conta) };
}

// ── comprovativo no Drive ────────────────────────────────────
// Uma pasta por ano e mês, como pede a especificação.
function pastaFilha_(pai, nome) {
  var it = pai ? pai.getFoldersByName(nome) : DriveApp.getFoldersByName(nome);
  if (it.hasNext()) return it.next();
  return pai ? pai.createFolder(nome) : DriveApp.createFolder(nome);
}

function guardarComprovativo_(foto, id, data) {
  var dados = String(foto.dados || '');
  var virgula = dados.indexOf(',');
  if (dados.slice(0, 5) === 'data:' && virgula > 0) dados = dados.slice(virgula + 1);
  if (!dados) throw fail_('validacao', 'Foto do comprovativo vazia.');
  if (dados.length * 3 / 4 > CONFIG.COMPROVATIVO_MAX_KB * 1024) {
    throw fail_('validacao', 'A foto é grande demais (máximo ' + CONFIG.COMPROVATIVO_MAX_KB + ' KB).');
  }
  var tipo = trim_(foto.tipo) || 'image/jpeg';
  if (tipo.indexOf('image/') !== 0 && tipo !== 'application/pdf') {
    throw fail_('validacao', 'O comprovativo tem de ser uma foto ou um PDF.');
  }
  var ext = tipo === 'application/pdf' ? '.pdf' : '.' + (tipo.split('/')[1] || 'jpg');
  var blob = Utilities.newBlob(Utilities.base64Decode(dados), tipo, id + ext);
  var pasta = pastaFilha_(pastaFilha_(pastaFilha_(null, CONFIG.COMPROVATIVOS_FOLDER),
    String(data).slice(0, 4)), String(data).slice(5, 7));
  var f = pasta.createFile(blob);
  // Os comprovativos não ficam públicos: só os operadores activos os vêem.
  try {
    var emails = readTable_('Utilizadores').rows.filter(function (u) { return u.ativo === SIM; })
      .map(function (u) { return u.email; });
    if (emails.length) f.addViewers(emails);
  } catch (e) { /* um email sem conta Google não impede guardar a despesa */ }
  return f.getUrl();
}

// ── transferências ───────────────────────────────────────────
function transferencia_(user, p) {
  p = p || {};
  var refC = trim_(p.ref_cliente);
  if (refC) {
    var ja = findBy_('Transferencias', 'ref_cliente', refC);
    if (ja) return { ok: true, repetido: true, transferencia: strip_(ja) };
  }
  var origem = contaValida_(p.conta_origem);
  var destino = contaValida_(p.conta_destino);
  if (origem.codigo === destino.codigo) throw fail_('validacao', 'A conta de origem e a de destino são a mesma.');
  if (origem.ativa !== SIM || destino.ativa !== SIM) throw fail_('validacao', 'Uma das contas está desactivada.');
  var valor = mt_(p.valor);
  if (!(valor > 0)) throw fail_('validacao', 'O valor da transferência tem de ser maior que zero.');
  var data = isDate_(trim_(p.data)) ? trim_(p.data) : today_();
  if (data > today_()) throw fail_('validacao', 'A data não pode estar no futuro.');
  avisaSaldoNegativo_(origem, valor, p.force);

  var t = writeObj_('Transferencias', { id: 'TR' + pad_(nextCounter_('TR', 0), 5), data: data,
    conta_origem: origem.codigo, conta_destino: destino.codigo, valor: valor,
    descricao: trim_(p.descricao), operador: user.email, estado: 'valida', motivo_anulacao: '',
    ref_cliente: refC, atualizado_em: now_(), atualizado_por: user.email });
  audit_(user, 'transferencia', 'Transferencias', t.id, null, t);
  return { ok: true, transferencia: strip_(t),
    saldo_origem: saldoDaConta_(origem.codigo), saldo_destino: saldoDaConta_(destino.codigo) };
}

function anularTransferencia_(user, id, motivo) {
  if (user.papel !== 'admin') throw fail_('permissao', 'Só o administrador pode anular transferências.');
  if (!trim_(motivo)) throw fail_('validacao', 'Indique o motivo da anulação.');
  var t = findBy_('Transferencias', 'id', trim_(id));
  if (!t) throw fail_('naoexiste', 'Transferência não encontrada.');
  if (t.estado === 'anulada') throw fail_('validacao', 'A transferência já está anulada.');
  var antes = strip_(t);
  t.estado = 'anulada'; t.motivo_anulacao = trim_(motivo);
  t.atualizado_em = now_(); t.atualizado_por = user.email;
  writeObj_('Transferencias', t, t._row);
  audit_(user, 'anular', 'Transferencias', t.id, antes, t);
  return { ok: true, transferencia: strip_(t),
    saldo_origem: saldoDaConta_(t.conta_origem), saldo_destino: saldoDaConta_(t.conta_destino) };
}

// ── fecho de caixa ───────────────────────────────────────────
// A especificação fixa 20 folhas, por isso a contagem fica em Auditoria,
// que já guarda data, operador e o antes/depois de tudo o resto.
function fechoCaixa_(user, p) {
  p = p || {};
  var conta = contaValida_(p.conta);
  if (conta.tipo !== 'caixa') throw fail_('validacao', 'O fecho de caixa é só para contas de dinheiro.');
  var data = isDate_(trim_(p.data)) ? trim_(p.data) : today_();
  if (data > today_()) throw fail_('validacao', 'A data não pode estar no futuro.');
  if (p.contado === undefined || p.contado === null || trim_(p.contado) === '') {
    throw fail_('validacao', 'Escreva quanto dinheiro foi contado.');
  }
  var contado = mt_(p.contado);
  if (contado < 0) throw fail_('validacao', 'O valor contado não pode ser negativo.');
  var esperado = saldoDaConta_(conta.codigo, data);
  var dif = mt_(contado - esperado);
  var registo = { conta: conta.codigo, data: data, esperado: esperado, contado: contado,
    diferenca: dif, observacao: trim_(p.observacao), operador: user.email };
  audit_(user, 'fecho de caixa', 'Contas', conta.codigo, { saldo_esperado: esperado }, registo);
  return { ok: true, fecho: registo };
}

function fechosDe_(conta, limite) {
  var cod = trim_(conta);
  var out = [];
  readTable_('Auditoria').rows.forEach(function (a) {
    if (a.acao !== 'fecho de caixa') return;
    if (cod && a.registo_id !== cod) return;
    try {
      var d = JSON.parse(a.depois);
      d.data_hora = a.data_hora;
      d._linha = a._row;      // a hora só tem segundos: a linha desempata
      out.push(d);
    } catch (e) { /* linha estragada à mão: ignora-se */ }
  });
  out.sort(function (a, b) {
    if (a.data_hora !== b.data_hora) return a.data_hora > b.data_hora ? -1 : 1;
    return a._linha > b._linha ? -1 : 1;
  });
  return out.slice(0, Number(limite) > 0 ? Number(limite) : 24).map(function (d) {
    delete d._linha;
    return d;
  });
}

// ════════════════════════════════════════════════════════════
// FASE 5 — e-Mola: o SMS do telefone vira recebimento
// ════════════════════════════════════════════════════════════
//
// Regra que manda em tudo: UM SMS NUNCA SE PERDE.
// Mesmo que o texto não se perceba, a linha fica gravada em
// Pagamentos_eMola com o texto original, e o operador liga-a à mão.
// Só se regista sozinho o que tem código de aluno E valor legível.
//
// Os padrões abaixo são a única coisa a mexer quando se souber a
// forma exacta do SMS. Fazer um pagamento de teste com *898# e outro
// pela app e-Mola, ver o texto em Pagamentos_eMola e ajustar aqui.
var EMOLA_PADROES = {
  // ID da transacção: é a chave contra duplicados
  transacao: [
    // Forma habitual: duas letras, dígitos, ponto, dígitos, ponto, letras/dígitos.
    // Os intervalos são largos de propósito: não se sabe ao certo quantos
    // dígitos a operadora usa, e um ID por ler é pior do que um ID a mais.
    /\b([A-Z]{2}\d{4,12}\.\d{2,8}\.[A-Z0-9]{3,12})\b/i,
    /\b(?:ID\s*(?:da\s*)?)?transac[çc][ãa]o\s*(?:ID)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9.\-]{5,})/i,
    /\bconf(?:irma[çc][ãa]o)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9.\-]{5,})/i,
    /\bref(?:er[êe]ncia)?\s*(?:da\s*transac[çc][ãa]o)\s*[:\-]?\s*([A-Z0-9][A-Z0-9.\-]{5,})/i
  ],
  // Valor recebido. O "saldo" vem sempre depois, por isso procura-se primeiro o recebimento.
  valor: [
    /receb[a-zç]*\s+(?:de\s+[^\d]{0,40})?([\d][\d.,\s]*)\s*MT/i,
    /\b([\d][\d.,\s]*)\s*MT\b/i
  ],
  telefone: [/\b(?:258)?\s?(8[0-9]\d{7})\b/],
  conteudo: [
    /conte[úu]do\s*[:\-]?\s*(.+?)(?:\.\s|\.$|$)/i,
    /refer[êe]ncia\s*[:\-]?\s*(.+?)(?:\.\s|\.$|$)/i,
    /motivo\s*[:\-]?\s*(.+?)(?:\.\s|\.$|$)/i
  ],
  nome: [
    /\bde\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁ-ú'’\- ]{2,40}?)[,\s]+(?:258)?\s?8[0-9]\d{7}/,
    /\bde\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁ-ú'’\- ]{2,40}?)\s*(?:\.|,|$)/
  ]
};

var EMOLA_ESTADOS = ['registado', 'a_confirmar', 'sem_familia', 'por_ler', 'ignorado', 'repetido'];

// ── chave do aparelho ────────────────────────────────────────
// O telefone com Tasker não tem conta Google: identifica-se com esta chave.
function chaveEmola_() {
  var k = props_().getProperty('EMOLA_KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, ''); props_().setProperty('EMOLA_KEY', k); }
  return k;
}

function chaveAparelho_(user, renovar) {
  if (user.papel !== 'admin') throw fail_('permissao', 'Só o administrador vê a chave do aparelho.');
  if (renovar) {
    props_().deleteProperty('EMOLA_KEY');
    audit_(user, 'renovar chave e-Mola', 'Pagamentos_eMola', '', null, null);
  }
  return { ok: true, chave: chaveEmola_(), url: ScriptApp.getService().getUrl() };
}

function exigeChave_(req) {
  if (trim_(req.chave) !== chaveEmola_()) throw fail_('chave', 'Chave do aparelho inválida.');
}

// ── leitura do texto ─────────────────────────────────────────
function primeiro_(txt, padroes) {
  for (var i = 0; i < padroes.length; i++) {
    var m = String(txt).match(padroes[i]);
    if (m && trim_(m[1])) return trim_(m[1]);
  }
  return '';
}

// "1,500.00MT", "1.500,00MT" e "1500MT" dão todos 1500.
// O último separador seguido de duas casas é o decimal; o resto são milhares.
function valorMT_(txt) {
  var bruto = primeiro_(txt, EMOLA_PADROES.valor);
  if (!bruto) return 0;
  var s = bruto.replace(/\s/g, '');
  var ult = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (ult >= 0 && s.length - ult - 1 === 2) {
    s = s.slice(0, ult).replace(/[.,]/g, '') + '.' + s.slice(ult + 1);
  } else {
    s = s.replace(/[.,]/g, '');
  }
  var n = Number(s);
  return isNaN(n) ? 0 : mt_(n);
}

// Códigos de aluno no Conteúdo: as letras vêm das escolas que existem.
// Aceita mais do que um ("B014 B015") e devolve só os que existem mesmo.
function extrairCodigos_(txt) {
  var letras = readTable_('Escolas').rows.map(function (e) { return String(e.codigo).toUpperCase(); })
    .filter(function (l) { return /^[A-Z]$/.test(l); }).join('');
  if (!letras) return [];
  var re = new RegExp('(?:^|[^A-Z0-9])([' + letras + ']\\d{3,4})(?![0-9])', 'g');
  var alvo = String(txt || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  var out = [], m;
  while ((m = re.exec(alvo)) !== null) {
    if (out.indexOf(m[1]) < 0 && findBy_('Alunos', 'codigo', m[1])) out.push(m[1]);
  }
  return out;
}

function analisarSMS_(texto) {
  var t = String(texto || '');
  var conteudo = primeiro_(t, EMOLA_PADROES.conteudo);
  // Se não há campo "Conteúdo", o código pode estar em qualquer parte do SMS.
  var codigos = extrairCodigos_(conteudo || t);
  return {
    transacao: primeiro_(t, EMOLA_PADROES.transacao).toUpperCase(),
    valor: valorMT_(t),
    telefone: phone9_(primeiro_(t, EMOLA_PADROES.telefone)),
    nome: primeiro_(t, EMOLA_PADROES.nome),
    conteudo: conteudo,
    codigos: codigos
  };
}

// ── entrada do telefone ──────────────────────────────────────
function remetenteConhecido_(remetente) {
  var r = norm_(remetente).replace(/[^a-z0-9]/g, '');
  if (!r) return false;
  return CONFIG.EMOLA_REMETENTES.some(function (x) {
    var y = norm_(x).replace(/[^a-z0-9]/g, '');
    return r === y || r.indexOf(y) >= 0;
  });
}

function receberSMS_(req) {
  exigeChave_(req);
  var texto = trim_(req.texto);
  if (!texto) throw fail_('validacao', 'SMS vazio.');
  var remetente = trim_(req.remetente);
  var recebido = isDate_(String(req.recebido_em).slice(0, 10)) ? trim_(req.recebido_em) : now_();

  var dados = analisarSMS_(texto);
  // Um SMS repetido pelo telefone não pode gerar dois pagamentos.
  if (dados.transacao) {
    var ja = findBy_('Pagamentos_eMola', 'transacao', dados.transacao);
    if (ja) return { ok: true, repetido: true, id: ja.id, estado: ja.estado };
  }

  var linha = { id: 'EM' + pad_(nextCounter_('EM', 0), 5), recebido_em: recebido, remetente: remetente,
    texto: texto, transacao: dados.transacao, valor: dados.valor, telefone_pagador: dados.telefone,
    nome_pagador: dados.nome, conteudo: dados.conteudo, codigos: dados.codigos.join(' '),
    estado: 'por_ler', encarregado: '', recibo: '', motivo: '', operador: '',
    atualizado_em: now_(), atualizado_por: 'e-Mola' };

  // Defesa contra SMS falsos: só o remetente da operadora conta como pagamento.
  if (!remetenteConhecido_(remetente)) {
    linha.estado = 'ignorado';
    linha.motivo = 'Remetente desconhecido: ' + (remetente || 'sem remetente');
    writeObj_('Pagamentos_eMola', linha);
    return { ok: true, id: linha.id, estado: linha.estado };
  }
  if (!(dados.valor > 0)) {
    linha.motivo = 'Não se percebeu o valor.';
    writeObj_('Pagamentos_eMola', linha);
    return { ok: true, id: linha.id, estado: linha.estado };
  }
  if (!dados.transacao) {
    linha.motivo = 'Não se percebeu o ID da transacção.';
    writeObj_('Pagamentos_eMola', linha);
    return { ok: true, id: linha.id, estado: linha.estado };
  }
  // Já registado à mão com a mesma referência?
  var noRecibo = readTable_('Recebimentos').rows.filter(function (r) {
    return r.estado !== 'anulado' && trim_(r.referencia_externa).toUpperCase() === dados.transacao;
  })[0];
  if (noRecibo) {
    linha.estado = 'repetido';
    linha.recibo = noRecibo.numero_recibo;
    linha.motivo = 'Já tinha sido registado à mão.';
    writeObj_('Pagamentos_eMola', linha);
    return { ok: true, id: linha.id, estado: linha.estado, recibo: noRecibo.numero_recibo };
  }

  writeObj_('Pagamentos_eMola', linha);
  return ligarPagamento_(linha);
}

// ── ligação em três níveis ───────────────────────────────────
// 1. código do aluno no Conteúdo  → regista-se sozinho
// 2. telefone do pagador          → espera um clique do operador
// 3. nenhum dos dois              → fica à espera de ligação à mão
function ligarPagamento_(linha) {
  var codigos = String(linha.codigos || '').split(/\s+/).filter(Boolean);
  if (codigos.length) {
    var encs = {}, alunos = [];
    codigos.forEach(function (c) {
      var a = findBy_('Alunos', 'codigo', c);
      if (!a) return;
      alunos.push(a);
      var fin = responsavelDe_(c);
      if (fin) encs[fin.codigo] = fin;
    });
    var lista = Object.keys(encs);
    if (lista.length === 1) {
      return registarEmola_(linha, encs[lista[0]], alunos, 'código ' + codigos.join(' '));
    }
    if (lista.length > 1) {
      return guardarEstado_(linha, 'a_confirmar', '',
        'Os códigos ' + codigos.join(' ') + ' são de famílias diferentes. Escolha quem pagou.');
    }
    return guardarEstado_(linha, 'sem_familia', '',
      'O aluno ' + codigos.join(' ') + ' não tem responsável financeiro.');
  }
  // sem código: tenta pelo telefone de quem pagou
  if (linha.telefone_pagador) {
    var donos = readTable_('Encarregados').rows.filter(function (e) {
      return String(e.telefone_1) === String(linha.telefone_pagador) ||
             String(e.telefone_2 || '') === String(linha.telefone_pagador);
    });
    if (donos.length === 1) {
      return guardarEstado_(linha, 'a_confirmar', donos[0].codigo,
        'Reconhecido pelo telefone de ' + donos[0].nome_completo + '. Confirme antes de registar.');
    }
    if (donos.length > 1) {
      return guardarEstado_(linha, 'a_confirmar', '', 'Há mais do que uma família com este telefone.');
    }
  }
  return guardarEstado_(linha, 'sem_familia', '',
    'Sem código de aluno e telefone desconhecido. Ligue à família à mão.');
}

function responsavelDe_(codAluno) {
  var l = readTable_('AlunoEncarregado').rows.filter(function (x) {
    return x.aluno === codAluno && x.responsavel_financeiro === SIM;
  })[0];
  return l ? findBy_('Encarregados', 'codigo', l.encarregado) : null;
}

function guardarEstado_(linha, estado, encarregado, motivo) {
  linha.estado = estado;
  linha.encarregado = encarregado || linha.encarregado || '';
  linha.motivo = motivo || '';
  linha.atualizado_em = now_();
  writeObj_('Pagamentos_eMola', linha, linha._row);
  return { ok: true, id: linha.id, estado: estado, motivo: linha.motivo,
    pagamento: strip_(linha) };
}

// Reparte o valor pelas dívidas, as mais velhas primeiro,
// começando pelos alunos indicados no Conteúdo.
function proporAlocacoes_(codEnc, valor, alunosPreferidos) {
  var filhos = filhosDe_(codEnc);
  var alocado = alocadoPorCobranca_();
  var pref = (alunosPreferidos || []).map(function (a) { return a.codigo; });
  var abertas = readTable_('Cobrancas').rows.filter(function (c) {
    if (c.estado === 'anulada' || !filhos[c.aluno]) return false;
    return mt_(mt_(c.valor_liquido) - mt_(alocado[c.id] || 0)) > 0.004;
  }).map(function (c) {
    return { c: c, falta: mt_(mt_(c.valor_liquido) - mt_(alocado[c.id] || 0)) };
  });
  abertas.sort(function (a, b) {
    var pa = pref.indexOf(a.c.aluno) >= 0 ? 0 : 1, pb = pref.indexOf(b.c.aluno) >= 0 ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.c.data_vencimento !== b.c.data_vencimento) return a.c.data_vencimento < b.c.data_vencimento ? -1 : 1;
    return a.c.id < b.c.id ? -1 : 1;
  });
  var resto = mt_(valor), out = [];
  abertas.forEach(function (d) {
    if (resto <= 0.004) return;
    var v = mt_(Math.min(resto, d.falta));
    if (v > 0.004) { out.push({ cobranca: d.c.id, valor: v }); resto = mt_(resto - v); }
  });
  return out;
}

var UTILIZADOR_EMOLA = { email: 'e-mola', nome: 'e-Mola', papel: 'admin' };

function registarEmola_(linha, enc, alunos, porque) {
  var alocs = proporAlocacoes_(enc.codigo, linha.valor, alunos);
  var res;
  try {
    res = receber_(UTILIZADOR_EMOLA, { encarregado: enc.codigo,
      aluno: alunos && alunos.length === 1 ? alunos[0].codigo : '',
      valor: linha.valor, metodo: 'emola', conta: CONFIG.EMOLA_CONTA,
      referencia_externa: linha.transacao, data: String(linha.recebido_em).slice(0, 10),
      observacao: 'e-Mola · ' + porque, alocacoes: alocs });
  } catch (e) {
    // Não se perde nada: fica na fila com o motivo à vista.
    return guardarEstado_(linha, 'a_confirmar', enc.codigo, 'Não foi possível registar: ' + e.message);
  }
  linha.estado = 'registado';
  linha.encarregado = enc.codigo;
  linha.recibo = res.recibo.numero_recibo;
  linha.motivo = porque;
  linha.operador = 'e-Mola';
  linha.atualizado_em = now_();
  writeObj_('Pagamentos_eMola', linha, linha._row);
  // Recibo pronto a seguir por SMS, da mesma fila das outras mensagens.
  filaSMSRecibo_(enc, res.recibo, linha.valor);
  audit_(UTILIZADOR_EMOLA, 'e-Mola automático', 'Pagamentos_eMola', linha.id, null, linha);
  return { ok: true, id: linha.id, estado: 'registado', recibo: res.recibo.numero_recibo,
    pagamento: strip_(linha), recebimento: res.recibo, cobrancas: res.cobrancas };
}

// ── acções do operador ───────────────────────────────────────
function confirmarEmola_(user, p) {
  var linha = findBy_('Pagamentos_eMola', 'id', trim_(p.id));
  if (!linha) throw fail_('naoexiste', 'Pagamento e-Mola não encontrado.');
  if (linha.estado === 'registado') throw fail_('validacao', 'Este pagamento já deu o recibo ' + linha.recibo + '.');
  if (linha.estado === 'ignorado') throw fail_('validacao', 'Este SMS foi posto de lado.');
  var enc = findBy_('Encarregados', 'codigo', trim_(p.encarregado || linha.encarregado));
  if (!enc) throw fail_('validacao', 'Escolha a família que pagou.');
  var valor = p.valor !== undefined && p.valor !== '' ? mt_(p.valor) : mt_(linha.valor);
  if (!(valor > 0)) throw fail_('validacao', 'Indique o valor do pagamento.');
  if (!trim_(linha.transacao)) throw fail_('validacao', 'Este SMS não tem ID de transacção: registe o pagamento em Receber.');
  linha.valor = valor;
  var alunos = String(linha.codigos || '').split(/\s+/).filter(Boolean)
    .map(function (c) { return findBy_('Alunos', 'codigo', c); }).filter(Boolean);
  var alocs = p.alocacoes && p.alocacoes.length ? p.alocacoes : proporAlocacoes_(enc.codigo, valor, alunos);
  var res = receber_(user, { encarregado: enc.codigo, valor: valor, metodo: 'emola',
    conta: CONFIG.EMOLA_CONTA, referencia_externa: linha.transacao,
    data: String(linha.recebido_em).slice(0, 10), observacao: 'e-Mola · confirmado pelo operador',
    alocacoes: alocs });
  linha.estado = 'registado';
  linha.encarregado = enc.codigo;
  linha.recibo = res.recibo.numero_recibo;
  linha.motivo = 'Confirmado por ' + (user.nome || user.email);
  linha.operador = user.email;
  linha.atualizado_em = now_(); linha.atualizado_por = user.email;
  writeObj_('Pagamentos_eMola', linha, linha._row);
  filaSMSRecibo_(enc, res.recibo, valor);
  audit_(user, 'confirmar e-Mola', 'Pagamentos_eMola', linha.id, null, linha);
  return { ok: true, pagamento: strip_(linha), recibo: res.recibo, alocacoes: res.alocacoes,
    cobrancas: res.cobrancas, chave: res.chave };
}

function ignorarEmola_(user, id, motivo) {
  var linha = findBy_('Pagamentos_eMola', 'id', trim_(id));
  if (!linha) throw fail_('naoexiste', 'Pagamento e-Mola não encontrado.');
  if (linha.estado === 'registado') throw fail_('validacao', 'Já deu origem ao recibo ' + linha.recibo + '.');
  if (!trim_(motivo)) throw fail_('validacao', 'Diga porque é que este SMS fica de lado.');
  var antes = strip_(linha);
  linha.estado = 'ignorado';
  linha.motivo = trim_(motivo);
  linha.operador = user.email;
  linha.atualizado_em = now_(); linha.atualizado_por = user.email;
  writeObj_('Pagamentos_eMola', linha, linha._row);
  audit_(user, 'ignorar e-Mola', 'Pagamentos_eMola', linha.id, antes, linha);
  return { ok: true, pagamento: strip_(linha) };
}

// Depois de corrigir um telefone ou de ligar um encarregado ao aluno,
// vale a pena voltar a tentar sem ter de reenviar o SMS.
function reprocessarEmola_(user, id) {
  var linha = findBy_('Pagamentos_eMola', 'id', trim_(id));
  if (!linha) throw fail_('naoexiste', 'Pagamento e-Mola não encontrado.');
  if (['registado', 'repetido'].indexOf(linha.estado) >= 0) {
    throw fail_('validacao', 'Este SMS já está fechado.');
  }
  var dados = analisarSMS_(linha.texto);
  linha.transacao = dados.transacao || linha.transacao;
  linha.valor = dados.valor || linha.valor;
  linha.telefone_pagador = dados.telefone || linha.telefone_pagador;
  linha.nome_pagador = dados.nome || linha.nome_pagador;
  linha.conteudo = dados.conteudo || linha.conteudo;
  linha.codigos = dados.codigos.join(' ');
  linha.atualizado_por = user.email;
  writeObj_('Pagamentos_eMola', linha, linha._row);
  if (!(linha.valor > 0) || !linha.transacao) {
    return guardarEstado_(linha, 'por_ler', linha.encarregado, 'Continua a não se perceber o SMS.');
  }
  return ligarPagamento_(linha);
}

// ── fila de SMS a sair ───────────────────────────────────────
// O mesmo telefone que recebe os SMS da e-Mola envia os recibos.
function novaMensagem_(enc, canal, texto, recibo) {
  return writeObj_('Mensagens', { id: 'MS' + pad_(nextCounter_('MS', 0), 5), data: now_(),
    encarregado: enc.codigo, telefone: phone9_(enc.telefone_1), canal: canal, texto: texto,
    recibo: recibo || '', estado: canal === 'sms' ? 'na fila' : 'aberto', enviado_em: '' });
}

function filaSMSRecibo_(enc, recibo, valor) {
  var divida = dividaDoEncarregado_(enc.codigo);
  var txt = 'Escolinhas: recebemos ' + mtTxt_(valor) + '. Recibo ' + recibo.numero_recibo + '.' +
    (divida > 0.004 ? ' Em falta: ' + mtTxt_(divida) + '.' : ' Esta tudo pago. Obrigado!');
  return novaMensagem_(enc, 'sms', txt, recibo.numero_recibo);
}

function smsPendentes_(req) {
  exigeChave_(req);
  var out = readTable_('Mensagens').rows.filter(function (m) {
    return m.canal === 'sms' && m.estado === 'na fila';
  }).slice(0, Number(req.limite) > 0 ? Number(req.limite) : 20)
    .map(function (m) { return { id: m.id, telefone: m.telefone, texto: m.texto }; });
  return { ok: true, mensagens: out };
}

function smsEnviado_(req) {
  exigeChave_(req);
  var m = findBy_('Mensagens', 'id', trim_(req.id));
  if (!m) throw fail_('naoexiste', 'Mensagem não encontrada.');
  m.estado = trim_(req.erro) ? 'erro' : 'enviada';
  m.enviado_em = now_();
  if (trim_(req.erro)) m.texto = m.texto;
  writeObj_('Mensagens', m, m._row);
  return { ok: true, id: m.id, estado: m.estado };
}

// ── teste rápido no editor ───────────────────────────────────
function testeLeitura() {
  _cache = {};
  BOOTSTRAP_TABLES.forEach(function (n) { Logger.log(n + ': ' + readTable_(n).rows.length + ' linhas'); });
}
