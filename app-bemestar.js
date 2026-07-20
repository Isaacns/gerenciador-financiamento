/* ===========================================================================
 * Gerenciador de Financiamento by VIZIO — Bem-estar & Pausas (§7)
 * Réplica fiel do módulo do Inovar Formaturas: lembretes amigáveis (toast,
 * NÃO-bloqueante) de hidratação, movimento, descanso visual e bem-estar
 * mental, com adiar e tela de preferências. Vem ATIVADO por padrão.
 *
 * §7 manda que as preferências fiquem "salvas neste aparelho" — por isso aqui
 * o localStorage é a fonte certa (diferente da Agenda §16, que é do backend).
 *
 * O registro do módulo (MODS/IC/CORE_MODS/dispatch) é feito no index.html,
 * não por monkey-patch do navigate — aqui só expomos window.renderBemestar.
 * =========================================================================== */
(function(){
"use strict";
var PKEY="fin_bemestar_prefs_v1";

/* As 4 cores são de CATEGORIA (semânticas), não de marca: água azul, movimento
   verde, visual roxo, mental laranja — iguais às do Inovar. O acento do produto
   (--blue) aparece no botão de confirmar. */
var TIPOS={
  agua:{nome:"Hidratação",emoji:"💧",cor:"#2563EB",intervalo:60,msgs:[
    "Hora do gole! Dê uma golada na sua água para manter o foco.",
    "Seu cérebro precisa de combustível. Que tal um copo de água agora?",
    "Hidratação em dia, mente leve! Beba um pouco de água. 💧"]},
  movimento:{nome:"Movimento & Postura",emoji:"🪑",cor:"#16A34A",intervalo:120,msgs:[
    "Hora de esticar as pernas! Levante-se e dê uma curta caminhada.",
    "Vamos alinhar a postura? Gire os ombros para trás e relaxe o pescoço.",
    "Pausa de 1 minuto: entrelace os dedos e empurre as mãos para o teto.",
    "Seu corpo agradece: caminhe até a janela para ver o movimento lá fora."]},
  visual:{nome:"Descanso Visual (20-20-20)",emoji:"👁️",cor:"#9333EA",intervalo:40,msgs:[
    "Descanse os olhos! Olhe para algo distante por 20 segundos.",
    "Pisque algumas vezes e mude o foco da tela por um instante."]},
  mental:{nome:"Bem-estar Mental",emoji:"🧠",cor:"#F0560C",intervalo:90,msgs:[
    "Inspire fundo… segure… e expire devagar. Sinta o alívio.",
    "Sorria! Sorrir libera endorfinas e reduz o estresse. Experimente! 😊",
    "Pausa mental: pense em três coisas pelas quais você é grato hoje.",
    "Feche os olhos por 30 segundos e apenas escute os sons ao seu redor."]}
};
var ORD=["agua","movimento","visual","mental"];

function defPrefs(){var t={};ORD.forEach(function(k){t[k]={on:true,intervalo:TIPOS[k].intervalo};});return {master:true,tipos:t};}
function load(){try{var s=JSON.parse(localStorage.getItem(PKEY)||"null");if(s&&s.tipos){ORD.forEach(function(k){if(!s.tipos[k])s.tipos[k]={on:true,intervalo:TIPOS[k].intervalo};});return s;}}catch(e){}return defPrefs();}
function save(p){try{localStorage.setItem(PKEY,JSON.stringify(p));}catch(e){}}

/* ---------- TOAST não-bloqueante (canto inferior esquerdo) ---------- */
function injectCSS(){
  if(document.getElementById("bem-css"))return;
  var c=
  "#bemWrap{position:fixed;left:20px;bottom:20px;z-index:75;display:flex;flex-direction:column;gap:10px;max-width:340px}"+
  "@media(max-width:560px){#bemWrap{left:10px;right:10px;bottom:80px;max-width:none}}"+
  ".bemT{background:rgba(22,26,33,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);border-left:4px solid var(--blue,#2563EB);border-radius:14px;padding:13px 15px;color:#E7E9ED;box-shadow:0 18px 40px rgba(0,0,0,.4);animation:bemIn .3s ease}"+
  "@keyframes bemIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}"+
  ".bemT.out{animation:bemOut .3s ease forwards}@keyframes bemOut{to{opacity:0;transform:translateX(-20px)}}"+
  ".bemT .h{display:flex;align-items:center;gap:8px;font-weight:700;font-size:.82rem;margin-bottom:4px}"+
  ".bemT .h .e{font-size:1.1rem}"+
  ".bemT .m{font-size:.86rem;line-height:1.45;color:#CDD1D8}"+
  ".bemT .b{display:flex;gap:8px;margin-top:10px}"+
  ".bemT .b button{flex:1;font-size:.76rem;font-weight:600;border-radius:8px;padding:7px 9px;cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#E7E9ED}"+
  /* acento do PRÓPRIO sistema (--blue do index.html) */
  ".bemT .b button.ok{background:var(--blue,#2563EB);border-color:var(--blue,#2563EB);color:#fff}"+
  ".bemT .b button:hover{filter:brightness(1.12)}"+
  ".bemPop{position:fixed;left:50%;top:28%;transform:translateX(-50%);z-index:200;background:rgba(22,26,33,.95);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:24px 28px;text-align:center;box-shadow:0 26px 64px rgba(0,0,0,.45);max-width:310px;cursor:pointer;animation:bemPopIn .36s cubic-bezier(.2,.9,.3,1.5)}"+
  ".bemPop.adi{border-top:4px solid var(--blue,#2563EB)}.bemPop.feito{border-top:4px solid #16A34A}"+
  ".bemPop .e{font-size:2.6rem;margin-bottom:6px;line-height:1}"+
  ".bemPop .m{color:#EAECEF;font-size:.98rem;font-weight:600;line-height:1.45}"+
  ".bemPop.out{animation:bemPopOut .3s ease forwards}"+
  "@keyframes bemPopIn{from{opacity:0;transform:translateX(-50%) scale(.8) translateY(12px)}to{opacity:1;transform:translateX(-50%) scale(1)}}"+
  "@keyframes bemPopOut{to{opacity:0;transform:translateX(-50%) scale(.92)}}"+
  "@media(prefers-reduced-motion:reduce){.bemT,.bemPop{animation:none!important}}";
  var s=document.createElement("style");s.id="bem-css";s.textContent=c;document.head.appendChild(s);
}
var REC=["Boa! Seu corpo agradece. 🎉","Mandou bem! Pequenas pausas, grandes resultados. 💪","Isso! Você está cuidando de você. 🌟","Feito! Mente renovada para seguir. ☕","Excelente! Cada pausa te deixa mais produtivo. ✨"];
var ADI=["Sem problema! Te lembro em 5 minutos. 💛","Tudo bem, sua tarefa vem primeiro. Volto já. 🙂","Combinado! Daqui a pouco a gente se vê. ⏰","Respeito seu foco. Até daqui a pouquinho! 🌿"];
function celebrar(tipo){
  injectCSS();
  var arr=(tipo==="adiar")?ADI:REC;
  var msg=arr[Math.floor(Math.random()*arr.length)];
  var el=document.createElement("div");
  el.className="bemPop "+(tipo==="adiar"?"adi":"feito");
  el.innerHTML='<div class="e">'+(tipo==="adiar"?"⏰":"🎉")+'</div><div class="m">'+msg+'</div>';
  document.body.appendChild(el);
  var rem=function(){if(!el.parentNode)return;el.classList.add("out");setTimeout(function(){el.remove();},300);};
  el.onclick=rem;
  setTimeout(rem,(tipo==="adiar")?2600:3200);
}
function wrap(){var w=document.getElementById("bemWrap");if(!w){w=document.createElement("div");w.id="bemWrap";document.body.appendChild(w);}return w;}
function toast(tipo){
  injectCSS();
  var t=TIPOS[tipo];var msg=t.msgs[Math.floor(Math.random()*t.msgs.length)];
  var el=document.createElement("div");el.className="bemT";el.style.borderLeftColor=t.cor;
  el.innerHTML='<div class="h"><span class="e">'+t.emoji+'</span>'+t.nome+'</div><div class="m">'+msg+'</div>'+
    '<div class="b"><button type="button" class="snooze">⏰ Adiar 5 min</button><button type="button" class="ok">Feito 👍</button></div>';
  wrap().appendChild(el);
  var rem=function(){el.classList.add("out");setTimeout(function(){el.remove();},320);};
  el.querySelector(".ok").onclick=function(){rem();celebrar("feito");};
  el.querySelector(".snooze").onclick=function(){STATE[tipo]=Date.now()+5*60*1000;rem();celebrar("adiar");};
  setTimeout(function(){if(el.parentNode)rem();},22000); /* some sozinho em 22s */
}

/* ---------- agendador ---------- */
var STATE={}; /* tipo -> próximo disparo (ms) */
function reprograma(){
  var p=load();var now=Date.now();
  ORD.forEach(function(k){
    if(p.master&&p.tipos[k]&&p.tipos[k].on){
      if(!STATE[k])STATE[k]=now+(p.tipos[k].intervalo||TIPOS[k].intervalo)*60*1000;
    }else{STATE[k]=null;}
  });
}
function tick(){
  var p=load();if(!p.master){return;}
  var now=Date.now();
  ORD.forEach(function(k){
    if(!(p.tipos[k]&&p.tipos[k].on)){STATE[k]=null;return;}
    if(!STATE[k]){STATE[k]=now+(p.tipos[k].intervalo||TIPOS[k].intervalo)*60*1000;return;}
    if(now>=STATE[k]){toast(k);STATE[k]=now+(p.tipos[k].intervalo||TIPOS[k].intervalo)*60*1000;}
  });
}

/* ---------- tela de preferências ---------- */
function esc(s){return (s==null?"":String(s)).replace(/</g,"&lt;");}
function renderBemestar(v){
  document.body.classList.remove("home");
  var p=load();
  var INTS=[15,20,30,40,45,60,90,120,180];
  function selInt(k){return '<select onchange="BEM.setInt(\''+k+'\',this.value)" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit;background:var(--surface);color:var(--text)">'+
    INTS.map(function(m){return '<option value="'+m+'"'+(Number(p.tipos[k].intervalo)===m?" selected":"")+'>a cada '+(m<60?m+" min":(m/60)+"h"+(m%60?" "+(m%60)+"min":""))+'</option>';}).join("")+'</select>';}
  var linhas=ORD.map(function(k){var t=TIPOS[k];var on=p.tipos[k].on;
    return '<div style="display:flex;align-items:center;gap:14px;padding:14px 4px;border-bottom:1px solid var(--border2);flex-wrap:wrap">'+
      '<div style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;background:'+t.cor+'18;flex:none">'+t.emoji+'</div>'+
      '<div style="flex:1;min-width:160px"><div style="font-weight:700">'+t.nome+'</div><div style="font-size:.8rem;color:var(--muted)">'+esc(t.msgs[0])+'</div></div>'+
      selInt(k)+
      '<label class="bemSw"><input type="checkbox" '+(on?"checked":"")+' onchange="BEM.toggle(\''+k+'\',this.checked)"><span></span></label>'+
    '</div>';
  }).join("");
  v.innerHTML=
    '<style>.bemSw{position:relative;display:inline-block;width:46px;height:26px;flex:none}.bemSw input{display:none}.bemSw span{position:absolute;inset:0;background:#CBD2DA;border-radius:999px;transition:.2s;cursor:pointer}.bemSw span:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}.bemSw input:checked+span{background:#16A34A}.bemSw input:checked+span:before{transform:translateX(20px)}</style>'+
    '<div class="card" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">'+
      '<div style="width:54px;height:54px;border-radius:14px;background:linear-gradient(135deg,#F0560C,#FF7A2E);display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex:none">🌿</div>'+
      '<div style="flex:1;min-width:220px"><h2 style="font-size:1.1rem;font-weight:800">Bem-estar &amp; Pausas</h2><div class="cap" style="margin:0">Lembretes amigáveis para você cuidar de si durante o trabalho. Não interrompem o que você está fazendo — aparecem discretamente no canto da tela.</div></div>'+
      '<label class="bemSw" style="transform:scale(1.15)"><input type="checkbox" '+(p.master?"checked":"")+' onchange="BEM.master(this.checked)"><span></span></label>'+
    '</div>'+
    '<div class="card"><div class="sec-title" style="font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;margin-bottom:6px">Tipos de lembrete &amp; frequência</div>'+linhas+
      '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap"><button type="button" onclick="BEM.testar()" style="border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer">🔔 Testar um lembrete agora</button>'+
      '<span style="font-size:.8rem;color:var(--muted);align-self:center">Suas preferências ficam salvas neste aparelho.</span></div>'+
    '</div>'+(typeof window.sig==="function"?window.sig():"");
}

window.BEM={
  render:renderBemestar,
  master:function(b){var p=load();p.master=!!b;save(p);STATE={};reprograma();},
  toggle:function(k,b){var p=load();p.tipos[k].on=!!b;save(p);STATE[k]=null;reprograma();},
  setInt:function(k,m){var p=load();p.tipos[k].intervalo=Number(m)||TIPOS[k].intervalo;save(p);STATE[k]=null;reprograma();},
  testar:function(){var pr=load();var ks=ORD.filter(function(k){return pr.tipos[k].on;});toast(ks[Math.floor(Math.random()*ks.length)]||"agua");}
};
window.renderBemestar=renderBemestar;

/* ---------- inicia o agendador depois do login ---------- */
function boot(){
  if(typeof SESSION==="undefined"||!SESSION){return setTimeout(boot,800);}
  reprograma();
  if(!window._bemTimer)window._bemTimer=setInterval(tick,60000); /* confere a cada minuto */
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
