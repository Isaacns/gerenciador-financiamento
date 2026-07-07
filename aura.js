/* =========================================================================
   MODO AURA — Vizio (efeito de ambiente: brilho que respira + partículas)
   Fiel ao studio/painel.html (@keyframes breathe), enriquecido com partículas
   e pulsação. Adaptável pela cor de destaque (--blue / window.VZ_ACCENT).
   Auto-contido: window.AURA. Toggle persistente (localStorage vz_aura_on).
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

  /* CSS */
  var css=document.createElement('style'); css.id='auraCSS'; css.textContent=
    '.vz-aura{position:absolute;inset:0;z-index:0;pointer-events:none;background:'+
      'radial-gradient(60vw 60vw at 18% -10%,rgba('+R+',.16),transparent 60%),'+
      'radial-gradient(50vw 50vw at 110% 10%,rgba(124,58,237,.12),transparent 60%);'+
      'animation:vzbreathe 9s ease-in-out infinite}'+
    '.vz-aura.fixed{position:fixed;mix-blend-mode:screen;opacity:.9}'+
    '@keyframes vzbreathe{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}'+
    '.vz-parts{position:absolute;inset:0;z-index:0;pointer-events:none}'+
    '.vz-parts.fixed{position:fixed;mix-blend-mode:screen;opacity:.55}'+
    '.vz-aura-off .vz-aura,.vz-aura-off .vz-parts{display:none!important}'+
    /* garante o conteúdo acima do aura */
    '#login>.login-card{position:relative;z-index:2}'+
    '#app{position:relative}#app>.side,#app>.main{position:relative;z-index:1}'+
    '#app .side>*{position:relative;z-index:1}'+ /* eleva logo/nav/foot acima do aura da sidebar */
    '#vzAuraBtn{position:fixed;right:14px;bottom:14px;z-index:120;background:rgba(17,24,39,.82);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:99px;padding:8px 13px;font:600 .76rem/1 Inter,system-ui,sans-serif;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;gap:6px;align-items:center;transition:.2s}'+
    '#vzAuraBtn:hover{border-color:'+HEX+'}'+
    '@media print{.vz-aura,.vz-parts,#vzAuraBtn{display:none!important}}';
  document.head.appendChild(css);

  var canvases=[];
  function makeAura(fixed){ var d=document.createElement('div'); d.className='vz-aura'+(fixed?' fixed':''); return d; }
  function makeCanvas(fixed){ var c=document.createElement('canvas'); c.className='vz-parts'+(fixed?' fixed':''); canvases.push(c); return c; }

  function inject(container, fixed){
    if(!container)return;
    container.insertBefore(makeCanvas(fixed), container.firstChild);
    container.insertBefore(makeAura(fixed), container.firstChild);
  }

  function particlesFor(canvas){
    var ctx=canvas.getContext('2d'), parts=[], raf=0;
    function size(){ var r=canvas.getBoundingClientRect(); canvas.width=Math.max(1,r.width||innerWidth); canvas.height=Math.max(1,r.height||innerHeight); }
    function seed(){ parts=[]; var n=Math.round((canvas.width*canvas.height)/26000); n=Math.max(24,Math.min(70,n)); for(var i=0;i<n;i++)parts.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*2+.6,vx:(Math.random()-.5)*.22,vy:(Math.random()-.5)*.22,a:Math.random()*.45+.2}); }
    function loop(){ if(!on()){raf=0;return;} ctx.clearRect(0,0,canvas.width,canvas.height); for(var i=0;i<parts.length;i++){var p=parts[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=canvas.width;if(p.x>canvas.width)p.x=0;if(p.y<0)p.y=canvas.height;if(p.y>canvas.height)p.y=0;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.283);ctx.fillStyle='rgba('+R+','+p.a+')';ctx.fill();} raf=requestAnimationFrame(loop); }
    function start(){ if(reduce||!on())return; size(); seed(); if(!raf)loop(); }
    addEventListener('resize',function(){ size(); seed(); });
    return {start:start};
  }

  var btn=document.createElement('button'); btn.id='vzAuraBtn'; btn.type='button'; btn.innerHTML='✨ AURA';
  function apply(){ document.body.classList.toggle('vz-aura-off', !on()); btn.style.opacity=on()?'1':'.5'; }
  btn.onclick=function(){ try{localStorage.setItem(KEY, on()?'0':'1');}catch(e){} apply(); starts.forEach(function(s){s.start();}); };

  var starts=[];
  function mount(){
    if(!document.body)return;
    // login (fundo escuro) — aura absoluta dentro do #login
    inject(document.getElementById('login'), false);
    // sidebar (fundo escuro) — aura respirando atrás do menu
    inject(document.querySelector('#app .side'), false);
    // app inteiro — camada fixa (screen) para os ambientes escuros (sidebar/hero)
    var fa=makeAura(true), fc=makeCanvas(true);
    document.body.insertBefore(fc, document.body.firstChild);
    document.body.insertBefore(fa, document.body.firstChild);
    document.body.appendChild(btn);
    canvases.forEach(function(c){ starts.push(particlesFor(c)); });
    apply();
    starts.forEach(function(s){ s.start(); });
  }
  window.AURA={ toggle:function(){ btn.click(); }, on:on };
  if(document.readyState!=='loading')mount(); else document.addEventListener('DOMContentLoaded',mount);
})();
