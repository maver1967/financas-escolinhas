// Collaudo della fase 5 (e-Mola): node test/fase5.test.js
// Il formato esatto dell'SMS non e' noto: qui si provano piu' forme plausibili
// e, soprattutto, che NESSUN SMS vada perso qualunque cosa contenga.
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
save('TabelaPrecos', { ano: ANO, escola: 'M', tipo_cobranca: 'MATRICULA', valor: 800 }, true);
save('TabelaPrecos', { ano: ANO, escola: 'M', tipo_cobranca: 'MENSALIDADE', valor: 1200 }, true);
var ana = save('Alunos', { nome_completo: 'Ana Cossa', escola: 'B' }, true).record;      // B001
var joao = save('Alunos', { nome_completo: 'João Cossa', escola: 'B' }, true).record;    // B002
var rosa = save('Alunos', { nome_completo: 'Rosa Nhaca', escola: 'M' }, true).record;    // M001
var orfao = save('Alunos', { nome_completo: 'Sem Familia', escola: 'B' }, true).record;  // B003
var maria = save('Encarregados', { nome_completo: 'Maria Cossa', telefone_1: '841234567' }, true).record;
var pedro = save('Encarregados', { nome_completo: 'Pedro Nhaca', telefone_1: '849998887' }, true).record;
save('AlunoEncarregado', { aluno: ana.codigo, encarregado: maria.codigo, responsavel_financeiro: 'sim' }, true);
save('AlunoEncarregado', { aluno: joao.codigo, encarregado: maria.codigo, responsavel_financeiro: 'sim' }, true);
save('AlunoEncarregado', { aluno: rosa.codigo, encarregado: pedro.codigo, responsavel_financeiro: 'sim' }, true);
check('alunos com os códigos esperados', ana.codigo === 'B001' && joao.codigo === 'B002' && rosa.codigo === 'M001',
  [ana.codigo, joao.codigo, rosa.codigo]);

var CH = post({ action: 'emolaChave', token: T }).chave;
check('chave do aparelho criada', !!CH && CH.length >= 16);
check('operador não vê a chave', (function () {
  save('Utilizadores', { email: 'op@escola.org', nome: 'Op', papel: 'operador' }, true);
  env.__tokenInfo.tokO = { aud: 'CID', email: 'op@escola.org', email_verified: 'true' };
  var TO = post({ action: 'login', idToken: 'tokO' }).token;
  return post({ action: 'emolaChave', token: TO }).code === 'permissao';
})());

function sms(texto, remetente, extra) {
  return post(Object.assign({ action: 'sms', chave: CH, texto: texto,
    remetente: remetente === undefined ? 'e-Mola' : remetente, recebido_em: HOJE + ' 09:15:00' }, extra || {}));
}
function linha(id) { return tabela('Pagamentos_eMola').filter(function (p) { return p.id === id; })[0]; }

// ── 1. a chave protege a entrada ─────────────────────────────
check('sem chave não entra', post({ action: 'sms', texto: 'x' }).code === 'chave');
check('chave errada não entra', post({ action: 'sms', chave: 'nao-e-esta', texto: 'x' }).code === 'chave');
check('a entrada dos SMS não precisa de sessão Google',
  post({ action: 'sms', chave: CH, texto: 'teste', remetente: 'e-Mola' }).ok);

// ── 2. ler o texto: várias formas do mesmo SMS ───────────────
var formas = [
  ['PP' + '240110.1234.A5678', 1500,
   'e-Mola: Recebeu 1,500.00MT de MARIA COSSA 841234567. Conteudo: B001. Transacao ID PP240110.1234.A5678. Saldo: 12,345.00MT'],
  ['PP240111.2222.B1234', 1500,
   'Transacao ID PP240111.2222.B1234 Confirmado. Recebeu 1.500,00MT de MARIA COSSA, 841234567. Conteudo: B001. Novo saldo 9.999,00MT'],
  ['PP240112.3333.C4567', 750,
   'e-Mola. Recebeu 750MT de MARIA COSSA 841234567. Conteudo: B001 pagamento. ID transacao: PP240112.3333.C4567'],
  ['PP240113.4444.D8901', 3000,
   'Recebeu 3,000.00MT de MARIA COSSA 841234567. Referencia: B001 B002. Transacao ID PP240113.4444.D8901']
];
formas.forEach(function (f, i) {
  var d = ctx.analisarSMS_(f[2]);
  check('forma ' + (i + 1) + ': lê a transacção', d.transacao === f[0], [d.transacao, f[0]]);
  check('forma ' + (i + 1) + ': lê o valor', d.valor === f[1], [d.valor, f[1]]);
  check('forma ' + (i + 1) + ': lê o telefone', d.telefone === '841234567', d.telefone);
  check('forma ' + (i + 1) + ': lê o código', d.codigos.length > 0, d.codigos);
});
// O ID da transacção não tem um comprimento garantido: a leitura não pode
// depender de contar dígitos, senão um pagamento verdadeiro perde-se.
[['PP261023.1001.AA11', 'Recebeu 1,500.00MT de X 841234567. Transacao ID PP261023.1001.AA11'],
 ['PP20261023.1001.AA11', 'Recebeu 1,500.00MT de X 841234567. Transacao ID PP20261023.1001.AA11'],
 ['PP24010.1234.A5678', 'Conteudo: B001. ID transacao: PP24010.1234.A5678'],
 ['CI250101.99.XYZ', 'Recebeu 100MT. Transacao CI250101.99.XYZ confirmada'],
 ['ABC123456', 'Recebeu 100MT. Confirmacao: ABC123456 recebido']
].forEach(function (c) {
  check('lê o ID "' + c[0] + '"', ctx.analisarSMS_(c[1]).transacao === c[0], ctx.analisarSMS_(c[1]).transacao);
});

check('o saldo no fim do SMS não é confundido com o valor', ctx.valorMT_(formas[0][2]) === 1500);
check('1,500.00MT = 1.500,00MT = 1500', ctx.valorMT_('1,500.00MT') === 1500 &&
  ctx.valorMT_('1.500,00MT') === 1500 && ctx.valorMT_('1500MT') === 1500);
check('valor com cêntimos', ctx.valorMT_('Recebeu 1,234.56MT') === 1234.56, ctx.valorMT_('Recebeu 1,234.56MT'));
check('dois códigos no mesmo Conteúdo', ctx.analisarSMS_(formas[3][2]).codigos.join(' ') === 'B001 B002',
  ctx.analisarSMS_(formas[3][2]).codigos);
check('códigos inventados são ignorados', ctx.extrairCodigos_('Conteudo: B999 Z123').length === 0,
  ctx.extrairCodigos_('Conteudo: B999 Z123'));
check('o código apanha-se mesmo sem campo Conteúdo',
  ctx.analisarSMS_('Recebeu 500MT de X 841234567 B001 Transacao ID PP1.2.A3').codigos[0] === 'B001');
check('não se confunde um número comprido com um código',
  ctx.extrairCodigos_('Conteudo: B0012345').length === 0, ctx.extrairCodigos_('Conteudo: B0012345'));

// ── 3. nível 1: código no Conteúdo → regista-se sozinho ──────
var r1 = sms('e-Mola: Recebeu 1,000.00MT de MARIA COSSA 841234567. Conteudo: B001. Transacao ID PP250101.1111.AAAA. Saldo: 5,000.00MT');
check('registado sozinho pelo código', r1.ok && r1.estado === 'registado' && r1.recibo, r1);
var rec1 = tabela('Recebimentos').filter(function (r) { return r.numero_recibo === r1.recibo; })[0];
check('vira recebimento e-Mola na conta e-Mola',
  rec1.metodo === 'emola' && rec1.conta === 'EMOLA' && rec1.valor === 1000, rec1);
check('a referência externa é o ID da transacção', rec1.referencia_externa === 'PP250101.1111.AAAA');
check('o operador fica registado como e-Mola', rec1.operador === 'e-mola', rec1.operador);
var alocs1 = tabela('Alocacoes').filter(function (a) { return a.recebimento === r1.recibo; });
check('alocado à dívida mais antiga da Ana', alocs1.length === 1, alocs1);
var cob1 = tabela('Cobrancas').filter(function (c) { return c.id === alocs1[0].cobranca; })[0];
check('pagou a matrícula da Ana', cob1.aluno === 'B001' && cob1.estado === 'paga', cob1);

// ── 4. o mesmo ID nunca gera dois recebimentos ───────────────
var r1b = sms('e-Mola: Recebeu 1,000.00MT de MARIA COSSA 841234567. Conteudo: B001. Transacao ID PP250101.1111.AAAA.');
check('SMS repetido não cria outro pagamento', r1b.ok && r1b.repetido && r1b.id === r1.id, r1b);
check('continua só um recibo com essa referência',
  tabela('Recebimentos').filter(function (r) { return r.referencia_externa === 'PP250101.1111.AAAA'; }).length === 1);

// pagamento já lançado à mão com a mesma referência
post({ action: 'receber', token: T, encarregado: pedro.codigo, valor: 500, metodo: 'emola', conta: 'EMOLA',
  referencia_externa: 'PP250102.9999.ZZZZ', data: HOJE, categoria: 'REC_OUT' });
var rMao = sms('Recebeu 500MT de PEDRO NHACA 849998887. Conteudo: M001. Transacao ID PP250102.9999.ZZZZ');
check('SMS de um pagamento já lançado à mão fica como repetido', rMao.estado === 'repetido', rMao);
check('e não cria um segundo recibo',
  tabela('Recebimentos').filter(function (r) { return r.referencia_externa === 'PP250102.9999.ZZZZ'; }).length === 1);

// ── 5. dois códigos da mesma família ─────────────────────────
var r2 = sms('Recebeu 4,000.00MT de MARIA COSSA 841234567. Conteudo: B001 B002. Transacao ID PP250103.2222.BBBB');
check('dois irmãos: regista-se sozinho', r2.estado === 'registado', r2);
var alocs2 = tabela('Alocacoes').filter(function (a) { return a.recebimento === r2.recibo; });
var alunosTocados = {};
alocs2.forEach(function (a) {
  alunosTocados[tabela('Cobrancas').filter(function (c) { return c.id === a.cobranca; })[0].aluno] = true;
});
check('reparte pelos dois irmãos', Object.keys(alunosTocados).sort().join(',') === 'B001,B002', alunosTocados);
check('não aloca mais do que o pago',
  alocs2.reduce(function (t, a) { return t + a.valor; }, 0) <= 4000.004);

// ── 6. códigos de famílias diferentes → pede confirmação ─────
var r3 = sms('Recebeu 2,000.00MT de ALGUEM 840000000. Conteudo: B001 M001. Transacao ID PP250104.3333.CCCC');
check('códigos de famílias diferentes esperam o operador', r3.estado === 'a_confirmar', r3);
check('e explicam porquê', linha(r3.id).motivo.indexOf('famílias diferentes') > 0, linha(r3.id).motivo);

// ── 7. nível 2: sem código, telefone conhecido ───────────────
var r4 = sms('Recebeu 1,200.00MT de PEDRO NHACA 849998887. Transacao ID PP250105.4444.DDDD');
check('reconhecido pelo telefone fica a confirmar', r4.estado === 'a_confirmar', r4);
check('já propõe a família certa', linha(r4.id).encarregado === pedro.codigo, linha(r4.id));
check('não criou recibo nenhum', !linha(r4.id).recibo, linha(r4.id));
var conf = post({ action: 'emolaConfirmar', token: T, id: r4.id });
check('o operador confirma e sai o recibo', conf.ok && conf.recibo.numero_recibo, conf);
check('a linha fica fechada', linha(r4.id).estado === 'registado' && linha(r4.id).recibo === conf.recibo.numero_recibo);
check('confirmar duas vezes é recusado',
  post({ action: 'emolaConfirmar', token: T, id: r4.id }).code === 'validacao');

// ── 8. nível 3: nada se reconhece ────────────────────────────
var r5 = sms('Recebeu 300MT de DESCONHECIDO 820001111. Transacao ID PP250106.5555.EEEE');
check('sem código e sem telefone conhecido fica por ligar', r5.estado === 'sem_familia', r5);
check('mas o SMS está guardado por inteiro', linha(r5.id).texto.indexOf('DESCONHECIDO') > 0);
var conf5 = post({ action: 'emolaConfirmar', token: T, id: r5.id, encarregado: maria.codigo });
check('o operador escolhe a família e regista', conf5.ok && conf5.recibo.valor === 300, conf5);

// aluno sem responsável financeiro
var r6 = sms('Recebeu 900MT de X 820002222. Conteudo: ' + orfao.codigo + '. Transacao ID PP250107.6666.FFFF');
check('aluno sem responsável financeiro fica por ligar', r6.estado === 'sem_familia', r6);
check('e diz exactamente porquê', linha(r6.id).motivo.indexOf('responsável financeiro') > 0, linha(r6.id).motivo);

// ── 9. SMS que não se percebem: guardam-se na mesma ──────────
var lixo = sms('Promocao Movitel: ganhe megas gratis!');
check('SMS sem valor fica por ler', lixo.estado === 'por_ler', lixo);
check('e explica o que faltou', linha(lixo.id).motivo.indexOf('valor') > 0, linha(lixo.id).motivo);
var semId = sms('Recebeu 1,000.00MT de MARIA COSSA 841234567. Conteudo: B001.');
check('SMS sem ID de transacção fica por ler', semId.estado === 'por_ler', semId);
check('e não vira recibo', !linha(semId.id).recibo);
check('confirmar um SMS sem ID é recusado',
  post({ action: 'emolaConfirmar', token: T, id: semId.id, encarregado: maria.codigo }).code === 'validacao');
var contagem = tabela('Pagamentos_eMola').length;
check('todos os SMS ficaram guardados', contagem >= 10, contagem);
check('nenhuma linha ficou sem o texto original',
  !tabela('Pagamentos_eMola').some(function (p) { return !p.texto; }));

// ── 10. remetente desconhecido não vira pagamento ────────────
var falso = sms('Recebeu 99,000.00MT de LADRAO 820009999. Conteudo: B001. Transacao ID PP250108.7777.GGGG', '849990000');
check('SMS de outro número é posto de lado', falso.estado === 'ignorado', falso);
check('e diz que o remetente é desconhecido', linha(falso.id).motivo.indexOf('Remetente desconhecido') === 0, linha(falso.id).motivo);
check('não criou recibo', tabela('Recebimentos').filter(function (r) { return r.referencia_externa === 'PP250108.7777.GGGG'; }).length === 0);
check('o remetente verdadeiro é aceite em maiúsculas ou com traço',
  ctx.remetenteConhecido_('E-MOLA') && ctx.remetenteConhecido_('eMola') && !ctx.remetenteConhecido_('841111111'));

// ── 11. voltar a tentar depois de corrigir o cadastro ────────
var semLigacao = sms('Recebeu 600MT de NOVA MAE 845550000. Transacao ID PP250109.8888.HHHH');
check('ainda sem família', semLigacao.estado === 'sem_familia');
var nova = save('Encarregados', { nome_completo: 'Nova Mae', telefone_1: '845550000' }, true).record;
save('AlunoEncarregado', { aluno: rosa.codigo, encarregado: nova.codigo, responsavel_financeiro: 'sim' }, true, true);
var re = post({ action: 'emolaReprocessar', token: T, id: semLigacao.id });
check('depois de ligar o telefone, reconhece a família', re.estado === 'a_confirmar', re);
check('e propõe a família nova', linha(semLigacao.id).encarregado === nova.codigo);
check('não se reprocessa o que já está fechado',
  post({ action: 'emolaReprocessar', token: T, id: r1.id }).code === 'validacao');

// ── 12. pôr de lado ──────────────────────────────────────────
check('ignorar exige motivo', post({ action: 'emolaIgnorar', token: T, id: lixo.id }).code === 'validacao');
var ig = post({ action: 'emolaIgnorar', token: T, id: lixo.id, motivo: 'Publicidade' });
check('posto de lado com motivo', ig.ok && ig.pagamento.estado === 'ignorado' && ig.pagamento.motivo === 'Publicidade');
check('não se ignora o que já deu recibo',
  post({ action: 'emolaIgnorar', token: T, id: r1.id, motivo: 'x' }).code === 'validacao');

// ── 13. fila de SMS a sair ───────────────────────────────────
var pend = post({ action: 'smsPendentes', chave: CH });
check('os recibos da e-Mola entram na fila de SMS', pend.ok && pend.mensagens.length >= 3, pend.mensagens.length);
check('a mensagem leva telefone e texto',
  pend.mensagens[0].telefone && pend.mensagens[0].texto.indexOf('Recibo') > 0, pend.mensagens[0]);
check('a fila precisa da chave', post({ action: 'smsPendentes' }).code === 'chave');
var env1 = post({ action: 'smsEnviado', chave: CH, id: pend.mensagens[0].id });
check('marcar como enviada', env1.ok && env1.estado === 'enviada');
var pend2 = post({ action: 'smsPendentes', chave: CH });
check('a enviada sai da fila', pend2.mensagens.length === pend.mensagens.length - 1, pend2.mensagens.length);
var errada = post({ action: 'smsEnviado', chave: CH, id: pend2.mensagens[0].id, erro: 'sem saldo' });
check('um erro de envio fica marcado', errada.estado === 'erro');

// ── 14. permissões e sincronização ───────────────────────────
env.__tokenInfo.tokO2 = { aud: 'CID', email: 'op@escola.org', email_verified: 'true' };
var TO = post({ action: 'login', idToken: 'tokO2' }).token;
var r7 = sms('Recebeu 1,000.00MT de PEDRO NHACA 849998887. Transacao ID PP250110.9999.IIII');
check('o operador pode confirmar um pagamento e-Mola',
  post({ action: 'emolaConfirmar', token: TO, id: r7.id }).ok);
check('Pagamentos_eMola fora do save genérico',
  post({ action: 'save', token: T, table: 'Pagamentos_eMola', record: { id: 'EM00001', valor: 1 } }).code === 'tabela');
var b = post({ action: 'bootstrap', token: T });
check('a fila da e-Mola chega à app', b.data.Pagamentos_eMola.length >= 10);
check('e é sincronizada aos pedaços',
  post({ action: 'bootstrap', token: T, desde: { Pagamentos_eMola: '2099-01-01 00:00:00' } }).data.Pagamentos_eMola.length === 0);

// ── 15. as contas continuam a fechar ─────────────────────────
var cobs = tabela('Cobrancas'), recs = tabela('Recebimentos'), alocs = tabela('Alocacoes');
var validos = {};
recs.forEach(function (r) { if (r.estado !== 'anulado') validos[r.numero_recibo] = true; });
var porCob = {};
alocs.forEach(function (a) { if (validos[a.recebimento]) porCob[a.cobranca] = (porCob[a.cobranca] || 0) + a.valor; });
var mau = cobs.filter(function (c) {
  var al = porCob[c.id] || 0;
  if (c.estado === 'anulada') return al > 0;
  if (c.valor_liquido <= 0) return c.estado !== 'paga';
  if (al <= 0) return c.estado !== 'aberta';
  return al + 0.004 >= c.valor_liquido ? c.estado !== 'paga' : c.estado !== 'parcial';
});
check('estado de todas as cobranças bate com as alocações', mau.length === 0, mau.slice(0, 3));
check('nenhuma cobrança recebeu a mais',
  !cobs.some(function (c) { return (porCob[c.id] || 0) > c.valor_liquido + 0.004; }));
var porRec = {};
alocs.forEach(function (a) { porRec[a.recebimento] = (porRec[a.recebimento] || 0) + a.valor; });
check('nenhum recibo alocou mais do que recebeu',
  !recs.some(function (r) { return (porRec[r.numero_recibo] || 0) > r.valor + 0.004; }));
var refs = recs.filter(function (r) { return r.referencia_externa && r.estado !== 'anulado'; })
  .map(function (r) { return r.referencia_externa; });
check('cada ID de transacção dá um só recibo válido',
  refs.length === refs.filter(function (v, i) { return refs.indexOf(v) === i; }).length, refs);
var regs = tabela('Pagamentos_eMola').filter(function (p) { return p.estado === 'registado'; });
check('todo o pagamento registado tem recibo', regs.every(function (p) { return !!p.recibo; }));
check('todo o pagamento não registado não tem recibo',
  tabela('Pagamentos_eMola').filter(function (p) { return p.estado !== 'registado' && p.estado !== 'repetido'; })
    .every(function (p) { return !p.recibo; }));

console.log(ok + ' ok, ' + ko + ' falliti');
process.exit(ko ? 1 : 0);
