/* =========================================================================
   MÓDULO AGENDA / PAUTA DO DIA — padrão VIZIO §16
   Gerenciador de Financiamento. Persistência no backend (Supabase + RLS),
   nunca localStorage: a pauta acompanha o usuário, não o aparelho.

   §16: semana à vista · Manhã/Tarde/Noite com contagem e período atual aberto ·
        arrastar (§15) · clicar para editar · quadro de tarefas com cronometragem ·
        faixa de foco no topo.
   §15: arrastar tipado (text/agenda-ev · text/agenda-tar) + text/plain de reserva;
        zona que recebe tipo desconhecido IGNORA; realce sempre limpo;
        soltar no mesmo lugar não faz nada; encaixe inteligente de horário;
        persiste + escreve trilha; e NUNCA é o único caminho (há botões).
   ========================================================================= */
(function(){
"use strict";

/* Dias exibidos (§16: "é configuração, não código novo").
   Financiamento é uso pessoal de expediente → Seg–Sex, como o Inovar. */
var DIAS_SEMANA = (window.DADOS && DADOS._cfg && DADOS._cfg.agendaDias) || [1,2,3,4,5];
var PERIODOS = [
  {id:'manha', nome:'Manhã', ic:'🌅', de:5,  ate:11, horaPadrao:'09:00'},
  {id:'tarde', nome:'Tarde', ic:'☀️', de:12, ate:17, horaPadrao:'14:00'},
  {id:'noite', nome:'Noite', ic:'🌙', de:18, ate:23, horaPadrao:'19:30'}
];
var COLS = {pendente:'Pendente', andamento:'Em andamento', concluida:'Concluída'};

var ATIV = [], TAR = [], REF = null, ABERTOS = {}, CARREGANDO = false;

/* ---------- utilitários ---------- */
function SB(){ return window.SUPA || null; }
/* O módulo resolve o próprio user_id pela sessão — não depende de outro
   arquivo expor variável global (era um acoplamento frágil). */
var MEU_ID=null;
function uid(){ return MEU_ID; }
function garantirId(){
  if(MEU_ID) return Promise.resolve(MEU_ID);
  var sb=SB(); if(!sb) return Promise.resolve(null);
  return sb.auth.getUser().then(function(r){
    MEU_ID=(r&&r.data&&r.data.user)?r.data.user.id:null; return MEU_ID;
  }).catch(function(){ return null; });
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function iso(d){ return d.toISOString().slice(0,10); }
function hoje(){ var d=new Date(); d.setHours(0,0,0,0); return d; }
function periodoAgora(){ var h=new Date().getHours(); for(var i=0;i<PERIODOS.length;i++){ if(h>=PERIODOS[i].de && h<=PERIODOS[i].ate) return PERIODOS[i].id; } return 'noite'; }
function inicioSemana(base){ var d=new Date(base); var dow=d.getDay(); var diff=(dow===0?-6:1-dow); d.setDate(d.getDate()+diff); d.setHours(0,0,0,0); return d; }
function diasDaSemana(){ var ini=inicioSemana(REF||hoje()), out=[];
  for(var i=0;i<7;i++){ var d=new Date(ini); d.setDate(ini.getDate()+i); if(DIAS_SEMANA.indexOf(d.getDay())>=0) out.push(d); }
  return out; }
function rotuloDia(d){ return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()]; }
function ehHoje(d){ return iso(d)===iso(hoje()); }
function fmtDur(ms){ ms=Number(ms)||0; var s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60);
  if(h>0) return h+'h'+String(m%60).padStart(2,'0'); if(m>0) return m+' min'; return s+'s'; }
function toast(m,k){ if(window.CRUD&&CRUD.toast) return CRUD.toast(m,k);
  var t=document.createElement('div'); t.textContent=m;
  t.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#10141F;color:#fff;padding:11px 18px;border-radius:10px;font:600 .86rem Inter,sans-serif;z-index:9500;box-shadow:0 8px 24px rgba(0,0,0,.3)';
  document.body.appendChild(t); setTimeout(function(){t.remove();},2800); }

/* ---------- CSS (acento do produto: --blue do próprio sistema) ---------- */
function ensureCss(){
  if(document.getElementById('agendaCss')) return;
  var s=document.createElement('style'); s.id='agendaCss';
  s.textContent=
    '.ag-foco{display:flex;align-items:center;gap:10px;background:var(--blue-soft);border:1px solid #C3D9FC;color:#13386F;border-radius:var(--radius);padding:12px 16px;font-size:.9rem;margin-bottom:16px}'+
    '.ag-foco b{color:var(--blue-d)}'+
    '.ag-nav{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}'+
    '.ag-week{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;align-items:start}'+
    '@media(max-width:980px){.ag-week{grid-template-columns:1fr}}'+
    '.ag-day{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}'+
    '.ag-day.hoje{border-color:var(--blue);box-shadow:0 0 0 3px var(--blue-soft)}'+
    '.ag-dhead{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border2)}'+
    '.ag-dhead .dw{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}'+
    '.ag-dhead .dn{font-size:1.05rem;font-weight:800;font-family:var(--font-display)}'+
    '.ag-day.hoje .dn{color:var(--blue)}'+
    '.ag-badge-hoje{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:var(--blue);color:#fff;padding:2px 6px;border-radius:5px}'+
    '.ag-add{background:none;border:0;color:var(--blue);font-size:1.1rem;cursor:pointer;padding:2px 6px;border-radius:6px}'+
    '.ag-add:hover{background:var(--blue-soft)}'+
    '.ag-per{border-bottom:1px solid var(--border2)}.ag-per:last-child{border-bottom:0}'+
    '.ag-phead{display:flex;align-items:center;gap:7px;padding:8px 12px;cursor:pointer;font-size:.78rem;font-weight:700;color:var(--muted);user-select:none}'+
    '.ag-phead:hover{background:var(--row)}'+
    '.ag-phead .ct{margin-left:auto;background:var(--row);color:var(--muted);border-radius:999px;padding:1px 8px;font-size:.7rem}'+
    '.ag-phead.agora{color:var(--blue-d)}.ag-phead.agora .ct{background:var(--blue-soft);color:var(--blue-d)}'+
    '.ag-agora{font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:var(--blue);color:#fff;padding:1px 6px;border-radius:5px}'+
    '.ag-plist{padding:6px 10px 10px;min-height:44px}'+
    '.ag-plist.drop-ok{outline:2px dashed var(--blue);outline-offset:-4px;background:var(--blue-soft)}'+
    '.ag-ev{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--blue);border-radius:9px;padding:8px 10px;margin-bottom:7px;cursor:grab;font-size:.84rem}'+
    '.ag-ev:hover{border-color:var(--blue)}'+
    '.ag-ev.dragging{opacity:.45}'+
    '.ag-ev .h{font-size:.72rem;color:var(--muted);font-weight:700}'+
    '.ag-ev .t{font-weight:600;line-height:1.3}'+
    '.ag-ev.ok .t{text-decoration:line-through;color:var(--muted2)}'+
    '.ag-ev .acts{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}'+
    '.ag-mini{border:1px solid var(--border);background:#fff;color:var(--muted);border-radius:6px;font-size:.68rem;font-weight:600;padding:2px 7px;cursor:pointer;white-space:nowrap}'+
    '.ag-mini:hover{border-color:var(--blue);color:var(--blue)}'+
    '.ag-vazio{font-size:.76rem;color:var(--muted2);padding:4px 2px}'+
    '.ag-board{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}'+
    '@media(max-width:900px){.ag-board{grid-template-columns:1fr}}'+
    '.ag-col{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px}'+
    '.ag-col.drop-ok{outline:2px dashed var(--blue);outline-offset:-4px;background:var(--blue-soft)}'+
    '.ag-col h3{font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:9px;display:flex;align-items:center;gap:7px}'+
    '.ag-col h3 .ct{margin-left:auto;background:var(--row);border-radius:999px;padding:1px 8px;font-size:.7rem}'+
    '.ag-tar{background:#fff;border:1px solid var(--border);border-radius:9px;padding:9px 11px;margin-bottom:8px;cursor:grab;font-size:.85rem}'+
    '.ag-tar.dragging{opacity:.45}'+
    '.ag-tar .cron{font-size:.68rem;color:var(--muted2);margin-top:5px}'+
    '.ag-ovl{position:fixed;inset:0;background:rgba(9,13,22,.62);z-index:9400;display:flex;align-items:center;justify-content:center;padding:20px}'+
    '.ag-box{background:var(--surface);border-radius:16px;max-width:460px;width:100%;padding:22px 24px;box-shadow:var(--shadow-lg);max-height:86vh;overflow:auto}';
  document.head.appendChild(s);
}

/* ---------- dados ---------- */
function carregar(){
  var sb=SB(); if(!sb) return Promise.resolve();
  CARREGANDO=true;
  return garantirId().then(function(){ return carregarDados(sb); });
}
function carregarDados(sb){
  var ini=iso(inicioSemana(REF||hoje())); var fim=new Date(inicioSemana(REF||hoje())); fim.setDate(fim.getDate()+6);
  return Promise.all([
    sb.from('fin_agenda_atividades').select('*').gte('data',ini).lte('data',iso(fim)).order('hora',{nullsFirst:true}),
    sb.from('fin_agenda_tarefas').select('*').order('ordem')
  ]).then(function(r){
    ATIV=(r[0]&&r[0].data)||[]; TAR=(r[1]&&r[1].data)||[]; CARREGANDO=false;
  }).catch(function(){ CARREGANDO=false; });
}
function trilha(entidade,id,de,para,detalhe){
  var sb=SB(); if(!sb) return Promise.resolve();
  var u=uid(); if(!u) return Promise.resolve();
  return sb.from('fin_agenda_trilha').insert({user_id:u,entidade:entidade,entidade_id:id,de:de,para:para,detalhe:detalhe||{}}).then(function(){},function(){});
}

/* ---------- render ---------- */
function render(v){
  ensureCss();
  if(!REF) REF=hoje();
  document.body.classList.remove('home');
  v.innerHTML='<div class="cap">Carregando sua pauta…</div>';
  carregar().then(function(){ v.innerHTML=html(); ligarEventos(v); });
}
function html(){
  var pAgora=PERIODOS.filter(function(p){return p.id===periodoAgora();})[0]||PERIODOS[0];
  var dias=diasDaSemana();
  var ini=inicioSemana(REF||hoje());
  var fimS=new Date(ini); fimS.setDate(ini.getDate()+6);
  var faixa='<div class="ag-foco">'+pAgora.ic+'<div>Agora é <b>'+pAgora.nome+'</b> — foque nas atividades deste período.</div></div>';
  var nav='<div class="ag-nav">'+
    '<button class="chip" data-nav="-1">‹ Semana anterior</button>'+
    '<button class="chip on" data-nav="0">Hoje</button>'+
    '<button class="chip" data-nav="1">Próxima semana ›</button>'+
    '<span class="cap" style="margin-left:auto">'+ini.getDate()+'/'+(ini.getMonth()+1)+' – '+fimS.getDate()+'/'+(fimS.getMonth()+1)+'</span>'+
  '</div>';

  var week=dias.map(function(d){
    var dISO=iso(d), isHoje=ehHoje(d);
    var pers=PERIODOS.map(function(p){
      var lista=ATIV.filter(function(a){return a.data===dISO && a.periodo===p.id;});
      var chave=dISO+'|'+p.id;
      var aberto=(ABERTOS[chave]!==undefined)?ABERTOS[chave]:(isHoje ? p.id===pAgora.id : lista.length>0);
      var agoraTag=(isHoje&&p.id===pAgora.id)?'<span class="ag-agora">agora</span>':'';
      var itens=lista.length?lista.map(function(a){return evHTML(a);}).join(''):'<div class="ag-vazio">—</div>';
      return '<div class="ag-per">'+
        '<div class="ag-phead'+((isHoje&&p.id===pAgora.id)?' agora':'')+'" data-toggle="'+chave+'">'+p.ic+' '+p.nome+' '+agoraTag+'<span class="ct">'+lista.length+'</span></div>'+
        (aberto?'<div class="ag-plist" data-drop-dia="'+dISO+'" data-drop-per="'+p.id+'">'+itens+'</div>':'')+
      '</div>';
    }).join('');
    return '<div class="ag-day'+(isHoje?' hoje':'')+'">'+
      '<div class="ag-dhead"><div><div class="dw">'+rotuloDia(d)+(isHoje?' <span class="ag-badge-hoje">hoje</span>':'')+'</div>'+
      '<div class="dn">'+d.getDate()+'/'+String(d.getMonth()+1).padStart(2,'0')+'</div></div>'+
      '<button class="ag-add" data-novo="'+dISO+'" title="Nova atividade">＋</button></div>'+
      pers+'</div>';
  }).join('');

  var board=Object.keys(COLS).map(function(st){
    var lista=TAR.filter(function(t){return t.status===st;});
    var itens=lista.length?lista.map(function(t){return tarHTML(t);}).join(''):'<div class="ag-vazio">Nenhuma tarefa aqui.</div>';
    return '<div class="ag-col" data-drop-status="'+st+'"><h3>'+COLS[st]+'<span class="ct">'+lista.length+'</span></h3>'+itens+'</div>';
  }).join('');

  return faixa+nav+
    '<div class="ag-week">'+week+'</div>'+
    '<div class="card" style="margin-top:20px"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px">'+
      '<div><h2 style="font-size:1.05rem">Tarefas</h2><div class="cap">Arraste entre as colunas — o tempo de cada etapa é cronometrado.</div></div>'+
      '<button class="chip on" data-nova-tarefa="1">＋ Nova tarefa</button></div>'+
      '<div class="ag-board">'+board+'</div></div>'+
    (window.sig?window.sig():'');
}
function evHTML(a){
  return '<div class="ag-ev'+(a.concluida?' ok':'')+'" draggable="true" data-ev="'+a.id+'">'+
    '<div class="h">'+(a.hora?String(a.hora).slice(0,5):'—')+'</div>'+
    '<div class="t">'+esc(a.titulo)+'</div>'+
    (a.obs?'<div class="cap" style="font-size:.74rem">'+esc(a.obs)+'</div>':'')+
    '<div class="acts">'+
      '<button class="ag-mini" data-edit="'+a.id+'">Editar</button>'+
      '<button class="ag-mini" data-mover="'+a.id+'">Mover</button>'+
      '<button class="ag-mini" data-ok="'+a.id+'">'+(a.concluida?'Reabrir':'Concluir')+'</button>'+
      '<button class="ag-mini" data-del="'+a.id+'">Excluir</button>'+
    '</div></div>';
}
function tarHTML(t){
  var tm=t.tempo_ms||{};
  var partes=['pendente','andamento','concluida'].filter(function(k){return (tm[k]||0)>0;})
    .map(function(k){return COLS[k]+': '+fmtDur(tm[k]);}).join(' · ');
  return '<div class="ag-tar" draggable="true" data-tar="'+t.id+'">'+
    '<div style="font-weight:600">'+esc(t.titulo)+'</div>'+
    (partes?'<div class="cron">⏱ '+partes+'</div>':'')+
    '<div class="acts" style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">'+
      '<button class="ag-mini" data-tstatus="'+t.id+'">Mudar etapa</button>'+
      '<button class="ag-mini" data-thist="'+t.id+'">Histórico</button>'+
      '<button class="ag-mini" data-tdel="'+t.id+'">Excluir</button>'+
    '</div></div>';
}

/* ---------- eventos (clique + arrastar) ---------- */
function ligarEventos(v){
  v.addEventListener('click',function(e){
    var el=e.target.closest('[data-nav],[data-toggle],[data-novo],[data-edit],[data-mover],[data-ok],[data-del],[data-nova-tarefa],[data-tstatus],[data-thist],[data-tdel]');
    if(!el) return;
    if(el.dataset.nav!==undefined){ var n=Number(el.dataset.nav);
      if(n===0) REF=hoje(); else { REF=new Date(inicioSemana(REF||hoje())); REF.setDate(REF.getDate()+n*7); }
      ABERTOS={}; render(v); return; }
    if(el.dataset.toggle){ var k=el.dataset.toggle; var atual=!!v.querySelector('[data-drop-dia="'+k.split('|')[0]+'"][data-drop-per="'+k.split('|')[1]+'"]'); ABERTOS[k]=!atual; v.innerHTML=html(); ligarEventos(v); return; }
    if(el.dataset.novo){ formAtividade(v,null,el.dataset.novo); return; }
    if(el.dataset.edit){ formAtividade(v,el.dataset.edit); return; }
    if(el.dataset.mover){ moverPorBotao(v,el.dataset.mover); return; }
    if(el.dataset.ok){ alternarConcluida(v,el.dataset.ok); return; }
    if(el.dataset.del){ excluirAtividade(v,el.dataset.del); return; }
    if(el.dataset.novaTarefa){ formTarefa(v); return; }
    if(el.dataset.tstatus){ mudarEtapaPorBotao(v,el.dataset.tstatus); return; }
    if(el.dataset.thist){ verHistorico(el.dataset.thist); return; }
    if(el.dataset.tdel){ excluirTarefa(v,el.dataset.tdel); return; }
  });

  /* ===== arrastar (§15) ===== */
  var TIPO_EV='text/agenda-ev', TIPO_TAR='text/agenda-tar';
  v.addEventListener('dragstart',function(e){
    var ev=e.target.closest('[data-ev]'), tr=e.target.closest('[data-tar]');
    if(ev){ e.dataTransfer.setData(TIPO_EV,ev.dataset.ev); e.dataTransfer.setData('text/plain','ev:'+ev.dataset.ev);
      e.dataTransfer.effectAllowed='move'; ev.classList.add('dragging'); return; }
    if(tr){ e.dataTransfer.setData(TIPO_TAR,tr.dataset.tar); e.dataTransfer.setData('text/plain','tar:'+tr.dataset.tar);
      e.dataTransfer.effectAllowed='move'; tr.classList.add('dragging'); return; }
  });
  v.addEventListener('dragend',function(){ limparRealce(v); });

  function tipoDe(dt){
    var t=dt.types||[];
    if([].indexOf.call(t,TIPO_EV)>=0) return 'ev';
    if([].indexOf.call(t,TIPO_TAR)>=0) return 'tar';
    return null; /* tipo desconhecido: a zona IGNORA (§15) */
  }
  v.addEventListener('dragover',function(e){
    var zonaDia=e.target.closest('[data-drop-dia]'), zonaCol=e.target.closest('[data-drop-status]');
    var tipo=tipoDe(e.dataTransfer);
    if(zonaDia && tipo==='ev'){ e.preventDefault(); e.dataTransfer.dropEffect='move'; zonaDia.classList.add('drop-ok'); return; }
    if(zonaCol && tipo==='tar'){ e.preventDefault(); e.dataTransfer.dropEffect='move'; zonaCol.classList.add('drop-ok'); return; }
    /* sem preventDefault = não aceita o drop */
  });
  v.addEventListener('dragleave',function(e){
    var z=e.target.closest('.drop-ok'); if(z) z.classList.remove('drop-ok');
  });
  v.addEventListener('drop',function(e){
    var zonaDia=e.target.closest('[data-drop-dia]'), zonaCol=e.target.closest('[data-drop-status]');
    var dt=e.dataTransfer, tipo=tipoDe(dt);
    var plain=dt.getData('text/plain')||'';
    if(zonaDia && (tipo==='ev' || plain.indexOf('ev:')===0)){
      e.preventDefault(); limparRealce(v);
      var id=dt.getData(TIPO_EV)||plain.slice(3);
      soltarAtividade(v,id,zonaDia.dataset.dropDia,zonaDia.dataset.dropPer); return;
    }
    if(zonaCol && (tipo==='tar' || plain.indexOf('tar:')===0)){
      e.preventDefault(); limparRealce(v);
      var tid=dt.getData(TIPO_TAR)||plain.slice(4);
      soltarTarefa(v,tid,zonaCol.dataset.dropStatus); return;
    }
    limparRealce(v); /* tipo que a zona não entende: ignora, sem adivinhar */
  });
}
function limparRealce(v){
  v.querySelectorAll('.drop-ok').forEach(function(z){z.classList.remove('drop-ok');});
  v.querySelectorAll('.dragging').forEach(function(z){z.classList.remove('dragging');});
}

/* ---------- ações: atividades ---------- */
function soltarAtividade(v,id,dia,periodo){
  var a=ATIV.filter(function(x){return x.id===id;})[0]; if(!a) return;
  if(a.data===dia && a.periodo===periodo) return;      /* mesmo lugar: não faz nada */
  var de=a.data+'/'+a.periodo;
  /* encaixe inteligente: hora passa para o padrão do período de destino */
  var p=PERIODOS.filter(function(x){return x.id===periodo;})[0];
  var novaHora=(a.periodo!==periodo)?p.horaPadrao:a.hora;
  var sb=SB(); if(!sb) return;
  sb.from('fin_agenda_atividades').update({data:dia,periodo:periodo,hora:novaHora}).eq('id',id).then(function(r){
    if(r.error){ toast('Não consegui mover: '+r.error.message,'danger'); return; }
    a.data=dia; a.periodo=periodo; a.hora=novaHora;
    trilha('atividade',id,de,dia+'/'+periodo,{via:'arrastar'});
    v.innerHTML=html(); ligarEventos(v); toast('Atividade movida','ok');
  });
}
function moverPorBotao(v,id){   /* §15: arrastar nunca é o único caminho */
  var a=ATIV.filter(function(x){return x.id===id;})[0]; if(!a) return;
  var dias=diasDaSemana();
  var optDia=dias.map(function(d){var s=iso(d);return '<option value="'+s+'"'+(s===a.data?' selected':'')+'>'+rotuloDia(d)+' '+d.getDate()+'/'+(d.getMonth()+1)+'</option>';}).join('');
  var optPer=PERIODOS.map(function(p){return '<option value="'+p.id+'"'+(p.id===a.periodo?' selected':'')+'>'+p.nome+'</option>';}).join('');
  modal('Mover atividade',
    '<div class="field"><label>Dia</label><select id="mvDia">'+optDia+'</select></div>'+
    '<div class="field"><label>Período</label><select id="mvPer">'+optPer+'</select></div>',
    function(){ soltarAtividade(v,id,document.getElementById('mvDia').value,document.getElementById('mvPer').value); return true; });
}
function formAtividade(v,id,diaPadrao){
  var a=id?ATIV.filter(function(x){return x.id===id;})[0]:null;
  var dias=diasDaSemana();
  var dSel=a?a.data:(diaPadrao||iso(hoje()));
  var optDia=dias.map(function(d){var s=iso(d);return '<option value="'+s+'"'+(s===dSel?' selected':'')+'>'+rotuloDia(d)+' '+d.getDate()+'/'+(d.getMonth()+1)+'</option>';}).join('');
  var pSel=a?a.periodo:periodoAgora();
  var optPer=PERIODOS.map(function(p){return '<option value="'+p.id+'"'+(p.id===pSel?' selected':'')+'>'+p.nome+'</option>';}).join('');
  var hSel=a&&a.hora?String(a.hora).slice(0,5):(PERIODOS.filter(function(p){return p.id===pSel;})[0]||PERIODOS[0]).horaPadrao;
  modal(id?'Editar atividade':'Nova atividade',
    '<div class="field"><label>O que precisa ser feito</label><input id="agTit" value="'+esc(a?a.titulo:'')+'" placeholder="Ex.: pagar a parcela 30"></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
      '<div class="field"><label>Dia</label><select id="agDia">'+optDia+'</select></div>'+
      '<div class="field"><label>Período</label><select id="agPer">'+optPer+'</select></div></div>'+
    '<div style="display:grid;grid-template-columns:1fr 2fr;gap:10px">'+
      '<div class="field"><label>Hora</label><input id="agHora" type="time" value="'+hSel+'"></div>'+
      '<div class="field"><label>Observação</label><input id="agObs" value="'+esc(a?(a.obs||''):'')+'"></div></div>',
    function(){
      var tit=(document.getElementById('agTit').value||'').trim();
      if(!tit){ toast('Dê um nome à atividade','warn'); return false; }
      var sb=SB(); if(!sb){ toast('Sem conexão com o servidor','danger'); return false; }
      var payload={data:document.getElementById('agDia').value,periodo:document.getElementById('agPer').value,
        hora:document.getElementById('agHora').value||null,titulo:tit,obs:document.getElementById('agObs').value||null};
      var q;
      if(id){ q=sb.from('fin_agenda_atividades').update(payload).eq('id',id); }
      else { payload.user_id=uid(); q=sb.from('fin_agenda_atividades').insert(payload); }
      q.then(function(r){
        if(r.error){ toast('Erro: '+r.error.message,'danger'); return; }
        carregar().then(function(){ v.innerHTML=html(); ligarEventos(v); toast(id?'Atividade atualizada':'Atividade criada','ok'); });
      });
      return true;
    });
}
function alternarConcluida(v,id){
  var a=ATIV.filter(function(x){return x.id===id;})[0]; if(!a) return;
  var sb=SB(); if(!sb) return;
  sb.from('fin_agenda_atividades').update({concluida:!a.concluida}).eq('id',id).then(function(r){
    if(r.error){ toast('Erro ao salvar','danger'); return; }
    a.concluida=!a.concluida; v.innerHTML=html(); ligarEventos(v);
  });
}
function excluirAtividade(v,id){
  if(!confirm('Excluir esta atividade?')) return;
  var sb=SB(); if(!sb) return;
  sb.from('fin_agenda_atividades').delete().eq('id',id).then(function(r){
    if(r.error){ toast('Erro ao excluir','danger'); return; }
    ATIV=ATIV.filter(function(x){return x.id!==id;}); v.innerHTML=html(); ligarEventos(v); toast('Excluída','ok');
  });
}

/* ---------- ações: tarefas ---------- */
function soltarTarefa(v,id,status){
  var t=TAR.filter(function(x){return x.id===id;})[0]; if(!t) return;
  if(t.status===status) return;                        /* mesmo lugar: não faz nada */
  var de=t.status;
  var sb=SB(); if(!sb) return;
  sb.from('fin_agenda_tarefas').update({status:status}).eq('id',id).select().single().then(function(r){
    if(r.error){ toast('Não consegui mover: '+r.error.message,'danger'); return; }
    var i=TAR.findIndex(function(x){return x.id===id;}); if(i>=0) TAR[i]=r.data;
    trilha('tarefa',id,de,status,{via:'arrastar'});
    v.innerHTML=html(); ligarEventos(v); toast('Tarefa em '+COLS[status],'ok');
  });
}
function mudarEtapaPorBotao(v,id){   /* §15: caminho equivalente ao arrasto */
  var t=TAR.filter(function(x){return x.id===id;})[0]; if(!t) return;
  var opts=Object.keys(COLS).map(function(k){return '<option value="'+k+'"'+(k===t.status?' selected':'')+'>'+COLS[k]+'</option>';}).join('');
  modal('Mudar etapa','<div class="field"><label>Etapa</label><select id="tqSt">'+opts+'</select></div>',
    function(){ soltarTarefa(v,id,document.getElementById('tqSt').value); return true; });
}
function formTarefa(v){
  modal('Nova tarefa','<div class="field"><label>Tarefa</label><input id="tqTit" placeholder="Ex.: juntar documentos do cartório"></div>',
    function(){
      var tit=(document.getElementById('tqTit').value||'').trim();
      if(!tit){ toast('Dê um nome à tarefa','warn'); return false; }
      var sb=SB(); if(!sb) return false;
      sb.from('fin_agenda_tarefas').insert({user_id:uid(),titulo:tit,status:'pendente'}).then(function(r){
        if(r.error){ toast('Erro: '+r.error.message,'danger'); return; }
        carregar().then(function(){ v.innerHTML=html(); ligarEventos(v); toast('Tarefa criada','ok'); });
      });
      return true;
    });
}
function excluirTarefa(v,id){
  if(!confirm('Excluir esta tarefa?')) return;
  var sb=SB(); if(!sb) return;
  sb.from('fin_agenda_tarefas').delete().eq('id',id).then(function(r){
    if(r.error){ toast('Erro ao excluir','danger'); return; }
    TAR=TAR.filter(function(x){return x.id!==id;}); v.innerHTML=html(); ligarEventos(v); toast('Excluída','ok');
  });
}
function verHistorico(id){
  var sb=SB(); if(!sb) return;
  sb.from('fin_agenda_trilha').select('*').eq('entidade_id',id).order('criado_em',{ascending:false}).limit(30).then(function(r){
    var linhas=((r&&r.data)||[]).map(function(x){
      var d=new Date(x.criado_em);
      return '<tr><td>'+d.toLocaleString('pt-BR')+'</td><td>'+esc(COLS[x.de]||x.de||'—')+' → <b>'+esc(COLS[x.para]||x.para||'—')+'</b></td></tr>';
    }).join('');
    modal('Histórico da tarefa', linhas?('<table style="width:100%;font-size:.84rem"><thead><tr><th style="text-align:left">Quando</th><th style="text-align:left">Mudança</th></tr></thead><tbody>'+linhas+'</tbody></table>'):'<div class="cap">Ainda sem movimentações.</div>', null);
  });
}

/* ---------- modal ---------- */
function modal(titulo,corpo,onOk){
  ensureCss();
  var ovl=document.createElement('div'); ovl.className='ag-ovl';
  ovl.innerHTML='<div class="ag-box"><h2 style="font-size:1.08rem;margin-bottom:12px;font-family:var(--font-display)">'+esc(titulo)+'</h2>'+corpo+
    '<div style="display:flex;gap:9px;justify-content:flex-end;margin-top:14px">'+
    '<button class="chip" data-x="1">'+(onOk?'Cancelar':'Fechar')+'</button>'+
    (onOk?'<button class="chip on" data-ok="1">Salvar</button>':'')+'</div></div>';
  document.body.appendChild(ovl);
  ovl.addEventListener('click',function(e){
    if(e.target===ovl||e.target.dataset.x){ ovl.remove(); return; }
    if(e.target.dataset.ok){ if(onOk()!==false) ovl.remove(); }
  });
}

window.renderAgenda=render;
})();
