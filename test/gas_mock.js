// Finto ambiente Google Apps Script per collaudare Code.gs in Node.
// Simula solo cio' che Code.gs usa.
function Range(sheet, r, c, nr, nc) { this.s = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
Range.prototype.getValues = function () {
  var out = [];
  for (var i = 0; i < this.nr; i++) {
    var row = [];
    for (var j = 0; j < this.nc; j++) {
      var line = this.s.data[this.r - 1 + i] || [];
      var v = line[this.c - 1 + j];
      row.push(v === undefined ? '' : v);
    }
    out.push(row);
  }
  return out;
};
Range.prototype.setValues = function (vals) {
  if (vals.length !== this.nr || vals[0].length !== this.nc) throw new Error('setValues: dimensione errata');
  for (var i = 0; i < this.nr; i++) {
    var idx = this.r - 1 + i;
    while (this.s.data.length <= idx) this.s.data.push([]);
    for (var j = 0; j < this.nc; j++) this.s.data[idx][this.c - 1 + j] = vals[i][j];
  }
  return this;
};
Range.prototype.setNumberFormat = function () { return this; };
Range.prototype.setFontWeight = function () { return this; };

function Sheet(name) { this.name = name; this.data = []; }
Sheet.prototype.getLastRow = function () {
  for (var i = this.data.length - 1; i >= 0; i--) {
    if ((this.data[i] || []).some(function (v) { return v !== '' && v !== undefined; })) return i + 1;
  }
  return 0;
};
Sheet.prototype.getLastColumn = function () {
  var m = 0;
  this.data.forEach(function (r) { for (var j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] !== undefined) { m = Math.max(m, j + 1); break; } });
  return m;
};
Sheet.prototype.getMaxRows = function () { return 1000; };
Sheet.prototype.getMaxColumns = function () { return Math.max(26, this.getLastColumn()); };
Sheet.prototype.insertColumnsAfter = function () { return this; };
Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); };
Sheet.prototype.setFrozenRows = function () {};
Sheet.prototype.deleteRow = function (r) { this.data.splice(r - 1, 1); };
Sheet.prototype.getName = function () { return this.name; };

function Spreadsheet() { this.sheets = [new Sheet('Folha1')]; }
Spreadsheet.prototype.getSheetByName = function (n) { return this.sheets.filter(function (s) { return s.name === n; })[0] || null; };
Spreadsheet.prototype.insertSheet = function (n) { var s = new Sheet(n); this.sheets.push(s); return s; };
Spreadsheet.prototype.deleteSheet = function (s) { this.sheets = this.sheets.filter(function (x) { return x !== s; }); };
Spreadsheet.prototype.getSheets = function () { return this.sheets; };
Spreadsheet.prototype.getId = function () { return 'SS1'; };
Spreadsheet.prototype.getName = function () { return 'Finanças Escolinhas'; };

function pad(n) { return n < 10 ? '0' + n : '' + n; }

module.exports = function makeEnv() {
  var ss = new Spreadsheet();
  var props = {};
  var triggers = [];
  var tokenInfo = {};
  var env = {
    __ss: ss,
    __props: props,
    __tokenInfo: tokenInfo,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, openById: function () { return ss; } },
    Utilities: {
      formatDate: function (d, tz, f) {
        var s = f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
          .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()));
        return s;
      },
      getUuid: function () { return require('crypto').randomUUID(); },
      base64Decode: function (b64) { return Array.from(Buffer.from(String(b64), 'base64')); },
      newBlob: function (bytes, tipo, nome) {
        return { bytes: bytes, tipo: tipo, nome: nome,
          getName: function () { return nome; }, getBytes: function () { return bytes; } };
      },
      computeHmacSha256Signature: function (txt, key) {
        var buf = require('crypto').createHmac('sha256', String(key)).update(String(txt)).digest();
        var out = [];
        for (var i = 0; i < buf.length; i++) out.push(buf[i] > 127 ? buf[i] - 256 : buf[i]);
        return out;
      }
    },
    Session: { getEffectiveUser: function () { return { getEmail: function () { return 'Admin@Escola.org'; } }; } },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
    PropertiesService: { getScriptProperties: function () { return {
      getProperty: function (k) { return props[k] === undefined ? null : props[k]; },
      setProperty: function (k, v) { props[k] = v; },
      deleteProperty: function (k) { delete props[k]; },
      getProperties: function () { return Object.assign({}, props); }
    }; } },
    UrlFetchApp: { fetch: function (url) {
      var tok = decodeURIComponent(url.split('id_token=')[1]);
      var info = tokenInfo[tok];
      return { getResponseCode: function () { return info ? 200 : 400; },
               getContentText: function () { return JSON.stringify(info || {}); } };
    } },
    ScriptApp: {
      getProjectTriggers: function () { return triggers; },
      newTrigger: function (fn) { var b = { timeBased: function () { return b; }, everyDays: function () { return b; },
        atHour: function () { return b; }, create: function () { triggers.push({ getHandlerFunction: function () { return fn; } }); } }; return b; },
      getService: function () { return { getUrl: function () { return 'https://script.google.com/macros/s/FAKE/exec'; } }; }
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: function (s) {
      return { text: s, setMimeType: function () { return this; } }; } },
    Logger: { log: function () {} },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput: function (html) {
        return { html: html, getContent: function () { return html; }, setXFrameOptionsMode: function () { return this; } };
      }
    },
    DriveApp: (function () {
      // Drive de mentira: pastas em árvore e ficheiros guardados em memória.
      function Ficheiro(nome, blob, pasta) {
        this.nome = nome; this.blob = blob; this.pasta = pasta; this.viewers = []; this.lixo = false;
      }
      Ficheiro.prototype.getUrl = function () { return 'https://drive.fake/' + encodeURIComponent(this.nome); };
      Ficheiro.prototype.getName = function () { return this.nome; };
      Ficheiro.prototype.addViewers = function (e) { this.viewers = this.viewers.concat(e); return this; };
      Ficheiro.prototype.setTrashed = function (v) { this.lixo = !!v; return this; };
      Ficheiro.prototype.makeCopy = function (nome, pasta) { return new Ficheiro(nome, this.blob, pasta); };

      function Pasta(nome) { this.nome = nome; this.pastas = []; this.ficheiros = []; }
      Pasta.prototype.getName = function () { return this.nome; };
      Pasta.prototype.getFoldersByName = function (n) { return iter(this.pastas.filter(function (p) { return p.nome === n; })); };
      Pasta.prototype.createFolder = function (n) { var p = new Pasta(n); this.pastas.push(p); return p; };
      Pasta.prototype.createFile = function (blob) {
        var f = new Ficheiro(blob.getName ? blob.getName() : 'ficheiro', blob, this);
        this.ficheiros.push(f);
        return f;
      };
      Pasta.prototype.getFiles = function () { return iter(this.ficheiros.filter(function (f) { return !f.lixo; })); };
      function iter(lista) {
        var i = 0;
        return { hasNext: function () { return i < lista.length; }, next: function () { return lista[i++]; } };
      }
      var raiz = new Pasta('__raiz__');
      return {
        __raiz: raiz,
        getFoldersByName: function (n) { return raiz.getFoldersByName(n); },
        createFolder: function (n) { return raiz.createFolder(n); },
        getFileById: function () { return new Ficheiro('folha', null, raiz); },
        Access: { ANYONE_WITH_LINK: 'link' },
        Permission: { VIEW: 'view' }
      };
    })()
  };
  return env;
};
