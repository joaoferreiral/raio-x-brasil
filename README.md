# Raio-X Brasil

O Brasil em números, sem complicação. Impostos, gastos do governo e indicadores da economia explicados em linguagem simples, atualizados todo dia com dados oficiais.

Custo: **zero**, fora o domínio. GitHub Pages e GitHub Actions são gratuitos em repositório público, as APIs do Banco Central e do IBGE são abertas e a pesquisa semanal usa a sua assinatura do Claude.

## Colocar no ar (uma vez só, ~10 minutos)

Rode no terminal, dentro desta pasta:

```bash
# 1. Criar o repositório público e subir o código
git init -b main
git add .
git commit -m "Raio-X Brasil: primeira versão"
gh repo create raio-x-brasil --public --source=. --push

# 2. Ligar o GitHub Pages usando o GitHub Actions
gh api -X POST "repos/{owner}/raio-x-brasil/pages" -f build_type=workflow

# 3. Gerar o token do Claude (abre o navegador para login) e salvar como secret
claude setup-token
gh secret set CLAUDE_CODE_OAUTH_TOKEN   # cole o token quando pedir

# 4. Rodar a primeira atualização agora (depois roda sozinho todo dia às 05:00)
gh workflow run atualizar.yml
gh run watch
```

O site fica em `https://SEU-USUARIO.github.io/raio-x-brasil/`.

## Domínio próprio

1. Compre o domínio (Registro.br para `.com.br`, ou Hostinger, Cloudflare etc).
2. No painel de DNS do domínio, crie:
   - 4 registros **A** em `@` apontando para `185.199.108.153`, `185.199.109.153`, `185.199.110.153` e `185.199.111.153`
   - 1 registro **CNAME** em `www` apontando para `SEU-USUARIO.github.io`
3. Configure o domínio no repositório e crie o arquivo CNAME:
   ```bash
   echo "seudominio.com.br" > CNAME
   git add CNAME && git commit -m "domínio" && git push
   gh api -X PUT "repos/{owner}/raio-x-brasil/pages" -f cname=seudominio.com.br
   ```
4. Espere o DNS propagar (de minutos a algumas horas) e ative **Enforce HTTPS** em Settings > Pages.

## Como a atualização automática funciona

Todo dia às 05:00 (Recife), o workflow `.github/workflows/atualizar.yml` faz três coisas:

1. **Indicadores:** busca inflação, Selic, dólar, desemprego, dívida e salário mínimo nas APIs do Banco Central e do IBGE. Se uma fonte falhar, mantém o último valor.
2. **Pesquisa semanal (só às segundas):** roda o Claude Code com as regras de `.claude/pesquisa-semanal.md`. Ele procura novas leis, MPs e decretos sobre impostos, confirma em fonte oficial e atualiza `data/`. Se o resultado não passar na validação, as mudanças são descartadas.
3. **Publicação:** valida tudo e publica no GitHub Pages.

Para acompanhar: `gh run list` ou a aba **Actions** do repositório. Para rodar só os números, sem a pesquisa: `gh workflow run atualizar.yml -f pular_pesquisa=true`.

## Editar pelo terminal

```bash
npm run dev       # ver o site em http://localhost:8080
npm run validar   # conferir os dados
claude            # abrir o Claude Code na pasta (ele lê o CLAUDE.md)
```

Qualquer `git push` na `main` republica o site.
