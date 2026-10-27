// Server di prova: serve la PWA e simula l'Apps Script con Code.gs + finto foglio.
// node test/dev_server.js  → http://localhost:8787  (stampa il token di sessione)
var http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');
var makeEnv = require('./gas_mock.js');

var env = makeEnv();
var ctx = vm.createContext(Object.assign({ console: console }, env));
vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/Code.gs'), 'utf8'), ctx);
ctx.instalar();
ctx.CONFIG.GOOGLE_CLIENT_ID = 'CID';
env.__tokenInfo.dev = { aud: 'CID', email: 'admin@escola.org', email_verified: 'true' };
var login = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'login', idToken: 'dev' }) } }).text);
fs.writeFileSync(path.join(__dirname, '.token'), login.token);

var APP = path.join(__dirname, '../app');
var types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
http.createServer(function (req, res) {
  if (req.method === 'POST' && req.url === '/api') {
    var body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      var out = ctx.doPost({ postData: { contents: body } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(out.text);
    });
    return;
  }
  var p = req.url.split('?')[0];
  // GET /api: a página pública do recibo (doGet), como no Apps Script
  if (req.method === 'GET' && p === '/api') {
    var q = {};
    (req.url.split('?')[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    var out = ctx.doGet({ parameter: q });
    var corpo = out.getContent ? out.getContent() : out.text;
    res.writeHead(200, { 'Content-Type': out.getContent ? 'text/html; charset=utf-8' : 'application/json' });
    res.end(corpo);
    return;
  }
  if (p === '/') p = '/index.html';
  var f = path.join(APP, p);
  if (!f.startsWith(APP) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  var data = fs.readFileSync(f);
  if (p === '/app.js') {
    // Só no servidor de prova: a app aponta para /api e já entra com a sessão,
    // para não ser preciso colar o token à mão. Sair continua a funcionar.
    data = String(data).replace(/API_URL: '[^']*'/, "API_URL: '/api'");
    data = "try{if(!localStorage.getItem('fe_token'))localStorage.setItem('fe_token'," +
      JSON.stringify(JSON.stringify(login.token)) + ");}catch(e){}\n" + data;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  res.end(data);
}).listen(8787, function () {
  console.log('Finanças Escolinhas — servidor de prova em http://localhost:8787');
  console.log('A sessão já vai aberta. Os dados vivem na memória: ao fechar, desaparecem.');
});
