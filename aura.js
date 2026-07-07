/* =========================================================================
   MODO AURA — VIZIO (ambiente vivo: brilho que respira + partículas + mouse)
   v2.1 — mais movimento: respiração mais rápida, mais partículas e mais vivas,
   parallax do mouse mais forte. Fiel ao studio/painel.html (@keyframes breathe).
   Auto-contido: window.AURA. Toggle persistente (localStorage vz_aura_on).
   Seletores em superset: Financiamento (.side/.main/.login-card) e Consórcio
   (#login>.box, #app aside/main, cockpit, portal .wrap).
   ========================================================================= */
(function(){
  'use strict';
  if(window.__AURA_INIT__)return; window.__AURA_INIT__=1;
  function accentHex(){
    var v=(window.VZ_ACCENT)|| (getComputedStyle(document.documentElement).getPropertyValue('--blue')||'').trim() || '#2563EB';
    return v.charAt(0)==='#'?v:'#2563EB';
  }
  function rgb(h){ h=h.replace('#',''); if(h.length===3)h=h.split('').map(function(c){return c+c;}).join(''); var n=parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  var HEX=accentHex(), RGB=rgb(HEX), R=RGB.join(',');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY='vz_aura_on';
  function on(){ try{return localStorage.getItem(KEY)!=='0';}catch(e){return true;} }

  /* CSS — gradientes fortes + respiração rápida e ampla */
  var css=document.createElement('style'); css.id='auraCSS'; css.textContent=
    '.vz-aura{position:absolute;inset:0;z-index:0;pointer-events:none;background:'+
      'radial-gradient(58vw 58vw at 16% -8%,rgba('+R+',.33),transparent 60%),'+
      'radial-gradient(52vw 52vw at 112% 8%,rgba(124,58,237,.27),transparent 60%),'+
      'radial-gradient(62vw 62vw at 50% 122%,rgba('+R+',.18),transparent 62%);'+
      'animation:vzbreathe 6s ease-in-out infinite}'+
    '.vz-afix{position:fixed;inset:-10%;z-index:0;pointer-events:none;will-change:transform;transition:transform .1s linear}'+
    '.vz-afix .vz-aura{mix-blend-mode:screen;opacity:.9}'+
    '@keyframes vzbreathe{0%,100%{opacity:.6;transform:scale(1) translateY(0)}50%{opacity:1;transform:scale(1.09) translateY(-2%)}}'+
    '.vz-parts{position:absolute;inset:0;z-index:0;pointer-events:none}'+
    '.vz-afix .vz-parts{mix-blend-mode:screen;opacity:.85}'+
    '.vz-aura-off .vz-aura,.vz-aura-off .vz-parts,.vz-aura-off .vz-afix{display:none!important}'+
    /* garante o conteúdo acima do aura (superset de seletores dos apps) */
    '#login>.login-card,#login>.box,#login>.card{position:relative;z-index:2}'+
    '#app{position:relative}'+
    '#app>.side,#app>.main,#app>aside,#app>main{position:relative;z-index:1}'+
    '#app .side>*,#app aside>*{position:relative;z-index:1}'+
    '.wrap{position:relative;z-index:1}'+
    '#vzAuraBtn{position:fixed;right:14px;bottom:64px;z-index:120;background:rgba(17,24,39,.82);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:99px;padding:8px 13px;font:600 .76rem/1 Inter,system-ui,sans-serif;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;gap:6px;align-items:center;transition:.2s}'+
    '#vzAuraBtn:hover{border-color:'+HEX+'}'+
    '@media print{.vz-aura,.vz-parts,.vz-afix,#vzAuraBtn{display:none!important}}';
  document.head.appendChild(css);

  /* ---- estado do mouse (parallax) ---- */
  var mx=0,my=0,cmx=0,cmy=0;
  addEventListener('pointermove',function(e){ mx=(e.clientX/innerWidth-.5)*2; my=(e.clientY/innerHeight-.5)*2; },{passive:true});
  addEventListener('deviceorientation',function(e){ if(e.gamma!=null){ mx=Math.max(-1,Math.min(1,e.gamma/35)); my=Math.max(-1,Math.min(1,(e.beta-45)/35)); } },{passive:true});

  var canvases=[]; // {c, parallax}
  function makeAura(){ var d=document.createElement('div'); d.className='vz-aura'; return d; }
  function makeCanvas(parallax){ var c=document.createElement('canvas'); c.className='vz-parts'; canvases.push({c:c,parallax:!!parallax}); return c; }
  function inject(container){
    if(!container)return;
    container.insertBefore(makeCanvas(false), container.firstChild);
    container.insertBefore(makeAura(), container.firstChild);
  }

  function particlesFor(item){
    var canvas=item.c, parallax=item.parallax, ctx=canvas.getContext('2d'), parts=[], raf=0;
    function size(){ var r=canvas.getBoundingClientRect(); canvas.width=Math.max(1,r.width||innerWidth); canvas.height=Math.max(1,r.height||innerHeight); }
    function seed(){ parts=[]; var n=Math.round((canvas.width*canvas.height)/18000); n=Math.max(38,Math.min(120,n));
      for(var i=0;i<n;i++)parts.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*2.2+.7,vx:(Math.random()-.5)*.5,vy:(Math.random()-.5)*.5,a:Math.random()*.55+.3,z:Math.random()*18+6}); }
    function loop(){
      if(!on()){raf=0;return;}
      cmx+=(mx-cmx)*.07; cmy+=(my-cmy)*.07;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      var ox=parallax?cmx:0, oy=parallax?cmy:0;
      for(var i=0;i<parts.length;i++){var p=parts[i];
        p.x+=p.vx;p.y+=p.vy;
        if(p.x<-20)p.x=canvas.width+20;if(p.x>canvas.width+20)p.x=-20;if(p.y<-20)p.y=canvas.height+20;if(p.y>canvas.height+20)p.y=-20;
        var dx=p.x+ox*p.z, dy=p.y+oy*p.z;
        ctx.beginPath();ctx.arc(dx,dy,p.r,0,6.283);ctx.fillStyle='rgba('+R+','+p.a+')';ctx.fill();
        if(p.r>1.4){ ctx.beginPath();ctx.arc(dx,dy,p.r*2.6,0,6.283);ctx.fillStyle='rgba('+R+','+(p.a*.16)+')';ctx.fill(); }
      }
      raf=requestAnimationFrame(loop);
    }
    function start(){ if(reduce||!on())return; size(); seed(); if(!raf)loop(); }
    addEventListener('resize',function(){ size(); seed(); });
    return {start:start};
  }

  var btn=document.createElement('button'); btn.id='vzAuraBtn'; btn.type='button'; btn.innerHTML='✨ AURA';
  function apply(){ document.body.classList.toggle('vz-aura-off', !on()); btn.style.opacity=on()?'1':'.5'; }
  var starts=[], afix=null;
  btn.onclick=function(){ try{localStorage.setItem(KEY, on()?'0':'1');}catch(e){} apply(); starts.forEach(function(s){s.start();}); if(afix)tickFix(); };

  function tickFix(){
    if(!afix||!on()||reduce)return;
    afix.style.transform='translate('+(cmx*40)+'px,'+(cmy*34)+'px)';
    requestAnimationFrame(tickFix);
  }

  function mount(){
    if(!document.body)return;
    /* camada fixa (screen) por toda a tela — o coração do efeito, com parallax */
    afix=document.createElement('div'); afix.className='vz-afix';
    afix.appendChild(makeAura());
    afix.appendChild(makeCanvas(true));
    document.body.insertBefore(afix, document.body.firstChild);
    /* login e barra lateral (fundos opacos) recebem aura própria */
    inject(document.getElementById('login'));
    inject(document.querySelector('#app .side') || document.querySelector('#app aside'));
    document.body.appendChild(btn);
    canvases.forEach(function(it){ starts.push(particlesFor(it)); });
    apply();
    starts.forEach(function(s){ s.start(); });
    tickFix();
  }
  window.AURA={ toggle:function(){ btn.click(); }, on:on };
  if(document.readyState!=='loading')mount(); else document.addEventListener('DOMContentLoaded',mount);
})();
