/* ===========================================================================
 * Gerenciador de Financiamento by VIZIO — Camada de Cadastro/Edição + Relatórios
 * Carregado depois do dados.js e do script principal do index.html.
 * - Adiciona em cada módulo a barra: Painel · Gerenciar dados · Relatório PDF
 * - Gerenciar dados: tabela com Novo / Editar / Excluir (formulário por módulo)
 * - Grava no Google Sheets via Apps Script (quando API_URL estiver configurada)
 * - Relatórios: layout imprimível (marca VIZIO + tabela + assinatura) via impressão
 * =========================================================================== */
(function(){
"use strict";

/* >>> Backend (Apps Script) — vazio = modo demonstração (edições valem na sessão). <<< */
var API_URL = "https://script.google.com/macros/s/AKfycbxrOR7LZBG-r5RYLDKNYnUS8axM1le2IuRa8ZrD4zdA-najiCZ-5AwplHnmAFVkW6ZR/exec";

var BRL=function(v){return (v==null||v==="")?"—":"R$ "+Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});};
function distinct(a){return a.filter(function(v,i){return a.indexOf(v)===i;});}

/* ---------- leitura de registros a partir do DADOS ---------- */
function recEntrada(){return DADOS.entrada.map(function(e){return {parcela:e.parcela,venc:e.venc,valor:e.valor,pago:e.pago,reajuste:e.reajuste,quitado:e.quitado?"Sim":"Não",status:e.status};});}
function recDoc(){return DADOS.doc.map(function(e){return {parcela:e.parcela,rtbi:e.rtbi,cartorio:e.cartorio,total:e.total,quitado:e.quitado?"Sim":"Não",status:e.status};});}
function recObra(){return DADOS.juros.map(function(e){return {parcela:e.parcela,venc:e.venc,valor:e.valor,evolucao:e.evolucao!=null?(e.evolucao*100).toFixed(1)+"%":"",quitado:e.quitado?"Sim":"Não",status:e.status};});}
function recFin(){return DADOS.fin.map(function(e){return {parcela:e.parcela,mes:e.mes,valor:e.valor,amort:e.amort,saldo:e.saldo,quitado:e.quitado?"Sim":"Não",status:e.status};});}

/* ---------- esquemas (campos por módulo) ---------- */
var SIMNAO=function(){return ["Sim","Não"];};
var SCHEMAS={
  entrada:{label:"Parcela da entrada",rep:"Relatório — Entrada Parcelada",get:recEntrada,money:["valor","pago","reajuste"],fields:[
    {k:"parcela",l:"Parcela",t:"text"},
    {k:"venc",l:"Vencimento (AAAA-MM-DD)",t:"text"},
    {k:"valor",l:"Valor previsto (R$)",t:"number"},
    {k:"pago",l:"Valor pago (R$)",t:"number"},
    {k:"reajuste",l:"Reajuste (R$)",t:"number"},
    {k:"quitado",l:"Pago?",t:"select",o:SIMNAO},
    {k:"status",l:"Status",t:"text"}
  ]},
  doc:{label:"Parcela de documentação",rep:"Relatório — Documentação (RTBI + Cartório)",get:recDoc,money:["rtbi","cartorio","total"],fields:[
    {k:"parcela",l:"Parcela",t:"number"},
    {k:"rtbi",l:"RTBI (R$)",t:"number"},
    {k:"cartorio",l:"Cartório (R$)",t:"number"},
    {k:"total",l:"Total (R$)",t:"number"},
    {k:"quitado",l:"Pago?",t:"select",o:SIMNAO},
    {k:"status",l:"Status",t:"text"}
  ]},
  obra:{label:"Parcela de juros de obra",rep:"Relatório — Juros de Obra",get:recObra,money:["valor"],fields:[
    {k:"parcela",l:"Parcela",t:"number"},
    {k:"venc",l:"Vencimento (AAAA-MM-DD)",t:"text"},
    {k:"valor",l:"Valor (R$)",t:"number"},
    {k:"evolucao",l:"Evolução da obra (ex.: 95%)",t:"text"},
    {k:"quitado",l:"Pago?",t:"select",o:SIMNAO},
    {k:"status",l:"Status",t:"text"}
  ]},
  financiamento:{label:"Parcela do financiamento",rep:"Relatório — Financiamento (SAC)",get:recFin,money:["valor","amort","saldo"],fields:[
    {k:"parcela",l:"Parcela",t:"number"},
    {k:"mes",l:"Mês (AAAA-MM-DD)",t:"text"},
    {k:"valor",l:"Parcela (R$)",t:"number"},
    {k:"amort",l:"Amortização (R$)",t:"number"},
    {k:"saldo",l:"Saldo devedor (R$)",t:"number"},
    {k:"quitado",l:"Pago?",t:"select",o:SIMNAO},
    {k:"status",l:"Status",t:"text"}
  ]}
};
/* módulos sem CRUD tabular (só painel) */
var NO_CRUD={visao:1,simulador:1,home:1};

/* ---------- estado de trabalho (cópia editável por sessão) ---------- */
var WORK={};
function work(id){ if(!WORK[id]) WORK[id]=JSON.parse(JSON.stringify(SCHEMAS[id].get())); return WORK[id]; }
function fmtCell(id,f,val){ if(val===0)return SCHEMAS[id].money.indexOf(f)>=0?BRL(0):0; if(val==null||val==="")return "—"; return SCHEMAS[id].money.indexOf(f)>=0?BRL(val):val; }

/* ---------- store: grava no backend ou avisa (modo demonstração) ---------- */
function apiPost(payload){
  if(!API_URL) return Promise.resolve({offline:true});
  return fetch(API_URL,{method:"POST",mode:"no-cors",body:JSON.stringify(payload)})
    .then(function(){return {ok:true};}).catch(function(){return {erro:true};});
}
function persist(id,action,record,idx){
  return apiPost({modulo:id,acao:action,registro:record,indice:idx}).then(function(res){
    if(res.offline) toast("Salvo nesta sessão. Conecte o Google Sheets (ver guia) para gravar de verdade.","warn");
    else if(res.erro) toast("Falha ao falar com o backend. Verifique a URL/implantação.","danger");
    else toast("Gravado no Google Sheets.","ok");
    return res;
  });
}

/* ---------- estilos ---------- */
var css=document.createElement("style");
css.textContent=
".abar{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}"+
".ab{border:1px solid #E4E8EF;background:#fff;color:#667085;padding:8px 14px;border-radius:8px;font-weight:600;font-size:.85rem}"+
".ab.on{background:#1C64F0;color:#fff;border-color:#1C64F0}.ab:hover{border-color:#1C64F0}"+
".ab.ghost{margin-left:auto;color:#161B26}"+
".crud-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}"+
".btn-new{background:#1C64F0;color:#fff;border:0;padding:9px 15px;border-radius:8px;font-weight:700;font-size:.85rem}"+
".btn-new:hover{background:#3C94FC}"+
".act{border:0;background:none;padding:5px 7px;border-radius:6px;cursor:pointer;color:#667085}"+
".act:hover{background:#EEF2FB;color:#161B26}.act.del:hover{color:#DC2626}"+
".ovl{position:fixed;inset:0;background:rgba(14,23,38,.5);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px}"+
".modal{background:#fff;border-radius:16px;max-width:540px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.25)}"+
".modal h3{padding:18px 22px;border-bottom:1px solid #EEF1F6;font-size:1.05rem}"+
".modal .body{padding:18px 22px}.modal .fld{margin-bottom:13px}"+
".modal label{display:block;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#667085;margin-bottom:5px}"+
".modal input,.modal select{width:100%;padding:10px 12px;border:1.5px solid #E4E8EF;border-radius:8px;font-size:.92rem;font-family:inherit}"+
".modal input:focus,.modal select:focus{outline:none;border-color:#1C64F0}"+
".modal .foot{padding:14px 22px;border-top:1px solid #EEF1F6;display:flex;gap:10px;justify-content:flex-end}"+
".btn-c{padding:10px 16px;border-radius:8px;font-weight:700;font-size:.88rem;border:1px solid #E4E8EF;background:#fff;color:#667085}"+
".btn-s{padding:10px 18px;border-radius:8px;font-weight:700;font-size:.88rem;border:0;background:#1C64F0;color:#fff}"+
".toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#10141F;color:#fff;padding:12px 20px;border-radius:10px;font-size:.86rem;z-index:300;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw}"+
".toast.warn{background:#9A5B0E}.toast.danger{background:#A32D2D}.toast.ok{background:#15803D}"+
".demo-note{background:#E7EFFE;border:1px solid #C3D9FC;color:#13386F;border-radius:10px;padding:10px 14px;font-size:.82rem;margin-bottom:14px}"+
"#reportArea{display:none}"+
"@media print{body *{visibility:hidden!important}#reportArea,#reportArea *{visibility:visible!important}#reportArea{display:block!important;position:absolute;left:0;top:0;width:100%;padding:0 6mm}.no-print{display:none!important}}";
document.head.appendChild(css);

function toast(msg,kind){
  var t=document.createElement("div");t.className="toast "+(kind||"");t.textContent=msg;document.body.appendChild(t);
  setTimeout(function(){t.style.opacity="0";t.style.transition="opacity .4s";},2600);
  setTimeout(function(){t.remove();},3100);
}

/* ---------- barra de ações ---------- */
function barHTML(id,mode){
  var rep='<button class="ab ghost" onclick="CRUD.report(\''+id+'\')">Relatório PDF</button>';
  if(NO_CRUD[id]) return '<div class="abar"><button class="ab on" onclick="window.navigate(\''+id+'\')">Painel</button>'+rep+'</div>';
  return '<div class="abar">'+
    '<button class="ab '+(mode==="dash"?"on":"")+'" onclick="window.navigate(\''+id+'\')">Painel</button>'+
    '<button class="ab '+(mode==="manage"?"on":"")+'" onclick="CRUD.manage(\''+id+'\')">Gerenciar dados</button>'+rep+'</div>';
}
var _nav=window.navigate;
window.navigate=function(id){
  _nav(id);
  if(id&&id!=="home"){
    var v=document.getElementById("view");
    if(v) v.insertAdjacentHTML("afterbegin",barHTML(id,"dash"));
  }
};

/* ---------- gerenciar dados ---------- */
function manage(id){
  var sc=SCHEMAS[id],rows=work(id),v=document.getElementById("view");
  var head=sc.fields.map(function(f){return "<th>"+f.l.replace(/\s*\(.*\)/,"")+"</th>";}).join("")+'<th class="num">Ações</th>';
  var body=rows.map(function(r,i){
    return "<tr>"+sc.fields.map(function(f){return "<td>"+fmtCell(id,f.k,r[f.k])+"</td>";}).join("")+
      '<td class="num"><button class="act" title="Editar" onclick="CRUD.edit(\''+id+'\','+i+')">✎</button>'+
      '<button class="act del" title="Excluir" onclick="CRUD.del(\''+id+'\','+i+')">🗑</button></td></tr>';
  }).join("")||'<tr><td colspan="'+(sc.fields.length+1)+'" style="color:#667085">Nenhum registro. Clique em “Novo”.</td></tr>';
  v.innerHTML=barHTML(id,"manage")+
    (API_URL?"":'<div class="demo-note"><b>Modo demonstração:</b> as edições valem nesta sessão e geram aviso ao salvar. A gravação real ativa quando o Google Sheets for conectado (ver guia de go-live).</div>')+
    '<div class="card"><div class="crud-toolbar"><h2 style="flex:1">Gerenciar — '+sc.label+'</h2>'+
      '<input id="crudBusca" placeholder="Buscar..." oninput="CRUD.filter(\''+id+'\')" style="padding:8px 11px;border:1px solid #E4E8EF;border-radius:8px;font-size:.85rem">'+
      '<button class="btn-new" onclick="CRUD.add(\''+id+'\')">＋ Novo</button></div>'+
    '<div class="tbl-wrap"><table><thead><tr>'+head+'</tr></thead><tbody id="crudBody">'+body+'</tbody></table></div>'+
    '<div style="margin-top:10px;font-size:.8rem;color:#667085">'+rows.length+' registro(s).</div></div>';
}
function filter(id){
  var q=(document.getElementById("crudBusca").value||"").toLowerCase();
  var sc=SCHEMAS[id],rows=work(id);
  var body=rows.map(function(r,i){return {r:r,i:i};}).filter(function(o){
    return sc.fields.some(function(f){return String(o.r[f.k]||"").toLowerCase().indexOf(q)>=0;});
  }).map(function(o){
    return "<tr>"+sc.fields.map(function(f){return "<td>"+fmtCell(id,f.k,o.r[f.k])+"</td>";}).join("")+
      '<td class="num"><button class="act" onclick="CRUD.edit(\''+id+'\','+o.i+')">✎</button>'+
      '<button class="act del" onclick="CRUD.del(\''+id+'\','+o.i+')">🗑</button></td></tr>';
  }).join("")||'<tr><td colspan="'+(sc.fields.length+1)+'" style="color:#667085">Sem resultados.</td></tr>';
  document.getElementById("crudBody").innerHTML=body;
}

/* ---------- formulário (modal) ---------- */
function openForm(id,idx){
  var sc=SCHEMAS[id];var rec=idx==null?{}:work(id)[idx];
  var fields=sc.fields.map(function(f){
    var cur=rec[f.k]!=null?rec[f.k]:"";var input;
    if(f.t==="select"){var opts=f.o();input='<select id="fld_'+f.k+'">'+opts.map(function(o){return '<option'+(String(o)===String(cur)?" selected":"")+'>'+o+'</option>';}).join("")+'</select>';}
    else input='<input id="fld_'+f.k+'" type="'+(f.t==="number"?"number":"text")+'"'+(f.t==="number"?' step="0.01"':'')+' value="'+String(cur).replace(/"/g,"&quot;")+'">';
    return '<div class="fld"><label>'+f.l+'</label>'+input+'</div>';
  }).join("");
  var ovl=document.createElement("div");ovl.className="ovl";ovl.id="crudOvl";
  ovl.innerHTML='<div class="modal"><h3>'+(idx==null?"Novo":"Editar")+" — "+sc.label+'</h3>'+
    '<div class="body">'+fields+'</div>'+
    '<div class="foot"><button class="btn-c" onclick="CRUD.close()">Cancelar</button>'+
    '<button class="btn-s" onclick="CRUD.save(\''+id+'\','+(idx==null?"null":idx)+')">Salvar</button></div></div>';
  ovl.addEventListener("click",function(e){if(e.target===ovl)closeForm();});
  document.body.appendChild(ovl);
}
function closeForm(){var o=document.getElementById("crudOvl");if(o)o.remove();}
function save(id,idx){
  var sc=SCHEMAS[id];var rec={};
  sc.fields.forEach(function(f){var el=document.getElementById("fld_"+f.k);var v=el.value;if(f.t==="number")v=v===""?null:Number(v);rec[f.k]=v;});
  var rows=work(id);
  if(idx==null) rows.push(rec); else rows[idx]=rec;
  persist(id,idx==null?"create":"update",rec,idx);
  closeForm();manage(id);
}
function del(id,idx){
  if(!confirm("Excluir este registro?"))return;
  var rows=work(id);var rec=rows[idx];rows.splice(idx,1);
  persist(id,"delete",rec,idx);
  manage(id);
}

/* ---------- relatório imprimível (PDF via impressão) ---------- */
function reportRows(id){
  // módulos painel-only têm relatório-resumo dedicado
  if(id==="visao") return {rep:"Relatório — Visão Geral do Imóvel",head:["Indicador","Valor"],body:resumoVisao()};
  if(id==="simulador") return {rep:"Relatório — Simulação de Amortização",head:["Cenário","Meses","Juros","Total desembolsado"],body:resumoSim()};
  var sc=SCHEMAS[id],rows=work(id);
  return {rep:sc.rep,head:["#"].concat(sc.fields.map(function(f){return f.l.replace(/\s*\(.*\)/,"");})),
    body:rows.map(function(r,i){return [i+1].concat(sc.fields.map(function(f){return fmtCell(id,f.k,r[f.k]);}));})};
}
function resumoVisao(){var r=DADOS.resumo;return [
  ["Imóvel",DADOS._meta.imovel],["Já investido",BRL(r.totalInvestido)],["Custo total do imóvel",BRL(r.custoTotal)],
  ["Falta pagar",BRL(r.faltaPagar)],["Concluído",(r.totalInvestido/r.custoTotal*100).toFixed(1)+"%"],
  ["Saldo do financiamento",BRL(DADOS.finMeta.saldoInicial)]];}
function resumoSim(){var s=DADOS.sim;return [
  ["Sem aporte",s.mesesBase+" meses",BRL(s.jurosBase),BRL(s.totalBase)],
  ["Com aporte de "+BRL(s.aporteExtra)+"/mês",s.mesesSim+" meses",BRL(s.jurosSim),BRL(s.totalSim)],
  ["Economia",(s.mesesBase-s.mesesSim)+" meses",BRL(s.jurosBase-s.jurosSim),BRL(s.totalBase-s.totalSim)]];}
function report(id){
  var R=reportRows(id);
  var head=R.head.map(function(h){return "<th style=\"text-align:left;padding:6px 8px;border-bottom:2px solid #1C64F0\">"+h+"</th>";}).join("");
  var body=R.body.map(function(row){return "<tr>"+row.map(function(c){return "<td style=\"padding:5px 8px;border-bottom:1px solid #e5e5e5\">"+(c==null?"—":c)+"</td>";}).join("")+"</tr>";}).join("");
  var area=document.getElementById("reportArea")||document.createElement("div");
  area.id="reportArea";
  area.innerHTML=
    '<div style="font-family:Inter,Arial,sans-serif;color:#0E1726;padding:8mm 0">'+
    '<div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid #1C64F0;padding-bottom:10px;margin-bottom:14px">'+
      '<img src="vizio-symbol-dark.png" style="height:40px"><img src="vizio-wordmark-dark.png" style="height:26px">'+
      '<div style="margin-left:6px"><div style="font-size:17px;font-weight:800">Gerenciador de Financiamento</div>'+
      '<div style="font-size:12px;color:#555">'+R.rep+' · '+DADOS._meta.imovel+'</div></div>'+
      '<div style="margin-left:auto;text-align:right;font-size:11px;color:#777">Emitido em '+new Date().toLocaleDateString("pt-BR")+'<br>'+R.body.length+' registro(s)</div></div>'+
    '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#F3F5F9">'+head+
      '</tr></thead><tbody>'+body+'</tbody></table>'+
    '<div style="margin-top:18px;border-top:1px solid #ccc;padding-top:8px;font-size:10px;color:#888;display:flex;justify-content:space-between">'+
      '<span><b>Gerenciador de Financiamento by VIZIO</b> · Sua planilha virou software.</span><span>um produto INPERSON</span></div>'+
    '</div>';
  if(!area.parentNode)document.body.appendChild(area);
  toast("Abrindo a janela de impressão — escolha “Salvar como PDF”.","ok");
  setTimeout(function(){window.print();},350);
}

/* ---------- API pública ---------- */
window.CRUD={manage:manage,filter:filter,add:function(id){openForm(id,null);},edit:function(id,i){openForm(id,i);},
  save:save,del:del,close:closeForm,report:report,_setApi:function(u){API_URL=u;}};

})();
