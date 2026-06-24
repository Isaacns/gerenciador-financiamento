/* ===========================================================================
 * Gerenciador de Financiamento by VIZIO — Gating por assinatura
 * Carregado por ÚLTIMO (depois de app-crud.js e supabase-mode.js).
 * Regra (configurável em DADOS._cfg):
 *   - trialDays (padrão 14): período de teste grátis por conta (a partir do
 *     created_at do usuário no Supabase Auth).
 *   - gating (padrão true): liga/desliga o bloqueio.
 *   - Admins (fin_perfis.is_admin) e assinantes ativos: acesso total, sem banner.
 *   - Teste vigente: acesso total + banner com dias restantes.
 *   - Teste encerrado e sem assinatura: bloqueia AÇÕES DE EDIÇÃO (mantém leitura)
 *     e leva para a tela de Assinatura. Falha sempre "aberta" (não bloqueia em erro).
 * Só atua quando o modo Supabase está ativo (DADOS._cfg.supabaseUrl preenchido).
 * =========================================================================== */
(function(){
"use strict";
function cfg(){ return (typeof DADOS!=="undefined" && DADOS._cfg) ? DADOS._cfg : {}; }
if(!cfg().supabaseUrl){ return; } // modo demo: gating inerte

var TRIAL_DAYS = Number(cfg().trialDays || 14);
var GATING_ON  = cfg().gating !== false;
var DAY = 86400000;
var STATE = { ready:false, admin:false, active:false, daysLeft:null, blocked:false };

function compute(user, perfil, assina){
  STATE.admin = !!(perfil && perfil.is_admin);
  var st = assina && assina.status;
  STATE.active = (st === "active" || st === "trialing");
  var created = (user && user.created_at) ? new Date(user.created_at) : null;
  if(created && !isNaN(created.getTime())){
    var end = created.getTime() + TRIAL_DAYS * DAY;
    STATE.daysLeft = Math.ceil((end - Date.now()) / DAY);
  } else {
    STATE.daysLeft = null;
  }
  STATE.blocked = GATING_ON && !STATE.admin && !STATE.active && !(STATE.daysLeft != null && STATE.daysLeft > 0);
  STATE.ready = true;
}

function renderBanner(){
  var ex = document.getElementById("vzGateBar"); if(ex) ex.remove();
  if(STATE.admin || STATE.active) return;            // sem banner para admin/assinante
  if(STATE.daysLeft == null && !STATE.blocked) return;
  var blocked = STATE.blocked, msg, bg;
  if(blocked){ msg = "Seu período de teste terminou. Assine para continuar salvando alterações."; bg = "#9A2D2D"; }
  else { msg = "Período de teste — " + STATE.daysLeft + " dia(s) restante(s)."; bg = "#1450C8"; }
  var bar = document.createElement("div"); bar.id = "vzGateBar";
  bar.style.cssText = "position:relative;z-index:30;background:"+bg+";color:#fff;padding:9px 16px;"+
    "font:600 .85rem 'Inter',system-ui,sans-serif;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap";
  bar.innerHTML = msg + ' <a href="javascript:void(0)" id="vzGateBtn" style="background:#fff;color:#10141F;'+
    'padding:5px 13px;border-radius:7px;text-decoration:none;font-weight:700">Ver assinatura</a>';
  document.body.insertBefore(bar, document.body.firstChild);
  var b = document.getElementById("vzGateBtn");
  if(b) b.onclick = function(){ if(window.navigate) window.navigate("assinatura"); };
}

function gateToast(){
  var t = document.createElement("div");
  t.textContent = "Assine para continuar editando — seu período de teste terminou.";
  t.style.cssText = "position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#9A2D2D;color:#fff;"+
    "padding:12px 20px;border-radius:10px;font:600 .86rem 'Inter',system-ui,sans-serif;z-index:400;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw;text-align:center";
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, 3200);
  if(window.navigate) window.navigate("assinatura");
}

function wrapCrud(){
  if(!window.CRUD || window.CRUD.__gated) return;
  ["save","gerar","importCSV","add","saveCfg","togglePago"].forEach(function(fn){
    var orig = window.CRUD[fn];
    if(typeof orig !== "function") return;
    window.CRUD[fn] = function(){ if(STATE.blocked){ gateToast(); return; } return orig.apply(this, arguments); };
  });
  window.CRUD.__gated = true;
}

function refresh(){
  var SB = window.SUPA; if(!SB) return;
  SB.auth.getUser().then(function(r){
    var user = r && r.data && r.data.user;
    if(!user){ STATE.ready = false; var ex=document.getElementById("vzGateBar"); if(ex)ex.remove(); return; }
    return Promise.all([
      SB.from("fin_perfis").select("is_admin").maybeSingle(),
      SB.from("fin_assinaturas").select("status,current_period_end").maybeSingle()
    ]).then(function(res){
      compute(user, (res[0] && res[0].data) || {}, (res[1] && res[1].data) || {});
      wrapCrud();
      renderBanner();
    });
  }).catch(function(){ /* falha aberta: não bloqueia */ });
}

function init(){
  if(!window.SUPA){ setTimeout(init, 400); return; }
  window.SUPA.auth.onAuthStateChange(function(){ setTimeout(refresh, 350); });
  var _start = window.startApp;
  window.startApp = function(){ if(_start) _start(); setTimeout(refresh, 250); };
  setTimeout(refresh, 900); // sessão persistida
}
init();
})();
