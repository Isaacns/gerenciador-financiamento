/* =========================================================================
   Vizio Finance v2 — núcleo genérico (preview). Opera nas tabelas vf_*.
   Contrato (qualquer bem) → planos → parcelas → eventos.
   Isolado do app atual (fin_*). Não altera nada em produção.
   ========================================================================= */
(function(){
"use strict";
var SUPA_URL="https://emyjzjadmxgbtmxnzazu.supabase.co";
var SUPA_KEY="sb_publishable_PY2YDxUzGgaXRVtvCcasBA_Ml7YUBTC";
var SB=window.supabase.createClient(SUPA_URL,SUPA_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

/* ---------- util ---------- */
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function fmtBRL(n){return "R$ "+(Number(n)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtBRL0(n){return "R$ "+(Number(n)||0).toLocaleString("pt-BR",{maximumFractionDigits:0});}
function fmtPct(x){return ((x||0)*100).toFixed(1).replace(".",",")+"%";}
function moneyFmt(n){return (Number(n)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});}
function moneyNum(s){ if(s==null||s==="")return 0; s=String(s).replace(/[^\d.,-]/g,""); if(s.indexOf(",")>=0)s=s.replace(/\./g,"").replace(",","."); else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,""); var n=parseFloat(s); return isNaN(n)?0:n; }
function dBR(iso){ if(!iso)return "—"; var p=String(iso).slice(0,10).split("-"); return p.length===3?(p[2]+"/"+p[1]+"/"+p[0]):iso; }
function addMonthsISO(iso,k){ var d=iso?new Date(iso+"T00:00:00"):new Date(); d.setMonth(d.getMonth()+k); return d.toISOString().slice(0,10); }
function toast(m,k){ var t=document.createElement("div"); t.className="toast "+(k||""); t.textContent=m; document.body.appendChild(t); setTimeout(function(){t.style.opacity="0";t.style.transition="opacity .4s";},2600); setTimeout(function(){t.remove();},3100); }
/* máscara R$ ao vivo */
function moneyMaskLive(el){ var hadComma=el.value.indexOf(",")>=0; var v=el.value.replace(/[^\d,]/g,""); var parts=v.split(","); var intp=parts[0].replace(/^0+(?=\d)/,"").replace(/\B(?=(\d{3})+(?!\d))/g,"."); if(intp==="")intp=(parts.length>1?"0":""); el.value=parts.length>1?intp+","+parts[1].slice(0,2):intp+(hadComma?",":""); }
document.addEventListener("input",function(e){ var t=e.target; if(t&&t.tagName==="INPUT"&&t.getAttribute("inputmode")==="decimal")moneyMaskLive(t); },true);
window.moneyMaskLive=moneyMaskLive;

/* ---------- motor de amortização / geração ---------- */
function taxaMensal(taxaAA){ taxaAA=Number(taxaAA)||0; return taxaAA>0?Math.pow(1+taxaAA/100,1/12)-1:0; }
/* Gera as parcelas de um plano a partir da config. Retorna array de {numero,vencimento,valor_previsto,juros,amortizacao,saldo,meta} */
function gerarParcelas(tipo,cfg){
  var out=[], i, n=Number(cfg.meses||cfg.nParc||0)||0, d0=cfg.primeiraData||null;
  if(tipo==="parcelamento"){
    var total=Number(cfg.total)||0; var np=Number(cfg.nParc)||1; var v=np>0?total/np:total;
    for(i=0;i<np;i++) out.push({numero:i+1,vencimento:d0?addMonthsISO(d0,i):null,valor_previsto:round2(v),meta:{}});
  } else if(tipo==="custos"){
    var t2=Number(cfg.total)||0; var np2=Number(cfg.nParc)||1; var v2=np2>0?t2/np2:t2;
    for(i=0;i<np2;i++) out.push({numero:i+1,vencimento:d0?addMonthsISO(d0,i):null,valor_previsto:round2(v2),meta:{}});
  } else if(tipo==="amortizacao"){
    var saldo=Number(cfg.total)||0; var im=taxaMensal(cfg.taxaAA); var sis=(cfg.sistema||"PRICE").toUpperCase();
    if(n<=0||saldo<=0) return out;
    if(sis==="SAC"){
      var amort=saldo/n, s=saldo;
      for(i=0;i<n;i++){ var j=s*im; out.push({numero:i+1,vencimento:d0?addMonthsISO(d0,i):null,valor_previsto:round2(amort+j),juros:round2(j),amortizacao:round2(amort),saldo:round2(s-amort),meta:{}}); s-=amort; }
    } else {
      var parc = im>0 ? saldo*im/(1-Math.pow(1+im,-n)) : saldo/n; var s2=saldo;
      for(i=0;i<n;i++){ var j2=s2*im, am=parc-j2; out.push({numero:i+1,vencimento:d0?addMonthsISO(d0,i):null,valor_previsto:round2(parc),juros:round2(j2),amortizacao:round2(am),saldo:round2(Math.max(0,s2-am)),meta:{}}); s2-=am; }
    }
  } else if(tipo==="juros_obra"){
    /* Juros de obra VARIÁVEL: saldo liberado cresce (evolução linear por padrão) e
       incide taxa + INCC. Cada mês é editável depois. */
    var val=Number(cfg.total)||0; var tm=(Number(cfg.taxaAM)||0)/100; var incc=(Number(cfg.incc)||0)/100;
    if(n<=0) return out;
    for(i=0;i<n;i++){ var evol=(i+1)/n; var liberado=val*evol; var jm=liberado*(tm+incc);
      out.push({numero:i+1,vencimento:d0?addMonthsISO(d0,i):null,valor_previsto:round2(jm),meta:{evolucao:round2(evol*100),incc:cfg.incc||0,saldo_liberado:round2(liberado),base:val}}); }
  }
  return out;
}
function round2(v){ return Math.round((Number(v)||0)*100)/100; }

/* ---------- estado ---------- */
var USER=null, PERFIL=null, CONTRATO=null, PLANOS=[], PARCELAS={}; /* PARCELAS[plano_id]=[] */

/* ===================== AUTH ===================== */
function togglePass(id,btn){ var el=$(id); if(!el)return; el.type=el.type==="password"?"text":"password"; btn.textContent=el.type==="password"?"👁":"🙈"; }

function login(ev){ ev.preventDefault();
  var email=($("lgEmail").value||"").trim(), pass=$("lgPass").value, err=$("lgErr"); err.textContent="Entrando…";
  SB.auth.signInWithPassword({email:email,password:pass}).then(function(r){
    if(r.error){ err.textContent="E-mail ou senha inválidos."; return; }
    err.textContent=""; boot(r.data.user);
  });
  return false;
}
function logout(){ SB.auth.signOut().finally(function(){ location.reload(); }); }

function boot(user){
  USER=user;
  return SB.from("vf_contratos").select("*").eq("produto","finance").order("created_at").then(function(r){
    var cs=r.data||[];
    $("login").classList.add("hidden"); $("app").classList.remove("hidden");
    $("uName").textContent=(user.user_metadata&&user.user_metadata.nome)||user.email.split("@")[0];
    $("uEmail").textContent=user.email;
    if(!cs.length){ WIZ.open(); return; }
    CONTRATO=cs[0]; carregar();
  });
}
/* sessão persistida */
SB.auth.getSession().then(function(s){ if(s.data&&s.data.session) boot(s.data.session.user); });

/* ===================== CARREGAR + DASHBOARD ===================== */
function carregar(){
  return Promise.all([
    SB.from("vf_planos").select("*").eq("contrato_id",CONTRATO.id).order("ordem"),
    SB.from("vf_parcelas").select("*").eq("contrato_id",CONTRATO.id).order("numero")
  ]).then(function(res){
    PLANOS=res[0].data||[]; PARCELAS={};
    (res[1].data||[]).forEach(function(p){ (PARCELAS[p.plano_id]=PARCELAS[p.plano_id]||[]).push(p); });
    renderDash();
  });
}
function planoAgg(pl){
  var arr=PARCELAS[pl.id]||[], prev=0,pago=0,npg=0;
  arr.forEach(function(p){ prev+=Number(p.valor_previsto)||0; if(p.quitado){ npg++; pago+=Number(p.valor_pago!=null?p.valor_pago:p.valor_previsto)||0; } });
  return {n:arr.length,npg:npg,prev:prev,pago:pago,pct:arr.length?npg/arr.length:0};
}
function totais(){
  var investido=0,prev=0;
  PLANOS.forEach(function(pl){ var a=planoAgg(pl); investido+=a.pago; prev+=a.prev; });
  var custoTotal = Math.max(prev, Number(CONTRATO.valor_bem)||0);
  return {investido:investido, prev:prev, custoTotal:custoTotal, falta:Math.max(0,custoTotal-investido), pct:custoTotal>0?investido/custoTotal:0};
}
var TIPO_LABEL={imovel_planta:"Imóvel na planta",imovel_pronto:"Imóvel pronto",casa:"Casa",apartamento:"Apartamento",terreno:"Terreno",lote:"Lote",veiculo:"Veículo",outro:"Outro bem"};
var TIPO_IC={imovel_planta:"🏗️",imovel_pronto:"🏠",casa:"🏡",apartamento:"🏢",terreno:"🌳",lote:"📐",veiculo:"🚗",outro:"📦"};
var PLANO_IC={parcelamento:"🧾",amortizacao:"🏦",custos:"📄",juros_obra:"🏗️"};

function renderDash(){
  var t=totais(), c=CONTRATO;
  var revisar=(c.meta&&c.meta.revisar)||[];
  var aviso = revisar.length ? '<div class="card" style="border-color:#F5C451;background:#FFFBEF"><div class="spread"><div><b>Revisar dados do cadastro</b><div class="cap">Migramos do sistema antigo, mas faltam informações que não existiam lá: '+revisar.map(function(x){return {valor_bem:"valor do bem",entrada_valor:"entrada",taxas:"taxa/prazo do financiamento"}[x]||x;}).join(", ")+'.</div></div><button class="chip on" onclick="APP.editarContrato()">Completar</button></div></div>' : '';
  var cards=PLANOS.map(function(pl){ var a=planoAgg(pl);
    return '<tr onclick="APP.abrirPlano(\''+pl.id+'\')" style="cursor:pointer"><td>'+(PLANO_IC[pl.tipo]||"•")+' <b>'+esc(pl.nome)+'</b></td>'+
      '<td class="num">'+a.n+'</td><td class="num">'+a.npg+'</td><td class="num">'+fmtBRL(a.pago)+'</td>'+
      '<td class="num">'+fmtPct(a.pct)+'</td><td class="num">›</td></tr>';
  }).join("");
  $("view").innerHTML=
    aviso+
    '<div class="spread" style="margin-bottom:16px"><div><h1 style="font-size:1.3rem">'+esc(c.nome)+'</h1>'+
      '<div class="cap">'+(TIPO_IC[c.bem_tipo]||"")+' '+(TIPO_LABEL[c.bem_tipo]||c.bem_tipo)+(c.instituicao?" · "+esc(c.instituicao):"")+'</div></div>'+
      '<div class="row"><button class="chip" onclick="APP.editarContrato()">Editar cadastro</button><button class="chip on" onclick="WIZ.addPlanoModal()">+ Plano de pagamento</button></div></div>'+
    '<div class="kpis">'+
      '<div class="kpi green"><div class="val">'+fmtBRL0(t.investido)+'</div><div class="lbl">Já investido</div></div>'+
      '<div class="kpi"><div class="val">'+fmtBRL0(t.custoTotal)+'</div><div class="lbl">Custo total</div></div>'+
      '<div class="kpi warn"><div class="val">'+fmtBRL0(t.falta)+'</div><div class="lbl">Falta pagar</div></div>'+
      '<div class="kpi"><div class="val">'+fmtPct(t.pct)+'</div><div class="lbl">Concluído</div></div>'+
    '</div>'+
    '<div class="card"><div class="spread" style="margin-bottom:8px"><h2 style="font-size:1.05rem">Planos de pagamento</h2></div>'+
      (PLANOS.length?'<table><thead><tr><th>Plano</th><th class="num">Parcelas</th><th class="num">Pagas</th><th class="num">Investido</th><th class="num">%</th><th></th></tr></thead><tbody>'+cards+'</tbody></table>':'<div class="cap">Nenhum plano ainda. Adicione o primeiro (parcelamento, financiamento, custos ou juros de obra).</div>')+
    '</div>'+
    '<div class="cap" style="text-align:center;opacity:.6">Vizio Finance v2 · núcleo genérico · contrato '+c.id.slice(0,8)+'</div>';
}

/* ---------- detalhe do plano: parcelas, marcar paga, add manual ---------- */
function abrirPlano(pid){
  var pl=PLANOS.find(function(p){return p.id===pid;}); if(!pl)return;
  var arr=(PARCELAS[pid]||[]);
  var isObra=pl.tipo==="juros_obra";
  var rows=arr.map(function(p,i){
    return '<tr><td>'+(p.numero||i+1)+(p.origem==="manual"?' <span class="badge vencer" style="font-size:.6rem">manual</span>':'')+'</td>'+
      '<td>'+dBR(p.vencimento)+'</td>'+
      (isObra?'<td class="num">'+(p.meta&&p.meta.evolucao!=null?p.meta.evolucao+"%":"—")+'</td>':'')+
      '<td class="num">'+fmtBRL(p.valor_previsto)+'</td>'+
      '<td class="num">'+(p.quitado?fmtBRL(p.valor_pago!=null?p.valor_pago:p.valor_previsto):"—")+'</td>'+
      '<td>'+(p.quitado?'<span class="badge pago">pago</span>':'<span class="badge vencer">a vencer</span>')+'</td>'+
      '<td class="num" style="white-space:nowrap"><button class="link" onclick="APP.editarParcela(\''+p.id+'\')">editar</button> · <button class="link" onclick="APP.togglePaga(\''+p.id+'\')">'+(p.quitado?"desmarcar":"marcar pago")+'</button></td></tr>';
  }).join("");
  var body='<div class="box"><div class="spread" style="margin-bottom:10px"><div><h2 style="font-size:1.1rem">'+(PLANO_IC[pl.tipo]||"")+' '+esc(pl.nome)+'</h2><div class="cap">'+arr.length+' parcela(s)</div></div>'+
    '<button class="link" onclick="this.closest(\'.ovl\').remove()">✕ Fechar</button></div>'+
    '<div style="max-height:52vh;overflow:auto"><table><thead><tr><th>#</th><th>Venc.</th>'+(isObra?'<th class="num">Evol.</th>':'')+'<th class="num">Previsto</th><th class="num">Pago</th><th>Status</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="cap">Sem parcelas. Adicione manualmente.</td></tr>')+'</tbody></table></div>'+
    '<div class="row" style="margin-top:14px;justify-content:space-between"><button class="chip" onclick="APP.addParcelaManual(\''+pid+'\')">+ Parcela manual</button>'+
    '<button class="chip" onclick="APP.delPlano(\''+pid+'\')" style="color:#DC2626;border-color:#F3B4B4">Excluir plano</button></div></div>';
  var ovl=document.createElement("div"); ovl.className="ovl"; ovl.innerHTML=body;
  ovl.addEventListener("click",function(e){if(e.target===ovl)ovl.remove();});
  document.body.appendChild(ovl);
}
function togglePaga(id){
  var pid=Object.keys(PARCELAS).find(function(k){return PARCELAS[k].some(function(p){return p.id===id;});});
  var p=PARCELAS[pid].find(function(x){return x.id===id;});
  var novo=!p.quitado;
  SB.from("vf_parcelas").update({quitado:novo, valor_pago:novo?(p.valor_pago!=null?p.valor_pago:p.valor_previsto):null, data_pagamento:novo?new Date().toISOString().slice(0,10):null}).eq("id",id).then(function(r){
    if(r.error){toast("Erro ao salvar","danger");return;}
    p.quitado=novo; p.valor_pago=novo?(p.valor_pago!=null?p.valor_pago:p.valor_previsto):null;
    var ovl=document.querySelector(".ovl"); if(ovl)ovl.remove(); abrirPlano(pid); renderDash();
  });
}
function addParcelaManual(pid){
  var pl=PLANOS.find(function(p){return p.id===pid;});
  var next=((PARCELAS[pid]||[]).reduce(function(m,p){return Math.max(m,p.numero||0);},0))+1;
  formModal("Nova parcela manual",[
    {k:"numero",l:"Nº",t:"number",v:next},
    {k:"vencimento",l:"Vencimento",t:"date",v:""},
    {k:"valor_previsto",l:"Valor",t:"money",v:""}
  ],function(d){
    return SB.from("vf_parcelas").insert({plano_id:pid,contrato_id:CONTRATO.id,user_id:USER.id,
      numero:Number(d.numero)||next,vencimento:d.vencimento||null,valor_previsto:moneyNum(d.valor_previsto),origem:"manual"}).then(function(r){
      if(r.error){toast("Erro: "+r.error.message,"danger");return false;}
      toast("Parcela adicionada","ok"); return carregar().then(function(){ var o=document.querySelector(".ovl"); if(o)o.remove(); abrirPlano(pid); });
    });
  },true);
}
/* Editar uma parcela existente. Em juros de obra, o valor é VARIÁVEL mês a mês —
   por isso aqui também dá para ajustar a evolução (%) e o INCC de cada mês, que
   ficam no meta da parcela. É o que torna o juros de obra editável de verdade. */
function editarParcela(id){
  var pid=Object.keys(PARCELAS).find(function(k){return PARCELAS[k].some(function(p){return p.id===id;});});
  if(!pid)return;
  var pl=PLANOS.find(function(p){return p.id===pid;});
  var p=PARCELAS[pid].find(function(x){return x.id===id;});
  var isObra=pl&&pl.tipo==="juros_obra";
  var campos=[
    {k:"numero",l:"Nº",t:"number",v:p.numero},
    {k:"vencimento",l:"Vencimento",t:"date",v:p.vencimento?String(p.vencimento).slice(0,10):""},
    {k:"valor_previsto",l:"Valor previsto",t:"money",v:p.valor_previsto}
  ];
  if(isObra){
    campos.push({k:"evolucao",l:"Evolução da obra (%)",t:"number",v:(p.meta&&p.meta.evolucao!=null?p.meta.evolucao:"")});
    campos.push({k:"incc",l:"INCC do mês (%)",t:"number",v:(p.meta&&p.meta.incc!=null?p.meta.incc:"")});
  }
  if(p.quitado) campos.push({k:"valor_pago",l:"Valor pago",t:"money",v:(p.valor_pago!=null?p.valor_pago:p.valor_previsto)});
  formModal("Editar parcela",campos,function(d){
    var upd={numero:Number(d.numero)||p.numero, vencimento:d.vencimento||null, valor_previsto:moneyNum(d.valor_previsto)};
    if(p.quitado && d.valor_pago!=null) upd.valor_pago=moneyNum(d.valor_pago);
    if(isObra){ var meta=Object.assign({},p.meta||{});
      if(d.evolucao!=="") meta.evolucao=Number(d.evolucao); if(d.incc!=="") meta.incc=Number(d.incc);
      upd.meta=meta;
    }
    return SB.from("vf_parcelas").update(upd).eq("id",id).then(function(r){
      if(r.error){toast("Erro: "+r.error.message,"danger");return false;}
      toast("Parcela atualizada","ok");
      return carregar().then(function(){ var o=document.querySelector(".ovl"); if(o)o.remove(); abrirPlano(pid); });
    });
  });
}
function delPlano(pid){
  if(!confirm("Excluir este plano e todas as suas parcelas? Isso não pode ser desfeito."))return;
  SB.from("vf_planos").delete().eq("id",pid).then(function(r){
    if(r.error){toast("Erro ao excluir","danger");return;}
    var o=document.querySelector(".ovl"); if(o)o.remove(); toast("Plano excluído","ok"); carregar();
  });
}
function editarContrato(){
  var c=CONTRATO;
  formModal("Editar cadastro",[
    {k:"nome",l:"Nome do contrato",t:"text",v:c.nome},
    {k:"bem_tipo",l:"Tipo de bem",t:"select",v:c.bem_tipo,opts:Object.keys(TIPO_LABEL).map(function(k){return {v:k,l:TIPO_LABEL[k]};})},
    {k:"valor_bem",l:"Valor do bem",t:"money",v:c.valor_bem},
    {k:"entrada_valor",l:"Entrada",t:"money",v:c.entrada_valor},
    {k:"instituicao",l:"Instituição",t:"text",v:c.instituicao||""}
  ],function(d){
    var meta=Object.assign({},c.meta||{}); delete meta.revisar;
    return SB.from("vf_contratos").update({nome:d.nome,bem_tipo:d.bem_tipo,valor_bem:moneyNum(d.valor_bem),entrada_valor:moneyNum(d.entrada_valor),instituicao:d.instituicao||null,meta:meta}).eq("id",c.id).then(function(r){
      if(r.error){toast("Erro: "+r.error.message,"danger");return false;}
      Object.assign(CONTRATO,{nome:d.nome,bem_tipo:d.bem_tipo,valor_bem:moneyNum(d.valor_bem),entrada_valor:moneyNum(d.entrada_valor),instituicao:d.instituicao,meta:meta});
      toast("Cadastro atualizado","ok"); renderDash();
    });
  });
}

/* ---------- modal de formulário genérico ---------- */
function fieldHTML(f){
  var lbl='<label>'+esc(f.l)+'</label>';
  if(f.t==="money")return '<div class="field">'+lbl+'<div class="moneyfld"><span class="pre">R$</span><input id="f_'+f.k+'" inputmode="decimal" value="'+(f.v?moneyFmt(f.v):"")+'" placeholder="0,00"></div></div>';
  if(f.t==="select")return '<div class="field">'+lbl+'<select id="f_'+f.k+'">'+f.opts.map(function(o){return '<option value="'+o.v+'"'+(String(f.v)===String(o.v)?" selected":"")+'>'+esc(o.l)+'</option>';}).join("")+'</select></div>';
  if(f.t==="number")return '<div class="field">'+lbl+'<input id="f_'+f.k+'" type="number" value="'+esc(f.v)+'"></div>';
  if(f.t==="date")return '<div class="field">'+lbl+'<input id="f_'+f.k+'" type="date" value="'+esc(f.v||"")+'"></div>';
  if(f.t==="month")return '<div class="field">'+lbl+'<input id="f_'+f.k+'" type="month" value="'+esc(f.v||"")+'"></div>';
  return '<div class="field">'+lbl+'<input id="f_'+f.k+'" value="'+esc(f.v||"")+'"></div>';
}
function formModal(title,fields,onSave,dark){
  var ovl=document.createElement("div"); ovl.className="ovl"+(dark?" dark":"");
  ovl.innerHTML='<div class="box"><h2 style="font-size:1.1rem;margin-bottom:12px">'+esc(title)+'</h2>'+fields.map(fieldHTML).join("")+
    '<div class="err" id="fmErr"></div><div class="row" style="justify-content:flex-end;margin-top:6px"><button class="chip" id="fmCancel">Cancelar</button><button class="chip on" id="fmOk">Salvar</button></div></div>';
  document.body.appendChild(ovl);
  ovl.querySelector("#fmCancel").onclick=function(){ovl.remove();};
  ovl.querySelector("#fmOk").onclick=function(){
    var d={}; fields.forEach(function(f){ var el=$("f_"+f.k); d[f.k]=el?el.value:""; });
    var res=onSave(d); if(res&&res.then)res.then(function(ok){ if(ok!==false)ovl.remove(); }); else if(res!==false)ovl.remove();
  };
}
window.APP={ login:login, logout:logout, togglePass:togglePass, abrirPlano:abrirPlano, togglePaga:togglePaga,
  addParcelaManual:addParcelaManual, editarParcela:editarParcela, delPlano:delPlano, editarContrato:editarContrato };
/* hook de validação (preview): permite conferir o motor sem logar */
window.__VF={ gerarParcelas:gerarParcelas, taxaMensal:taxaMensal, moneyNum:moneyNum };

/* ===================== WIZARD (cadastro genérico) ===================== */
var W={ step:0, data:{ bem_tipo:null, nome:"", valor_bem:"", entrada_valor:"", instituicao:"", data_inicio:"", planos:[] } };
var STEPS=["Tipo de bem","Dados do bem","Pagamentos","Revisão"];

function wizOpen(){ W={ step:0, data:{ bem_tipo:null, nome:"", valor_bem:"", entrada_valor:"", instituicao:"", data_inicio:"", planos:[] } }; $("wiz").classList.add("on"); wizRender(); }
function wizSteps(){ $("wzSteps").innerHTML=STEPS.map(function(s,i){ return '<span class="wz-step '+(i===W.step?"on":(i<W.step?"done":""))+'">'+(i+1)+". "+s+'</span>'; }).join(""); }
function wizCollect(){
  var d=W.data;
  if(W.step===1){ d.nome=($("wNome")||{}).value||d.nome; d.valor_bem=($("wValor")||{}).value||d.valor_bem; d.entrada_valor=($("wEntrada")||{}).value||d.entrada_valor; d.instituicao=($("wInst")||{}).value||d.instituicao; d.data_inicio=($("wData")||{}).value||d.data_inicio; }
}
function wizRender(){
  wizSteps(); var d=W.data, b=$("wzBody");
  if(W.step===0){
    b.innerHTML='<div class="card"><h2>Qual bem você está financiando?</h2><div class="cap" style="margin-bottom:14px">Isso ajusta as perguntas seguintes.</div>'+
      '<div class="tipos">'+Object.keys(TIPO_LABEL).map(function(k){return '<div class="tipo'+(d.bem_tipo===k?" sel":"")+'" onclick="WIZ.pickTipo(\''+k+'\')"><div class="ic">'+TIPO_IC[k]+'</div><div class="nm">'+TIPO_LABEL[k]+'</div></div>';}).join("")+'</div></div>';
  } else if(W.step===1){
    b.innerHTML='<div class="card"><h2>Dados do bem</h2><div class="cap" style="margin-bottom:14px">Esse nome aparece no topo do seu painel.</div>'+
      '<div class="field"><label>Nome do contrato</label><input id="wNome" value="'+esc(d.nome)+'" placeholder="Ex.: Meu Apê 203, Meu carro, Lote 12"></div>'+
      '<div class="grid2"><div class="field"><label>Valor do bem</label><div class="moneyfld"><span class="pre">R$</span><input id="wValor" inputmode="decimal" value="'+(d.valor_bem?moneyFmt(moneyNum(d.valor_bem)):"")+'" placeholder="0,00"></div></div>'+
      '<div class="field"><label>Entrada (se houver)</label><div class="moneyfld"><span class="pre">R$</span><input id="wEntrada" inputmode="decimal" value="'+(d.entrada_valor?moneyFmt(moneyNum(d.entrada_valor)):"")+'" placeholder="0,00"></div></div></div>'+
      '<div class="grid2"><div class="field"><label>Instituição (banco/construtora)</label><input id="wInst" value="'+esc(d.instituicao)+'" placeholder="Ex.: Caixa, MRV"></div>'+
      '<div class="field"><label>Início do contrato</label><input id="wData" type="date" value="'+esc(d.data_inicio)+'"></div></div></div>';
  } else if(W.step===2){
    var lista=d.planos.length? d.planos.map(function(p,i){ return '<div class="plano-item"><div>'+(PLANO_IC[p.tipo]||"•")+' <b>'+esc(p.nome)+'</b><div class="cap" style="color:#8A93A8">'+planoResumo(p)+'</div></div><button class="x" onclick="WIZ.rmPlano('+i+')">✕</button></div>'; }).join("") : '<div class="cap" style="color:#8A93A8">Nenhum bloco ainda.</div>';
    b.innerHTML='<div class="card"><h2>Como o pagamento é dividido?</h2><div class="cap" style="margin-bottom:14px">Adicione os blocos que fizerem sentido. Você pode ter vários — ex.: entrada parcelada + financiamento + custos.</div>'+
      lista+
      '<div class="row" style="margin-top:14px;gap:8px;flex-wrap:wrap">'+
        '<button class="chip on" onclick="WIZ.addBloco(\'parcelamento\')">+ Parcelamento simples</button>'+
        '<button class="chip on" onclick="WIZ.addBloco(\'amortizacao\')">+ Financiamento (SAC/PRICE)</button>'+
        '<button class="chip on" onclick="WIZ.addBloco(\'juros_obra\')">+ Juros de obra</button>'+
        '<button class="chip on" onclick="WIZ.addBloco(\'custos\')">+ Custos (ITBI, cartório…)</button>'+
      '</div></div>';
  } else if(W.step===3){
    var tot=d.planos.reduce(function(s,p){return s+(p._parc||[]).reduce(function(x,q){return x+(Number(q.valor_previsto)||0);},0);},0);
    b.innerHTML='<div class="card"><h2>Confira e crie</h2>'+
      '<div class="cap" style="margin-bottom:12px">'+(TIPO_IC[d.bem_tipo]||"")+' '+(TIPO_LABEL[d.bem_tipo]||"")+' · <b style="color:#fff">'+esc(d.nome||"—")+'</b></div>'+
      '<table style="color:#D2D8E4"><thead><tr><th style="color:#8A93A8">Bloco</th><th style="color:#8A93A8" class="num">Parcelas</th><th style="color:#8A93A8" class="num">Total</th></tr></thead><tbody>'+
      d.planos.map(function(p){var pt=(p._parc||[]).reduce(function(x,q){return x+(Number(q.valor_previsto)||0);},0);return '<tr><td>'+(PLANO_IC[p.tipo]||"•")+' '+esc(p.nome)+'</td><td class="num">'+(p._parc||[]).length+'</td><td class="num">'+fmtBRL(pt)+'</td></tr>';}).join("")+
      '</tbody></table><div class="spread" style="margin-top:12px"><span class="cap">Soma dos previstos</span><b style="color:#fff">'+fmtBRL(tot)+'</b></div></div>';
  }
  $("wzBack").style.visibility=W.step===0?"hidden":"visible";
  $("wzNext").textContent=W.step===STEPS.length-1?"Criar contrato ✓":"Próximo →";
}
function planoResumo(p){ var c=p.cfg||{};
  if(p.tipo==="amortizacao")return (c.sistema||"PRICE")+" · "+fmtBRL(moneyNum(c.total))+" · "+(c.meses||0)+"x · "+(c.taxaAA||0)+"% a.a.";
  if(p.tipo==="juros_obra")return (c.meses||0)+" meses · "+(c.taxaAM||0)+"% a.m. + INCC "+(c.incc||0)+"%";
  return fmtBRL(moneyNum(c.total))+" em "+(c.nParc||1)+"x";
}
function pickTipo(k){ W.data.bem_tipo=k; wizRender(); }
function addBloco(tipo){
  var defs={
    parcelamento:{nome:"Parcelamento",fields:[{k:"nome",l:"Nome do bloco",t:"text",v:"Entrada parcelada"},{k:"total",l:"Valor total",t:"money",v:""},{k:"nParc",l:"Nº de parcelas",t:"number",v:12},{k:"primeiraData",l:"1ª parcela",t:"date",v:W.data.data_inicio}]},
    amortizacao:{nome:"Financiamento",fields:[{k:"nome",l:"Nome do bloco",t:"text",v:"Financiamento"},{k:"total",l:"Valor financiado",t:"money",v:""},{k:"sistema",l:"Sistema",t:"select",v:"SAC",opts:[{v:"SAC",l:"SAC (parcela decrescente)"},{v:"PRICE",l:"PRICE (parcela fixa)"}]},{k:"taxaAA",l:"Juros (% ao ano)",t:"number",v:""},{k:"meses",l:"Prazo (meses)",t:"number",v:420},{k:"primeiraData",l:"1ª parcela",t:"date",v:W.data.data_inicio}]},
    juros_obra:{nome:"Juros de obra",fields:[{k:"nome",l:"Nome do bloco",t:"text",v:"Juros de obra"},{k:"total",l:"Valor da obra financiado",t:"money",v:""},{k:"meses",l:"Meses de obra",t:"number",v:""},{k:"taxaAM",l:"Juros (% ao mês)",t:"number",v:""},{k:"incc",l:"INCC estimado (% a.m.)",t:"number",v:""},{k:"primeiraData",l:"1ª parcela",t:"date",v:W.data.data_inicio}]},
    custos:{nome:"Custos",fields:[{k:"nome",l:"Nome do bloco",t:"text",v:"Documentação e custos"},{k:"total",l:"Valor total",t:"money",v:""},{k:"nParc",l:"Nº de parcelas",t:"number",v:1},{k:"primeiraData",l:"1ª parcela",t:"date",v:W.data.data_inicio}]}
  };
  var def=defs[tipo];
  formModal("Adicionar "+def.nome,def.fields,function(vals){
    var cfg={}; def.fields.forEach(function(f){ cfg[f.k]= f.t==="money"?moneyNum(vals[f.k]) : (f.t==="number"?Number(vals[f.k])||0 : vals[f.k]); });
    var parc=gerarParcelas(tipo,cfg);
    W.data.planos.push({tipo:tipo,nome:vals.nome||def.nome,cfg:cfg,_parc:parc});
    wizRender();
  },true);
}
function rmPlano(i){ W.data.planos.splice(i,1); wizRender(); }
function wizNext(){
  wizCollect();
  if(W.step===0 && !W.data.bem_tipo){ toast("Escolha o tipo de bem","warn"); return; }
  if(W.step===1 && !((W.data.nome||"").trim())){ toast("Dê um nome ao contrato","warn"); return; }
  if(W.step===STEPS.length-1){ return wizSave(); }
  W.step++; wizRender(); window.scrollTo(0,0);
}
function wizBack(){ wizCollect(); if(W.step>0){ W.step--; wizRender(); window.scrollTo(0,0); } }

function wizSave(){
  var d=W.data;
  $("wzNext").disabled=true; $("wzNext").textContent="Criando…";
  var ins={ user_id:USER.id, produto:"finance", nome:(d.nome||"Meu financiamento").trim(), bem_tipo:d.bem_tipo,
    valor_bem:moneyNum(d.valor_bem), entrada_valor:moneyNum(d.entrada_valor), instituicao:d.instituicao||null,
    data_inicio:d.data_inicio||null, meta:{origem:"wizard_v2"} };
  SB.from("vf_contratos").insert(ins).select().single().then(function(r){
    if(r.error){ toast("Erro: "+r.error.message,"danger"); $("wzNext").disabled=false; $("wzNext").textContent="Criar contrato ✓"; return; }
    var contrato=r.data; var ordem=0, chain=Promise.resolve();
    d.planos.forEach(function(p){
      chain=chain.then(function(){
        return SB.from("vf_planos").insert({contrato_id:contrato.id,user_id:USER.id,nome:p.nome,tipo:p.tipo,ordem:++ordem,config:Object.assign({},p.cfg)}).select().single().then(function(rp){
          if(rp.error)throw rp.error; var plano=rp.data;
          var rows=(p._parc||[]).map(function(q){ return {plano_id:plano.id,contrato_id:contrato.id,user_id:USER.id,numero:q.numero,vencimento:q.vencimento||null,valor_previsto:q.valor_previsto,juros:q.juros||null,amortizacao:q.amortizacao||null,saldo:q.saldo||null,origem:"gerada",meta:q.meta||{}}; });
          return rows.length? SB.from("vf_parcelas").insert(rows) : Promise.resolve();
        });
      });
    });
    chain.then(function(){ $("wiz").classList.remove("on"); CONTRATO=contrato; toast("Contrato criado!","ok"); carregar(); })
      .catch(function(e){ toast("Erro ao salvar planos: "+(e.message||e),"danger"); $("wzNext").disabled=false; $("wzNext").textContent="Criar contrato ✓"; });
  });
}
window.WIZ={ open:wizOpen, next:wizNext, back:wizBack, pickTipo:pickTipo, addBloco:addBloco, rmPlano:rmPlano,
  addPlanoModal:function(){ /* adiciona plano a um contrato existente */ addPlanoExistente(); } };

/* adicionar plano a contrato já criado (fora do wizard) */
function addPlanoExistente(){
  var tipos=[{v:"parcelamento",l:"Parcelamento simples"},{v:"amortizacao",l:"Financiamento (SAC/PRICE)"},{v:"juros_obra",l:"Juros de obra"},{v:"custos",l:"Custos"}];
  formModal("Novo plano — escolha o tipo",[{k:"tipo",l:"Tipo de plano",t:"select",v:"parcelamento",opts:tipos}],function(d){
    var tipo=d.tipo;
    var saved=W; W={data:{planos:[],data_inicio:CONTRATO.data_inicio||""}}; // reusa addBloco p/ config
    var origPush=Array.prototype.push;
    // abre o form de config do bloco e grava direto no banco
    var defs={
      parcelamento:[{k:"nome",l:"Nome",t:"text",v:"Parcelamento"},{k:"total",l:"Valor total",t:"money",v:""},{k:"nParc",l:"Nº de parcelas",t:"number",v:12},{k:"primeiraData",l:"1ª parcela",t:"date",v:CONTRATO.data_inicio||""}],
      amortizacao:[{k:"nome",l:"Nome",t:"text",v:"Financiamento"},{k:"total",l:"Valor financiado",t:"money",v:""},{k:"sistema",l:"Sistema",t:"select",v:"SAC",opts:[{v:"SAC",l:"SAC"},{v:"PRICE",l:"PRICE"}]},{k:"taxaAA",l:"Juros (% a.a.)",t:"number",v:""},{k:"meses",l:"Prazo (meses)",t:"number",v:420},{k:"primeiraData",l:"1ª parcela",t:"date",v:CONTRATO.data_inicio||""}],
      juros_obra:[{k:"nome",l:"Nome",t:"text",v:"Juros de obra"},{k:"total",l:"Valor da obra",t:"money",v:""},{k:"meses",l:"Meses",t:"number",v:""},{k:"taxaAM",l:"Juros (% a.m.)",t:"number",v:""},{k:"incc",l:"INCC (% a.m.)",t:"number",v:""},{k:"primeiraData",l:"1ª parcela",t:"date",v:CONTRATO.data_inicio||""}],
      custos:[{k:"nome",l:"Nome",t:"text",v:"Custos"},{k:"total",l:"Valor total",t:"money",v:""},{k:"nParc",l:"Nº de parcelas",t:"number",v:1},{k:"primeiraData",l:"1ª parcela",t:"date",v:CONTRATO.data_inicio||""}]
    };
    W=saved;
    formModal("Configurar plano",defs[tipo],function(vals){
      var cfg={}; defs[tipo].forEach(function(f){ cfg[f.k]= f.t==="money"?moneyNum(vals[f.k]) : (f.t==="number"?Number(vals[f.k])||0 : vals[f.k]); });
      var parc=gerarParcelas(tipo,cfg);
      var ordem=(PLANOS.reduce(function(m,p){return Math.max(m,p.ordem||0);},0))+1;
      return SB.from("vf_planos").insert({contrato_id:CONTRATO.id,user_id:USER.id,nome:vals.nome||tipo,tipo:tipo,ordem:ordem,config:cfg}).select().single().then(function(rp){
        if(rp.error){toast("Erro: "+rp.error.message,"danger");return false;}
        var rows=parc.map(function(q){return {plano_id:rp.data.id,contrato_id:CONTRATO.id,user_id:USER.id,numero:q.numero,vencimento:q.vencimento||null,valor_previsto:q.valor_previsto,juros:q.juros||null,amortizacao:q.amortizacao||null,saldo:q.saldo||null,origem:"gerada",meta:q.meta||{}};});
        return (rows.length?SB.from("vf_parcelas").insert(rows):Promise.resolve()).then(function(){ toast("Plano criado","ok"); carregar(); });
      });
    },false);
    return true;
  });
}
})();
