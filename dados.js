/* VIZIO · Gerenciador de Financiamento — Instância da Sarah (modo SUPABASE)
   Login real (e-mail + senha) e dados na nuvem. Os arrays começam vazios:
   os dados são carregados do Supabase após o login (tabelas fin_*). */
const DADOS = {
  _meta: { produto: "Gerenciador de Financiamento", imovel: "Meu Apê 203 — Dom Pedro I", fonte: "Supabase", gerado: "23/06/2026" },
  _cfg: {
    produto: "Gerenciador de Financiamento",
    instancia: "Meu Apê 203 — Dom Pedro I",
    propLabel: "Proprietária",
    supabaseUrl: "https://emyjzjadmxgbtmxnzazu.supabase.co",
    supabaseKey: "sb_publishable_PY2YDxUzGgaXRVtvCcasBA_Ml7YUBTC",
    assinaturaUrl: "https://buy.stripe.com/6oUdRbafr8nKfMgfP1eIw00"
  },
  resumo: { entradaPago:0, entradaPrev:0, entradaPct:0, docPago:0, docPrev:0, docPct:0, jurosPago:0, jurosPrev:0, jurosPct:0, finSaldo:0, totalInvestido:0, custoTotal:0, faltaPagar:0 },
  finMeta: { saldoInicial:188694.70, jurosMensal:0.0058, totalPago:0, saldoAtual:188694.70, parcelasPagas:0, parcelasRestantes:420, pctQuitado:0 },
  sim: { aporteExtra:200, aporteUnico:0, juros:0.0058, parcela:1543.70, saldo:188694.70, mesesBase:420, mesesSim:264, jurosBase:315663, jurosSim:179760, totalBase:648000, totalSim:467000 },
  entrada: [],
  doc: [],
  juros: [],
  fin: [],
  desembolso: []
};
