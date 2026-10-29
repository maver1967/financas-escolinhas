// Collaudo di Code.gs con un finto Google Sheet: node test/backend.test.js
var fs = require('fs'), vm = require('vm'), path = require('path');
var makeEnv = require('./gas_mock.js');

var env = makeEnv();
var ctx = vm.createContext(Object.assign({ console: console }, env));
vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

var ok = 0, ko = 0;
function check(label, cond, extra) {
  if (cond) ok++; else { ko++; console.log('FALLITO: ' + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
function post(obj) {
  var out = ctx.doPost({ postData: { contents: JSON.stringify(obj) } });
  return JSON.parse(out.text);
}

// 1. installazione
var log = ctx.instalar();
// 20 fogli nella specifica + Pagamentos_eMola, che la fase 5 aggiunge
check('21 fogli creati', env.__ss.sheets.length === 21, env.__ss.sheets.map(function (s) { return s.name; }));
check('c\'e il foglio della e-Mola', !!env.__ss.getSheetByName('Pagamentos_eMola'));
check('Folha1 rimossa', !env.__ss.getSheetByName('Folha1'));
check('5 scuole', env.__ss.getSheetByName('Escolas').getLastRow() === 6);
check('7 conti', env.__ss.getSheetByName('Contas').getLastRow() === 8);
var log2 = ctx.instalar();
check('reinstallare non duplica', env.__ss.getSheetByName('Escolas').getLastRow() === 6, log2);

// 2. login
ctx.CONFIG.GOOGLE_CLIENT_ID = 'CID';
env.__tokenInfo.tokA = { aud: 'CID', email: 'admin@escola.org', email_verified: 'true' };
env.__tokenInfo.tokX = { aud: 'CID', email: 'estranho@x.org', email_verified: 'true' };
env.__tokenInfo.tokW = { aud: 'ALTRO', email: 'admin@escola.org', email_verified: 'true' };
var r = post({ action: 'login', idToken: 'tokA' });
check('login admin', r.ok && r.token && r.user.papel === 'admin', r);
var T = r.token;
check('utente sconosciuto rifiutato', !post({ action: 'login', idToken: 'tokX' }).ok);
check('client id sbagliato rifiutato', !post({ action: 'login', idToken: 'tokW' }).ok);
check('token falso rifiutato', post({ action: 'bootstrap', token: 'nope' }).code === 'sessao');

// 3. bootstrap
var b = post({ action: 'bootstrap', token: T });
check('bootstrap ok', b.ok && b.data.Escolas.length === 5 && b.data.Utilizadores.length === 1, b);
check('anno attivo 2027', b.data.AnosLetivos[0].ano === 2027 && b.data.AnosLetivos[0].ativo === 'sim', b.data.AnosLetivos);
check('Macupula = C', b.data.Escolas.filter(function (e) { return e.nome === 'Macupula'; })[0].codigo === 'C');

// 4. alunni con codici per scuola
function save(table, record, isNew, force) { return post({ action: 'save', token: T, table: table, record: record, isNew: isNew, force: force }); }
var a1 = save('Alunos', { nome_completo: 'Ana Maria Cossa', escola: 'B', sexo: 'F' }, true);
check('primo alunno B001', a1.ok && a1.record.codigo === 'B001' && a1.record.estado === 'ativo', a1);
var a2 = save('Alunos', { nome_completo: 'Joao Mabunda', escola: 'B' }, true);
check('secondo alunno B002', a2.record && a2.record.codigo === 'B002', a2);
var a3 = save('Alunos', { nome_completo: 'Lurdes Tembe', escola: 'C' }, true);
check('Macupula C001', a3.record && a3.record.codigo === 'C001', a3);
var dupN = save('Alunos', { nome_completo: 'ana maria cossá', escola: 'S' }, true);
check('nome doppione chiede conferma', dupN.code === 'confirmar', dupN);
var dupF = save('Alunos', { nome_completo: 'ana maria cossá', escola: 'S' }, true, true);
check('con conferma salva S001', dupF.record && dupF.record.codigo === 'S001', dupF);
var badE = save('Alunos', { nome_completo: 'X', escola: 'Z' }, true);
check('scuola inesistente', badE.code === 'validacao', badE);
var mv = save('Alunos', { codigo: 'B002', escola: 'M' }, false);
check('cambio scuola chiede conferma', mv.code === 'confirmar', mv);
mv = save('Alunos', { codigo: 'B002', escola: 'M' }, false, true);
check('cambio scuola mantiene codice', mv.record && mv.record.codigo === 'B002' && mv.record.escola === 'M', mv);
var a4 = save('Alunos', { nome_completo: 'Pedro Novo', escola: 'B' }, true);
check('numerazione B continua B003', a4.record && a4.record.codigo === 'B003', a4);

// 5. encarregados
var e1 = save('Encarregados', { nome_completo: 'Maria Cossa', telefone_1: '+258 84 123 4567' }, true);
check('encarregado E0001 e telefono normalizzato', e1.record && e1.record.codigo === 'E0001' && e1.record.telefone_1 === '841234567', e1);
var e2 = save('Encarregados', { nome_completo: 'Outra', telefone_1: '841234567' }, true);
check('telefono doppione chiede conferma', e2.code === 'confirmar' && e2.extra.codigo === 'E0001', e2);
var e3 = save('Encarregados', { nome_completo: 'Sem tel', telefone_1: '12' }, true);
check('telefono non valido', e3.code === 'validacao', e3);

// 6. collegamenti
var l1 = save('AlunoEncarregado', { aluno: 'B001', encarregado: 'E0001', parentesco: 'Mãe', responsavel_financeiro: 'sim', contacto_principal: 'sim' }, true);
check('link AE00001', l1.record && l1.record.id === 'AE00001', l1);
var e4 = save('Encarregados', { nome_completo: 'Avó Rosa', telefone_1: '871112223' }, true);
var l2 = save('AlunoEncarregado', { aluno: 'B001', encarregado: e4.record.codigo, parentesco: 'Avó', responsavel_financeiro: 'sim' }, true);
check('nuovo responsabile toglie il vecchio', l2.ok && l2.changed.length === 1 && l2.changed[0].record.responsavel_financeiro === 'não', l2);
check('link doppio rifiutato', save('AlunoEncarregado', { aluno: 'B001', encarregado: 'E0001' }, true).code === 'duplicado');
var rm = post({ action: 'removeLink', token: T, id: l2.record.id });
check('rimozione link', rm.ok && env.__ss.getSheetByName('AlunoEncarregado').getLastRow() === 2, rm);

// 7. configurazione
var p1 = save('TabelaPrecos', { ano: 2027, escola: 'B', tipo_cobranca: 'MENSALIDADE', valor: '1500' }, true);
check('prezzo PR00001', p1.record && p1.record.id === 'PR00001' && p1.record.valor === 1500 && p1.record.dia_vencimento === 10, p1);
check('prezzo doppio rifiutato', save('TabelaPrecos', { ano: 2027, escola: 'B', tipo_cobranca: 'MENSALIDADE', valor: 2000 }, true).code === 'duplicado');
var y = save('AnosLetivos', { ano: 2028, mes_inicio: 2, mes_fim: 11, ativo: 'sim' }, true);
check('nuovo anno attivo disattiva il precedente', y.ok && y.changed[0].record.ano === 2027 && y.changed[0].record.ativo === 'não', y);
check('codice scuola duplicato', save('Escolas', { codigo: 'b', nome: 'X' }, true).code === 'duplicado');
var self = save('Utilizadores', { email: 'admin@escola.org', nome: 'A', papel: 'operador', ativo: 'sim' }, false);
check('admin non si toglie da solo', self.code === 'validacao', self);
var cat = save('Categorias', { codigo: 'des_alim_arroz', nome: 'Arroz', tipo: 'despesa', categoria_pai: 'DES_ALIM' }, true);
check('sottocategoria', cat.ok && cat.record.codigo === 'DES_ALIM_ARROZ', cat);
check('terzo livello rifiutato', save('Categorias', { codigo: 'X3', nome: 'x', tipo: 'despesa', categoria_pai: 'DES_ALIM_ARROZ' }, true).code === 'validacao');

// 8. sconti e permessi operatore
var d1 = save('Descontos', { aluno: 'B001', tipo_cobranca: 'MENSALIDADE', modo: 'percentagem', valor: 50, mes_de: 2, mes_ate: 11, motivo: 'Irmãos' }, true);
check('sconto DS00001 anno attivo', d1.record && d1.record.id === 'DS00001' && d1.record.ano === 2028, d1);
check('sconto oltre 100% rifiutato', save('Descontos', { aluno: 'B001', tipo_cobranca: 'TODOS', modo: 'percentagem', valor: 150, mes_de: 2, mes_ate: 3, motivo: 'x' }, true).code === 'validacao');
save('Utilizadores', { email: 'Op@Escola.org', nome: 'Operadora', papel: 'operador' }, true);
env.__tokenInfo.tokO = { aud: 'CID', email: 'op@escola.org', email_verified: 'true' };
var TO = post({ action: 'login', idToken: 'tokO' }).token;
var bo = post({ action: 'bootstrap', token: TO });
check('operatore non vede Utilizadores', bo.ok && !bo.data.Utilizadores, Object.keys(bo.data || {}));
var po = post({ action: 'save', token: TO, table: 'Escolas', record: { codigo: 'B', nome: 'X' } });
check('operatore non cambia scuole', po.code === 'permissao', po);
var ao = post({ action: 'save', token: TO, table: 'Alunos', record: { nome_completo: 'Filho Op', escola: 'N' }, isNew: true });
check('operatore iscrive alunni', ao.ok && ao.record.codigo === 'N001' && ao.record.atualizado_por === 'op@escola.org', ao);
check('tabella di sistema non scrivibile', save('Cobrancas', { id: 'x' }, true).code === 'tabela');

// 8b. apagare un record di configurazione
function apagar(table, id, tok) { return post({ action: 'apagarConfig', token: tok || T, table: table, id: id }); }
function conta(table) { return post({ action: 'bootstrap', token: T }).data[table].length; }

save('Categorias', { codigo: 'DES_ERRO', nome: 'Escrita por engano', tipo: 'despesa', ativa: 'sim' }, true);
var antes = conta('Categorias');
check('categoria nova aparece', antes > 0 && post({ action: 'bootstrap', token: T }).data.Categorias
  .some(function (c) { return c.codigo === 'DES_ERRO'; }));
check('categoria por usar apaga-se', apagar('Categorias', 'DES_ERRO').ok === true);
check('e desaparece mesmo', conta('Categorias') === antes - 1);
check('apagar outra vez diz que nao existe', apagar('Categorias', 'DES_ERRO').code === 'validacao');

// uma categoria com filhas nao se apaga
save('Categorias', { codigo: 'DES_PAI', nome: 'Pai', tipo: 'despesa', ativa: 'sim' }, true);
save('Categorias', { codigo: 'DES_FILHA', nome: 'Filha', tipo: 'despesa', categoria_pai: 'DES_PAI', ativa: 'sim' }, true);
var rPai = apagar('Categorias', 'DES_PAI');
check('categoria com subcategoria nao se apaga', rPai.ok !== true && /Categorias/.test(rPai.error || ''), rPai);
check('a subcategoria apaga-se', apagar('Categorias', 'DES_FILHA').ok === true);
check('e depois o pai tambem', apagar('Categorias', 'DES_PAI').ok === true);

// uma escola em uso nao se apaga
var rEsc = apagar('Escolas', 'B');
check('escola em uso nao se apaga', rEsc.ok !== true && /usado/.test(rEsc.error || ''), rEsc);
check('a escola continua la', post({ action: 'bootstrap', token: T }).data.Escolas
  .some(function (e) { return e.codigo === 'B'; }));

// o administrador nao se apaga a si proprio
var rEu = apagar('Utilizadores', 'admin@escola.org');
check('nao se apaga a propria conta', rEu.ok !== true && /pr\u00f3pria/.test(rEu.error || ''), rEu);

// so o administrador, e so as tabelas de configuracao
check('operador nao apaga', apagar('Categorias', 'DES_ALIM', TO).code === 'permissao');
check('tabela de movimentos nao se apaga', apagar('Despesas', 'DP00001').code === 'validacao');
check('tabela inventada nao se apaga', apagar('NaoExiste', 'x').code === 'validacao');

// 9. audit e logout
check('auditoria scritta', env.__ss.getSheetByName('Auditoria').getLastRow() > 15);
check('logout', post({ action: 'logout', token: TO }).ok && post({ action: 'bootstrap', token: TO }).code === 'sessao');

console.log(ok + ' ok, ' + ko + ' falliti');
process.exit(ko ? 1 : 0);
