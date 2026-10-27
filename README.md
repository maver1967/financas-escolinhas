# Finanças Escolinhas

Gestão financeira das cinco escolinhas de Maxixe — Barrane, Matadouro,
Nhamaxaxa, Macupula e São Lourenço — em português, feita para funcionar
em telefones com pouca rede.

A app é uma PWA sem servidor próprio: o código está aqui, os dados vivem
num único Google Sheet, e tudo passa por um Google Apps Script.
**Nenhum dado de alunos ou famílias está neste repositório.**

## Como está organizado

| Pasta | O que é |
| --- | --- |
| `app/` | A PWA publicada em GitHub Pages |
| `backend/Code.gs` | O Apps Script ligado ao Google Sheet |
| `test/` | Demonstração e 336 provas automáticas |
| `INSTALACAO.md` | Como instalar, do zero, em cerca de 30 minutos |

## Experimentar sem instalar nada

Com [Node.js](https://nodejs.org):

```
node test/demo.js
```

Abre `http://localhost:8787` com uma rede inteira de mentira: cinco
escolinhas, quinze alunos, mensalidades em atraso, pagamentos, despesas
e SMS da e-Mola. Os dados vivem só na memória e desaparecem ao fechar.

## Provas

```
node test/backend.test.js    # configuração, alunos, encarregados
node test/fase2.test.js      # cobranças, pagamentos, crédito, recibos
node test/fase3.test.js      # despesas, contas, transferências, fecho
node test/fase5.test.js      # leitura dos SMS da e-Mola e ligação
```

Cada uma acaba por refazer as contas de todas as linhas: os saldos e as
dívidas têm de bater com os movimentos, sempre.

## Duas regras que mandam em tudo

- **Saldos e dívidas nunca se guardam.** Calculam-se dos movimentos, no
  servidor e na app, para não haver dois números diferentes do mesmo facto.
- **Nada se apaga.** Anula-se, com motivo, data e operador, e fica em `Auditoria`.

## Instalar

Ver [INSTALACAO.md](INSTALACAO.md).
