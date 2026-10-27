// Demonstração: servidor de prova já com uma rede de escolinhas a funcionar.
//   node test/demo.js   → http://localhost:8787
// Nada é guardado: a folha é falsa e vive só na memória deste processo.
require('./dev_server.js');

var API = 'http://localhost:8787/api';
var T = require('fs').readFileSync(require('path').join(__dirname, '.token'), 'utf8').trim();
function post(o) {
  return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(Object.assign({ token: T }, o)) }).then(function (r) { return r.json(); });
}
function save(t, r, n, f) { return post({ action: 'save', table: t, record: r, isNew: n, force: f }); }

var hoje = new Date();
var HOJE = hoje.toISOString().slice(0, 10);
var ANO = hoje.getFullYear();          // o ano corrente, para haver mensalidades já vencidas

(async function () {
  // ── preços das cinco escolas ───────────────────────────────
  var precos = { B: [1000, 1500], M: [800, 1200], N: [700, 1000], C: [900, 1300], S: [1100, 1600] };
  await save('AnosLetivos', { ano: ANO, mes_inicio: 2, mes_fim: 11, ativo: 'sim' }, true).catch(function () {});
  await save('AnosLetivos', { ano: ANO, mes_inicio: 2, mes_fim: 11, ativo: 'sim' }, false);
  for (var e of Object.keys(precos)) {
    await save('TabelaPrecos', { ano: ANO, escola: e, tipo_cobranca: 'MATRICULA', valor: precos[e][0], dia_vencimento: 10 }, true);
    await save('TabelaPrecos', { ano: ANO, escola: e, tipo_cobranca: 'MENSALIDADE', valor: precos[e][1], dia_vencimento: 10 }, true);
  }
  for (var c of [['DES_ALIM_ARROZ', 'Arroz', 'DES_ALIM'], ['DES_ALIM_OLEO', 'Óleo', 'DES_ALIM'],
                 ['DES_ALIM_PEIXE', 'Peixe', 'DES_ALIM'], ['DES_LIMP_SABAO', 'Sabão', 'DES_LIMP']]) {
    await save('Categorias', { codigo: c[0], nome: c[1], tipo: 'despesa', categoria_pai: c[2] }, true);
  }

  // ── alunos ─────────────────────────────────────────────────
  var turma = [['Ana Maria Cossa', 'B', 'F'], ['João Mabunda', 'B', 'M'], ['Lurdes Tembe', 'B', 'F'],
    ['Zita Come', 'B', 'F'], ['Paulo Chissano', 'M', 'M'], ['Rosa Nhaca', 'M', 'F'],
    ['Belmiro Juma', 'M', 'M'], ['Celso Bila', 'N', 'M'], ['Amélia Macuácua', 'C', 'F'],
    ['Dino Sitoe', 'C', 'M'], ['Fátima Zefanias', 'S', 'F'], ['Hélio Mucavel', 'S', 'M'],
    ['Nelsa Matola', 'S', 'F'], ['Jorge Timana', 'N', 'M']];
  var alunos = [];
  for (var t of turma) {
    alunos.push((await save('Alunos', { nome_completo: t[0], escola: t[1], sexo: t[2], sala: 'Sala A',
      data_entrada: ANO + '-02-01' }, true, true)).record);
  }
  // um entrou a meio do ano: recebe menos mensalidades
  alunos.push((await save('Alunos', { nome_completo: 'Sónia Novo', escola: 'B', sexo: 'F',
    data_entrada: ANO + '-07-01' }, true, true)).record);

  // ── encarregados ───────────────────────────────────────────
  var pais = [['Maria Cossa', '841234567'], ['Carlos Mabunda', '842223334'], ['Rosa Tembe', '843334445'],
    ['Nelson Bila', '844445556'], ['Judite Sitoe', '845556667'], ['Alberto Come', '846667778'],
    ['Teresa Juma', '847778889']];
  var E = [];
  for (var p of pais) {
    E.push((await save('Encarregados', { nome_completo: p[0], telefone_1: p[1], tem_whatsapp: 'sim' }, true, true)).record);
  }
  // Maria tem três educandos: serve para ver a repartição entre irmãos
  for (var i of [0, 2, 3]) {
    await save('AlunoEncarregado', { aluno: alunos[i].codigo, encarregado: E[0].codigo, parentesco: 'Mãe',
      responsavel_financeiro: 'sim', contacto_principal: 'sim' }, true);
  }
  for (var par of [[1, 1], [4, 2], [7, 3], [8, 4], [9, 5], [10, 6], [14, 0]]) {
    await save('AlunoEncarregado', { aluno: alunos[par[0]].codigo, encarregado: E[par[1]].codigo,
      parentesco: 'Pai', responsavel_financeiro: 'sim', contacto_principal: 'sim' }, true);
  }
  // de propósito: três alunos ficam sem responsável financeiro, para o relatório os apanhar

  // ── descontos, antes de gerar ──────────────────────────────
  await save('Descontos', { aluno: alunos[2].codigo, ano: ANO, tipo_cobranca: 'MENSALIDADE',
    modo: 'percentagem', valor: 50, mes_de: 2, mes_ate: 11, motivo: 'Irmãos' }, true);
  await save('Descontos', { aluno: alunos[3].codigo, ano: ANO, tipo_cobranca: 'MENSALIDADE',
    modo: 'percentagem', valor: 50, mes_de: 2, mes_ate: 11, motivo: 'Irmãos' }, true);
  await save('Descontos', { aluno: alunos[9].codigo, ano: ANO, tipo_cobranca: 'TODOS',
    modo: 'percentagem', valor: 100, mes_de: 2, mes_ate: 11, motivo: 'Isenção total' }, true);
  await save('Descontos', { aluno: alunos[12].codigo, ano: ANO, tipo_cobranca: 'MENSALIDADE',
    modo: 'valor', valor: 400, mes_de: 2, mes_ate: 11, motivo: 'Filha de funcionária' }, true);
  await post({ action: 'recalcularCobrancas', ano: ANO, escola: 'TODAS', tipo: 'TODOS', confirmar: true });

  // ── pagamentos: uns em dia, outros a meio, outros nada ─────
  var b = await post({ action: 'bootstrap' });
  function emAberto(codEnc) {
    var filhos = b.data.AlunoEncarregado.filter(function (l) { return l.encarregado === codEnc; })
      .map(function (l) { return l.aluno; });
    return b.data.Cobrancas.filter(function (c) { return filhos.indexOf(c.aluno) >= 0 && c.estado === 'aberta'; })
      .sort(function (x, y) { return x.data_vencimento < y.data_vencimento ? -1 : 1; });
  }
  var plano = [[E[0].codigo, 18000], [E[1].codigo, 9000], [E[2].codigo, 5200],
               [E[3].codigo, 3000], [E[5].codigo, 12000]];
  for (var pl of plano) {
    var cobs = emAberto(pl[0]), resto = pl[1], alocs = [];
    for (var c2 of cobs) {
      if (resto <= 0) break;
      var v = Math.min(resto, c2.valor_liquido);
      if (v > 0) { alocs.push({ cobranca: c2.id, valor: v }); resto = Math.round((resto - v) * 100) / 100; }
    }
    await post({ action: 'receber', encarregado: pl[0], valor: pl[1], metodo: 'numerario',
      conta: 'CX_COMUM', data: HOJE, alocacoes: alocs });
  }
  // um por e-Mola, um adiantamento que fica em crédito e um recibo anulado
  await post({ action: 'receber', encarregado: E[4].codigo, valor: 2600, metodo: 'emola', conta: 'EMOLA',
    referencia_externa: 'PP' + ANO + '10.4455.B991', data: HOJE, alocacoes: emAberto(E[4].codigo).slice(0, 2)
      .map(function (x) { return { cobranca: x.id, valor: x.valor_liquido }; }) });
  await post({ action: 'receber', encarregado: E[6].codigo, valor: 5000, metodo: 'numerario', conta: 'CX_COMUM',
    data: HOJE, categoria: 'REC_OUT', observacao: 'Adiantamento do ano' });
  var errado = await post({ action: 'receber', encarregado: E[1].codigo, valor: 700, metodo: 'numerario',
    conta: 'CX_COMUM', data: HOJE, categoria: 'REC_OUT' });
  if (errado.ok) await post({ action: 'anularRecebimento', numero: errado.recibo.numero_recibo, motivo: 'Valor errado' });

  // ── dinheiro em caixa, despesas e um depósito ──────────────
  var cx = (await post({ action: 'bootstrap' })).data.Contas.filter(function (x) { return x.codigo === 'CX_COMUM'; })[0];
  await save('Contas', Object.assign({}, cx, { saldo_inicial: 12000, data_saldo_inicial: ANO + '-01-01' }), false);
  var gastos = [['4 sacos de arroz', 'DES_ALIM', 'DES_ALIM_ARROZ', 'Loja Maputo', 6400, 'REDE', 'FT 1023'],
    ['Óleo alimentar 20L', 'DES_ALIM', 'DES_ALIM_OLEO', 'Mercado Central', 1800, 'REDE', 'FT 1024'],
    ['Peixe seco', 'DES_ALIM', 'DES_ALIM_PEIXE', 'Mercado do Peixe', 2300, 'REDE', ''],
    ['Sabão e lixívia', 'DES_LIMP', 'DES_LIMP_SABAO', 'Drogaria Central', 950, 'REDE', 'FT 882'],
    ['Electricidade', 'DES_UTIL', '', 'EDM', 2400, 'B', 'EDM-99120'],
    ['Água', 'DES_UTIL', '', 'FIPAG', 800, 'M', ''],
    ['Lenha para a cozinha', 'DES_ALIM', '', 'Vendedor local', 600, 'N', '']];
  for (var g of gastos) {
    await post({ action: 'despesa', data: HOJE, escola: g[5], categoria: g[1], subcategoria: g[2],
      descricao: g[0], fornecedor: g[3], valor: g[4], conta: 'CX_COMUM', metodo: 'numerario',
      numero_documento: g[6], force: true });
  }
  await post({ action: 'transferencia', data: HOJE, conta_origem: 'CX_COMUM', conta_destino: 'CT_B',
    valor: 10000, descricao: 'Depósito do mês', force: true });
  var saldo = (await post({ action: 'saldos' })).saldos.filter(function (s) { return s.codigo === 'CX_COMUM'; })[0].saldo;
  await post({ action: 'fechoCaixa', conta: 'CX_COMUM', data: HOJE, contado: saldo - 150,
    observacao: 'Faltam 150 MT, a procurar' });

  // ── e-Mola: um SMS de cada caso, para ver a fila a funcionar ─
  var chave = (await post({ action: 'emolaChave' })).chave;
  var todos = await post({ action: 'bootstrap' });
  var ana = todos.data.Alunos.filter(function (a) { return a.nome_completo.indexOf('Ana Maria') === 0; })[0];
  var lurdes = todos.data.Alunos.filter(function (a) { return a.nome_completo.indexOf('Lurdes') === 0; })[0];
  var mae = todos.data.Encarregados.filter(function (x) { return x.nome_completo === 'Maria Cossa'; })[0];
  var teresa = todos.data.Encarregados.filter(function (x) { return x.nome_completo === 'Teresa Juma'; })[0];
  function sms(texto, remetente) {
    return post({ action: 'sms', chave: chave, texto: texto, remetente: remetente || 'e-Mola',
      recebido_em: HOJE + ' 08:40:00' });
  }
  await sms('e-Mola: Recebeu 1,500.00MT de MARIA COSSA ' + mae.telefone_1 + '. Conteudo: ' + ana.codigo +
    '. Transacao ID PP' + ANO + '1023.1001.AA11. Saldo: 23,400.00MT');
  await sms('Recebeu 3,000.00MT de MARIA COSSA ' + mae.telefone_1 + '. Conteudo: ' + ana.codigo + ' ' +
    lurdes.codigo + '. Transacao ID PP' + ANO + '1023.1002.BB22');
  await sms('Recebeu 1,200.00MT de TERESA JUMA ' + teresa.telefone_1 + '. Transacao ID PP' + ANO + '1023.1003.CC33');
  await sms('Recebeu 800MT de ANONIMO 820001111. Transacao ID PP' + ANO + '1023.1004.DD44');
  await sms('Movitel: aproveite o novo pacote de megas!');
  await sms('Recebeu 50,000.00MT de LADRAO 820009999. Conteudo: ' + ana.codigo +
    '. Transacao ID PP' + ANO + '1023.1005.EE55', '849990000');

  var f = await post({ action: 'bootstrap' });
  var porTratar = f.data.Pagamentos_eMola.filter(function (x) {
    return ['a_confirmar', 'sem_familia', 'por_ler'].indexOf(x.estado) >= 0;
  }).length;
  console.log('');
  console.log('  Pronto: ' + f.data.Alunos.length + ' alunos, ' + f.data.Cobrancas.length + ' cobranças, ' +
    f.data.Recebimentos.length + ' recibos, ' + f.data.Despesas.length + ' despesas, ' +
    f.data.Pagamentos_eMola.length + ' SMS e-Mola (' + porTratar + ' por tratar).');
  console.log('  Abra  http://localhost:8787  — a sessão já está aberta como administrador.');
  console.log('  Para parar: Ctrl+C.');
  console.log('');
})();
