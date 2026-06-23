# Gerenciador de Financiamento — by VIZIO

Sistema web (HTML/CSS/JS puro + Supabase) que transforma a planilha de acompanhamento de
financiamento imobiliário em um **SaaS com login, dados na nuvem e painéis**. *Sua planilha virou software.*

🔗 **No ar:** https://isaacns.github.io/gerenciador-financiamento/

## Como funciona
- **Login real por e-mail e senha** (Supabase Auth). Cada usuário só vê os próprios dados (isolamento por RLS).
- **Criar conta:** qualquer pessoa pode se cadastrar pela tela de login ("Criar conta") e gerenciar o próprio financiamento.
- **Recuperação e troca de senha** integradas.

## Arquivos
- `index.html` — aplicação (login/cadastro, HOME, 7 módulos, gráficos Chart.js).
- `supabase-mode.js` — camada Supabase: autenticação, leitura/gravação na nuvem, cadastro self-service.
- `app-crud.js` — Cadastro/Edição (Novo/Editar/Excluir) + configuração de etapa + relatórios PDF.
- `dados.js` — configuração da instância (`_cfg` com a URL/chave pública do Supabase). Os dados vêm da nuvem após o login.
- `configurador.html` — ferramenta **exclusiva de administradores** para gerar e **entregar** uma instância pronta na conta de um cliente.
- `vizio-*.png`, `favicon-*.png` — identidade VIZIO.

## Módulos (7)
Início · Visão Geral · Entrada Parcelada (com reajuste/parcela corrigida automática) · Documentação ·
Juros de Obra · Financiamento (SAC/PRICE) · Simulador de amortização antecipada.
Cada etapa tem **Gerenciar dados** (configurar, gerar parcelas, incluir/editar/excluir) e **Relatório PDF**.

## Backend (Supabase)
- Tabelas por usuário: `fin_perfis`, `fin_config`, `fin_entrada`, `fin_doc`, `fin_obra`, `fin_financiamento` — todas com **RLS** (`auth.uid() = user_id`).
- **Admin:** flag `fin_perfis.is_admin` (travada contra autoelevação) controla o acesso ao Configurador.
- **Entrega premium:** a Edge Function `seed-client` cria/convida o cliente por e-mail e semeia os dados na conta dele com segurança (service role + verificação de admin).

## Dois modelos de uso
1. **Self-service:** o cliente cria a conta e preenche os próprios dados (configura cada etapa e gera o cronograma, ou lança parcela a parcela).
2. **Done-for-you (premium):** o admin usa o Configurador, informa o e-mail do cliente e o sistema entrega tudo preenchido (cria a conta + convite + dados).

## Publicar
Suba esta pasta para um repositório e ative **Settings → Pages → branch `main` / pasta raiz**. O `.nojekyll` já está incluído.

---
*Gerenciador de Financiamento by VIZIO · um produto INPERSON.*
