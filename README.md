# Gerenciador de Financiamento — Dashboard (by VIZIO)

Sistema web (HTML/CSS/JS puro) que transforma a planilha de financiamento em software.

## Arquivos
- `index.html` — aplicação (login, HOME, 7 módulos, gráficos Chart.js).
- `dados.js` — snapshot dos dados da planilha (`const DADOS`). Trocar este arquivo = nova instância/comprador.
- `app-crud.js` — camada de Cadastro/Edição (Novo/Editar/Excluir) + Relatórios PDF.
- `vizio-*.png`, `favicon-*.png` — identidade VIZIO.

## Como abrir
Abra `index.html` no navegador. Login de demonstração:
- `sarah` / `sarah` — proprietária
- `admin` / `admin` — gestor (Isaac / INPERSON)

## Publicar (GitHub Pages)
1. Suba esta pasta para um repositório.
2. Settings → Pages → branch `main` / pasta raiz.
3. O `.nojekyll` já está incluído.

## Conectar dados ao vivo (Google Sheets)
1. Publique a planilha como Apps Script Web App (doPost grava as abas).
2. Em `app-crud.js`, preencha `API_URL` com a URL `/exec` do Web App.
3. O CRUD passa a gravar de verdade (hoje opera em modo demonstração na sessão).

## Clonar para outro comprador
Gere um novo `dados.js` a partir da planilha do comprador (mesma estrutura) e ajuste
o nome do imóvel em `index.html` (instância). O resto do sistema é reutilizável.

---
Sua planilha virou software. · um produto INPERSON
