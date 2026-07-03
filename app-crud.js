/* ===========================================================================
 * Gerenciador de Financiamento by VIZIO — Cadastro/Edição + Config de etapa + Relatórios
 * Edita DADOS diretamente (quitado boolean) e RECALCULA o resumo a cada mudança,
 * então os painéis (HOME/Visão/módulos) refletem o que é incluído.
 * - Configuração da etapa: valor total, forma (à vista/parcelado), nº de parcelas,
 *   parcelas fixas ou com juros (SAC/PRICE no financiamento) + "Gerar parcelas".
 * - Marcar parcela paga abate do total (pago acumulado, falta = total − pago).
 * - Relatório PDF com resumo (pago, falta, %). Grava no Sheets quando API_URL setada.
 * =========================================================================== */
(function(){
"use strict";

var API_URL = "https://script.google.com/macros/s/AKfycbxrOR7LZBG-r5RYLDKNYnUS8axM1le2IuRa8ZrD4zdA-najiCZ-5AwplHnmAFVkW6ZR/exec";

/* ---------- helpers ---------- */
function r2(n){ return Math.round((Number(n)||0)*100)/100; }
function correcaoEntrada(e){ if(!e||e.pago==null||e.pago===""||e.valor==null)return null; return r2(Number(e.pago)-Number(e.valor)); }
function moneyFmt(n){ return (Number(n)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function BRL(v){ return (v==null||v==="")?"—":"R$ "+moneyFmt(v); }
function moneyParse(s){ if(s==null||s==="")return null; s=String(s).replace(/[^\d.,-]/g,""); if(s.indexOf(",")>=0)s=s.replace(/\./g,"").replace(",","."); var n=parseFloat(s); return isNaN(n)?null:n; }
function dBR(s){ if(!s||s==="—")return "—"; var p=String(s).split("-"); return p.length===3?(p[2].slice(0,2)+"/"+p[1]+"/"+p[0]):s; }
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function addMonths(ym,k){ if(!ym)return ""; var p=String(ym).split("-"); var y=+p[0],m=(+p[1]||1)-1+k; y+=Math.floor(m/12); m=((m%12)+12)%12; var d=p[2]||"08"; return y+"-"+String(m+1).padStart(2,"0")+"-"+String(d).padStart(2,"0"); }

/* ---------- módulos: mapeamento id -> array em DADOS ---------- */
var ARR={entrada:"entrada",doc:"doc",obra:"juros",financiamento:"fin"};
function rows(id){ if(!DADOS[ARR[id]]) DADOS[ARR[id]]=[]; return DADOS[ARR[id]]; }
function isPago(e){ return e.quitado===true; }

/* ---------- esquemas (campos do formulário/tabela por módulo) ----------
   tipos: text · number · money · date · check (Pago?) · status (badge, auto) */
var SCHEMAS={
  entrada:{label:"Parcela da entrada",rep:"Entrada Parcelada",hasCfg:true,kind:"etapa",pagoFill:"pago",fields:[
    {k:"parcela",l:"Parcela",t:"text"},{k:"venc",l:"Vencimento",t:"date"},
    {k:"valor",l:"Valor",t:"money"},{k:"pago",l:"Valor pago",t:"money"},
    {k:"reajuste",l:"Reajuste (corrigido)",t:"money",auto:true},{k:"quitado",l:"Pago?",t:"check"},{k:"status",l:"Status",t:"status"}
  ]},
  doc:{label:"Parcela de documentação",rep:"Documentação (RTBI + Cartório)",hasCfg:true,kind:"etapa",fields:[
    {k:"parcela",l:"Parcela",t:"number"},{k:"rtbi",l:"RTBI",t:"money"},{k:"cartorio",l:"Cartório",t:"money"},
    {k:"total",l:"Total",t:"money"},{k:"quitado",l:"Pago?",t:"check"},{k:"status",l:"Status",t:"status"}
  ]},
  obra:{label:"Parcela de juros de obra",rep:"Juros de Obra",hasCfg:true,kind:"obra",fields:[
    {k:"parcela",l:"Parcela",t:"number"},{k:"venc",l:"Vencimento",t:"date"},{k:"valor",l:"Valor",t:"money"},
    {k:"evolucao",l:"Evolução da obra",t:"text"},{k:"quitado",l:"Pago?",t:"check"},{k:"status",l:"Status",t:"status"}
  ]},
  financiamento:{label:"Parcela do financiamento",rep:"Financiamento",hasCfg:true,kind:"fin",pagoFill:"pago",fields:[
    {k:"parcela",l:"Parcela",t:"number"},{k:"mes",l:"Mês",t:"date"},{k:"valor",l:"Parcela (devida)",t:"money"},
    {k:"pago",l:"Valor pago",t:"money"},{k:"reajuste",l:"Diferença (corrigida)",t:"money",auto:true},
    {k:"amort",l:"Amortização",t:"money"},{k:"saldo",l:"Saldo devedor",t:"money"},{k:"quitado",l:"Pago?",t:"check"},{k:"status",l:"Status",t:"status"}
  ]}
};
var NO_CRUD={visao:1,simulador:1,home:1};
function isMoney(f){return f.t==="money";}

/* ---------- configuração das etapas (armazenada em DADOS._cfgMod) ---------- */
function cfg(id){
  if(!DADOS._cfgMod) DADOS._cfgMod={};
  if(!DADOS._cfgMod[id]){
    DADOS._cfgMod[id]= id==="financiamento"
      ? {total:0,tipo:"SAC",meses:0,taxa:0,data:""}
      : id==="obra"
      ? {total:0,taxa:0,meses:0,incc:0,data:""}
      : {total:0,forma:"parcelado",nParc:0,tipo:(id==="doc"?"fixa":"fixa"),taxa:0,data:""};
  }
  return DADOS._cfgMod[id];
}

/* ---------- RECÁLCULO: resumo + finMeta a partir dos arrays (corrige "não atualiza") ---------- */
function sumPrev(arr,valK){ return arr.reduce(function(s,e){return s+(Number(e[valK]||e.valor||0));},0); }
function sumPago(arr,valK){ return arr.filter(isPago).reduce(function(s,e){return s+(Number(e.pago!=null?e.pago:(e[valK]||e.valor||0)));},0); }
function finOriginal(fin){ if(!fin||!fin.length) return 0; var f0=fin[0]; var v=(Number(f0.saldo)||0)+(Number(f0.amort)||0); if(v>0) return v; return fin.reduce(function(m,e){return Math.max(m,Number(e.saldo)||0);},0); }
function recompute(){
  var d=DADOS; if(!d.resumo)d.resumo={}; if(!d.finMeta)d.finMeta={}; if(!d.amortizacoes)d.amortizacoes=[];
  // entrada
  var cE=cfg("entrada"); var ePrev=cE.total>0?cE.total:sumPrev(d.entrada,"valor"); var ePago=sumPago(d.entrada,"valor");
  d.resumo.entradaPrev=r2(ePrev); d.resumo.entradaPago=r2(ePago); d.resumo.entradaPct=ePrev?r2(ePago/ePrev*1):0; d.resumo.entradaPct=ePrev?ePago/ePrev:0;
  // doc
  var cD=cfg("doc"); var dPrev=cD.total>0?cD.total:sumPrev(d.doc,"total"); var dPago=d.doc.filter(isPago).reduce(function(s,e){return s+(e.total||0);},0);
  d.resumo.docPrev=r2(dPrev); d.resumo.docPago=r2(dPago); d.resumo.docPct=dPrev?dPago/dPrev:0;
  // obra (juros)
  var oPrev=sumPrev(d.juros,"total"); var oPago=d.juros.filter(isPago).reduce(function(s,e){return s+(e.total||e.valor||0);},0);
  d.resumo.jurosPrev=r2(oPrev); d.resumo.jurosPago=r2(oPago); d.resumo.jurosPct=oPrev?oPago/oPrev:0;
  // financiamento
  var cF=cfg("financiamento"); var saldoIni=cF.total>0?cF.total:finOriginal(d.fin);
  var pagos=d.fin.filter(isPago); var amortPaid=pagos.reduce(function(s,e){return s+(e.amort||0);},0);
  var finTotalPago=pagos.reduce(function(s,e){return s+(e.pago!=null?Number(e.pago):(e.valor||0));},0);
  var amortExtra=(d.amortizacoes||[]).reduce(function(s,a){return s+(Number(a.valor)||0);},0);
  d.finMeta.saldoInicial=r2(saldoIni);
  if(cF.taxa>0) d.finMeta.jurosMensal=cF.taxa/100;
  d.finMeta.totalPago=r2(finTotalPago+amortExtra); d.finMeta.amortExtra=r2(amortExtra);
  d.finMeta.saldoAtual=r2(Math.max(0,saldoIni-amortPaid-amortExtra));
  d.finMeta.parcelasPagas=pagos.length;
  d.finMeta.parcelasRestantes=Math.max(0,d.fin.length-pagos.length);
  d.finMeta.pctQuitado=saldoIni?(amortPaid+amortExtra)/saldoIni:0;
  // totais
  var invest=ePago+dPago+oPago+finTotalPago+amortExtra;
  var custo=ePrev+dPrev+oPrev+saldoIni;
  d.resumo.totalInvestido=r2(invest); d.resumo.custoTotal=r2(custo); d.resumo.faltaPagar=r2(custo-invest); d.resumo.finSaldo=d.finMeta.saldoAtual;
}
/* resumo por etapa (p/ tela e relatório) */
function resumoEtapa(id){
  recompute(); var r=DADOS.resumo;
  if(id==="entrada")return {pago:r.entradaPago,prev:r.entradaPrev,pct:r.entradaPct};
  if(id==="doc")return {pago:r.docPago,prev:r.docPrev,pct:r.docPct};
  if(id==="obra")return {pago:r.jurosPago,prev:r.jurosPrev,pct:r.jurosPct};
  if(id==="financiamento"){var fm=DADOS.finMeta;return {pago:fm.totalPago,prev:fm.saldoInicial,pct:fm.pctQuitado,saldo:fm.saldoAtual};}
  return {pago:0,prev:0,pct:0};
}

/* ---------- gerar parcelas a partir da configuração ---------- */
function gerar(id){
  if(document.getElementById("cf_total")) readCfg(id); // lê o formulário antes de gerar (corrige "gera errado/não gera")
  var c=cfg(id), out=[];
  if(id==="financiamento"){
    var V=c.total||0, i=(c.taxa||0)/100, n=parseInt(c.meses)||0, sist=c.tipo||"SAC";
    if(V<=0||n<=0){toast("Preencha valor financiado e nº de meses.","warn");return;}
    var saldo=V, amortSAC=V/n, parcP=i>0?V*i/(1-Math.pow(1+i,-n)):V/n;
    for(var k=1;k<=n;k++){ var juros=saldo*i,parc,amort; if(sist==="PRICE"){parc=parcP;amort=parc-juros;}else{amort=amortSAC;parc=amort+juros;} saldo=Math.max(0,saldo-amort); out.push({parcela:k,mes:addMonths(c.data||"2027-01",k-1),valor:r2(parc),pago:null,reajuste:null,amort:r2(amort),total:r2(parc),saldo:r2(saldo),quitado:false,status:"A VENCER"}); }
    DADOS.fin=out;
  } else if(id==="doc"){
    var T=c.total||0, nd=c.forma==="avista"?1:(parseInt(c.nParc)||0); if(T<=0||nd<=0){toast("Preencha valor total e nº de parcelas.","warn");return;}
    var vd=T/nd; for(var j=1;j<=nd;j++) out.push({parcela:j,rtbi:r2(vd),cartorio:0,total:r2(vd),quitado:false,status:"A VENCER"});
    DADOS.doc=out;
  } else if(id==="entrada"){
    var Te=c.total||0, ne=c.forma==="avista"?1:(parseInt(c.nParc)||0), ie=(c.taxa||0)/100, fixa=(c.tipo!=="juros"); if(Te<=0||ne<=0){toast("Preencha valor total e nº de parcelas.","warn");return;}
    var pe=(!fixa&&ie>0)?Te*ie/(1-Math.pow(1+ie,-ne)):Te/ne;
    for(var m=1;m<=ne;m++){ var jr=(!fixa&&ie>0)?r2(pe-Te/ne):0; out.push({parcela:String(m),venc:addMonths(c.data||"2024-01",m-1),valor:r2(pe),pago:null,reajuste:null,quitado:false,status:"A VENCER"}); }
    DADOS.entrada=out;
  } else if(id==="obra"){
    /* Juros de obra (padrão de mercado): incide sobre o saldo já liberado ao construtor,
       que cresce com a evolução da obra; + correção monetária (INCC). Evolução linear por padrão. */
    var Vo=c.total||0, io=(c.taxa||0)/100, no=parseInt(c.meses)||0, incc=(c.incc||0)/100;
    if(Vo<=0||no<=0){toast("Preencha o valor financiado e os meses de obra.","warn");return;}
    for(var q=1;q<=no;q++){
      var pctLib=q/no;                 /* evolução da obra (linear) */
      var liberado=Vo*pctLib;          /* saldo devedor apurado no mês = liberado acumulado */
      var val=liberado*io + liberado*incc; /* juros sobre o liberado + correção INCC */
      out.push({parcela:q,venc:addMonths(c.data||"2027-01",q-1),valor:r2(val),evolucao:Math.round(pctLib*100)+"%",total:r2(val),quitado:false,status:"A VENCER"});
    }
    DADOS.juros=out;
  }
  recompute();
  if(window.VZSUPA) window.VZSUPA.replaceModule(id, rows(id));
  toast(out.length+" parcela(s) gerada(s). Marque as pagas para abater do total.","ok");
  manage(id);
}

/* ---------- store (backend) ---------- */
function apiPost(p){ if(!API_URL)return Promise.resolve({offline:true}); return fetch(API_URL,{method:"POST",mode:"no-cors",body:JSON.stringify(p)}).then(function(){return {ok:true};}).catch(function(){return {erro:true};}); }
function toRec(id,e){ var o={}; SCHEMAS[id].fields.forEach(function(f){ if(f.k==="quitado")o.quitado=e.quitado?"Sim":"Não"; else if(f.k==="status")o.status=e.quitado?"PAGO":"A VENCER"; else o[f.k]=e[f.k]; }); return o; }
function persist(id,action,e,idx,silent){
  if(window.VZSUPA){ window.VZSUPA.persist(id,action,e||{}); if(!silent)toast("Salvo na nuvem.","ok"); return Promise.resolve({ok:true}); }
  return apiPost({modulo:id,acao:action,registro:toRec(id,e||{}),indice:idx}).then(function(res){
    if(silent)return res;
    if(res.offline)toast("Salvo nesta sessão. Conecte o Google Sheets para gravar de verdade.","warn");
    else if(res.erro)toast("Falha ao falar com o backend.","danger");
    else toast("Gravado no Google Sheets.","ok");
    return res;
  });
}

/* ---------- estilos ---------- */
var css=document.createElement("style");
css.textContent=
".abar{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}"+
".ab{border:1px solid #E4E8EF;background:#fff;color:#667085;padding:8px 14px;border-radius:8px;font-weight:600;font-size:.85rem}"+
".ab.on{background:#1C64F0;color:#fff;border-color:#1C64F0}.ab:hover{border-color:#1C64F0}.ab.ghost{margin-left:auto;color:#161B26}"+
".cfgcard{background:#F7F9FC;border:1px solid #E4E8EF;border-radius:12px;padding:16px 18px;margin-bottom:16px}"+
".cfgcard h3{font-size:.95rem;font-weight:800;margin-bottom:3px}.cfgcard .cap{font-size:.8rem;color:#667085;margin-bottom:12px}"+
".cfgrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end}"+
".cfgf label{display:block;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#667085;margin-bottom:4px}"+
".cfgf input,.cfgf select{width:100%;padding:9px 11px;border:1.5px solid #E4E8EF;border-radius:8px;font-size:.9rem;font-family:inherit}"+
".cfgf input:focus,.cfgf select:focus{outline:none;border-color:#1C64F0}"+
".cfgbtns{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}"+
".cfgsum{margin-top:12px;display:flex;gap:18px;flex-wrap:wrap;font-size:.85rem;border-top:1px dashed #D7DEEA;padding-top:10px}"+
".cfgsum b{font-variant-numeric:tabular-nums}.cfgsum .g{color:#16A34A}.cfgsum .r{color:#B7791F}"+
".crud-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.crud-toolbar h2{flex:1;min-width:160px}"+
".btn-new{background:#1C64F0;color:#fff;border:0;padding:9px 15px;border-radius:8px;font-weight:700;font-size:.85rem}.btn-new:hover{background:#3C94FC}"+
".btn-gen{background:#11151f;color:#fff;border:0;padding:9px 14px;border-radius:8px;font-weight:700;font-size:.85rem}.btn-gen:hover{background:#1b2233}"+
".btn-save2{background:#fff;color:#1C64F0;border:1.5px solid #1C64F0;padding:8px 14px;border-radius:8px;font-weight:700;font-size:.85rem}"+
".chkfilter{display:flex;align-items:center;gap:7px;font-size:.84rem;color:#161B26;font-weight:600;cursor:pointer;user-select:none}.chkfilter input{width:17px;height:17px;accent-color:#1C64F0;cursor:pointer}"+
".act{border:0;background:none;padding:5px 7px;border-radius:6px;cursor:pointer;color:#667085;font-size:.95rem}.act:hover{background:#EEF2FB;color:#161B26}.act.del:hover{color:#DC2626}"+
".ckcell{text-align:center}.ckcell input{width:19px;height:19px;accent-color:#16A34A;cursor:pointer}"+
".bdg{font-size:.7rem;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap}.bdg.pago{background:#E7F6ED;color:#16A34A}.bdg.vencer{background:#FBF1DC;color:#B7791F}"+
".ovl{position:fixed;inset:0;background:rgba(14,23,38,.5);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px}"+
".modal{background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.25)}"+
".modal h3{padding:18px 22px;border-bottom:1px solid #EEF1F6;font-size:1.05rem}.modal .body{padding:18px 22px}.modal .fld{margin-bottom:14px}"+
".modal label{display:block;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#667085;margin-bottom:6px}"+
".modal input[type=text],.modal input[type=number],.modal input[type=date]{width:100%;padding:10px 12px;border:1.5px solid #E4E8EF;border-radius:8px;font-size:.95rem;font-family:inherit}"+
".modal input:focus{outline:none;border-color:#1C64F0;box-shadow:0 0 0 3px #E7EFFE}"+
".moneyfld{display:flex;border:1.5px solid #E4E8EF;border-radius:8px;overflow:hidden}.moneyfld:focus-within{border-color:#1C64F0;box-shadow:0 0 0 3px #E7EFFE}"+
".moneyfld .pre{background:#F3F5F9;color:#667085;font-weight:700;font-size:.9rem;display:flex;align-items:center;padding:0 12px;border-right:1px solid #E4E8EF}"+
".moneyfld input{flex:1;border:0!important;border-radius:0;box-shadow:none!important;text-align:right;font-variant-numeric:tabular-nums}"+
".ckfld{display:flex;align-items:center;gap:10px;background:#F7F9FC;border:1.5px solid #E4E8EF;border-radius:8px;padding:11px 14px;cursor:pointer}.ckfld input{width:20px;height:20px;accent-color:#16A34A;cursor:pointer}.ckfld span{font-size:.92rem;font-weight:600;color:#161B26}"+
".modal .foot{padding:14px 22px;border-top:1px solid #EEF1F6;display:flex;gap:10px;justify-content:flex-end}"+
".btn-c{padding:10px 16px;border-radius:8px;font-weight:700;font-size:.88rem;border:1px solid #E4E8EF;background:#fff;color:#667085}.btn-s{padding:10px 18px;border-radius:8px;font-weight:700;font-size:.88rem;border:0;background:#1C64F0;color:#fff}"+
".toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#10141F;color:#fff;padding:12px 20px;border-radius:10px;font-size:.86rem;z-index:300;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw}.toast.warn{background:#9A5B0E}.toast.danger{background:#A32D2D}.toast.ok{background:#15803D}"+
".demo-note{background:#E7EFFE;border:1px solid #C3D9FC;color:#13386F;border-radius:10px;padding:10px 14px;font-size:.82rem;margin-bottom:14px}"+
".hint-edit{font-size:.8rem;color:#667085;margin:0 0 12px}"+
"#reportArea{display:none}"+".tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}"+".tbl-wrap th:last-child,.tbl-wrap td:last-child{position:sticky;right:0;background:#fff;z-index:2}"+".tbl-wrap thead th:last-child{background:#fff;z-index:3}"+".tbl-wrap tbody tr:hover td:last-child{background:#F7F9FC}"+".tbl-wrap td:last-child{box-shadow:-8px 0 10px -8px rgba(14,23,38,.22)}"+
"@media print{body *{visibility:hidden!important}#reportArea,#reportArea *{visibility:visible!important}#reportArea{display:block!important;position:absolute;left:0;top:0;width:100%;padding:0 6mm}.no-print{display:none!important}}";
document.head.appendChild(css);
function toast(msg,kind){var t=document.createElement("div");t.className="toast "+(kind||"");t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.style.opacity="0";t.style.transition="opacity .4s";},2600);setTimeout(function(){t.remove();},3100);}

/* ---------- barra de ações ---------- */
function barHTML(id,mode){
  var rep='<button class="ab ghost" onclick="CRUD.report(\''+id+'\')">Relatório PDF</button>';
  var csvb=SCHEMAS[id]?'<button class="ab" onclick="CRUD.exportXLS(\''+id+'\')" title="Baixar em Excel">Excel</button>'+
    '<button class="ab" onclick="CRUD.exportDOC(\''+id+'\')" title="Baixar em Word">Word</button>'+
    '<button class="ab" onclick="CRUD.exportCSV(\''+id+'\')" title="Baixar em CSV">CSV</button>':'';
  var impb=SCHEMAS[id]?'<button class="ab" onclick="CRUD.importArquivo(\''+id+'\')" title="Importar de PDF (Confissão/Extrato MRV), Excel ou CSV">Importar</button>':'';
  var amb=(id==="financiamento")?'<button class="ab" onclick="CRUD.amortizar()" title="Registrar amortizacao antecipada">Amortizar</button>':'';
  var hsb=(id==="financiamento")?'<button class="ab" onclick="CRUD.amortHist()" title="Historico de amortizacoes">Hist\u00f3rico</button>':'';
  if(NO_CRUD[id])return '<div class="abar"><button class="ab on" onclick="window.navigate(\''+id+'\')">Painel</button>'+rep+'</div>';
  var isAdm=(typeof SESSION!=="undefined"&&SESSION&&SESSION.isAdmin);
  /* Assinatura: "Gerenciar dados" só para o master */
  var mgb=(id==="assinatura"&&!isAdm)?'':'<button class="ab '+(mode==="manage"?"on":"")+'" onclick="CRUD.manage(\''+id+'\')">Gerenciar dados</button>';
  return '<div class="abar"><button class="ab '+(mode==="dash"?"on":"")+'" onclick="window.navigate(\''+id+'\')">Painel</button>'+
    mgb+amb+hsb+impb+csvb+rep+'</div>';
}
var _nav=window.navigate;
window.navigate=function(id){ _nav(id); if(id&&id!=="home"&&id!=="manual"){var v=document.getElementById("view");if(v)v.insertAdjacentHTML("afterbegin",barHTML(id,"dash"));} };

/* ---------- células ---------- */
function cellHTML(id,f,e,i){
  if(f.t==="check")return '<td class="ckcell"><input type="checkbox" '+(isPago(e)?"checked":"")+' title="Marcar como pago" onchange="CRUD.togglePago(\''+id+'\','+i+',this.checked)"></td>';
  if(f.t==="status")return '<td><span class="bdg '+(isPago(e)?"pago":"vencer")+'">'+(isPago(e)?"PAGO":"A VENCER")+'</span></td>';
  if(isMoney(f))return '<td class="num">'+BRL(e[f.k])+'</td>';
  if(f.t==="date")return '<td>'+dBR(e[f.k])+'</td>';
  return '<td>'+(e[f.k]==null||e[f.k]===""?"—":esc(e[f.k]))+'</td>';
}
var FILTER={};
function visible(id){
  var q=(FILTER[id]&&FILTER[id].q||"").toLowerCase(), pend=FILTER[id]&&FILTER[id].pend, sc=SCHEMAS[id];
  return rows(id).map(function(e,i){return {e:e,i:i};}).filter(function(o){
    if(pend&&isPago(o.e))return false;
    if(!q)return true;
    return sc.fields.some(function(f){return String(o.e[f.k]==null?"":o.e[f.k]).toLowerCase().indexOf(q)>=0;});
  });
}

/* ---------- config card ---------- */
function cfgCardHTML(id){
  if(!SCHEMAS[id].hasCfg)return "";
  var c=cfg(id), s=resumoEtapa(id);
  var inner;
  if(id==="financiamento"){
    inner='<div class="cfgrow">'+
      '<div class="cfgf"><label>Valor financiado (R$)</label><input id="cf_total" inputmode="decimal" value="'+(c.total?moneyFmt(c.total):"")+'"></div>'+
      '<div class="cfgf"><label>Tipo</label><select id="cf_tipo"><option value="SAC"'+(c.tipo==="SAC"?" selected":"")+'>SAC (decrescente)</option><option value="PRICE"'+(c.tipo==="PRICE"?" selected":"")+'>PRICE (fixa)</option></select></div>'+
      '<div class="cfgf"><label>Nº de meses</label><input id="cf_meses" type="number" value="'+(c.meses||"")+'"></div>'+
      '<div class="cfgf"><label>Juros (% a.m.)</label><input id="cf_taxa" type="number" step="0.01" value="'+(c.taxa||"")+'"></div>'+
      '<div class="cfgf"><label>1ª parcela</label><input id="cf_data" type="month" value="'+(String(c.data||"").slice(0,7))+'"></div></div>';
  } else if(id==="obra"){
    inner='<div class="cfgrow">'+
      '<div class="cfgf"><label>Valor financiado (R$)</label><input id="cf_total" inputmode="decimal" value="'+(c.total?moneyFmt(c.total):"")+'"></div>'+
      '<div class="cfgf"><label>Juros de obra (% a.m.)</label><input id="cf_taxa" type="number" step="0.01" value="'+(c.taxa||"")+'"></div>'+
      '<div class="cfgf"><label>Meses de obra</label><input id="cf_meses" type="number" value="'+(c.meses||"")+'"></div>'+
      '<div class="cfgf"><label>INCC (% a.m.)</label><input id="cf_incc" type="number" step="0.01" value="'+(c.incc||"")+'"></div>'+
      '<div class="cfgf"><label>1ª parcela</label><input id="cf_data" type="month" value="'+(String(c.data||"").slice(0,7))+'"></div></div>';
  } else {
    var jurosShow=(id==="entrada");
    inner='<div class="cfgrow">'+
      '<div class="cfgf"><label>Valor total (R$)</label><input id="cf_total" inputmode="decimal" value="'+(c.total?moneyFmt(c.total):"")+'"></div>'+
      '<div class="cfgf"><label>Forma</label><select id="cf_forma" onchange="CRUD.cfgForma(\''+id+'\')"><option value="avista"'+(c.forma==="avista"?" selected":"")+'>À vista</option><option value="parcelado"'+(c.forma!=="avista"?" selected":"")+'>Parcelado</option></select></div>'+
      '<div class="cfgf"><label>Nº de parcelas</label><input id="cf_nparc" type="number" value="'+(c.nParc||"")+'" '+(c.forma==="avista"?"disabled":"")+'></div>'+
      (jurosShow?'<div class="cfgf"><label>Tipo</label><select id="cf_tipo"><option value="fixa"'+(c.tipo!=="juros"?" selected":"")+'>Parcelas fixas</option><option value="juros"'+(c.tipo==="juros"?" selected":"")+'>Com juros</option></select></div>'+
      '<div class="cfgf"><label>Juros (% a.m.)</label><input id="cf_taxa" type="number" step="0.01" value="'+(c.taxa||"")+'"></div>':'<div class="cfgf"><label>Tipo</label><input value="Parcelas fixas" disabled></div>')+
      '<div class="cfgf"><label>1ª parcela</label><input id="cf_data" type="month" value="'+(String(c.data||"").slice(0,7))+'"></div></div>';
  }
  var pct=(s.pct*100).toFixed(1).replace(".",",");
  var zbtn=(typeof SESSION!=="undefined"&&SESSION&&SESSION.isAdmin)?'<button class="btn-save2" style="background:#FEE4E2;color:#B42318;border-color:#FDA29B" onclick="CRUD.zerarConta()" title="Apaga tudo e recomeca do zero">🗑 Zerar minha conta</button>':'';
  return '<div class="cfgcard"><h3>⚙ Configuração da etapa</h3>'+
    '<div class="cap">Defina o valor total e a forma de pagamento. Use <b>Gerar parcelas</b> para criar o cronograma automaticamente, ou inclua manualmente em <b>＋ Novo</b> com base no seu contrato. Ao marcar uma parcela como paga, ela abate do total.</div>'+
    inner+
    '<div class="cfgbtns"><button class="btn-gen" onclick="CRUD.gerar(\''+id+'\')">⚙ Gerar parcelas</button><button class="btn-save2" onclick="CRUD.saveCfg(\''+id+'\')">Salvar configuração</button>'+zbtn+'</div>'+
    '<div class="cfgsum"><span>Total: <b>'+BRL(s.prev)+'</b></span><span class="g">Já pago: <b>'+BRL(s.pago)+'</b></span><span class="r">Falta: <b>'+BRL((s.prev||0)-(s.pago||0))+'</b></span><span>Concluído: <b>'+pct+'%</b></span></div></div>';
}
function readCfg(id){
  var c=cfg(id), g=function(x){var el=document.getElementById(x);return el?el.value:"";};
  c.total=moneyParse(g("cf_total"))||0;
  c.data=g("cf_data")?g("cf_data")+"-08":"";
  if(id==="financiamento"){ c.tipo=g("cf_tipo")||"SAC"; c.meses=parseInt(g("cf_meses"))||0; c.taxa=moneyParse(g("cf_taxa"))||0; }
  else if(id==="obra"){ c.taxa=moneyParse(g("cf_taxa"))||0; c.meses=parseInt(g("cf_meses"))||0; c.incc=moneyParse(g("cf_incc"))||0; }
  else { c.forma=g("cf_forma")||"parcelado"; c.nParc=parseInt(g("cf_nparc"))||0; if(id==="entrada"){c.tipo=g("cf_tipo")||"fixa";c.taxa=moneyParse(g("cf_taxa"))||0;} else c.tipo="fixa"; }
  return c;
}
function saveCfg(id){ readCfg(id); recompute(); if(window.VZSUPA) window.VZSUPA.saveCfg(id,cfg(id)); toast("Configuração salva.","ok"); manage(id); }
function cfgForma(id){ var f=document.getElementById("cf_forma"),n=document.getElementById("cf_nparc"); if(f&&n){n.disabled=(f.value==="avista");} }

/* ---------- gerenciar dados ---------- */
function manage(id){
  if(!FILTER[id])FILTER[id]={q:"",pend:false};
  var sc=SCHEMAS[id],v=document.getElementById("view");
  var head=sc.fields.map(function(f){var cls=(isMoney(f)?' class="num"':(f.t==="check"?' style="text-align:center"':''));return "<th"+cls+">"+f.l+"</th>";}).join("")+'<th class="num">Ações</th>';
  v.innerHTML=barHTML(id,"manage")+
    (API_URL?"":'<div class="demo-note"><b>Modo demonstração:</b> as edições valem nesta sessão.</div>')+
    cfgCardHTML(id)+
    '<div class="card"><div class="crud-toolbar"><h2>Parcelas — '+sc.label.replace("Parcela de ","").replace("Parcela da ","").replace("Parcela do ","")+'</h2>'+
      '<label class="chkfilter"><input type="checkbox" id="crudPend" '+(FILTER[id].pend?"checked":"")+' onchange="CRUD.setPend(\''+id+'\',this.checked)"> só a vencer</label>'+
      '<input id="crudBusca" value="'+esc(FILTER[id].q)+'" placeholder="Buscar..." oninput="CRUD.filter(\''+id+'\')" style="padding:8px 11px;border:1px solid #E4E8EF;border-radius:8px;font-size:.85rem">'+
      '<button class="btn-new" onclick="CRUD.add(\''+id+'\')">＋ Novo</button></div>'+
    '<p class="hint-edit">Marque o quadradinho <b>“Pago?”</b> para quitar em 1 clique (abate do total), ou ✎ para editar. Dica: use <b>Importar CSV</b> para subir várias parcelas de uma planilha.</p>'+
    '<div class="tbl-wrap"><table><thead><tr>'+head+'</tr></thead><tbody id="crudBody"></tbody></table></div>'+
    '<div id="crudCount" style="margin-top:10px;font-size:.8rem;color:#667085"></div></div>';
  renderBody(id);
}
function renderBody(id){
  var sc=SCHEMAS[id],vis=visible(id);
  document.getElementById("crudBody").innerHTML=vis.map(function(o){
    return "<tr>"+sc.fields.map(function(f){return cellHTML(id,f,o.e,o.i);}).join("")+
      '<td class="num" style="white-space:nowrap"><button class="act" title="Editar" onclick="CRUD.edit(\''+id+'\','+o.i+')">✎</button><button class="act del" title="Excluir" onclick="CRUD.del(\''+id+'\','+o.i+')">🗑</button></td></tr>';
  }).join("")||'<tr><td colspan="'+(sc.fields.length+1)+'" style="color:#667085">Nenhuma parcela. Configure acima e clique em “Gerar parcelas”, ou use “＋ Novo”.</td></tr>';
  var all=rows(id),pg=all.filter(isPago).length;
  document.getElementById("crudCount").innerHTML=vis.length+" de "+all.length+" parcela(s) · <b>"+pg+"</b> paga(s) · "+(all.length-pg)+" a vencer";
}
function filter(id){FILTER[id].q=document.getElementById("crudBusca").value||"";renderBody(id);}
function setPend(id,on){FILTER[id].pend=!!on;renderBody(id);}
var _saveTimers={};
function saveModuleSoon(id){
  if(!(window.VZSUPA&&window.VZSUPA.saveModule))return;
  if(_saveTimers[id])clearTimeout(_saveTimers[id]);
  _saveTimers[id]=setTimeout(function(){ _saveTimers[id]=null;
    try{ window.VZSUPA.saveModule(id,rows(id)).then(function(){toast("Salvo na nuvem.","ok");}).catch(function(){toast("Falha ao salvar na nuvem.","danger");}); }catch(e){}
  },600);
}
function togglePago(id,i,checked){
  var sc=SCHEMAS[id],e=rows(id)[i]; e.quitado=!!checked; e.status=checked?"PAGO":"A VENCER";
  if(checked&&sc.pagoFill&&(e[sc.pagoFill]==null||e[sc.pagoFill]==="")) e[sc.pagoFill]=e.valor;
  if(!checked&&sc.pagoFill) e[sc.pagoFill]=null;
  if(id==="entrada"||id==="financiamento")e.reajuste=correcaoEntrada(e);
  recompute(); saveModuleSoon(id); manage(id);
}

/* ---------- formulário ---------- */
function fieldInput(f,cur){
  if(f.t==="status")return "";
  if(f.t==="check"){var on=(cur===true);return '<div class="fld"><label>'+f.l+'</label><label class="ckfld"><input type="checkbox" id="fld_'+f.k+'" '+(on?"checked":"")+'><span>Parcela paga / quitada</span></label></div>';}
  if(f.auto){var d2=(cur==null||cur==="")?"—":("R$ "+moneyFmt(cur));return '<div class="fld"><label>'+f.l+'</label><input id="fld_'+f.k+'" type="text" value="'+esc(d2)+'" disabled style="background:#F3F5F9;color:#667085">'+'<div style="font-size:.72rem;color:#98A2B3;margin-top:3px">Calculado automaticamente: valor pago − previsto.</div></div>';}
  var lbl='<label>'+f.l+(isMoney(f)?" (R$)":"")+'</label>';
  if(f.t==="money"){var disp=(cur==null||cur==="")?"":moneyFmt(cur);return '<div class="fld">'+lbl+'<div class="moneyfld"><span class="pre">R$</span><input id="fld_'+f.k+'" type="text" inputmode="decimal" value="'+esc(disp)+'" oninput="window.CRUD&&CRUD.liveCorrecao&&CRUD.liveCorrecao()" onblur="CRUD.fmtMoney(this)"></div></div>';}
  if(f.t==="date")return '<div class="fld">'+lbl+'<input id="fld_'+f.k+'" type="date" value="'+esc(cur||"")+'"></div>';
  if(f.t==="number")return '<div class="fld">'+lbl+'<input id="fld_'+f.k+'" type="number" step="1" value="'+esc(cur)+'"></div>';
  return '<div class="fld">'+lbl+'<input id="fld_'+f.k+'" type="text" value="'+esc(cur)+'"></div>';
}
function openForm(id,idx){
  var sc=SCHEMAS[id],rec=idx==null?{}:rows(id)[idx];
  var fields=sc.fields.map(function(f){return fieldInput(f,rec[f.k]!=null?rec[f.k]:"");}).join("");
  var ovl=document.createElement("div");ovl.className="ovl";ovl.id="crudOvl";
  ovl.innerHTML='<div class="modal"><h3>'+(idx==null?"Novo":"Editar")+" — "+sc.label+'</h3><div class="body">'+fields+'</div>'+
    '<div class="foot"><button class="btn-c" onclick="CRUD.close()">Cancelar</button><button class="btn-s" onclick="CRUD.save(\''+id+'\','+(idx==null?"null":idx)+')">Salvar</button></div></div>';
  ovl.addEventListener("click",function(ev){if(ev.target===ovl)closeForm();});
  document.body.appendChild(ovl);var fi=ovl.querySelector("input");if(fi)fi.focus();
}
function fmtMoney(el){var n=moneyParse(el.value);el.value=(n==null?"":moneyFmt(n));}
function closeForm(){var o=document.getElementById("crudOvl");if(o)o.remove();}
function save(id,idx){
  var sc=SCHEMAS[id],rec=idx==null?{}:Object.assign({},rows(id)[idx]);
  sc.fields.forEach(function(f){ if(f.t==="status")return; var el=document.getElementById("fld_"+f.k); if(!el)return;
    if(f.t==="check")rec.quitado=el.checked; else if(isMoney(f))rec[f.k]=moneyParse(el.value); else if(f.t==="number")rec[f.k]=el.value===""?null:Number(el.value); else rec[f.k]=el.value; });
  rec.status=rec.quitado?"PAGO":"A VENCER";
  if(rec.quitado&&sc.pagoFill&&rec[sc.pagoFill]==null)rec[sc.pagoFill]=rec.valor;
  if(id==="entrada"||id==="financiamento")rec.reajuste=correcaoEntrada(rec);
  if(idx==null)rows(id).push(rec);else rows(id)[idx]=rec;
  recompute(); saveModuleSoon(id);
  closeForm(); manage(id);
}
function del(id,idx){ if(!confirm("Excluir esta parcela?"))return; var e=rows(id)[idx]; rows(id).splice(idx,1); recompute(); saveModuleSoon(id); manage(id); }

/* ---------- relatório (com resumo) ---------- */
function csvCell(id,f,e){
  if(f.t==="status")return isPago(e)?"PAGO":"A VENCER";
  if(f.t==="check")return isPago(e)?"Sim":"Não";
  if(isMoney(f))return (e[f.k]==null||e[f.k]==="")?"":moneyFmt(e[f.k]);
  if(f.t==="date")return dBR(e[f.k]);
  return e[f.k]==null?"":String(e[f.k]);
}
function exportCSV(id){
  var sc=SCHEMAS[id]; if(!sc){toast("Exportação disponível nas etapas.","warn");return;}
  recompute();
  var cols=sc.fields;
  var lines=[cols.map(function(f){return f.l;})];
  rows(id).forEach(function(e){ lines.push(cols.map(function(f){return csvCell(id,f,e);})); });
  var rs=resumoEtapa(id);
  lines.push([]);
  lines.push(["Total previsto", moneyFmt(rs.prev||0)]);
  lines.push(["Total pago", moneyFmt(rs.pago||0)]);
  lines.push(["Falta", moneyFmt((rs.prev||0)-(rs.pago||0))]);
  lines.push(["Concluído", (rs.pct*100).toFixed(1).replace(".",",")+"%"]);
  var sep=";";
  var csv=lines.map(function(row){ return row.map(function(c){ return chr34+String(c==null?"":c).replace(/"/g,chr34+chr34)+chr34; }).join(sep); }).join(CRLF);
  csv=BOM+csv;
  var blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=(sc.rep||id)+".csv"; a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
  toast("CSV exportado — abre no Excel.","ok");
}
var BOM=String.fromCharCode(65279), CRLF=String.fromCharCode(13,10), chr34=String.fromCharCode(34);
function cellReport(id,f,e){ if(f.t==="status")return isPago(e)?"PAGO":"A VENCER"; if(f.t==="check")return isPago(e)?"Pago":"A vencer"; if(isMoney(f))return BRL(e[f.k]); if(f.t==="date")return dBR(e[f.k]); return e[f.k]==null||e[f.k]===""?"—":e[f.k]; }
/* Monta os dados do relatório (reusado por PDF/Excel/Word) */
function reportModel(id){
  recompute();
  var sc=SCHEMAS[id], R, sumHTML="";
  if(id==="visao"){ R={rep:"Visão Geral do Imóvel",head:["Indicador","Valor"],body:[["Imóvel",DADOS._meta.imovel],["Já investido",BRL(DADOS.resumo.totalInvestido)],["Custo total",BRL(DADOS.resumo.custoTotal)],["Falta pagar",BRL(DADOS.resumo.faltaPagar)],["Concluído",((DADOS.resumo.custoTotal?DADOS.resumo.totalInvestido/DADOS.resumo.custoTotal:0)*100).toFixed(1).replace(".",",")+"%"]]}; }
  else if(id==="simulador"){ var s=DADOS.sim; R={rep:"Simulação de Amortização",head:["Cenário","Meses","Juros","Total"],body:[["Sem aporte",s.mesesBase+"m",BRL(s.jurosBase),BRL(s.totalBase)],["Com aporte",s.mesesSim+"m",BRL(s.jurosSim),BRL(s.totalSim)],["Economia",(s.mesesBase-s.mesesSim)+"m",BRL(s.jurosBase-s.jurosSim),BRL(s.totalBase-s.totalSim)]]}; }
  else {
    var rs=resumoEtapa(id), pct=(rs.pct*100).toFixed(1).replace(".",",");
    sumHTML='<div style="display:flex;gap:24px;margin:12px 0;padding:10px 14px;background:#F3F5F9;border-radius:8px;font-size:12px">'+
      '<span>Total previsto: <b>'+BRL(rs.prev)+'</b></span><span style="color:#16A34A">Já pago: <b>'+BRL(rs.pago)+'</b></span>'+
      '<span style="color:#B7791F">Falta: <b>'+BRL((rs.prev||0)-(rs.pago||0))+'</b></span><span>Concluído: <b>'+pct+'%</b></span></div>';
    R={rep:sc.rep,head:["#"].concat(sc.fields.map(function(f){return f.l;})),body:rows(id).map(function(e,i){return [i+1].concat(sc.fields.map(function(f){return cellReport(id,f,e);}));})};
  }
  return {R:R,sumHTML:sumHTML,sc:sc};
}
/* Exporta Excel (.xls) ou Word (.doc) via blob HTML nativo — sem biblioteca externa */
function exportOffice(id,fmt){
  var M=reportModel(id), R=M.R;
  var th=R.head.map(function(h){return '<th style="background:#2563EB;color:#fff;border:1px solid #999;padding:5px 8px;text-align:left">'+esc(h)+'</th>';}).join("");
  var tb=R.body.map(function(row){return '<tr>'+row.map(function(c){return '<td style="border:1px solid #ccc;padding:4px 8px">'+esc(c==null?"":c)+'</td>';}).join("")+'</tr>';}).join("");
  var titulo='Gerenciador de Financiamento — '+R.rep+' · '+(DADOS._meta&&DADOS._meta.imovel||"");
  var doc='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>'+
    '<h2 style="font-family:Arial">'+esc(titulo)+'</h2>'+M.sumHTML+
    '<table border="1" style="border-collapse:collapse;font-family:Arial;font-size:12px"><thead><tr>'+th+'</tr></thead><tbody>'+tb+'</tbody></table>'+
    '<p style="font-family:Arial;font-size:10px;color:#888">Gerado por Gerenciador de Financiamento · Vizio Finance — '+new Date().toLocaleDateString("pt-BR")+'</p></body></html>';
  var isXls=fmt==="xls";
  var blob=new Blob(["﻿"+doc],{type:isXls?"application/vnd.ms-excel":"application/msword"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=(R.rep||id)+(isXls?".xls":".doc"); a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
  toast((isXls?"Excel":"Word")+" exportado ("+(R.body.length)+" registro(s)).","ok");
}
function exportXLS(id){ exportOffice(id,"xls"); }
function exportDOC(id){ exportOffice(id,"doc"); }
function report(id){
  var M=reportModel(id), R=M.R, sumHTML=M.sumHTML, sc=M.sc;
  var head=R.head.map(function(h){return "<th style=\"text-align:left;padding:6px 8px;border-bottom:2px solid #1C64F0\">"+h+"</th>";}).join("");
  var body=R.body.map(function(row){return "<tr>"+row.map(function(c){return "<td style=\"padding:5px 8px;border-bottom:1px solid #e5e5e5\">"+(c==null?"—":c)+"</td>";}).join("")+"</tr>";}).join("");
  var area=document.getElementById("reportArea")||document.createElement("div");area.id="reportArea";
  area.innerHTML='<div style="font-family:Inter,Arial,sans-serif;color:#0E1726;padding:8mm 0">'+
    '<div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid #1C64F0;padding-bottom:10px;margin-bottom:14px">'+
      '<img src="vizio-symbol-dark.png" style="height:40px"><img src="vizio-wordmark-dark.png" style="height:26px">'+
      '<div style="margin-left:6px"><div style="font-size:17px;font-weight:800">Gerenciador de Financiamento</div><div style="font-size:12px;color:#555">Relatório — '+R.rep+' · '+DADOS._meta.imovel+'</div></div>'+
      '<div style="margin-left:auto;text-align:right;font-size:11px;color:#777">Emitido em '+new Date().toLocaleDateString("pt-BR")+'<br>'+R.body.length+' registro(s)</div></div>'+
    sumHTML+
    '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#F3F5F9">'+head+'</tr></thead><tbody>'+body+'</tbody></table>'+
    '<div style="margin-top:18px;border-top:1px solid #ccc;padding-top:8px;font-size:10px;color:#888;display:flex;justify-content:space-between"><span><b>Gerenciador de Financiamento by VIZIO</b> · Sua planilha virou software.</span><span>um produto INPERSON</span></div></div>';
  if(!area.parentNode)document.body.appendChild(area);
  toast("Abrindo a janela de impressão — escolha “Salvar como PDF”.","ok");
  setTimeout(function(){window.print();},350);
}

/* ---------- amortizacao antecipada (recalcula o cronograma do financiamento) ---------- */
function finTaxa(){ var c=cfg("financiamento"); var i=(c.taxa||0)/100; if(!i&&DADOS.finMeta&&DADOS.finMeta.jurosMensal)i=Number(DADOS.finMeta.jurosMensal)||0; return i; }
function nextUnpaidIdx(arr){ for(var k=0;k<arr.length;k++){ if(!isPago(arr[k]))return k; } return arr.length?arr.length-1:0; }
function recalcFin(arr,i,sist,aporte,fromIdx,modo){
  var keep=arr.slice(0,fromIdx);
  var saldoStart=fromIdx>0?(Number(arr[fromIdx-1].saldo)||0):finOriginal(arr);
  var saldo=r2(saldoStart-(Number(aporte)||0)); if(saldo<0)saldo=0;
  var baseMes=(arr[fromIdx]&&arr[fromIdx].mes)?arr[fromIdx].mes:addMonths((cfg("financiamento").data)||"2027-01",fromIdx);
  var remaining=arr.length-fromIdx, out=keep.slice();
  function push(off,parc,amort,sal){ out.push({parcela:0,mes:addMonths(baseMes,off),valor:r2(parc),pago:null,reajuste:null,amort:r2(amort),total:r2(parc),saldo:r2(Math.max(0,sal)),quitado:false,status:"A VENCER"}); }
  if(saldo>0.005&&remaining>0){
    if(modo==="parcela"){
      if(sist==="PRICE"){ var parc=i>0?saldo*i/(1-Math.pow(1+i,-remaining)):saldo/remaining;
        for(var k=0;k<remaining;k++){ var j=saldo*i,a=parc-j; if(a>saldo)a=saldo; saldo=saldo-a; push(k,a+j,a,saldo); if(saldo<=0.005)break; } }
      else { var am=saldo/remaining;
        for(var k2=0;k2<remaining;k2++){ var j2=saldo*i,a2=am; if(a2>saldo)a2=saldo; saldo=saldo-a2; push(k2,a2+j2,a2,saldo); if(saldo<=0.005)break; } }
    } else {
      if(sist==="PRICE"){ var parcK=Number(arr[fromIdx]&&arr[fromIdx].valor)||0; if(parcK<=0&&i>0)parcK=saldoStart*i/(1-Math.pow(1+i,-remaining));
        var off=0; while(saldo>0.005&&off<2000){ var jp=saldo*i,ap=parcK-jp; if(ap<=0)break; if(ap>saldo)ap=saldo; saldo=saldo-ap; push(off,ap+jp,ap,saldo); off++; } }
      else { var amK=Number(arr[fromIdx]&&arr[fromIdx].amort)||0; if(amK<=0)amK=finOriginal(arr)/(arr.length||1);
        var o2=0; while(saldo>0.005&&o2<5000){ var js=saldo*i,as=amK; if(as>saldo)as=saldo; saldo=saldo-as; push(o2,as+js,as,saldo); o2++; } }
    }
  }
  out.forEach(function(e,ix){ e.parcela=ix+1; });
  return out;
}
function amortizar(){
  var arr=DADOS.fin||[]; if(!arr.length){ toast("Gere o financiamento primeiro (Configurar -> Gerar parcelas).","warn"); return; }
  var fu=nextUnpaidIdx(arr); var defParc=(arr[fu]&&arr[fu].parcela)||1;
  var ovl=document.createElement("div"); ovl.className="ovl"; ovl.id="crudOvl";
  ovl.innerHTML='<div class="modal"><h3>Registrar amortizacao antecipada</h3><div class="body">'+
    '<div class="fld"><label>Valor do aporte (R$)</label><div class="moneyfld"><span class="pre">R$</span><input id="am_val" type="text" inputmode="decimal" onblur="CRUD.fmtMoney(this)"></div></div>'+
    '<div class="fld"><label>Aplicar a partir da parcela no</label><input id="am_parc" type="number" min="1" value="'+defParc+'"></div>'+
    '<div class="fld"><label>Como recalcular</label>'+
      '<label class="ckfld" style="margin-bottom:8px"><input type="radio" name="am_modo" value="prazo" checked><span>Reduzir o prazo (mantem a parcela, quita antes)</span></label>'+
      '<label class="ckfld"><input type="radio" name="am_modo" value="parcela"><span>Reduzir a parcela (mantem o prazo, parcela menor)</span></label>'+
    '</div></div>'+
    '<div class="foot"><button class="btn-c" onclick="CRUD.close()">Cancelar</button><button class="btn-s" onclick="CRUD.amortizarAplica()">Aplicar e recalcular</button></div></div>';
  ovl.addEventListener("click",function(ev){if(ev.target===ovl)closeForm();});
  document.body.appendChild(ovl); var fi=document.getElementById("am_val"); if(fi)fi.focus();
}
function amortizarAplica(){
  var arr=DADOS.fin||[]; if(!arr.length)return;
  var aporte=moneyParse((document.getElementById("am_val")||{}).value);
  var parcNo=parseInt((document.getElementById("am_parc")||{}).value)||1;
  var me=document.querySelector('input[name="am_modo"]:checked'); var modo=me?me.value:"prazo";
  if(!aporte||aporte<=0){ toast("Informe o valor do aporte.","warn"); return; }
  var fromIdx=-1; for(var k=0;k<arr.length;k++){ if(Number(arr[k].parcela)===parcNo){fromIdx=k;break;} }
  if(fromIdx<0)fromIdx=Math.max(0,Math.min(parcNo-1,arr.length-1));
  var i=finTaxa(), sist=(cfg("financiamento").tipo||"SAC"), antes=arr.length;
  var novo=recalcFin(arr,i,sist,aporte,fromIdx,modo);
  var amRec={data:new Date().toISOString().slice(0,10),valor:aporte,modo:modo,parcela_no:parcNo,saldo_apos:(novo[fromIdx]?novo[fromIdx].saldo:null)};
  DADOS.amortizacoes=DADOS.amortizacoes||[]; DADOS.amortizacoes.push(amRec);
  if(window.VZSUPA&&window.VZSUPA.addAmort)window.VZSUPA.addAmort(amRec);
  DADOS.fin=novo; recompute();
  if(window.VZSUPA&&window.VZSUPA.replaceModule)window.VZSUPA.replaceModule("financiamento",novo);
  closeForm();
  var msg=(modo==="prazo")?("Amortizacao aplicada. Prazo: "+antes+" -> "+novo.length+" parcelas."):("Amortizacao aplicada. Parcela recalculada (prazo mantido).");
  toast(msg,"ok"); manage("financiamento");
}

/* ---------- importação CSV (self-service) ---------- */
function norm(s){ return String(s==null?"":s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," "); }
function parseCSV(text){
  var DQ=String.fromCharCode(34), NL=String.fromCharCode(10), CR=String.fromCharCode(13), FEFF=String.fromCharCode(65279);
  text=String(text||""); if(text.charAt(0)===FEFF)text=text.slice(1);
  var firstLine=text.split(/\r?\n/)[0]||"";
  var sep=(firstLine.split(";").length>firstLine.split(",").length)?";":",";
  var out=[],row=[],cur="",i=0,q=false,ch;
  while(i<text.length){ ch=text.charAt(i);
    if(q){ if(ch===DQ){ if(text.charAt(i+1)===DQ){cur+=DQ;i++;} else q=false; } else cur+=ch; }
    else{ if(ch===DQ){q=true;} else if(ch===sep){row.push(cur);cur="";} else if(ch===NL){row.push(cur);out.push(row);row=[];cur="";} else if(ch===CR){} else {cur+=ch;} }
    i++;
  }
  if(cur!==""||row.length){row.push(cur);out.push(row);}
  return out;
}
function dISO(s){ s=String(s||"").trim(); if(!s||s==="—")return ""; var m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(m)return m[3]+"-"+String(m[2]).padStart(2,"0")+"-"+String(m[1]).padStart(2,"0"); if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s; m=s.match(/^(\d{1,2})\/(\d{4})$/); if(m)return m[2]+"-"+String(m[1]).padStart(2,"0")+"-08"; if(/^\d{4}-\d{2}$/.test(s))return s+"-08"; return s; }
function truthy(s){ s=norm(s); return s==="sim"||s==="pago"||s==="paga"||s==="true"||s==="1"||s==="x"||s==="quitado"||s==="quitada"; }
function importCSV(id){
  var sc=SCHEMAS[id]; if(!sc){toast("Importacao disponivel nas etapas.","warn");return;}
  var inp=document.createElement("input"); inp.type="file"; inp.accept=".csv,text/csv,text/plain";
  inp.onchange=function(){ var file=inp.files&&inp.files[0]; if(!file)return;
    var rd=new FileReader();
    rd.onload=function(){ try{ processImport(id,String(rd.result||"")); }catch(err){ toast("Nao consegui ler o arquivo. Confira se e um CSV.","danger"); } };
    rd.readAsText(file,"utf-8");
  };
  inp.click();
}
/* Importa CSV OU Excel (.xlsx/.xls) para preencher as parcelas. Excel é convertido
   em CSV (SheetJS) e passa pelo mesmo mapeamento por cabeçalho. */
function importArquivo(id){
  var sc=SCHEMAS[id]; if(!sc){toast("Importação disponível nas etapas de pagamento.","warn");return;}
  var inp=document.createElement("input"); inp.type="file"; inp.accept=".csv,.txt,.xlsx,.xls,.pdf,text/csv,application/pdf";
  inp.onchange=function(){ var file=inp.files&&inp.files[0]; if(!file)return;
    var nome=(file.name||"").toLowerCase();
    if(/\.pdf$/.test(nome)){ importPDF(file); return; }
    if(/\.(xlsx|xls)$/.test(nome)){
      if(typeof XLSX==="undefined"){toast("Leitor de Excel ainda carregando — tente de novo em instantes.","warn");return;}
      var rb=new FileReader();
      rb.onload=function(){ try{
        var wb=XLSX.read(new Uint8Array(rb.result),{type:"array"});
        var ws=wb.Sheets[wb.SheetNames[0]];
        processImport(id, XLSX.utils.sheet_to_csv(ws));
      }catch(err){ toast("Não consegui ler a planilha Excel. Confira se há um cabeçalho na 1ª linha.","danger"); } };
      rb.readAsArrayBuffer(file);
    } else {
      var rd=new FileReader();
      rd.onload=function(){ try{ processImport(id,String(rd.result||"")); }catch(err){ toast("Não consegui ler o arquivo. Use CSV ou Excel com cabeçalho.","danger"); } };
      rd.readAsText(file,"utf-8");
    }
  };
  inp.click();
}
/* ===== IMPORT DE PDF (MRV — Confissão de Dívida + Extrato) =====
   Extrai o texto do PDF no navegador (pdf.js) e lê pelo padrão fixo da MRV.
   Confissão = cronograma PREVISTO; Extrato = pagamentos REALIZADOS (mescla). */
function pdfDateISO(br){ var p=String(br||"").split("/"); return p.length===3?(p[2]+"-"+p[1]+"-"+p[0]):""; }
function pdfNum(x){ if(x==null)return 0; x=String(x).replace(/[^\d.,-]/g,""); if(x.indexOf(",")>=0)x=x.replace(/\./g,"").replace(",","."); var n=parseFloat(x); return isNaN(n)?0:n; }
function pdfExtractText(file){
  return file.arrayBuffer().then(function(buf){
    if(typeof pdfjsLib==="undefined") throw new Error("leitor de PDF não carregado");
    try{ pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; }catch(e){}
    return pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise.then(function(pdf){
      var chain=Promise.resolve(), out=[];
      for(var p=1;p<=pdf.numPages;p++){ (function(pn){ chain=chain.then(function(){ return pdf.getPage(pn).then(function(pg){ return pg.getTextContent().then(function(tc){
        var byY={}; tc.items.forEach(function(it){ var y=Math.round(it.transform[5]); (byY[y]=byY[y]||[]).push({x:it.transform[4],s:it.str}); });
        var ys=Object.keys(byY).map(Number).sort(function(a,b){return b-a;});
        ys.forEach(function(y){ out.push(byY[y].sort(function(a,b){return a.x-b.x;}).map(function(i){return i.s;}).join(" ").replace(/\s+/g," ").trim()); });
      });});});})(p); }
      return chain.then(function(){ return out.join("\n"); });
    });
  });
}
function parseMRV(text){
  var conf=/INSTRUMENTO DE CONFISS/i.test(text), ext=/Consulta de Extrato/i.test(text), rows=[], m;
  if(conf){
    var re=/\b1\s+([A-Z]{1,2})\s*-\s*[^\d]+?([\d\.]+,\d{2})\s+(\d{2}\/\d{2}\/\d{4})/g;
    while((m=re.exec(text))){ rows.push({code:m[1],valor:pdfNum(m[2]),venc:pdfDateISO(m[3]),pago:0,reaj:0,paid:false}); }
    return {tipo:"confissao",rows:rows};
  }
  if(ext){
    var lines=text.split("\n");
    var payRe=/Pago\s+(\d{2}\/\d{2}\/\d{4})\s+R\$\s*([\d\.]+,\d{2})\s+R\$\s*([\d\.]+,\d{2})\s+R\$\s*([\d\.]+,\d{2})\s+R\$\s*([\d\.]+,\d{2})\s+R\$\s*([\d\.]+,\d{2})\s+R\$\s*([\d\.]+,\d{2})/;
    var codeRe=/\b([A-Z]{1,2})(\d{2,3})\b/;
    for(var i=0;i<lines.length;i++){ var pm=payRe.exec(lines[i]); if(!pm)continue;
      var cm=codeRe.exec(lines[i]); if(!cm){ for(var j=i-1;j>=Math.max(0,i-2);j--){ if(lines[j]){cm=codeRe.exec(lines[j]); if(cm)break;} } }
      rows.push({code:cm?cm[1]:"??",venc:pdfDateISO(pm[1]),valor:pdfNum(pm[2]),reaj:pdfNum(pm[3]),pago:pdfNum(pm[7]),paid:true});
    }
    return {tipo:"extrato",rows:rows};
  }
  return {tipo:"desconhecido",rows:rows};
}
function mrvBuckets(parsed){
  var b={entrada:[],doc:[],fin:[],outros:[]};
  parsed.rows.forEach(function(r){
    if(r.code==="RT"||r.code==="RI") b.doc.push(r);
    else if(r.code==="P") b.fin.push(r);
    else if(r.code==="E"||r.code==="M"||r.code==="DF") b.entrada.push(r);
    else b.outros.push(r);
  });
  return b;
}
function applyMRV(parsed,b){
  var isExt=parsed.tipo==="extrato";
  if(b.entrada.length){
    var ent=b.entrada.slice().sort(function(a,c){return String(a.venc).localeCompare(String(c.venc));});
    if(isExt && DADOS.entrada && DADOS.entrada.length){
      var byV={}; DADOS.entrada.forEach(function(e){ byV[e.venc]=e; });
      ent.forEach(function(r){ var e=byV[r.venc]; if(e){ e.quitado=true; e.pago=r.pago; e.reajuste=r2((r.pago||0)-(r.valor||0)); e.status="PAGO"; }
        else { DADOS.entrada.push({parcela:String(DADOS.entrada.length+1),venc:r.venc,valor:r.valor,pago:r.pago,reajuste:r2((r.pago||0)-(r.valor||0)),quitado:true,status:"PAGO"}); } });
    } else {
      DADOS.entrada=ent.map(function(r,i){ return {parcela:String(i+1),venc:r.venc,valor:r.valor,pago:r.paid?r.pago:null,reajuste:r.paid?r2((r.pago||0)-(r.valor||0)):null,quitado:!!r.paid,status:r.paid?"PAGO":"A VENCER"}; });
    }
  }
  if(b.doc.length){
    var doc=b.doc.slice().sort(function(a,c){return String(a.venc).localeCompare(String(c.venc));});
    DADOS.doc=doc.map(function(r,i){ var itbi=(r.code==="RI"); return {parcela:i+1,rtbi:itbi?r.valor:0,cartorio:itbi?0:r.valor,total:r.valor,quitado:!!r.paid,status:r.paid?"PAGO":"A VENCER"}; });
  }
  if(b.fin.length){
    var principal=b.fin.reduce(function(s,r){return s+(r.valor||0);},0);
    var cf=cfg("financiamento"); cf.total=r2(principal); if(window.VZSUPA&&window.VZSUPA.saveCfg)window.VZSUPA.saveCfg("financiamento",cf);
  }
  recompute();
  if(window.VZSUPA&&window.VZSUPA.replaceModule){ if(b.entrada.length)window.VZSUPA.replaceModule("entrada",DADOS.entrada); if(b.doc.length)window.VZSUPA.replaceModule("doc",DADOS.doc); }
  toast("PDF importado: "+(b.entrada.length?"entrada ":"")+(b.doc.length?"documentação ":"")+(b.fin.length?"financiamento":""),"ok");
  if(window.navigate)window.navigate("visao");
}
function previewMRV(parsed,b){
  var ovl=document.createElement("div"); ovl.className="vzmodal"; ovl.style.cssText="position:fixed;inset:0;background:rgba(9,13,22,.62);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px";
  if(parsed.tipo==="desconhecido"||!parsed.rows.length){
    ovl.innerHTML='<div style="background:#fff;border-radius:16px;max-width:440px;padding:24px 26px;box-shadow:0 14px 36px rgba(14,23,38,.2)"><h3 style="margin-bottom:8px">PDF não reconhecido</h3><p style="color:#667085;font-size:.9rem;margin-bottom:14px">Este import lê os PDFs da MRV (Confissão de Dívida e Extrato). Para outros formatos, use Excel ou CSV.</p><div style="text-align:right"><button class="ab" onclick="var m=this.closest(\'.vzmodal\');if(m)m.remove()">Fechar</button></div></div>';
    document.body.appendChild(ovl); return;
  }
  function grp(arr,lbl){ if(!arr.length)return ""; var tot=arr.reduce(function(s,r){return s+(r.paid?(r.pago||r.valor):r.valor);},0); return '<tr><td style="padding:6px 8px;border-bottom:1px solid #EEF1F6">'+lbl+'</td><td style="padding:6px 8px;border-bottom:1px solid #EEF1F6;text-align:right">'+arr.length+'</td><td style="padding:6px 8px;border-bottom:1px solid #EEF1F6;text-align:right">'+BRL(tot)+'</td></tr>'; }
  var tipoLbl=parsed.tipo==="confissao"?"Confissão de Dívida — cronograma previsto":"Extrato MRV — pagamentos realizados";
  var nota=parsed.tipo==="extrato"?"As parcelas serão marcadas como <b>pagas</b> e mescladas ao cronograma existente (sem perder as futuras).":"Cria o <b>cronograma previsto</b>. Depois importe o Extrato para marcar as pagas.";
  ovl.innerHTML='<div style="background:#fff;border-radius:16px;max-width:540px;width:100%;padding:24px 26px;box-shadow:0 14px 36px rgba(14,23,38,.2);max-height:82vh;overflow:auto">'+
    '<h3 style="font-family:var(--font-display,inherit);margin-bottom:2px">Importar do PDF</h3>'+
    '<div style="color:#667085;font-size:.86rem;margin-bottom:14px">'+tipoLbl+' · '+parsed.rows.length+' linhas lidas</div>'+
    '<table style="width:100%;font-size:.88rem;border-collapse:collapse;margin-bottom:12px"><thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #2563EB">Módulo</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid #2563EB">Itens</th><th style="text-align:right;padding:6px 8px;border-bottom:2px solid #2563EB">Total</th></tr></thead><tbody>'+
    grp(b.entrada,"Entrada Parcelada (sinais + mensais)")+grp(b.doc,"Documentação (cartório + ITBI)")+grp(b.fin,"Financiamento (principal CEF)")+'</tbody></table>'+
    '<div style="color:#667085;font-size:.82rem;margin-bottom:16px">'+nota+'</div>'+
    '<div style="display:flex;gap:10px;justify-content:flex-end"><button class="ab" onclick="var m=this.closest(\'.vzmodal\');if(m)m.remove()">Cancelar</button><button class="ab on" id="mrvGo" style="background:#2563EB;color:#fff;border-color:#2563EB">Importar</button></div></div>';
  ovl.addEventListener("click",function(e){if(e.target===ovl)ovl.remove();});
  document.body.appendChild(ovl);
  document.getElementById("mrvGo").onclick=function(){ ovl.remove(); applyMRV(parsed,b); };
}
function importPDF(file){ toast("Lendo o PDF…","ok"); pdfExtractText(file).then(function(text){ var parsed=parseMRV(text); previewMRV(parsed, mrvBuckets(parsed)); }).catch(function(err){ toast("Falha ao ler o PDF"+(err&&err.message?" ("+err.message+")":"")+".","danger"); }); }
function processImport(id,text){
  var sc=SCHEMAS[id];
  var grid=parseCSV(text).filter(function(r){return r.some(function(c){return String(c).trim()!=="";});});
  if(!grid.length){toast("Arquivo vazio.","warn");return;}
  var header=grid[0].map(norm);
  var colOf={}; sc.fields.forEach(function(f){ var idx=header.indexOf(norm(f.l)); if(idx<0)idx=header.indexOf(norm(f.l.replace(" (R$)",""))); colOf[f.k]=idx; });
  var hasAny=sc.fields.some(function(f){return f.t!=="status"&&!f.auto&&colOf[f.k]>=0;});
  if(!hasAny){toast("Cabecalho nao reconhecido. Dica: exporte o CSV desta etapa e use como modelo.","danger");return;}
  var recs=[];
  for(var r=1;r<grid.length;r++){
    var line=grid[r], first=norm(line[0]);
    if(first==="total previsto"||first==="total pago"||first==="falta"||first==="concluido")break;
    var rec={};
    sc.fields.forEach(function(f){
      if(f.t==="status"||f.auto)return;
      var ci=colOf[f.k], raw=ci>=0?line[ci]:"";
      if(f.t==="check")rec.quitado=truthy(raw);
      else if(isMoney(f))rec[f.k]=moneyParse(raw);
      else if(f.t==="date")rec[f.k]=dISO(raw);
      else if(f.t==="number")rec[f.k]=(raw===""||raw==null)?null:Number(String(raw).replace(/[^\d.-]/g,""));
      else rec[f.k]=(raw==null?"":String(raw).trim());
    });
    var temAlgo=sc.fields.some(function(f){return f.t!=="status"&&f.t!=="check"&&!f.auto&&rec[f.k]!=null&&rec[f.k]!=="";});
    if(!temAlgo&&!rec.quitado)continue;
    rec.status=rec.quitado?"PAGO":"A VENCER";
    if(rec.quitado&&sc.pagoFill&&(rec[sc.pagoFill]==null||rec[sc.pagoFill]===""))rec[sc.pagoFill]=rec.valor;
    if(id==="entrada"||id==="financiamento")rec.reajuste=correcaoEntrada(rec);
    recs.push(rec);
  }
  if(!recs.length){toast("Nenhuma parcela encontrada no arquivo.","warn");return;}
  if(!confirm("Importar "+recs.length+" parcela(s)? Isso vai SUBSTITUIR as parcelas atuais desta etapa."))return;
  DADOS[ARR[id]]=recs;
  recompute();
  if(window.VZSUPA&&window.VZSUPA.replaceModule)window.VZSUPA.replaceModule(id,recs);
  toast(recs.length+" parcela(s) importada(s) e salva(s) na nuvem.","ok");
  manage(id);
}

/* ---------- recompute inicial (reflete dados ja carregados) ---------- */
try{ recompute(); }catch(e){}

function amortHist(){
  var list=DADOS.amortizacoes||[];
  var body=list.length?list.map(function(a){return '<tr><td style="padding:6px">'+dBR(a.data)+'</td><td style="padding:6px">'+BRL(a.valor)+'</td><td style="padding:6px">'+(a.modo==="parcela"?"Reduzir parcela":"Reduzir prazo")+'</td><td style="padding:6px">'+(a.parcela_no||"\u2014")+'</td><td style="padding:6px">'+(a.saldo_apos!=null?BRL(a.saldo_apos):"\u2014")+'</td></tr>';}).join(""):'<tr><td colspan="5" style="text-align:center;color:#98A2B3;padding:14px">Nenhuma amortiza\u00e7\u00e3o registrada ainda.</td></tr>';
  var total=list.reduce(function(s,a){return s+(Number(a.valor)||0);},0);
  var ovl=document.createElement("div"); ovl.className="ovl"; ovl.id="crudOvl";
  ovl.innerHTML='<div class="modal"><h3>Hist\u00f3rico de amortiza\u00e7\u00f5es</h3><div class="body">'+
    '<table style="width:100%;border-collapse:collapse;font-size:.86rem"><thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid #E4E8EF">Data</th><th style="text-align:left;padding:6px;border-bottom:1px solid #E4E8EF">Valor</th><th style="text-align:left;padding:6px;border-bottom:1px solid #E4E8EF">Tipo</th><th style="text-align:left;padding:6px;border-bottom:1px solid #E4E8EF">Parcela n\u00ba</th><th style="text-align:left;padding:6px;border-bottom:1px solid #E4E8EF">Saldo ap\u00f3s</th></tr></thead><tbody>'+body+'</tbody></table>'+
    '<div style="margin-top:12px;font-weight:700">Total amortizado: '+BRL(total)+'</div>'+
    '</div><div class="foot"><button class="btn-s" onclick="CRUD.close()">Fechar</button></div></div>';
  ovl.addEventListener("click",function(ev){if(ev.target===ovl)closeForm();});
  document.body.appendChild(ovl);
}
function zerarConta(){
  if(!(typeof SESSION!=="undefined"&&SESSION&&SESSION.isAdmin)){ toast("Apenas administradores.","warn"); return; }
  if(!confirm("ZERAR TODA a sua conta?\n\nIsto apaga TODOS os dados financeiros (entrada, documenta\u00e7\u00e3o, obra, financiamento, amortiza\u00e7\u00f5es) e as configura\u00e7\u00f5es desta conta, para come\u00e7ar do zero.\n\nEsta a\u00e7\u00e3o N\u00c3O pode ser desfeita."))return;
  if(!confirm("Confirma novamente? Tudo ser\u00e1 apagado e o sistema ficar\u00e1 zerado."))return;
  /* zera explicitamente o Valor Financiado (e demais configs) e salva */
  try{ ["financiamento","entrada","doc","obra"].forEach(function(m){ var cc=cfg(m); cc.total=0; cc.meses=0; cc.taxa=0; cc.nParc=0; cc.incc=0; if(window.VZSUPA&&window.VZSUPA.saveCfg)window.VZSUPA.saveCfg(m,cc); }); }catch(e){}
  if(window.VZSUPA&&window.VZSUPA.wipeAll){
    window.VZSUPA.wipeAll().then(function(){ alert("Conta zerada. O sistema vai recarregar do zero."); location.reload(); }).catch(function(){ toast("Falha ao zerar na nuvem.","danger"); });
  } else {
    DADOS.entrada=[];DADOS.doc=[];DADOS.juros=[];DADOS.fin=[];DADOS.amortizacoes=[];DADOS._cfgMod={};recompute();location.reload();
  }
}
/* ---------- API publica ---------- */
function liveCorrecao(){ var pp=document.getElementById("fld_pago"),vv=document.getElementById("fld_valor"),rr=document.getElementById("fld_reajuste"); if(!pp||!vv||!rr)return; var pv=moneyParse(pp.value),vl=moneyParse(vv.value); rr.value=(pv==null||vl==null)?"—":("R$ "+moneyFmt(r2(pv-vl))); }
window.CRUD={manage:manage,filter:filter,setPend:setPend,togglePago:togglePago,fmtMoney:fmtMoney,liveCorrecao:liveCorrecao,
  add:function(id){openForm(id,null);},edit:function(id,i){openForm(id,i);},save:save,del:del,close:closeForm,
  report:report,exportCSV:exportCSV,exportXLS:exportXLS,exportDOC:exportDOC,importCSV:importCSV,importArquivo:importArquivo,importPDF:importPDF,amortizar:amortizar,amortizarAplica:amortizarAplica,amortHist:amortHist,zerarConta:zerarConta,gerar:gerar,saveCfg:saveCfg,cfgForma:cfgForma,recompute:recompute,_setApi:function(u){API_URL=u;}};

})();
