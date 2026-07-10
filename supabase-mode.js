/* ===========================================================================
 * Gerenciador de Financiamento by VIZIO — Modo Supabase (auth real + dados na nuvem)
 * Carregado por último (depois do index inline e do app-crud.js).
 * Ativa SOMENTE quando DADOS._cfg.supabaseUrl está preenchido — senão fica inerte
 * (o demo segue em modo aberto, sem cadastro).
 * - Login: Supabase Auth (e-mail + senha) · Recuperar senha · Alterar senha
 * - Dados: lê/grava nas tabelas fin_* (RLS isola por usuário)
 * =========================================================================== */
(function(){
"use strict";
var CFG = (typeof DADOS!=="undefined" && DADOS._cfg) ? DADOS._cfg : {};
if(!CFG.supabaseUrl || !window.supabase){ return; }   // modo demo/Apps Script: não faz nada

var SB = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.SUPA = SB;

var MAP = {
  entrada:      {t:"fin_entrada",       arr:"entrada", cols:["parcela","venc","valor","pago","reajuste","quitado","status"]},
  doc:          {t:"fin_doc",           arr:"doc",     cols:["parcela","rtbi","cartorio","total","quitado","status"]},
  obra:         {t:"fin_obra",          arr:"juros",   cols:["parcela","venc","valor","evolucao","total","quitado","status"]},
  financiamento:{t:"fin_financiamento", arr:"fin",     cols:["parcela","mes","valor","pago","reajuste","amort","saldo","quitado","status"]}
};
var NUMCOLS=["valor","pago","reajuste","rtbi","cartorio","total","amort","saldo"];
function recToRow(id,e){ var m=MAP[id],o={}; m.cols.forEach(function(c){ var v=e[c];
  if(c==="quitado")v=!!v; else if(c==="evolucao")v=(v==null||v==="")?null:String(v);
  o[c]=(v===undefined?null:v); }); return o; }
function rowToRec(id,row){ var m=MAP[id],e={_id:row.id}; m.cols.forEach(function(c){ var v=row[c];
  if(c==="quitado")v=(v===true); else if(c==="evolucao")v=(v==null||v==="")?null:parseFloat(v);
  else if(NUMCOLS.indexOf(c)>=0)v=(v==null?null:Number(v)); e[c]=v; }); return e; }

var UID=null;

window.VZSUPA={
  active:true,
  persist:function(id,action,e){
    var m=MAP[id];
    if(action==="create") return SB.from(m.t).insert(recToRow(id,e)).select().single().then(function(r){ if(r.data)e._id=r.data.id; });
    if(action==="update"){ if(e._id) return SB.from(m.t).update(recToRow(id,e)).eq("id",e._id); return Promise.resolve(); }
    if(action==="delete"){ if(e._id) return SB.from(m.t).delete().eq("id",e._id); return Promise.resolve(); }
    return Promise.resolve();
  },
  replaceModule:function(id,rows){ var m=MAP[id];
    return SB.from(m.t).delete().not("id","is",null).then(function(){
      var payload=rows.map(function(e,i){ var o=recToRow(id,e); o.ordem=i; return o; });
      if(!payload.length) return;
      return SB.from(m.t).insert(payload).select("id").then(function(r){ if(r.data) r.data.forEach(function(row,i){ rows[i]._id=row.id; }); });
    });
  },
  saveCfg:function(id,c){ if(!UID)return Promise.resolve();
    return SB.from("fin_config").upsert({user_id:UID,modulo:id,total:c.total||0,forma:c.forma||"parcelado",nparc:c.nParc||0,tipo:c.tipo||"fixa",taxa:c.taxa||0,meses:c.meses||0,data:c.data||""},{onConflict:"user_id,modulo"}).then(function(){});
  },
  addAmort:function(rec){ return SB.from("fin_amortizacoes").insert({data:rec.data||null,valor:rec.valor||0,modo:rec.modo||null,parcela_no:rec.parcela_no||null,saldo_apos:(rec.saldo_apos==null?null:rec.saldo_apos)}).select("id").single().then(function(r){ if(r.data)rec._id=r.data.id; }); },
  clearAmort:function(){ return SB.from("fin_amortizacoes").delete().not("id","is",null); },
  saveModule:function(id,rows){ return this.replaceModule(id,rows); },
  wipeAll:function(){ var ts=["fin_entrada","fin_doc","fin_obra","fin_financiamento","fin_amortizacoes","fin_config"]; return Promise.all(ts.map(function(t){ return SB.from(t).delete().not("id","is",null); })); },
  reset:function(email){ return SB.auth.resetPasswordForEmail(email,{redirectTo:location.href.split("#")[0]}); },
  changePass:function(np){ return SB.auth.updateUser({password:np}); }
};

function loadAll(){
  return Promise.all([
    SB.from("fin_perfis").select("*").maybeSingle(),
    SB.from("fin_config").select("*"),
    SB.from("fin_entrada").select("*").order("ordem"),
    SB.from("fin_doc").select("*").order("ordem"),
    SB.from("fin_obra").select("*").order("ordem"),
    SB.from("fin_financiamento").select("*").order("ordem"),
    SB.from("fin_amortizacoes").select("*").order("created_at")
  ]).then(function(res){
    var perfil=res[0].data||{};
    DADOS.entrada=(res[2].data||[]).map(function(r){return rowToRec("entrada",r);});
    DADOS.doc    =(res[3].data||[]).map(function(r){return rowToRec("doc",r);});
    DADOS.juros  =(res[4].data||[]).map(function(r){return rowToRec("obra",r);});
    DADOS.fin    =(res[5].data||[]).map(function(r){return rowToRec("financiamento",r);});
    DADOS.amortizacoes=(res[6].data||[]).map(function(r){return {_id:r.id,data:r.data,valor:Number(r.valor)||0,modo:r.modo,parcela_no:r.parcela_no,saldo_apos:(r.saldo_apos==null?null:Number(r.saldo_apos))};});
    DADOS._cfgMod={};
    (res[1].data||[]).forEach(function(cf){ DADOS._cfgMod[cf.modulo]={total:Number(cf.total)||0,forma:cf.forma,nParc:cf.nparc,tipo:cf.tipo,taxa:Number(cf.taxa)||0,meses:cf.meses,data:cf.data}; });
    if(window.CRUD&&CRUD.recompute)CRUD.recompute();
    return perfil;
  });
}
function entrar(perfil,email){
  if(window.setSession) window.setSession({nome:perfil.nome||email, perfil:perfil.papel||"proprietario", user:email, roleLabel:perfil.prop_label||"", isAdmin:!!perfil.is_admin});
}

/* ===== PORTÃO DE ACESSO =====================================================
 * Ordem obrigatória: autenticar -> carregar perfil -> verificar assinatura
 * -> só então abrir o app. Falha fechada: sem verificação, sem acesso.
 * ========================================================================== */
function checkingUI(on){
  var el=document.getElementById("vzChecking");
  if(!on){ if(el)el.remove(); return; }
  if(el) return;
  el=document.createElement("div"); el.id="vzChecking";
  el.style.cssText="position:fixed;inset:0;z-index:8500;display:flex;align-items:center;justify-content:center;"+
    "background:rgba(11,14,22,.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);"+
    "color:#E8EAEE;font:600 .92rem 'Inter',system-ui,sans-serif;gap:12px";
  el.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5AA0FF" stroke-width="2.4" stroke-linecap="round">'+
    '<path d="M12 3a9 9 0 1 0 9 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/></path></svg>'+
    '<span>Verificando seu acesso…</span>';
  document.body.appendChild(el);
}

function guardAndEnter(u,email,onErrText){
  UID=u.id;
  checkingUI(true);
  return loadAll()
    .then(function(perfil){ return ensurePerfil(u,perfil); })
    .then(function(perfil){
      if(!window.VZGATE){ checkingUI(false); entrar(perfil,email); return; }  // sem gating (demo)
      return window.VZGATE.check().then(function(st){
        checkingUI(false);
        if(st.blocked){ window.VZGATE.showBlock(); return; }   // NÃO abre o app
        entrar(perfil,email);       // startApp
        window.VZGATE.apply();      // faixa de carência, se houver
      });
    })
    .catch(function(e){
      checkingUI(false);
      if(window.VZGATE){ window.VZGATE.showVerifyError(function(){ guardAndEnter(u,email,onErrText); }); }
      else if(onErrText){ onErrText("Erro ao carregar seus dados."); }
    });
}

/* ----- login (substitui o doLogin do index) ----- */
window.doLogin=function(ev){ ev.preventDefault();
  var email=(document.getElementById("u").value||"").trim();
  var pass=document.getElementById("p").value;
  var err=document.getElementById("loginErr"); err.textContent="Entrando…";
  SB.auth.signInWithPassword({email:email,password:pass}).then(function(r){
    if(r.error){ err.textContent="E-mail ou senha inválidos."; return; }
    err.textContent="";
    guardAndEnter(r.data.user, email, function(m){ err.textContent=m; });
  });
  return false;
};
window.logout=function(){ SB.auth.signOut().finally(function(){ try{sessionStorage.removeItem("vizio_fin_sess");}catch(e){} location.reload(); }); };

/* ----- recuperação de senha (link do e-mail volta com type=recovery) ----- */
SB.auth.onAuthStateChange(function(evt){
  var conv=/type=(invite|recovery|signup)/.test(location.hash||"");
  if(evt==="PASSWORD_RECOVERY" || (evt==="SIGNED_IN" && conv)){
    var np=prompt("Bem-vindo! Defina sua senha de acesso (mín. 6 caracteres):");
    if(np&&np.length>=6) SB.auth.updateUser({password:np}).then(function(r){ alert(r.error?("Erro: "+r.error.message):"Senha definida! Você já está no sistema."); });
  }
});

/* ----- boot: NUNCA entra direto. Ou pede login, ou passa pelo portão. -----
 * requireLogin (DADOS._cfg.requireLogin, padrão true): a cada visita o usuário
 * digita e-mail e senha. Links de convite/recuperação são preservados. */
var REQUIRE_LOGIN = (CFG.requireLogin !== false);
var IS_CONV_LINK  = /type=(invite|recovery|signup)/.test(location.hash||"");

SB.auth.getSession().then(function(s){
  var sess = s && s.data && s.data.session;
  if(!sess) return;                                  // sem sessão: tela de login
  if(REQUIRE_LOGIN && !IS_CONV_LINK){
    return SB.auth.signOut().catch(function(){});     // força o login explícito
  }
  return guardAndEnter(sess.user, sess.user.email);   // sessão válida -> portão
});

/* ----- UI: tela de login (e-mail + esqueci senha) e botão alterar senha ----- */
function ensurePerfil(u,perfil){
  if(perfil&&perfil.user_id) return Promise.resolve(perfil);
  var md=(u&&u.user_metadata)||{};
  var row={user_id:u.id,instancia:md.instancia||"Meu im\u00f3vel",nome:md.nome||u.email,papel:"proprietario",prop_label:"Propriet\u00e1rio"};
  return SB.from("fin_perfis").upsert(row,{onConflict:"user_id"}).then(function(){return row;}).catch(function(){return row;});
}
function toggleSignup(show){
  var sc=document.getElementById("signupCard");
  var lc=document.querySelector("#login form.login-card:not(#signupCard)");
  if(sc)sc.style.display=show?"":"none";
  if(lc)lc.style.display=show?"none":"";
}
function buildSignup(){
  var su=document.getElementById("lgSignup"); if(su)su.onclick=function(){toggleSignup(true);};
  if(document.getElementById("signupCard"))return;
  var loginDiv=document.getElementById("login"); if(!loginDiv)return;
  var sc=document.createElement("form"); sc.className="login-card"; sc.id="signupCard"; sc.style.display="none";
  sc.onsubmit=function(ev){return window.doSignup(ev);};
  sc.innerHTML='<div class="lg"><img class="sym" src="vizio-symbol-dark.png"><img class="wm" src="vizio-wordmark-dark.png"></div>'+
    '<h1>Criar conta</h1><div class="sb">Cadastre-se para gerenciar seu financiamento</div>'+
    '<div class="login-err" id="signupErr"></div>'+
    '<div class="field"><label>Seu nome</label><input id="su_nome" autocomplete="name"></div>'+
    '<div class="field"><label>Im\u00f3vel (ex.: Ap\u00ea 502 \u2014 Ed. Aurora)</label><input id="su_inst"></div>'+
    '<div class="field"><label>E-mail</label><input id="su_email" type="email" autocomplete="email"></div>'+
    '<div class="field"><label>Senha (m\u00edn. 6)</label><input id="su_pass" type="password" autocomplete="new-password"></div>'+
    '<label style="display:flex;gap:8px;align-items:flex-start;font-size:.8rem;color:#475467;margin:4px 0 10px;text-align:left"><input type="checkbox" id="su_consent" style="margin-top:3px"> <span>Li e aceito os <a href="legal.html" target="_blank" style="color:#1C64F0;font-weight:700">Termos e a Política de Privacidade</a>.</span></label>'+'<button class="btn-primary" type="submit">Criar minha conta</button>'+
    '<div class="login-hint"><a href="javascript:void(0)" id="toLogin" style="color:#1C64F0;font-weight:700;text-decoration:none">J\u00e1 tenho conta \u2014 entrar</a></div>'+
    '<div class="login-tag">Sua planilha virou software. \u00b7 um produto INPERSON</div>';
  loginDiv.appendChild(sc);
  var tl=document.getElementById("toLogin"); if(tl)tl.onclick=function(){toggleSignup(false);};
}
window.doSignup=function(ev){ if(ev)ev.preventDefault();
  var nome=(document.getElementById("su_nome").value||"").trim();
  var inst=(document.getElementById("su_inst").value||"").trim()||"Meu im\u00f3vel";
  var email=(document.getElementById("su_email").value||"").trim();
  var pass=document.getElementById("su_pass").value||"";
  var err=document.getElementById("signupErr"); err.style.color="";
  if(!email||pass.length<6){ err.textContent="Informe e-mail e senha (m\u00edn. 6 caracteres)."; return false; }
  if(!document.getElementById("su_consent")||!document.getElementById("su_consent").checked){ err.textContent="É preciso aceitar os Termos e a Política de Privacidade."; return false; }
  err.textContent="Criando sua conta...";
  SB.auth.signUp({email:email,password:pass,options:{data:{nome:nome,instancia:inst},emailRedirectTo:location.href.split("#")[0]}}).then(function(r){
    if(r.error){ err.textContent="Erro: "+r.error.message; return; }
    var u=r.data&&r.data.user, session=r.data&&r.data.session;
    if(session&&u){ guardAndEnter(u,email,function(m){ err.textContent=m; }); }   // conta nova tamb\u00e9m passa pelo port\u00e3o
    else { err.style.color="#15803D"; err.textContent="Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre."; }
  });
  return false;
};
function injectLoginUI(){
  var u=document.getElementById("u"); if(u){ u.type="email"; u.placeholder="seu@email.com"; }
  var lbls=document.querySelectorAll("#login .field label"); if(lbls[0])lbls[0].textContent="E-mail";
  var hint=document.getElementById("lgHint");
  if(hint){ hint.innerHTML='<a href="javascript:void(0)" id="lgForgot" style="color:#1C64F0;font-weight:700;text-decoration:none">Esqueci minha senha</a> \u00b7 <a href="javascript:void(0)" id="lgSignup" style="color:#1C64F0;font-weight:700;text-decoration:none">Criar conta</a>'; }
  var fg=document.getElementById("lgForgot");
  if(fg)fg.onclick=function(){ var em=prompt("Digite seu e-mail para receber o link de recuperação:",(document.getElementById("u").value||"")); if(em){ window.VZSUPA.reset(em).then(function(r){ alert(r.error?("Erro: "+r.error.message):("Enviamos um link de recuperação para "+em+". Confira seu e-mail.")); }); } };
  buildSignup();
}
if(document.readyState!=="loading")injectLoginUI(); else document.addEventListener("DOMContentLoaded",injectLoginUI);

var _startApp=window.startApp;
window.startApp=function(){ if(_startApp)_startApp();
  var bar=document.querySelector(".topbar .user");
  if(bar&&!document.getElementById("btnPass")){
    var b=document.createElement("button"); b.id="btnPass"; b.className="out"; b.title="Alterar senha"; b.style.marginRight="2px";
    b.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    b.onclick=function(){ var np=prompt("Defina sua nova senha (mín. 6 caracteres):"); if(np&&np.length>=6){ window.VZSUPA.changePass(np).then(function(r){ alert(r.error?("Erro: "+r.error.message):"Senha alterada com sucesso."); }); } };
    var out=bar.querySelector("button.out"); if(out)bar.insertBefore(b,out); else bar.appendChild(b);
  }
};

/* O gating.js agora é carregado por <script> no index.html, ANTES deste arquivo,
   para que window.VZGATE já exista quando o portão (guardAndEnter) rodar. */
})();
