// Collaudo delle regole della fase 2: node test/fase2.test.js
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
function save(table, record, isNew, force) { return post({ action: 'save', token: T, table: table, record: record, isNew: isNew, force: force }); }
function tabela(n) { return post({ action: 'bootstrap', token: T }).data[n]; }
var HOJE = ctx.today_();

// ── preparação: preços 2027 em Barrane e Macupula ───────────
var ANO = tabela('AnosLetivos')[0].ano;
check('ano activo é 2027', ANO === 2027, ANO);
save('TabelaPrecos', { ano: ANO, escola: 'B', tipo_cobranca: 'MATRICULA', valor: 1000, dia_vencimento: 10 }, true);
save('TabelaPrecos', { ano: ANO, escola: 'B', tipo_cobranca: 'MENSALIDADE', valor: 1500, dia_vencimento: 10 }, true);
save('TabelaPrecos', { ano: ANO, escola: 'C', tipo_cobranca: 'MATRICULA', valor: 800, dia_vencimento: 5 }, true);
save('TabelaPrecos', { ano: ANO, escola: 'C', tipo_cobranca: 'MENSALIDADE', valor: 1200, dia_vencimento: 5 }, true);

// ── 1. inscrição gera matrícula + mensalidades ──────────────
var a1 = save('Alunos', { nome_completo: 'Ana Cossa', escola: 'B', data_entrada: ANO + '-02-01' }, true);
check('aluno B001 criado', a1.ok && a1.record.codigo === 'B001', a1);
var cobA = tabela('Cobrancas').filter(function (c) { return c.aluno === 'B001'; });
check('11 cobranças na inscrição (1 matrícula + 10 meses)', cobA.length === 11, cobA.length);
check('cobranças devolvidas no changed', (a1.changed || []).length === 11, (a1.changed || []).length);
var mat = cobA.filter(function (c) { return c.tipo_cobranca === 'MATRICULA'; })[0];
check('matrícula 1000 MT, vence na entrada', mat && mat.valor_liquido === 1000 && mat.data_vencimento === ANO + '-02-01', mat);
var fev = cobA.filter(function (c) { return c.mes_referencia === ANO + '-02' && c.tipo_cobranca === 'MENSALIDADE'; })[0];
check('mensalidade Fevereiro 1500, vence dia 10', fev && fev.valor_liquido === 1500 && fev.data_vencimento === ANO + '-02-10', fev);
check('descrição em português', fev && fev.descricao === 'Mensalidade de Fevereiro ' + ANO, fev && fev.descricao);
check('estado inicial aberta', cobA.every(function (c) { return c.estado === 'aberta'; }));
check('ids CB00001…', cobA[0].id === 'CB00001' && cobA[10].id === 'CB00011', [cobA[0].id, cobA[10].id]);

// ── 2. entrada a meio do ano ────────────────────────────────
var a2 = save('Alunos', { nome_completo: 'Beto Sitoe', escola: 'C', data_entrada: ANO + '-05-20' }, true);
var cobB = tabela('Cobrancas').filter(function (c) { return c.aluno === a2.record.codigo; });
check('entrada em Maio: matrícula + 7 mensalidades', cobB.length === 8, cobB.length);
check('nada antes de Maio', cobB.every(function (c) { return c.mes_referencia >= ANO + '-05'; }), cobB.map(function (c) { return c.mes_referencia; }));
check('matrícula de Maio vence na entrada', cobB.filter(function (c) { return c.tipo_cobranca === 'MATRICULA'; })[0].data_vencimento === ANO + '-05-20');

// ── 3. descontos aplicados à geração ────────────────────────
var a3 = save('Alunos', { nome_completo: 'Carla Novo', escola: 'B' }, true);
var C3 = a3.record.codigo;
check('sem data de entrada começa no 1.º mês', tabela('Cobrancas').filter(function (c) { return c.aluno === C3; }).length === 11);
var a4 = save('Alunos', { nome_completo: 'Dino Irmao', escola: 'B', estado: 'transferido' }, true);
check('aluno não activo não gera cobranças', tabela('Cobrancas').filter(function (c) { return c.aluno === a4.record.codigo; }).length === 0);

save('Descontos', { aluno: C3, tipo_cobranca: 'MENSALIDADE', modo: 'percentagem', valor: 50,
  mes_de: 2, mes_ate: 11, motivo: 'Irmãos' }, true);
// o desconto só toca cobranças novas: apagamos e geramos de novo com outro aluno
var a5 = save('Alunos', { nome_completo: 'Elsa Mucavel', escola: 'B' }, true);
var C5 = a5.record.codigo;
save('Descontos', { aluno: C5, tipo_cobranca: 'MENSALIDADE', modo: 'percentagem', valor: 50, mes_de: 2, mes_ate: 11, motivo: 'Irmãos' }, true);
var a6 = save('Alunos', { nome_completo: 'Fabio Chissano', escola: 'B' }, true);
var C6 = a6.record.codigo;
save('Descontos', { aluno: C6, tipo_cobranca: 'TODOS', modo: 'percentagem', valor: 100, mes_de: 2, mes_ate: 11, motivo: 'Isenção total' }, true);
// geramos para um aluno criado DEPOIS do desconto
var a7 = save('Alunos', { nome_completo: 'Gina Nhaca', escola: 'B' }, true);
var C7 = a7.record.codigo;
save('Descontos', { aluno: C7, tipo_cobranca: 'MENSALIDADE', modo: 'valor', valor: 500, mes_de: 2, mes_ate: 3, motivo: 'Bolsa' }, true);

// aluno novo com desconto já registado: usamos o C6 (isenção) criando o desconto antes
var a8 = save('Alunos', { nome_completo: 'Hugo Zefanias', escola: 'B', estado: 'transferido' }, true);
var C8 = a8.record.codigo;
save('Descontos', { aluno: C8, tipo_cobranca: 'MENSALIDADE', modo: 'percentagem', valor: 50, mes_de: 2, mes_ate: 11, motivo: 'Irmãos' }, true);
var g8 = save('Alunos', { codigo: C8, escola: 'B', nome_completo: 'Hugo Zefanias', estado: 'ativo' }, false);
check('reactivar não gera sozinho', tabela('Cobrancas').filter(function (c) { return c.aluno === C8; }).length === 0, g8);
var ger = post({ action: 'gerarCobrancas', token: T, ano: ANO, confirmar: false });
check('simulação não escreve nada', ger.ok && ger.simulacao && tabela('Cobrancas').filter(function (c) { return c.aluno === C8; }).length === 0, ger);
check('simulação conta as 11 em falta', ger.total === 11, ger.total);
var ger2 = post({ action: 'gerarCobrancas', token: T, ano: ANO, confirmar: true });
check('geração cria 11', ger2.criadas === 11, ger2);
var cob8 = tabela('Cobrancas').filter(function (c) { return c.aluno === C8; });
var m8 = cob8.filter(function (c) { return c.tipo_cobranca === 'MENSALIDADE'; })[0];
check('desconto 50% na mensalidade', m8 && m8.valor_bruto === 1500 && m8.valor_desconto === 750 && m8.valor_liquido === 750, m8);
check('matrícula sem desconto', cob8.filter(function (c) { return c.tipo_cobranca === 'MATRICULA'; })[0].valor_liquido === 1000);
check('geração repetida não duplica', post({ action: 'gerarCobrancas', token: T, ano: ANO, confirmar: true }).criadas === 0);

// isenção total: cobrança a zero, já paga
var a9 = save('Alunos', { nome_completo: 'Iris Macuacua', escola: 'B', estado: 'transferido' }, true);
var C9 = a9.record.codigo;
save('Descontos', { aluno: C9, tipo_cobranca: 'TODOS', modo: 'percentagem', valor: 100, mes_de: 2, mes_ate: 11, motivo: 'Isenção total' }, true);
save('Alunos', { codigo: C9, nome_completo: 'Iris Macuacua', escola: 'B', estado: 'ativo' }, false);
post({ action: 'gerarCobrancas', token: T, ano: ANO, confirmar: true });
var cob9 = tabela('Cobrancas').filter(function (c) { return c.aluno === C9; });
check('isenção total: líquido 0 e estado paga', cob9.length === 11 && cob9.every(function (c) { return c.valor_liquido === 0 && c.estado === 'paga'; }), cob9[0]);

// desconto de valor fixo só em 2 meses
var a10 = save('Alunos', { nome_completo: 'Joana Bila', escola: 'B', estado: 'transferido' }, true);
var C10 = a10.record.codigo;
save('Descontos', { aluno: C10, tipo_cobranca: 'MENSALIDADE', modo: 'valor', valor: 500, mes_de: 2, mes_ate: 3, motivo: 'Bolsa' }, true);
save('Alunos', { codigo: C10, nome_completo: 'Joana Bila', escola: 'B', estado: 'ativo' }, false);
post({ action: 'gerarCobrancas', token: T, ano: ANO, confirmar: true });
var cob10 = tabela('Cobrancas').filter(function (c) { return c.aluno === C10 && c.tipo_cobranca === 'MENSALIDADE'; });
function mes(l, m) { return l.filter(function (c) { return c.mes_referencia === ANO + '-' + m; })[0]; }
check('desconto fixo em Fevereiro', mes(cob10, '02').valor_liquido === 1000, mes(cob10, '02'));
check('sem desconto em Abril', mes(cob10, '04').valor_liquido === 1500, mes(cob10, '04'));

// ── 4. preços em falta ──────────────────────────────────────
var aM = save('Alunos', { nome_completo: 'Kito Sem Preco', escola: 'M' }, true);
check('escola sem preço não gera', tabela('Cobrancas').filter(function (c) { return c.aluno === aM.record.codigo; }).length === 0);
var gerM = post({ action: 'gerarCobrancas', token: T, ano: ANO, confirmar: false });
check('simulação avisa dos preços em falta', gerM.precos_em_falta.length === 2 &&
  gerM.precos_em_falta.every(function (x) { return x.escola === 'M'; }), gerM.precos_em_falta);

// ── 5. encarregado e recebimentos ───────────────────────────
var e1 = save('Encarregados', { nome_completo: 'Maria Cossa', telefone_1: '841234567' }, true).record;
save('AlunoEncarregado', { aluno: 'B001', encarregado: e1.codigo, parentesco: 'Mãe', responsavel_financeiro: 'sim', contacto_principal: 'sim' }, true);
save('AlunoEncarregado', { aluno: C3, encarregado: e1.codigo, parentesco: 'Mãe' }, true);
var outro = save('Encarregados', { nome_completo: 'Zacarias Outro', telefone_1: '849998887' }, true).record;

function cobsDe(cod) {
  return tabela('Cobrancas').filter(function (c) { return c.aluno === cod; })
    .sort(function (a, b) { return a.data_vencimento < b.data_vencimento ? -1 : 1; });
}
var dividas = cobsDe('B001');
var matB = dividas.filter(function (c) { return c.tipo_cobranca === 'MATRICULA'; })[0];

function receber(p) { return post(Object.assign({ action: 'receber', token: T }, p)); }

var r1 = receber({ encarregado: e1.codigo, aluno: 'B001', valor: 400, metodo: 'numerario', conta: 'CX_COMUM',
  data: HOJE, alocacoes: [{ cobranca: matB.id, valor: 400 }] });
check('recibo REC-2027-00001', r1.ok && r1.recibo.numero_recibo === 'REC-' + ANO + '-00001', r1);
check('pagamento parcial deixa parcial', r1.cobrancas[0].estado === 'parcial', r1.cobrancas);
check('alocação AL00001', r1.alocacoes[0].id === 'AL00001' && r1.alocacoes[0].valor === 400, r1.alocacoes);
check('sem crédito', r1.credito === 0, r1.credito);

var r2 = receber({ encarregado: e1.codigo, valor: 600, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE,
  alocacoes: [{ cobranca: matB.id, valor: 600 }] });
check('completa a matrícula', r2.cobrancas[0].estado === 'paga', r2.cobrancas);
check('numeração continua', r2.recibo.numero_recibo === 'REC-' + ANO + '-00002');

var over = receber({ encarregado: e1.codigo, valor: 100, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE,
  alocacoes: [{ cobranca: matB.id, valor: 100 }] });
check('cobrança já paga recusa mais alocação', over.code === 'validacao', over);

var alheia = receber({ encarregado: outro.codigo, valor: 100, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE,
  alocacoes: [{ cobranca: dividas[1].id, valor: 100 }] });
check('cobrança de outra família recusada', alheia.code === 'validacao', alheia);

var demais = receber({ encarregado: e1.codigo, valor: 100, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE,
  alocacoes: [{ cobranca: dividas[1].id, valor: 150 }] });
check('alocações acima do pago recusadas', demais.code === 'validacao', demais);

var cred = receber({ encarregado: e1.codigo, valor: 2000, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE,
  alocacoes: [{ cobranca: dividas[1].id, valor: 1500 }] });
check('sobra vira crédito', cred.ok && cred.credito === 500, cred);

check('valor zero recusado', receber({ encarregado: e1.codigo, valor: 0, metodo: 'numerario', conta: 'CX_COMUM' }).code === 'validacao');
check('método inválido recusado', receber({ encarregado: e1.codigo, valor: 10, metodo: 'cheque', conta: 'CX_COMUM' }).code === 'validacao');
check('data futura recusada', receber({ encarregado: e1.codigo, valor: 10, metodo: 'numerario', conta: 'CX_COMUM', data: '2099-01-01' }).code === 'validacao');
check('e-Mola sem referência recusada', receber({ encarregado: e1.codigo, valor: 10, metodo: 'emola', conta: 'EMOLA' }).code === 'validacao');
check('sem alocações nem categoria recusado', receber({ encarregado: outro.codigo, valor: 10, metodo: 'numerario', conta: 'CX_COMUM' }).code === 'validacao');
var doa = receber({ encarregado: outro.codigo, valor: 5000, metodo: 'numerario', conta: 'CX_COMUM', categoria: 'REC_OUT', observacao: 'Donativo' });
check('entrada sem alunos com categoria', doa.ok && doa.credito === 5000, doa);

// e-Mola: referência única
var em1 = receber({ encarregado: e1.codigo, aluno: 'B001', valor: 300, metodo: 'emola', conta: 'EMOLA',
  referencia_externa: 'PP24010.1234.A5678', data: HOJE, alocacoes: [{ cobranca: dividas[2].id, valor: 300 }] });
check('e-Mola com referência aceite', em1.ok, em1);
var em2 = receber({ encarregado: e1.codigo, valor: 300, metodo: 'emola', conta: 'EMOLA',
  referencia_externa: 'PP24010.1234.A5678', data: HOJE, categoria: 'REC_OUT' });
check('referência repetida recusada', em2.code === 'duplicado', em2);

// fila offline: o mesmo ref_cliente não cria dois recibos
var off = { encarregado: e1.codigo, valor: 200, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE,
  ref_cliente: 'tel-abc-1', alocacoes: [{ cobranca: dividas[3].id, valor: 200 }] };
var o1 = receber(off), o2 = receber(off);
check('reenvio da fila devolve o mesmo recibo', o1.ok && o2.ok && o2.repetido &&
  o1.recibo.numero_recibo === o2.recibo.numero_recibo, [o1.recibo && o1.recibo.numero_recibo, o2.recibo && o2.recibo.numero_recibo]);
check('reenvio não duplica alocações', tabela('Alocacoes').filter(function (a) { return a.recebimento === o1.recibo.numero_recibo; }).length === 1);

// ── 6. anulações ────────────────────────────────────────────
var an = post({ action: 'anularRecebimento', token: T, numero: r1.recibo.numero_recibo, motivo: 'Erro de digitação' });
check('anulação exige motivo', post({ action: 'anularRecebimento', token: T, numero: r2.recibo.numero_recibo }).code === 'validacao');
check('recibo anulado', an.ok && an.recibo.estado === 'anulado', an);
check('cobrança volta a parcial', an.cobrancas[0].estado === 'parcial', an.cobrancas);
check('anular duas vezes recusado', post({ action: 'anularRecebimento', token: T, numero: r1.recibo.numero_recibo, motivo: 'x' }).code === 'validacao');
check('o número do recibo não se reutiliza', receber({ encarregado: e1.codigo, valor: 50, metodo: 'numerario',
  conta: 'CX_COMUM', data: HOJE, categoria: 'REC_OUT' }).recibo.numero_recibo > r2.recibo.numero_recibo);

check('cobrança com pagamento não se anula', post({ action: 'anularCobranca', token: T, id: matB.id, motivo: 'x' }).code === 'validacao');
var semPag = cobsDe('B001').filter(function (c) { return c.estado === 'aberta'; })[0];
var ac = post({ action: 'anularCobranca', token: T, id: semPag.id, motivo: 'Cobrada por engano' });
check('cobrança sem pagamento anula-se', ac.ok && ac.cobranca.estado === 'anulada', ac);
check('cobrança anulada não aceita pagamento', receber({ encarregado: e1.codigo, valor: 10, metodo: 'numerario',
  conta: 'CX_COMUM', data: HOJE, alocacoes: [{ cobranca: semPag.id, valor: 10 }] }).code === 'validacao');

// ── 7. saída do aluno ───────────────────────────────────────
var antes10 = cobsDe(C10).filter(function (c) { return c.estado === 'aberta'; }).length;
var sai = save('Alunos', { codigo: C10, nome_completo: 'Joana Bila', escola: 'B', estado: 'desistente',
  data_saida: ANO + '-06-30' }, false, true);
var dep10 = cobsDe(C10);
check('saída anula as futuras em aberto', dep10.filter(function (c) { return c.estado === 'anulada'; }).length === antes10, dep10.map(function (c) { return c.estado; }));
check('motivo da anulação registado', dep10.filter(function (c) { return c.estado === 'anulada'; })[0].motivo_anulacao === 'Aluno desistente');
check('aluno que saiu não entra em novas gerações', post({ action: 'gerarCobrancas', token: T, ano: ANO, confirmar: true }).criadas === 0);

// ── 8. preço alterado a meio do ano ─────────────────────────
var precoC = tabela('TabelaPrecos').filter(function (p) { return p.escola === 'C' && p.tipo_cobranca === 'MENSALIDADE'; })[0];
save('TabelaPrecos', Object.assign({}, precoC, { valor: 1400 }), false);
var rc = post({ action: 'recalcularCobrancas', token: T, ano: ANO, escola: 'C', tipo: 'MENSALIDADE', confirmar: false });
check('simulação do recálculo', rc.ok && rc.simulacao && rc.total === 7, rc);
var rc2 = post({ action: 'recalcularCobrancas', token: T, ano: ANO, escola: 'C', tipo: 'MENSALIDADE', confirmar: true });
check('recálculo aplicado', rc2.alteradas === 7, rc2);
check('mensalidade de Macupula passa a 1400', cobsDe(a2.record.codigo).filter(function (c) { return c.tipo_cobranca === 'MENSALIDADE'; })[0].valor_liquido === 1400);

// pago não muda
var pagoAntes = matB.valor_liquido;
save('TabelaPrecos', Object.assign({}, tabela('TabelaPrecos').filter(function (p) { return p.escola === 'B' && p.tipo_cobranca === 'MATRICULA'; })[0], { valor: 1200 }), false);
post({ action: 'recalcularCobrancas', token: T, ano: ANO, escola: 'B', tipo: 'MATRICULA', confirmar: true });
check('cobrança com pagamento não se recalcula',
  tabela('Cobrancas').filter(function (c) { return c.id === matB.id; })[0].valor_liquido === pagoAntes);

// ── 9. multas ───────────────────────────────────────────────
save('AnosLetivos', { ano: 2026, mes_inicio: 2, mes_fim: 11, ativo: 'não' }, true);
save('TabelaPrecos', { ano: 2026, escola: 'B', tipo_cobranca: 'MENSALIDADE', valor: 1000, dia_vencimento: 10 }, true);
save('TabelaPrecos', { ano: 2026, escola: 'B', tipo_cobranca: 'MATRICULA', valor: 500, dia_vencimento: 10 }, true);
var velho = save('Alunos', { nome_completo: 'Lara Antiga', escola: 'B', data_entrada: '2026-02-01' }, true).record;
post({ action: 'gerarCobrancas', token: T, ano: 2026, confirmar: true });
var cobV = tabela('Cobrancas').filter(function (c) { return c.aluno === velho.codigo && c.ano === 2026; });
check('geração de um ano não activo', cobV.length === 11, cobV.length);
check('o aluno também tem as cobranças do ano activo',
  tabela('Cobrancas').filter(function (c) { return c.aluno === velho.codigo && c.ano === ANO; }).length === 11);
check('multas desligadas não fazem nada', post({ action: 'aplicarMultas', token: T, ano: 2026, confirmar: true }).aplicadas === 0);
save('RegrasMulta', { ano: 2026, escola: 'REDE', dias_tolerancia: 15, modo: 'percentagem', valor: 10, ativa: 'sim' }, true);
var mu = post({ action: 'aplicarMultas', token: T, ano: 2026, confirmar: false });
// Contar com um número à mão tornava a prova dependente do dia de hoje:
// o que tem de bater é a regra — vencida há mais dias do que a tolerância.
var deviamLevar = tabela('Cobrancas').filter(function (c) {
  return String(c.ano) === '2026' && ['aberta', 'parcial'].indexOf(c.estado) >= 0 &&
    Number(c.valor_multa) === 0 && ctx.somaDias_(c.data_vencimento, 15) < HOJE;
}).length;
check('a simulação conta exactamente as que passaram a tolerância',
  mu.aplicadas === deviamLevar && deviamLevar > 0, [mu.aplicadas, deviamLevar]);
check('e deixa de fora as que ainda não venceram',
  tabela('Cobrancas').some(function (c) {
    return String(c.ano) === '2026' && ctx.somaDias_(c.data_vencimento, 15) >= HOJE;
  }));
var mu2 = post({ action: 'aplicarMultas', token: T, ano: 2026, confirmar: true });
check('multas aplicadas', mu2.aplicadas === mu.aplicadas, mu2);
var comMulta = tabela('Cobrancas').filter(function (c) {
  return c.aluno === velho.codigo && c.ano === 2026 && c.tipo_cobranca === 'MENSALIDADE' && c.valor_multa > 0;
})[0];
check('multa 10% soma ao líquido', comMulta && comMulta.valor_multa === 100 && comMulta.valor_liquido === 1100, comMulta);
check('só as vencidas há mais de 15 dias levam multa',
  tabela('Cobrancas').filter(function (c) { return c.ano === 2026 && c.valor_multa > 0; })
    .every(function (c) { return ctx.somaDias_(c.data_vencimento, 15) < HOJE; }));
check('multas não se repetem', post({ action: 'aplicarMultas', token: T, ano: 2026, confirmar: true }).aplicadas === 0);
var rm = post({ action: 'removerMulta', token: T, id: comMulta.id, motivo: 'Pagou atrasado com autorização' });
check('multa retirada à mão', rm.ok && rm.cobranca.valor_multa === 0 && rm.cobranca.valor_liquido === 1000, rm);

// ── 10. recibo: dados e página pública ──────────────────────
var dados = post({ action: 'recibo', token: T, numero: r2.recibo.numero_recibo });
check('dados do recibo', dados.ok && dados.linhas.length === 1 && dados.encarregado.nome_completo === 'Maria Cossa', dados);
check('dívida da família calculada', dados.divida > 0, dados.divida);
var pg = ctx.doGet({ parameter: { recibo: r2.recibo.numero_recibo, k: dados.chave } }).getContent();
check('página do recibo abre com a chave certa', pg.indexOf(r2.recibo.numero_recibo) > 0 && pg.indexOf('Maria Cossa') > 0);
check('chave errada recusada', ctx.doGet({ parameter: { recibo: r2.recibo.numero_recibo, k: 'xxx' } }).getContent().indexOf('inválida') > 0);
check('recibo inexistente', ctx.doGet({ parameter: { recibo: 'REC-2027-99999', k: 'x' } }).getContent().indexOf('não encontrado') > 0);
var pgAn = ctx.doGet({ parameter: { recibo: r1.recibo.numero_recibo, k: ctx.chaveRecibo_(r1.recibo.numero_recibo) } }).getContent();
check('recibo anulado mostra ANULADO', pgAn.indexOf('ANULADO') > 0 && pgAn.indexOf('Erro de digitação') > 0);
check('doGet sem recibo continua a responder JSON', JSON.parse(ctx.doGet({ parameter: {} }).text).ok);

// ── 11. mensagens ───────────────────────────────────────────
var msg = post({ action: 'mensagem', token: T, encarregado: e1.codigo, canal: 'whatsapp',
  texto: 'Recibo ' + r2.recibo.numero_recibo, recibo: r2.recibo.numero_recibo });
check('mensagem registada', msg.ok && msg.mensagem.telefone === '841234567' && msg.mensagem.canal === 'whatsapp', msg);
check('canal inválido recusado', post({ action: 'mensagem', token: T, encarregado: e1.codigo, canal: 'pombo' }).code === 'validacao');

// ── 12. sincronização incremental ───────────────────────────
var full = post({ action: 'bootstrap', token: T });
check('bootstrap traz as folhas da fase 2', full.data.Cobrancas.length > 0 && full.data.Recebimentos.length > 0 && full.data.Alocacoes.length > 0);
check('bootstrap diz qual é o ano activo', full.ano_ativo === ANO, full.ano_ativo);
function desde(m) { return { Cobrancas: m, Recebimentos: m, Alocacoes: m }; }
var futuro = post({ action: 'bootstrap', token: T, desde: desde('2099-01-01 00:00:00') });
check('sem novidades o incremental vem vazio',
  futuro.data.Cobrancas.length === 0 && futuro.data.Recebimentos.length === 0 && futuro.parcial.Cobrancas === true, futuro.data);
check('as folhas pequenas vêm sempre inteiras', futuro.data.Alunos.length === full.data.Alunos.length);
// A app guarda o maior atualizado_em que recebeu e pede a partir daí.
function maxAtual(list) {
  return list.reduce(function (m, r) { return String(r.atualizado_em) > m ? String(r.atualizado_em) : m; }, '');
}
var marca = maxAtual(full.data.Recebimentos);
var novoRec = receber({ encarregado: e1.codigo, valor: 70, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE, categoria: 'REC_OUT' });
var inc2 = post({ action: 'bootstrap', token: T, desde: desde(marca) });
check('incremental traz o recibo novo', inc2.data.Recebimentos.some(function (r) {
  return r.numero_recibo === novoRec.recibo.numero_recibo; }), inc2.data.Recebimentos.length);
check('o incremental não traz nada anterior à marca',
  inc2.data.Recebimentos.every(function (r) { return String(r.atualizado_em) >= marca; }), marca);
check('nada se perde no mesmo segundo da marca',
  full.data.Recebimentos.concat(inc2.data.Recebimentos).filter(function (r, i, l) {
    return l.map(function (x) { return x.numero_recibo; }).indexOf(r.numero_recibo) === i;
  }).length === post({ action: 'bootstrap', token: T }).data.Recebimentos.length);

// ── 13. permissões do operador ──────────────────────────────
save('Utilizadores', { email: 'op@escola.org', nome: 'Operadora', papel: 'operador' }, true);
env.__tokenInfo.tokO = { aud: 'CID', email: 'op@escola.org', email_verified: 'true' };
var TO = post({ action: 'login', idToken: 'tokO' }).token;
var opRec = post({ action: 'receber', token: TO, encarregado: e1.codigo, valor: 100, metodo: 'numerario',
  conta: 'CX_COMUM', data: HOJE, categoria: 'REC_OUT' });
check('operador pode receber', opRec.ok && opRec.recibo.operador === 'op@escola.org', opRec);
check('operador não gera cobranças', post({ action: 'gerarCobrancas', token: TO, ano: ANO, confirmar: true }).code === 'permissao');
check('operador não anula recibos', post({ action: 'anularRecebimento', token: TO, numero: r2.recibo.numero_recibo, motivo: 'x' }).code === 'permissao');
check('operador não anula cobranças', post({ action: 'anularCobranca', token: TO, id: dividas[5].id, motivo: 'x' }).code === 'permissao');
check('operador não recalcula preços', post({ action: 'recalcularCobrancas', token: TO, ano: ANO, confirmar: true }).code === 'permissao');
check('Cobrancas continua fora do save genérico', post({ action: 'save', token: T, table: 'Cobrancas', record: { id: 'CB00001', valor_liquido: 1 } }).code === 'tabela');

// ── 13b. crédito: o adiantamento paga as cobranças seguintes ─
var aK = save('Alunos', { nome_completo: 'Nelia Poupada', escola: 'B' }, true).record;
var eK = save('Encarregados', { nome_completo: 'Paulo Poupado', telefone_1: '843332221' }, true).record;
save('AlunoEncarregado', { aluno: aK.codigo, encarregado: eK.codigo, responsavel_financeiro: 'sim' }, true);
var dK = cobsDe(aK.codigo);
var adiant = receber({ encarregado: eK.codigo, aluno: aK.codigo, valor: 2500, metodo: 'numerario',
  conta: 'CX_COMUM', data: HOJE, alocacoes: [{ cobranca: dK[0].id, valor: 1000 }] });
check('adiantamento deixa crédito', adiant.ok && adiant.credito === 1500 && adiant.sobra === 1500, adiant);

var uc = post({ action: 'usarCredito', token: T, encarregado: eK.codigo,
  alocacoes: [{ cobranca: dK[1].id, valor: 1500 }] });
check('crédito paga a cobrança seguinte', uc.ok && uc.cobrancas[0].estado === 'paga' && uc.credito === 0, uc);
check('alocação do crédito aponta ao recibo antigo',
  uc.alocacoes[0].recebimento === adiant.recibo.numero_recibo, uc.alocacoes);
check('crédito esgotado recusa mais',
  post({ action: 'usarCredito', token: T, encarregado: eK.codigo, alocacoes: [{ cobranca: dK[2].id, valor: 10 }] }).code === 'validacao');
check('crédito não paga cobranças de outra família',
  post({ action: 'usarCredito', token: T, encarregado: eK.codigo, alocacoes: [{ cobranca: dividas[6].id, valor: 10 }] }).code === 'validacao');

// dinheiro novo + crédito na mesma operação
var adiant2 = receber({ encarregado: eK.codigo, valor: 800, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE, categoria: 'REC_OUT' });
check('segundo adiantamento', adiant2.credito === 800, adiant2);
var misto = receber({ encarregado: eK.codigo, valor: 700, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE,
  alocacoes: [{ cobranca: dK[2].id, valor: 700 }], credito: [{ cobranca: dK[2].id, valor: 800 }] });
check('pagamento novo mais crédito fecham a cobrança',
  misto.ok && misto.cobrancas[0].estado === 'paga' && misto.credito === 0, misto);
check('as duas partes geram alocações', misto.alocacoes.length === 2, misto.alocacoes);
// dinheiro e crédito não podem gastar o mesmo saldo da mesma cobrança
var adiant3 = receber({ encarregado: eK.codigo, valor: 400, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE, categoria: 'REC_OUT' });
var dobro = receber({ encarregado: eK.codigo, valor: 1500, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE,
  alocacoes: [{ cobranca: dK[3].id, valor: 1500 }], credito: [{ cobranca: dK[3].id, valor: 100 }] });
check('dinheiro e crédito não gastam o mesmo saldo', dobro.code === 'validacao', dobro);
// e um erro no crédito não pode deixar o recibo gravado
var recAntes = tabela('Recebimentos').length;
var semCredito = receber({ encarregado: eK.codigo, valor: 100, metodo: 'numerario', conta: 'CX_COMUM', data: HOJE,
  alocacoes: [{ cobranca: dK[3].id, valor: 100 }], credito: [{ cobranca: dK[3].id, valor: 9999 }] });
check('crédito insuficiente é recusado', semCredito.code === 'validacao', semCredito);
check('o recibo recusado não fica gravado', tabela('Recebimentos').length === recAntes, [recAntes, tabela('Recebimentos').length]);
check('nem a alocação do recibo recusado',
  tabela('Alocacoes').filter(function (a) { return a.cobranca === dK[3].id; }).length === 0);
check('o crédito da família não se perdeu', ctx.creditoDoEncarregado_(eK.codigo) === 400, ctx.creditoDoEncarregado_(eK.codigo));

// anular o recibo que deu o crédito desfaz o que ele pagou
var anK = post({ action: 'anularRecebimento', token: T, numero: adiant.recibo.numero_recibo, motivo: 'Dinheiro devolvido' });
check('anular desfaz também o que o crédito pagou', anK.ok && anK.cobrancas.length === 2 &&
  anK.cobrancas.every(function (c) { return c.estado === 'aberta'; }), anK.cobrancas);

// ── 14. contabilidade fecha ─────────────────────────────────
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
var sobreAlocada = cobs.filter(function (c) { return (porCob[c.id] || 0) > c.valor_liquido + 0.004; });
check('nenhuma cobrança recebe mais do que deve', sobreAlocada.length === 0, sobreAlocada.slice(0, 3));
var porRec = {};
alocs.forEach(function (a) { porRec[a.recebimento] = (porRec[a.recebimento] || 0) + a.valor; });
var sobrePago = recs.filter(function (r) { return (porRec[r.numero_recibo] || 0) > r.valor + 0.004; });
check('nenhum recibo aloca mais do que recebeu', sobrePago.length === 0, sobrePago.slice(0, 3));
var nums = recs.map(function (r) { return r.numero_recibo; });
check('números de recibo únicos', nums.length === nums.filter(function (v, i) { return nums.indexOf(v) === i; }).length);
var ids = cobs.map(function (c) { return c.id; });
check('ids de cobrança únicos', ids.length === ids.filter(function (v, i) { return ids.indexOf(v) === i; }).length);

// ── 15. actualizar uma instalação da fase 1 ─────────────────
// Quem já tinha a fase 1 volta a correr instalar(): as colunas novas
// têm de aparecer sem tocar nos dados que já lá estão.
(function () {
  var sh = env.__ss.getSheetByName('Recebimentos');
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iRef = head.indexOf('ref_cliente');
  check('ref_cliente existe', iRef >= 0, head);
  var linhas = sh.getLastRow();
  // finge uma folha da fase 1: sem a coluna ref_cliente
  sh.getRange(1, iRef + 1, 1, 1).setValues([['']]);
  ctx._cache = {};
  ctx.instalar();
  var head2 = env.__ss.getSheetByName('Recebimentos').getRange(1, 1, 1, env.__ss.getSheetByName('Recebimentos').getLastColumn()).getValues()[0];
  check('instalar() repõe a coluna em falta', head2.indexOf('ref_cliente') >= 0, head2);
  check('instalar() não mexe nas linhas', env.__ss.getSheetByName('Recebimentos').getLastRow() === linhas);
  var ali = env.__ss.getSheetByName('Alocacoes').getRange(1, 1, 1, env.__ss.getSheetByName('Alocacoes').getLastColumn()).getValues()[0];
  check('Alocacoes tem as colunas de auditoria', ali.indexOf('atualizado_em') >= 0 && ali.indexOf('atualizado_por') >= 0, ali);
})();

console.log(ok + ' ok, ' + ko + ' falliti');
process.exit(ko ? 1 : 0);
