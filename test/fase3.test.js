// Collaudo delle regole della fase 3: node test/fase3.test.js
var fs = require('fs'), vm = require('vm'), path = require('path');
var makeEnv = require('./gas_mock.js');

var env = makeEnv();
var ctx = vm.createContext(Object.assign({ console: console }, env));
vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

var ok = 0, ko = 0;
function check(label, cond, extra) {
  if (cond) ok++; else { ko++; console.log('FALLITO: ' + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
function post(o) { return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }).text); }

ctx.instalar();
ctx.CONFIG.GOOGLE_CLIENT_ID = 'CID';
env.__tokenInfo.tokA = { aud: 'CID', email: 'admin@escola.org', email_verified: 'true' };
var T = post({ action: 'login', idToken: 'tokA' }).token;
function save(t, r, n, f) { return post({ action: 'save', token: T, table: t, record: r, isNew: n, force: f }); }
function tabela(n) { return post({ action: 'bootstrap', token: T }).data[n]; }
var HOJE = ctx.today_();
var ANO = tabela('AnosLetivos')[0].ano;

// ── preparação ───────────────────────────────────────────────
save('TabelaPrecos', { ano: ANO, escola: 'B', tipo_cobranca: 'MATRICULA', valor: 1000 }, true);
save('TabelaPrecos', { ano: ANO, escola: 'B', tipo_cobranca: 'MENSALIDADE', valor: 1500 }, true);
var aluno = save('Alunos', { nome_completo: 'Ana Cossa', escola: 'B' }, true).record;
var enc = save('Encarregados', { nome_completo: 'Maria Cossa', telefone_1: '841234567' }, true).record;
save('AlunoEncarregado', { aluno: aluno.codigo, encarregado: enc.codigo, responsavel_financeiro: 'sim' }, true);
// subcategorias de despesa
save('Categorias', { codigo: 'DES_ALIM_ARROZ', nome: 'Arroz', tipo: 'despesa', categoria_pai: 'DES_ALIM' }, true);
save('Categorias', { codigo: 'DES_LIMP_SABAO', nome: 'Sabão', tipo: 'despesa', categoria_pai: 'DES_LIMP' }, true);
// saldo inicial na caixa comum
var caixa = tabela('Contas').filter(function (c) { return c.codigo === 'CX_COMUM'; })[0];
save('Contas', Object.assign({}, caixa, { saldo_inicial: 5000, data_saldo_inicial: '2020-01-01' }), false);

function desp(p) { return post(Object.assign({ action: 'despesa', token: T }, p)); }
function saldo(c) { return post({ action: 'saldos', token: T }).saldos.filter(function (s) { return s.codigo === c; })[0].saldo; }

// ── 1. registar uma despesa ──────────────────────────────────
check('saldo inicial lido da conta', saldo('CX_COMUM') === 5000, saldo('CX_COMUM'));
var d1 = desp({ data: HOJE, escola: 'B', categoria: 'DES_ALIM', subcategoria: 'DES_ALIM_ARROZ',
  descricao: '2 sacos de arroz', fornecedor: 'Loja Maputo', valor: 1200, conta: 'CX_COMUM',
  metodo: 'numerario', numero_documento: 'FT 1023' });
check('despesa DP00001', d1.ok && d1.despesa.id === 'DP00001' && d1.despesa.estado === 'valida', d1);
check('saldo da caixa desce', d1.saldo === 3800 && saldo('CX_COMUM') === 3800, d1.saldo);
check('operador registado', d1.despesa.operador === 'admin@escola.org');

var dRede = desp({ data: HOJE, escola: 'REDE', categoria: 'DES_UTIL', descricao: 'Electricidade da rede',
  valor: 800, conta: 'CX_COMUM', metodo: 'numerario' });
check('despesa comum à rede', dRede.ok && dRede.despesa.escola === 'REDE', dRede);
check('categoria sem subcategoria é aceite', dRede.despesa.subcategoria === '');

// ── 2. validações ────────────────────────────────────────────
check('valor zero recusado', desp({ escola: 'B', categoria: 'DES_ALIM', descricao: 'x', valor: 0,
  conta: 'CX_COMUM', metodo: 'numerario' }).code === 'validacao');
// O formulário simples não pede descrição: vale a categoria, ou a subcategoria
var semDesc = desp({ escola: 'B', categoria: 'DES_ALIM', valor: 10, conta: 'CX_COMUM', metodo: 'numerario' });
check('sem descrição usa o nome da categoria', semDesc.ok && semDesc.despesa.descricao === 'Produtos alimentares', semDesc);
var semDesc2 = desp({ escola: 'B', categoria: 'DES_ALIM', subcategoria: 'DES_ALIM_ARROZ', valor: 10,
  conta: 'CX_COMUM', metodo: 'numerario' });
check('com subcategoria usa o nome dela', semDesc2.ok && semDesc2.despesa.descricao === 'Arroz', semDesc2);
post({ action: 'anularDespesa', token: T, id: semDesc.despesa.id, motivo: 'só prova' });
post({ action: 'anularDespesa', token: T, id: semDesc2.despesa.id, motivo: 'só prova' });
check('data futura recusada', desp({ data: '2099-01-01', escola: 'B', categoria: 'DES_ALIM', descricao: 'x',
  valor: 10, conta: 'CX_COMUM', metodo: 'numerario' }).code === 'validacao');
check('escola inexistente recusada', desp({ escola: 'Z', categoria: 'DES_ALIM', descricao: 'x', valor: 10,
  conta: 'CX_COMUM', metodo: 'numerario' }).code === 'validacao');
check('categoria de receita recusada', desp({ escola: 'B', categoria: 'REC_MAT', descricao: 'x', valor: 10,
  conta: 'CX_COMUM', metodo: 'numerario' }).code === 'validacao');
check('subcategoria de outra categoria recusada', desp({ escola: 'B', categoria: 'DES_ALIM',
  subcategoria: 'DES_LIMP_SABAO', descricao: 'x', valor: 10, conta: 'CX_COMUM', metodo: 'numerario' }).code === 'validacao');
check('subcategoria no lugar da categoria recusada', desp({ escola: 'B', categoria: 'DES_ALIM_ARROZ',
  descricao: 'x', valor: 10, conta: 'CX_COMUM', metodo: 'numerario' }).code === 'validacao');
check('conta inexistente recusada', desp({ escola: 'B', categoria: 'DES_ALIM', descricao: 'x', valor: 10,
  conta: 'NAO_EXISTE', metodo: 'numerario' }).code === 'validacao');
check('método inválido recusado', desp({ escola: 'B', categoria: 'DES_ALIM', descricao: 'x', valor: 10,
  conta: 'CX_COMUM', metodo: 'cheque' }).code === 'validacao');
var catOff = save('Categorias', { codigo: 'DES_UTIL', nome: 'Utilidades', tipo: 'despesa', ativa: 'não' }, false);
check('categoria desactivada recusada', desp({ escola: 'B', categoria: 'DES_UTIL', descricao: 'x', valor: 10,
  conta: 'CX_COMUM', metodo: 'numerario' }).code === 'validacao', catOff);
save('Categorias', { codigo: 'DES_UTIL', nome: 'Utilidades', tipo: 'despesa', ativa: 'sim' }, false);

// ── 3. a caixa não fica negativa sem aviso ───────────────────
var antesDoAviso = tabela('Despesas').length;
var grande = desp({ escola: 'B', categoria: 'DES_ALIM', descricao: 'Compra grande', valor: 99999,
  conta: 'CX_COMUM', metodo: 'numerario' });
check('saldo negativo pede confirmação', grande.code === 'confirmar', grande);
check('nada foi gravado sem confirmar', tabela('Despesas').length === antesDoAviso,
  [antesDoAviso, tabela('Despesas').length]);
var forcada = desp({ escola: 'B', categoria: 'DES_ALIM', descricao: 'Compra grande', valor: 99999,
  conta: 'CX_COMUM', metodo: 'numerario', force: true });
check('com confirmação grava à mesma', forcada.ok && forcada.saldo < 0, forcada.saldo);
var anulGrande = post({ action: 'anularDespesa', token: T, id: forcada.despesa.id, motivo: 'Lançamento errado' });
check('anulação repõe o saldo', anulGrande.ok && saldo('CX_COMUM') === 3000, saldo('CX_COMUM'));
var contaBanco = tabela('Contas').filter(function (c) { return c.tipo === 'banco'; })[0];
var bancoNeg = desp({ escola: 'B', categoria: 'DES_ALIM', descricao: 'Do banco', valor: 50000,
  conta: contaBanco.codigo, metodo: 'banco' });
check('o banco pode ficar a descoberto sem aviso', bancoNeg.ok, bancoNeg);
post({ action: 'anularDespesa', token: T, id: bancoNeg.despesa.id, motivo: 'só teste' });

// ── 4. anulações ─────────────────────────────────────────────
check('anular exige motivo', post({ action: 'anularDespesa', token: T, id: 'DP00001' }).code === 'validacao');
var an = post({ action: 'anularDespesa', token: T, id: 'DP00001', motivo: 'Documento errado' });
check('despesa anulada', an.ok && an.despesa.estado === 'anulada' && an.despesa.motivo_anulacao === 'Documento errado', an);
check('saldo volta a subir', saldo('CX_COMUM') === 4200, saldo('CX_COMUM'));
check('anular duas vezes recusado', post({ action: 'anularDespesa', token: T, id: 'DP00001', motivo: 'x' }).code === 'validacao');
check('despesa inexistente', post({ action: 'anularDespesa', token: T, id: 'DP99999', motivo: 'x' }).code === 'naoexiste');
check('a linha não se apaga', tabela('Despesas').filter(function (d) { return d.id === 'DP00001'; }).length === 1);

// ── 5. comprovativo no Drive ─────────────────────────────────
var img = Buffer.from('uma foto qualquer').toString('base64');
var comFoto = desp({ escola: 'B', categoria: 'DES_LIMP', subcategoria: 'DES_LIMP_SABAO',
  descricao: 'Sabão azul', valor: 300, conta: 'CX_COMUM', metodo: 'numerario',
  foto: { nome: 'foto.jpg', tipo: 'image/jpeg', dados: img } });
check('comprovativo guardado', comFoto.ok && comFoto.despesa.comprovativo_url.indexOf('drive.fake') > 0, comFoto);
var raiz = env.DriveApp.__raiz.pastas.filter(function (p) { return p.nome === 'Comprovativos Finanças Escolinhas'; })[0];
check('pasta dos comprovativos criada', !!raiz);
var pastaAno = raiz.pastas.filter(function (p) { return p.nome === HOJE.slice(0, 4); })[0];
check('pasta do ano', !!pastaAno, raiz.pastas.map(function (p) { return p.nome; }));
var pastaMes = pastaAno.pastas.filter(function (p) { return p.nome === HOJE.slice(5, 7); })[0];
check('pasta do mês', !!pastaMes && pastaMes.ficheiros.length === 1, pastaAno.pastas.map(function (p) { return p.nome; }));
check('ficheiro com o nome da despesa', pastaMes.ficheiros[0].nome === comFoto.despesa.id + '.jpeg', pastaMes.ficheiros[0].nome);
check('comprovativo não é público: só os operadores o vêem',
  pastaMes.ficheiros[0].viewers.indexOf('admin@escola.org') >= 0, pastaMes.ficheiros[0].viewers);
var comData = desp({ escola: 'B', categoria: 'DES_LIMP', descricao: 'Com data:URL', valor: 50,
  conta: 'CX_COMUM', metodo: 'numerario', foto: { tipo: 'image/png', dados: 'data:image/png;base64,' + img } });
check('aceita a foto em formato data:URL', comData.ok, comData);
check('tipo de ficheiro inválido recusado', desp({ escola: 'B', categoria: 'DES_LIMP', descricao: 'x', valor: 10,
  conta: 'CX_COMUM', metodo: 'numerario', foto: { tipo: 'application/zip', dados: img } }).code === 'validacao');
var enorme = 'A'.repeat(3 * 1024 * 1024);
check('foto grande demais recusada', desp({ escola: 'B', categoria: 'DES_LIMP', descricao: 'x', valor: 10,
  conta: 'CX_COMUM', metodo: 'numerario', foto: { tipo: 'image/jpeg', dados: enorme } }).code === 'validacao');

// ── 6. fila offline das despesas ─────────────────────────────
var base = { escola: 'B', categoria: 'DES_ALIM', descricao: 'Pão', valor: 150, conta: 'CX_COMUM',
  metodo: 'numerario', data: HOJE, ref_cliente: 'tel-desp-1' };
var o1 = desp(base), o2 = desp(base);
check('reenvio da fila não duplica a despesa', o1.ok && o2.ok && o2.repetido && o1.despesa.id === o2.despesa.id, [o1.despesa.id, o2.despesa && o2.despesa.id]);
check('só uma linha gravada', tabela('Despesas').filter(function (d) { return d.ref_cliente === 'tel-desp-1'; }).length === 1);

// ── 7. transferências ────────────────────────────────────────
function transf(p) { return post(Object.assign({ action: 'transferencia', token: T }, p)); }
var saldoAntes = saldo('CX_COMUM');
var t1 = transf({ data: HOJE, conta_origem: 'CX_COMUM', conta_destino: contaBanco.codigo, valor: 1000,
  descricao: 'Depósito do mês' });
check('transferência TR00001', t1.ok && t1.transferencia.id === 'TR00001', t1);
check('sai da origem', t1.saldo_origem === saldoAntes - 1000, t1.saldo_origem);
check('entra no destino', t1.saldo_destino === 1000, t1.saldo_destino);
check('mesma conta recusada', transf({ conta_origem: 'CX_COMUM', conta_destino: 'CX_COMUM', valor: 10 }).code === 'validacao');
check('valor zero recusado', transf({ conta_origem: 'CX_COMUM', conta_destino: contaBanco.codigo, valor: 0 }).code === 'validacao');
check('conta inexistente recusada', transf({ conta_origem: 'CX_COMUM', conta_destino: 'ZZZ', valor: 10 }).code === 'validacao');
check('data futura recusada', transf({ data: '2099-01-01', conta_origem: 'CX_COMUM', conta_destino: contaBanco.codigo, valor: 10 }).code === 'validacao');
check('caixa negativa pede confirmação', transf({ conta_origem: 'CX_COMUM', conta_destino: contaBanco.codigo, valor: 999999 }).code === 'confirmar');
var tOff = { conta_origem: 'CX_COMUM', conta_destino: contaBanco.codigo, valor: 200, data: HOJE, ref_cliente: 'tel-tr-1' };
check('reenvio não duplica a transferência', transf(tOff).transferencia.id === transf(tOff).transferencia.id);
check('uma só linha', tabela('Transferencias').filter(function (t) { return t.ref_cliente === 'tel-tr-1'; }).length === 1);
var saldoOrig = saldo('CX_COMUM'), saldoDest = saldo(contaBanco.codigo);
var anT = post({ action: 'anularTransferencia', token: T, id: 'TR00001', motivo: 'Depósito não feito' });
check('transferência anulada repõe os dois saldos',
  anT.ok && saldo('CX_COMUM') === saldoOrig + 1000 && saldo(contaBanco.codigo) === saldoDest - 1000,
  [saldo('CX_COMUM'), saldo(contaBanco.codigo)]);

// ── 8. recebimentos entram no saldo da conta ─────────────────
var cob = tabela('Cobrancas').filter(function (c) { return c.aluno === aluno.codigo; })[0];
var antesRec = saldo('CX_COMUM');
post({ action: 'receber', token: T, encarregado: enc.codigo, valor: 1000, metodo: 'numerario',
  conta: 'CX_COMUM', data: HOJE, alocacoes: [{ cobranca: cob.id, valor: 1000 }] });
check('o recibo entra na caixa', saldo('CX_COMUM') === antesRec + 1000, saldo('CX_COMUM'));

// ── 9. movimentos de uma conta ───────────────────────────────
var mov = post({ action: 'movimentos', token: T, conta: 'CX_COMUM' }).movimentos;
check('movimentos por ordem de data', mov.every(function (m, i) { return i === 0 || mov[i - 1].data <= m.data; }));
check('tem recebimentos e despesas', mov.some(function (m) { return m.tipo === 'recebimento'; }) &&
  mov.some(function (m) { return m.tipo === 'despesa'; }) && mov.some(function (m) { return m.tipo === 'transferencia'; }),
  mov.map(function (m) { return m.tipo; }));
check('as despesas entram com sinal negativo', mov.filter(function (m) { return m.tipo === 'despesa'; }).every(function (m) { return m.valor < 0; }));
check('nada de anulado nos movimentos', !mov.some(function (m) { return m.id === 'DP00001' || m.id === 'TR00001'; }),
  mov.map(function (m) { return m.id; }));
var somaMov = mov.reduce(function (t, m) { return Math.round((t + m.valor) * 100) / 100; }, 5000);
check('os movimentos somam o saldo', somaMov === saldo('CX_COMUM'), [somaMov, saldo('CX_COMUM')]);
var movMes = post({ action: 'movimentos', token: T, conta: 'CX_COMUM', de: '2000-01-01', ate: '2000-12-31' }).movimentos;
check('filtro por período', movMes.length === 0, movMes.length);

// ── 10. o saldo inicial só conta a partir da sua data ────────
var cx2 = save('Contas', { codigo: 'CX_B', nome: 'Caixa de Barrane', tipo: 'caixa', escola: 'B',
  saldo_inicial: 100, data_saldo_inicial: '2099-01-01' }, true);
desp({ data: HOJE, escola: 'B', categoria: 'DES_ALIM', descricao: 'Antes do saldo inicial', valor: 40,
  conta: 'CX_B', metodo: 'numerario', force: true });
check('movimentos anteriores à data do saldo inicial não contam', saldo('CX_B') === 100, saldo('CX_B'));

// ── 11. fecho de caixa ───────────────────────────────────────
var esperado = saldo('CX_COMUM');
var f1 = post({ action: 'fechoCaixa', token: T, conta: 'CX_COMUM', data: HOJE, contado: esperado });
check('fecho sem diferença', f1.ok && f1.fecho.diferenca === 0 && f1.fecho.esperado === esperado, f1);
var f2 = post({ action: 'fechoCaixa', token: T, conta: 'CX_COMUM', data: HOJE, contado: esperado - 250,
  observacao: 'Faltam 250 MT' });
check('fecho com falta regista a diferença', f2.ok && f2.fecho.diferenca === -250, f2);
check('fecho só em contas de dinheiro',
  post({ action: 'fechoCaixa', token: T, conta: contaBanco.codigo, contado: 10 }).code === 'validacao');
check('fecho sem valor contado recusado',
  post({ action: 'fechoCaixa', token: T, conta: 'CX_COMUM' }).code === 'validacao');
check('contado negativo recusado',
  post({ action: 'fechoCaixa', token: T, conta: 'CX_COMUM', contado: -5 }).code === 'validacao');
check('fecho não mexe no saldo', saldo('CX_COMUM') === esperado, saldo('CX_COMUM'));
var fechos = post({ action: 'fechos', token: T, conta: 'CX_COMUM' }).fechos;
check('histórico dos fechos, do mais recente', fechos.length === 2 && fechos[0].diferenca === -250, fechos);
check('o fecho guarda quem contou', fechos[0].operador === 'admin@escola.org' && fechos[0].observacao === 'Faltam 250 MT');

// ── 12. permissões ───────────────────────────────────────────
save('Utilizadores', { email: 'op@escola.org', nome: 'Operadora', papel: 'operador' }, true);
env.__tokenInfo.tokO = { aud: 'CID', email: 'op@escola.org', email_verified: 'true' };
var TO = post({ action: 'login', idToken: 'tokO' }).token;
var opD = post({ action: 'despesa', token: TO, escola: 'B', categoria: 'DES_ALIM', descricao: 'Compra da operadora',
  valor: 60, conta: 'CX_COMUM', metodo: 'numerario', data: HOJE });
check('operador regista despesas', opD.ok && opD.despesa.operador === 'op@escola.org', opD);
check('operador não anula despesas',
  post({ action: 'anularDespesa', token: TO, id: opD.despesa.id, motivo: 'x' }).code === 'permissao');
var opT = post({ action: 'transferencia', token: TO, conta_origem: 'CX_COMUM', conta_destino: contaBanco.codigo,
  valor: 50, data: HOJE });
check('operador faz transferências', opT.ok, opT);
check('operador não anula transferências',
  post({ action: 'anularTransferencia', token: TO, id: opT.transferencia.id, motivo: 'x' }).code === 'permissao');
check('operador faz o fecho de caixa',
  post({ action: 'fechoCaixa', token: TO, conta: 'CX_COMUM', contado: 10 }).ok);
check('Despesas fora do save genérico',
  post({ action: 'save', token: T, table: 'Despesas', record: { id: 'DP00001', valor: 1 } }).code === 'tabela');
check('Transferencias fora do save genérico',
  post({ action: 'save', token: T, table: 'Transferencias', record: { id: 'TR00001', valor: 1 } }).code === 'tabela');

// ── 13. sincronização e actualização ─────────────────────────
var full = post({ action: 'bootstrap', token: T });
check('bootstrap traz despesas e transferências',
  full.data.Despesas.length > 0 && full.data.Transferencias.length > 0);
var inc = post({ action: 'bootstrap', token: T, desde: { Despesas: '2099-01-01 00:00:00', Transferencias: '2099-01-01 00:00:00' } });
check('incremental das folhas novas', inc.data.Despesas.length === 0 && inc.parcial.Despesas === true, inc.data.Despesas.length);
// ── 14. a caixa fecha ────────────────────────────────────────
// Para cada conta: saldo_inicial + tudo o que é válido = saldo mostrado.
var contas = tabela('Contas'), recs = tabela('Recebimentos'), desps = tabela('Despesas'), trs = tabela('Transferencias');
var maus = contas.filter(function (c) {
  var ini = c.data_saldo_inicial || '';
  function conta(d) { return !ini || String(d).slice(0, 10) >= ini; }
  var s = Number(c.saldo_inicial) || 0;
  recs.forEach(function (r) { if (r.estado !== 'anulado' && r.conta === c.codigo && conta(r.data)) s += Number(r.valor); });
  desps.forEach(function (d) { if (d.estado !== 'anulada' && d.conta === c.codigo && conta(d.data)) s -= Number(d.valor); });
  trs.forEach(function (t) {
    if (t.estado === 'anulada' || !conta(t.data)) return;
    if (t.conta_destino === c.codigo) s += Number(t.valor);
    if (t.conta_origem === c.codigo) s -= Number(t.valor);
  });
  return Math.round(s * 100) / 100 !== saldo(c.codigo);
});
check('o saldo de todas as contas bate com os movimentos', maus.length === 0,
  maus.map(function (c) { return c.codigo + ': ' + saldo(c.codigo); }));
var ids = desps.map(function (d) { return d.id; });
check('ids de despesa únicos', ids.length === ids.filter(function (v, i) { return ids.indexOf(v) === i; }).length);
check('nenhuma despesa sem operador', !desps.some(function (d) { return !d.operador; }));
check('nenhuma anulação sem motivo',
  !desps.some(function (d) { return d.estado === 'anulada' && !d.motivo_anulacao; }) &&
  !trs.some(function (t) { return t.estado === 'anulada' && !t.motivo_anulacao; }));

// ── 15. actualizar uma instalação da fase 2 ─────────────────
// Fica no fim: apaga de propósito um cabeçalho e estraga a folha.
(function () {
  var sh = env.__ss.getSheetByName('Transferencias');
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var i = head.indexOf('motivo_anulacao');
  check('motivo_anulacao existe nas transferências', i >= 0, head);
  var linhas = sh.getLastRow();
  sh.getRange(1, i + 1, 1, 1).setValues([['']]);
  ctx._cache = {};
  ctx.instalar();
  var sh2 = env.__ss.getSheetByName('Transferencias');
  var head2 = sh2.getRange(1, 1, 1, sh2.getLastColumn()).getValues()[0];
  check('instalar() repõe a coluna sem perder linhas',
    head2.indexOf('motivo_anulacao') >= 0 && sh2.getLastRow() === linhas, head2);
  var shD = env.__ss.getSheetByName('Despesas');
  var headD = shD.getRange(1, 1, 1, shD.getLastColumn()).getValues()[0];
  check('ref_cliente existe nas despesas', headD.indexOf('ref_cliente') >= 0, headD);
})();

console.log(ok + ' ok, ' + ko + ' falliti');
process.exit(ko ? 1 : 0);
