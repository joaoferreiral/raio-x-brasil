# Raio-X Brasil

Site público que explica, em linguagem simples, o estado do Brasil: impostos, gastos do governo e indicadores da economia. Atualiza sozinho todo dia.

## Estrutura

- `index.html`, `assets/style.css`, `assets/app.js`: site estático, sem build. O JS lê os arquivos de `data/` e monta a página.
- `data/indicadores.json`: números do resumo. Os itens com `auto` são atualizados por `scripts/atualizar-indicadores.mjs` (APIs do Banco Central e do IBGE).
- `data/medidas.json`: linha do tempo de mudanças nos impostos desde 2023.
- `data/gastos.json`: Orçamento federal do ano.
- `data/tributos.json`: lista dos principais tributos.
- `data/glossario.json`: termos difíceis. No texto, `[[Termo]]` ou `[[Termo|texto]]` vira um botão com a explicação.
- `data/contexto.json`: governo atual, base de comparação (dez/2022) e avisos.
- `data/changelog.json`: últimas atualizações mostradas no site.
- `scripts/validar.mjs`: valida todos os JSON. Roda antes de qualquer publicação.
- `.github/workflows/atualizar.yml`: todo dia às 06:17 (Recife) atualiza indicadores, roda a pesquisa com o Claude e publica no GitHub Pages.
- `.claude/pesquisa-diaria.md`: instruções da pesquisa diária automática.

## Comandos

```bash
npm run dev          # servidor local em http://localhost:8080
npm run validar      # valida os dados
npm run indicadores  # busca os indicadores nas APIs oficiais (precisa de internet no Brasil ou exterior)
```

## Regras editoriais (valem para qualquer edição)

1. **Neutro e com fonte.** Só fatos verificáveis, cada medida com link para a norma oficial ou reportagem. Listar aumentos e reduções de imposto com o mesmo cuidado.
2. **Linguagem simples.** Escreva para quem nunca leu sobre economia. Explique siglas pelo glossário.
3. **Sem travessão (—)** em nenhum texto do site.
4. **Nunca apagar medidas.** Para corrigir, edite. Se caducou ou foi derrubada, mude o tipo para `nao-vingou`.
5. Rodar `npm run validar` depois de qualquer mudança em `data/`.
