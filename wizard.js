/* =========================================================================
   Assistente Guiado de Financiamento — Vizio Finance
   Módulo isolado: configura o financiamento passo a passo (liberação
   progressiva) e destrava o acompanhamento. Reusa os motores do app.
   Exposto como window.WIZ. Acoplado por startApp() -> WIZ.maybeStart().
   ========================================================================= */
(function(){
  'use strict';
  function $(id){return document.getElementById(id);}
  function r2(n){return Math.round((Number(n)||0)*100)/100;}
  function fmt(n){return (Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function brl(n){return 'R$ '+fmt(n);}
  function pct(n){return (Number(n)||0).toFixed(1).replace('.',',')+'%';}
  function moneyNum(s){ if(s==null||s==='')return 0; s=String(s).replace(/[^\d.,-]/g,''); if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.'); else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,''); var n=parseFloat(s); return isNaN(n)?0:n; }
  function addMonths(iso,k){ var p=String(iso||'').split('-'); var y=+p[0]||2025,m=(+p[1]||1)-1,d=+p[2]||8; var dt=new Date(y,m+k,d); return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); }
  function thisMonthISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-08'; }
  function monthlyRate(aa){ aa=Number(aa)||0; return Math.pow(1+aa/100,1/12)-1; } /* a.a. -> a.m. efetivo */

  /* ---------- estado ---------- */
  var W={ step:0, edit:false, data:{} };
  function defaults(){ return {tipo:'', valorImovel:0, cidade:'', usado:'novo', entrada:0, sistema:'SAC', prazo:420, taxaAA:11.5, primeira:thisMonthISO(), renda:0,
    mesesObra:0, jurosObraAM:0, incc:0.5, entradaTotal:0, entradaParc:0,
    itbi:0, cartorio:0, avaliacao:0, seguroMensal:0, tarifa:25 }; }
  function isPlanta(){ return W.data.tipo==='imovel_planta'; }
  /* etapas ativas conforme o tipo (pronto pula a fase de obra) */
  function steps(){ return isPlanta()?[0,1,2,3,4,5,6]:[0,1,2,4,5,6]; }

  /* ---------- gate ---------- */
  function hasData(){ try{ var d=window.DADOS||{}; return !!((d.entrada&&d.entrada.length)||(d.fin&&d.fin.length)||(d.doc&&d.doc.length)||(d.juros&&d.juros.length)); }catch(e){ return false; } }
  function isDone(){ var c=(window.DADOS&&DADOS._cfg)||{}; return c.setupDone===true; }
  function maybeStart(){ if(isDone()||hasData())return; open(false); }

  /* ---------- cálculos ao vivo ---------- */
  function calc(){
    var d=W.data, o={};
    o.financiado = Math.max(0,(d.valorImovel||0)-(d.entrada||0));
    o.entradaPct = d.valorImovel>0 ? (d.entrada/d.valorImovel*100) : 0;
    var i=monthlyRate(d.taxaAA), n=d.prazo||0, V=o.financiado;
    if(V>0&&n>0){ o.parcela1 = d.sistema==='PRICE' ? (i>0?V*i/(1-Math.pow(1+i,-n)):V/n) : (V/n + V*i); }
    else o.parcela1=0;
    o.parcelaComSeg = o.parcela1 + (d.seguroMensal||0) + (d.tarifa||0);
    o.comprometimento = d.renda>0 ? (o.parcelaComSeg/d.renda*100) : 0;
    o.custosDoc = (d.itbi||0)+(d.cartorio||0)+(d.avaliacao||0);
    o.custoTotal = (d.valorImovel||0) + o.custosDoc; /* imóvel + custos de aquisição */
    o.iam=i;
    return o;
  }

  /* ---------- geração de parcelas (motores) ---------- */
  function genFin(){ var d=W.data,c=calc(),V=c.financiado,n=d.prazo,i=c.iam,sist=d.sistema,arr=[]; if(V<=0||n<=0)return arr;
    var saldo=V,amortSAC=V/n,parcP=i>0?V*i/(1-Math.pow(1+i,-n)):V/n;
    for(var k=1;k<=n;k++){ var juros=saldo*i,parc,amort; if(sist==='PRICE'){parc=parcP;amort=parc-juros;}else{amort=amortSAC;parc=amort+juros;} saldo=Math.max(0,saldo-amort);
      arr.push({parcela:k,mes:addMonths(d.primeira,k-1),valor:r2(parc),pago:null,reajuste:null,amort:r2(amort),total:r2(parc),saldo:r2(saldo),quitado:false,status:'A VENCER'}); }
    return arr; }
  function genObra(){ var d=W.data,c=calc(),V=c.financiado,n=parseInt(d.mesesObra)||0,i=(d.jurosObraAM||0)/100,incc=(d.incc||0)/100,arr=[]; if(V<=0||n<=0)return arr;
    for(var q=1;q<=n;q++){ var p=q/n,lib=V*p,val=lib*i+lib*incc; arr.push({parcela:q,venc:addMonths(d.primeira,q-1),valor:r2(val),evolucao:Math.round(p*100)+'%',total:r2(val),quitado:false,status:'A VENCER'}); }
    return arr; }
  function genEntrada(){ var d=W.data,T=d.entradaTotal||0,n=parseInt(d.entradaParc)||0,arr=[]; if(T<=0||n<=0)return arr;
    var v=T/n; for(var j=1;j<=n;j++)arr.push({parcela:String(j),venc:addMonths(d.primeira,j-1),valor:r2(v),pago:null,reajuste:null,quitado:false,status:'A VENCER'}); return arr; }
  function genDoc(){ var d=W.data,arr=[],i=1;
    if(d.itbi>0){arr.push({parcela:i++,rtbi:r2(d.itbi),cartorio:0,total:r2(d.itbi),quitado:false,status:'A VENCER'});}
    if(d.cartorio>0){arr.push({parcela:i++,rtbi:0,cartorio:r2(d.cartorio),total:r2(d.cartorio),quitado:false,status:'A VENCER'});}
    if(d.avaliacao>0){arr.push({parcela:i++,rtbi:0,cartorio:r2(d.avaliacao),total:r2(d.avaliacao),quitado:false,status:'A VENCER'});}
    return arr; }

  function finish(){
    var d=W.data,c=calc(); var DADOS=window.DADOS; if(!DADOS)return;
    DADOS._cfg=DADOS._cfg||{}; DADOS._cfg.perfil=d.tipo; DADOS._cfg.setupDone=true;
    DADOS._cfgMod=DADOS._cfgMod||{};
    var iamPct=r2(c.iam*100);
    DADOS._cfgMod.financiamento={total:c.financiado,tipo:d.sistema,meses:d.prazo,taxa:iamPct,data:d.primeira};
    DADOS.fin=genFin();
    if(isPlanta()){
      DADOS._cfgMod.obra={total:c.financiado,taxa:d.jurosObraAM||0,meses:parseInt(d.mesesObra)||0,incc:d.incc||0,data:d.primeira};
      DADOS.juros=genObra();
      DADOS._cfgMod.entrada={total:d.entradaTotal||0,forma:'parcelado',nParc:parseInt(d.entradaParc)||0,tipo:'fixa',data:d.primeira};
      var en=genEntrada(); if(en.length)DADOS.entrada=en;
    }
    var dc=genDoc(); if(dc.length)DADOS.doc=dc;
    DADOS._cfg.custoImovel=d.valorImovel; DADOS._cfg.renda=d.renda; DADOS._cfg.seguroMensal=d.seguroMensal; DADOS._cfg.tarifa=d.tarifa;
    try{ if(window.CRUD&&CRUD.recompute)CRUD.recompute(); }catch(e){}
    /* persiste na nuvem quando disponível */
    try{ if(window.VZSUPA){
      var mods={financiamento:DADOS.fin,obra:DADOS.juros,entrada:DADOS.entrada,doc:DADOS.doc};
      Object.keys(mods).forEach(function(id){ if(mods[id]&&mods[id].length&&VZSUPA.replaceModule)VZSUPA.replaceModule(id,mods[id]); if(DADOS._cfgMod[id]&&VZSUPA.saveCfg)VZSUPA.saveCfg(id,DADOS._cfgMod[id]); });
    } }catch(e){}
    close();
    try{ if(window.navigate)window.navigate('home'); }catch(e){}
    try{ if(window.CRUD)toastLike('Configuração concluída! Seu financiamento está pronto para acompanhar.'); }catch(e){}
  }
  function toastLike(msg){ var t=document.createElement('div'); t.textContent=msg; t.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#111827;color:#fff;padding:12px 18px;border-radius:10px;font-size:.9rem;z-index:300;box-shadow:0 10px 30px rgba(0,0,0,.3)'; document.body.appendChild(t); setTimeout(function(){t.style.opacity='0';t.style.transition='opacity .4s';},3000); setTimeout(function(){t.remove();},3500); }

  function skip(){ var DADOS=window.DADOS; if(DADOS){DADOS._cfg=DADOS._cfg||{};DADOS._cfg.setupDone=true;} close(); }

  /* ---------- UI ---------- */
  function injectCSS(){ if($('wizCSS'))return; var s=document.createElement('style'); s.id='wizCSS'; s.textContent=
    "#wizOvl{position:fixed;inset:0;z-index:150;background:var(--bg,#F3F5F9);display:flex;flex-direction:column;overflow:auto}"+
    "#wizOvl.hidden{display:none!important}"+
    ".wz-top{background:radial-gradient(120% 120% at 80% 0%,#1F2937,#0B0E16);color:#fff;padding:20px 24px}"+
    ".wz-top .lg{display:flex;align-items:center;gap:10px;margin-bottom:12px}"+
    ".wz-top .lg .lk{display:flex;flex-direction:column;align-items:flex-start;gap:1px}"+
    ".wz-top .lg img{width:28px;height:28px;animation:vzpulse 2.8s ease-in-out infinite}.wz-top .lg .w{font-family:var(--font-display,Raleway),sans-serif;font-weight:600;letter-spacing:.24em;font-size:.8rem;line-height:1.2}.wz-top .lg .f{font-family:var(--font-display,Raleway),sans-serif;font-weight:600;font-size:.54rem;letter-spacing:.3em;text-indent:.3em;text-transform:uppercase;color:var(--sky,#60A5FA);background:none;padding:0;line-height:1.3}"+
    ".wz-steps{display:flex;gap:6px;flex-wrap:wrap}"+
    ".wz-steps .s{font-size:.72rem;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.12);color:#C2C9D6;font-weight:600}"+
    ".wz-steps .s.on{background:var(--blue,#2563EB);color:#fff}.wz-steps .s.done{background:rgba(22,163,74,.25);color:#86EFAC}"+
    ".wz-body{flex:1;max-width:900px;width:100%;margin:0 auto;padding:22px}"+
    ".wz-grid{display:grid;grid-template-columns:1fr 300px;gap:20px;align-items:start}@media(max-width:820px){.wz-grid{grid-template-columns:1fr}}"+
    ".wz-card{background:#fff;border:1px solid var(--border,#E4E8EF);border-radius:14px;padding:22px 24px;box-shadow:0 1px 3px rgba(14,23,38,.05)}"+
    ".wz-card h2{font-family:var(--font-display,Raleway),sans-serif;font-size:1.35rem;margin:0 0 4px}"+
    ".wz-card .sub{color:var(--muted,#6B7280);font-size:.9rem;margin-bottom:16px}"+
    ".wz-f{margin-bottom:14px}.wz-f label{display:block;font-size:.76rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#6B7280);margin-bottom:5px}"+
    ".wz-f input,.wz-f select{width:100%;padding:11px 13px;border:1.5px solid var(--border,#E4E8EF);border-radius:9px;font-size:.98rem;font-family:inherit}"+
    ".wz-f input:focus,.wz-f select:focus{outline:none;border-color:var(--blue,#2563EB)}"+
    ".wz-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:600px){.wz-row{grid-template-columns:1fr}}"+
    ".wz-hint{font-size:.78rem;color:var(--muted2,#9CA3AF);margin-top:4px}"+
    ".wz-pick{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:600px){.wz-pick{grid-template-columns:1fr}}"+
    ".wz-opt{border:2px solid var(--border,#E4E8EF);border-radius:12px;padding:16px;cursor:pointer;transition:.15s}"+
    ".wz-opt:hover{border-color:var(--sky,#60A5FA)}.wz-opt.on{border-color:var(--blue,#2563EB);background:var(--blue-soft,#EAF1FE)}"+
    ".wz-opt b{display:block;font-family:var(--font-display,Raleway),sans-serif;font-size:1.02rem}.wz-opt span{font-size:.82rem;color:var(--muted,#6B7280)}"+
    ".wz-side{background:#fff;border:1px solid var(--border,#E4E8EF);border-radius:14px;padding:18px 20px;position:sticky;top:16px}"+
    ".wz-side h3{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#6B7280);margin:0 0 10px}"+
    ".wz-side .rw{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--border,#E4E8EF);font-size:.88rem}"+
    ".wz-side .rw:last-child{border:0}.wz-side .rw b{font-variant-numeric:tabular-nums}"+
    ".wz-alert{margin-top:10px;font-size:.8rem;padding:8px 10px;border-radius:8px}"+
    ".wz-alert.ok{background:var(--success-bg,#E7F6ED);color:#0F5A2C}.wz-alert.warn{background:var(--warn-bg,#FBF1DC);color:#8A5A00}"+
    ".wz-nav{display:flex;justify-content:space-between;gap:10px;margin-top:20px;max-width:900px;margin-left:auto;margin-right:auto;padding:0 22px 30px}"+
    ".wz-btn{padding:12px 22px;border-radius:10px;font-weight:700;font-size:.95rem;border:1px solid var(--border,#E4E8EF);background:#fff;color:var(--text,#111827);cursor:pointer;font-family:inherit}"+
    ".wz-btn.pri{background:var(--blue,#2563EB);color:#fff;border-color:var(--blue,#2563EB)}.wz-btn.pri:disabled{opacity:.45;cursor:not-allowed}"+
    ".wz-btn.ghost{background:none;border:0;color:var(--muted,#6B7280)}"+
    ".wz-shortcut{margin-top:8px;padding:12px 14px;border:1px dashed var(--sky,#60A5FA);border-radius:10px;background:var(--blue-soft,#EAF1FE);font-size:.85rem;color:#13386F;display:flex;justify-content:space-between;align-items:center;gap:10px}"+
    ".wz-shortcut button{border:0;background:var(--blue,#2563EB);color:#fff;font-weight:700;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:.82rem}";
    document.head.appendChild(s); }

  function ensureDom(){ if($('wizOvl'))return; var o=document.createElement('div'); o.id='wizOvl'; o.className='hidden';
    o.innerHTML='<div class="wz-top"><div class="lg"><img src="vizio-symbol-light.png" alt="Vizio Finance"><div class="lk"><span class="w">VIZIO</span><span class="f">Finance</span></div></div><div class="wz-steps" id="wzSteps"></div></div>'+
      '<div class="wz-body" id="wzBody"></div><div class="wz-nav" id="wzNav"></div>';
    document.body.appendChild(o);
    /* listeners delegados anexados UMA vez ao container (sobrevivem aos re-renders do innerHTML) */
    var body=o.querySelector('#wzBody');
    body.addEventListener('input',function(e){ var t=e.target; if(t&&t.matches&&t.matches('input[inputmode=decimal]')&&window.moneyMaskLive)window.moneyMaskLive(t); collect(); refreshValid(); updateSide(); },true);
    body.addEventListener('change',function(){ collect(); refreshValid(); updateSide(); },true);
  }

  function open(edit){ injectCSS(); ensureDom(); W.edit=!!edit; W.step=0; W.data=defaults(); if(edit)readExisting(); $('wizOvl').classList.remove('hidden'); render(); }
  function close(){ var o=$('wizOvl'); if(o)o.classList.add('hidden'); }
  function readExisting(){ try{ var d=window.DADOS||{},c=d._cfg||{},m=d._cfgMod||{}; W.data.tipo=c.perfil||'imovel_planta'; if(m.financiamento){W.data.sistema=m.financiamento.tipo||'SAC';W.data.prazo=m.financiamento.meses||420;} W.data.valorImovel=c.custoImovel||0; W.data.renda=c.renda||0; }catch(e){} }

  var STEP_LABELS={0:'Tipo',1:'Imóvel',2:'Financiamento',3:'Obra',4:'Custos',5:'Pagamentos',6:'Revisão'};

  function render(){
    var act=steps(), cur=act[Math.min(W.step,act.length-1)];
    /* stepper */
    var st=$('wzSteps'); st.innerHTML=act.map(function(s,ix){ var cls=s===cur?'on':(ix<act.indexOf(cur)?'done':''); return '<span class="s '+cls+'">'+(ix+1)+'. '+STEP_LABELS[s]+'</span>'; }).join('');
    /* body */
    $('wzBody').innerHTML = bodyFor(cur);
    bindStep(cur);
    /* nav */
    var idx=act.indexOf(cur), last=idx===act.length-1;
    var nav=$('wzNav');
    nav.innerHTML = (idx>0?'<button class="wz-btn" onclick="WIZ._back()">← Voltar</button>':'<button class="wz-btn ghost" onclick="WIZ._skip()">Pular (modo avançado)</button>')+
      (last?'<button class="wz-btn pri" id="wzGo" onclick="WIZ._finish()">✓ Concluir configuração</button>':'<button class="wz-btn pri" id="wzGo" onclick="WIZ._next()">Próximo →</button>');
    refreshValid();
  }

  function money(id,val,ph){ return '<input id="'+id+'" inputmode="decimal" value="'+(val?fmt(val):'')+'" placeholder="'+(ph||'0,00')+'">'; }

  function bodyFor(s){
    var d=W.data,c=calc();
    if(s===0){ return card('Vamos configurar seu financiamento','Em poucos passos o sistema fica pronto para você acompanhar tudo. Comece escolhendo o tipo:',
      '<div class="wz-pick">'+
      opt('imovel_planta','Imóvel na planta','Comprei em construção (ex.: MRV). Tem fase de obra + financiamento.')+
      opt('imovel_pronto','Imóvel pronto','Imóvel novo ou usado, já construído.')+
      '</div>'); }
    if(s===1){ return grid(card('Dados do imóvel','O valor é a base para entrada, ITBI e financiamento.',
      '<div class="wz-f"><label>Valor do imóvel (R$)</label>'+money('wImovel',d.valorImovel)+'</div>'+
      '<div class="wz-row"><div class="wz-f"><label>Cidade / UF</label><input id="wCidade" value="'+esc(d.cidade)+'" placeholder="Ex.: Salvador/BA"></div>'+
      '<div class="wz-f"><label>Situação</label><select id="wUsado"><option value="novo"'+(d.usado==='novo'?' selected':'')+'>Novo</option><option value="usado"'+(d.usado==='usado'?' selected':'')+'>Usado</option></select></div></div>')); }
    if(s===2){ return grid(card('Entrada e financiamento','Informe a entrada e as condições. O sistema calcula o valor financiado e a 1ª parcela ao vivo.',
      '<div class="wz-row"><div class="wz-f"><label>Entrada (R$)</label>'+money('wEntrada',d.entrada)+'<div class="wz-hint" id="wEntPct"></div></div>'+
      '<div class="wz-f"><label>Sistema</label><select id="wSist"><option value="SAC"'+(d.sistema==='SAC'?' selected':'')+'>SAC (parcela decrescente)</option><option value="PRICE"'+(d.sistema==='PRICE'?' selected':'')+'>PRICE (parcela fixa)</option></select></div></div>'+
      '<div class="wz-row"><div class="wz-f"><label>Prazo (meses)</label><input id="wPrazo" type="number" value="'+(d.prazo||'')+'" max="420"><div class="wz-hint">Máximo 420 (35 anos)</div></div>'+
      '<div class="wz-f"><label>Juros (% a.a.)</label><input id="wTaxa" type="number" step="0.01" value="'+(d.taxaAA||'')+'"><div class="wz-hint">Ex.: 11,5 + TR</div></div></div>'+
      '<div class="wz-row"><div class="wz-f"><label>1ª parcela</label><input id="wPrim" type="month" value="'+String(d.primeira||'').slice(0,7)+'"></div>'+
      '<div class="wz-f"><label>Renda bruta mensal (R$) <span style="text-transform:none;font-weight:400">— opcional</span></label>'+money('wRenda',d.renda)+'<div class="wz-hint">Mostra o quanto a parcela compromete</div></div></div>')); }
    if(s===3){ return grid(card('Fase de obra','Durante a obra você paga à construtora: juros sobre o liberado + correção (INCC), e a entrada parcelada.',
      shortcut('Já tem a Confissão de Dívida (PDF)? Importe e preenchemos a entrada automaticamente.','WIZ._importConf()')+
      '<div class="wz-row"><div class="wz-f"><label>Meses de obra</label><input id="wMobra" type="number" value="'+(d.mesesObra||'')+'"></div>'+
      '<div class="wz-f"><label>Juros de obra (% a.m.)</label><input id="wJobra" type="number" step="0.01" value="'+(d.jurosObraAM||'')+'"></div></div>'+
      '<div class="wz-row"><div class="wz-f"><label>INCC (% a.m.)</label><input id="wIncc" type="number" step="0.01" value="'+(d.incc||'')+'"></div>'+
      '<div class="wz-f"><label>Entrada parcelada — total (R$)</label>'+money('wEntTot',d.entradaTotal)+'</div></div>'+
      '<div class="wz-f"><label>Nº de parcelas da entrada</label><input id="wEntParc" type="number" value="'+(d.entradaParc||'')+'"></div>')); }
    if(s===4){ if(!d.itbi&&d.valorImovel){d.itbi=r2(d.valorImovel*0.02);d.cartorio=r2(d.valorImovel*0.015);}
      return grid(card('Documentação e custos','Valores pré-preenchidos com percentuais típicos — ajuste conforme o seu caso.',
      '<div class="wz-row"><div class="wz-f"><label>ITBI (R$)</label>'+money('wItbi',d.itbi)+'<div class="wz-hint">~2% do imóvel</div></div>'+
      '<div class="wz-f"><label>Cartório / registro (R$)</label>'+money('wCart',d.cartorio)+'<div class="wz-hint">~1,5% do imóvel</div></div></div>'+
      '<div class="wz-row"><div class="wz-f"><label>Avaliação (R$)</label>'+money('wAval',d.avaliacao)+'</div>'+
      '<div class="wz-f"><label>Seguros MIP+DFI (R$/mês)</label>'+money('wSeg',d.seguroMensal)+'</div></div>'+
      '<div class="wz-f"><label>Tarifa de administração (R$/mês)</label>'+money('wTar',d.tarifa)+'</div>')); }
    if(s===5){ return grid(card('Você já começou a pagar?','Se já pagou parcelas, importe o Extrato (PDF) para marcar tudo que já foi quitado. Senão, é só avançar.',
      shortcut('Importar Extrato (PDF) — marca as parcelas pagas','WIZ._importExt()')+
      '<p style="color:var(--muted,#6B7280);font-size:.88rem;margin-top:10px">Você pode pular esta etapa e marcar as parcelas pagas depois, dentro do sistema.</p>')); }
    if(s===6){ return grid(card('Revisão','Confira o resumo. Ao concluir, o sistema libera o acompanhamento do seu financiamento.',
      '<table style="width:100%;font-size:.92rem;border-collapse:collapse">'+
      rev('Tipo', isPlanta()?'Imóvel na planta':'Imóvel pronto')+
      rev('Valor do imóvel', brl(d.valorImovel))+
      rev('Entrada', brl(d.entrada)+' ('+pct(c.entradaPct)+')')+
      rev('Valor financiado', brl(c.financiado))+
      rev('Sistema / prazo', d.sistema+' · '+d.prazo+' meses')+
      rev('1ª parcela (aprox.)', brl(c.parcelaComSeg))+
      (isPlanta()?rev('Juros de obra', d.mesesObra+' meses'):'')+
      rev('Custos (ITBI+cartório+aval.)', brl(c.custosDoc))+
      (d.renda>0?rev('Comprometimento de renda', pct(c.comprometimento)):'')+
      '</table>')); }
    return card('—','','');
  }

  function card(h,sub,inner){ return '<div class="wz-card"><h2>'+h+'</h2>'+(sub?'<div class="sub">'+sub+'</div>':'')+inner+'</div>'; }
  function grid(cardHtml){ return '<div class="wz-grid">'+cardHtml+sideHtml()+'</div>'; }
  function opt(val,t,s){ return '<div class="wz-opt'+(W.data.tipo===val?' on':'')+'" onclick="WIZ._pick(\''+val+'\')"><b>'+t+'</b><span>'+s+'</span></div>'; }
  function shortcut(txt,fn){ return '<div class="wz-shortcut"><span>'+txt+'</span><button onclick="'+fn+'">Importar</button></div>'; }
  function rev(k,v){ return '<tr><td style="padding:7px 0;border-bottom:1px solid var(--border2,#EEF1F6);color:var(--muted,#6B7280)">'+k+'</td><td style="padding:7px 0;border-bottom:1px solid var(--border2,#EEF1F6);text-align:right;font-weight:700">'+v+'</td></tr>'; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

  function sideHtml(){ var d=W.data,c=calc(); var alert=''; if(d.renda>0){ alert = c.comprometimento>35 ? '<div class="wz-alert warn">Atenção: a parcela compromete '+pct(c.comprometimento)+' da renda (acima de 35%).</div>' : c.comprometimento>0 ? '<div class="wz-alert ok">Comprometimento de '+pct(c.comprometimento)+' da renda — dentro do saudável.</div>' : ''; }
    return '<div class="wz-side"><h3>Resumo ao vivo</h3>'+
      '<div class="rw"><span>Valor do imóvel</span><b>'+brl(d.valorImovel)+'</b></div>'+
      '<div class="rw"><span>Entrada</span><b>'+brl(d.entrada)+' · '+pct(c.entradaPct)+'</b></div>'+
      '<div class="rw"><span>Financiado</span><b>'+brl(c.financiado)+'</b></div>'+
      '<div class="rw"><span>1ª parcela</span><b>'+brl(c.parcelaComSeg)+'</b></div>'+
      (d.renda>0?'<div class="rw"><span>Comprometido</span><b>'+pct(c.comprometimento)+'</b></div>':'')+
      alert+'</div>'; }

  /* lê os campos da etapa atual para o estado */
  function collect(){ var d=W.data;
    if($('wImovel'))d.valorImovel=moneyNum($('wImovel').value); if($('wCidade'))d.cidade=$('wCidade').value; if($('wUsado'))d.usado=$('wUsado').value;
    if($('wEntrada'))d.entrada=moneyNum($('wEntrada').value); if($('wSist'))d.sistema=$('wSist').value; if($('wPrazo'))d.prazo=parseInt($('wPrazo').value)||0; if($('wTaxa'))d.taxaAA=parseFloat(String($('wTaxa').value).replace(',','.'))||0; if($('wPrim'))d.primeira=$('wPrim').value?$('wPrim').value+'-08':d.primeira; if($('wRenda'))d.renda=moneyNum($('wRenda').value);
    if($('wMobra'))d.mesesObra=parseInt($('wMobra').value)||0; if($('wJobra'))d.jurosObraAM=parseFloat(String($('wJobra').value).replace(',','.'))||0; if($('wIncc'))d.incc=parseFloat(String($('wIncc').value).replace(',','.'))||0; if($('wEntTot'))d.entradaTotal=moneyNum($('wEntTot').value); if($('wEntParc'))d.entradaParc=parseInt($('wEntParc').value)||0;
    if($('wItbi'))d.itbi=moneyNum($('wItbi').value); if($('wCart'))d.cartorio=moneyNum($('wCart').value); if($('wAval'))d.avaliacao=moneyNum($('wAval').value); if($('wSeg'))d.seguroMensal=moneyNum($('wSeg').value); if($('wTar'))d.tarifa=moneyNum($('wTar').value);
  }
  function updateSide(){ var g=document.querySelector('.wz-side'); if(g){ g.outerHTML=sideHtml(); } var ep=$('wEntPct'); if(ep){var c=calc();ep.textContent='Financiado: '+brl(c.financiado)+' · '+pct(c.entradaPct)+' de entrada';} }
  function bindStep(s){ /* listeners já anexados uma vez em ensureDom */ }
  function valid(s){ var d=W.data;
    if(s===0)return !!d.tipo;
    if(s===1)return d.valorImovel>0;
    if(s===2)return d.entrada>=0 && d.prazo>0 && d.taxaAA>0 && d.valorImovel>d.entrada;
    if(s===3)return (parseInt(d.mesesObra)||0)>0;
    if(s===4)return true;
    if(s===5)return true;
    if(s===6)return true;
    return true; }
  function refreshValid(){ collect(); var act=steps(),cur=act[Math.min(W.step,act.length-1)]; var b=$('wzGo'); if(b&&b.classList.contains('pri')&&b.textContent.indexOf('Próximo')>=0)b.disabled=!valid(cur); }

  function next(){ collect(); var act=steps(),cur=act[Math.min(W.step,act.length-1)]; if(!valid(cur))return; var i=act.indexOf(cur); if(i<act.length-1){ W.step=act[i+1]; render(); window.scrollTo(0,0);} }
  function back(){ collect(); var act=steps(),cur=act[Math.min(W.step,act.length-1)]; var i=act.indexOf(cur); if(i>0){ W.step=act[i-1]; render(); window.scrollTo(0,0);} }
  function pick(v){ W.data.tipo=v; render(); }
  function importConf(){ close(); if(window.CRUD&&CRUD.importArquivo)CRUD.importArquivo('entrada'); }
  function importExt(){ close(); if(window.CRUD&&CRUD.importArquivo)CRUD.importArquivo('entrada'); }

  window.WIZ={ maybeStart:maybeStart, open:function(){open(true);}, close:close,
    _next:next,_back:back,_pick:pick,_finish:finish,_skip:skip,_importConf:importConf,_importExt:importExt };
})();
