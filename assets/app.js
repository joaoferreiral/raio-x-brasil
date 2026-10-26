(() => {
  'use strict';

  const TIPOS = {
    'criou': { rotulo: 'Criou imposto', curto: 'Criados', cor: 'var(--t-criou)', det: 'tributo ou cobrança nova' },
    'aumentou': { rotulo: 'Aumentou imposto', curto: 'Aumentados', cor: 'var(--t-aumentou)', det: 'alíquota maior ou volta de cobrança' },
    'cortou-beneficio': { rotulo: 'Cortou benefício', curto: 'Benefícios cortados', cor: 'var(--t-cortou)', det: 'fim de isenção ou desconto' },
    'reduziu': { rotulo: 'Reduziu imposto', curto: 'Reduzidos', cor: 'var(--t-reduziu)', det: 'isenção ou alíquota menor' },
    'nao-vingou': { rotulo: 'Não vingou', curto: 'Não vingaram', cor: 'var(--t-nao)', det: 'derrubado ou perdeu a validade' },
    'regra': { rotulo: 'Mudança de regra', curto: 'Outras regras', cor: 'var(--t-regra)', det: 'não é imposto, mas afeta a arrecadação' },
  };
  const AUMENTOS = ['criou', 'aumentou', 'cortou-beneficio'];
  const FINALIZADOS = ['encerrado', 'derrubado', 'caducou'];
  const STATUS = {
    'vigente': 'Em vigor', 'encerrado': 'Encerrado', 'derrubado': 'Derrubado', 'caducou': 'Perdeu a validade',
    'em-transicao': 'Em transição', 'suspenso': 'Suspenso', 'em-tramitacao': 'Em votação',
  };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, casas = 1) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

  let glossario = new Map();

  // [[Termo]] ou [[Termo|texto]] vira um botão que abre a explicação.
  function rich(texto) {
    return esc(texto).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, termo, rotulo) =>
      `<button type="button" class="termo" data-termo="${esc(termo.trim())}">${rotulo || termo}</button>`);
  }

  function link(f) {
    return `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.nome)}</a>`;
  }

  function dataBR(d) {
    const [a, m, dia] = d.split('-');
    return dia ? `${Number(dia)} ${MESES[m - 1]} ${a}` : `${MESES[m - 1]} ${a}`;
  }

  async function carregar(nome) {
    const res = await fetch(`data/${nome}.json?v=${Date.now().toString().slice(0, -5)}`);
    if (!res.ok) throw new Error(nome);
    return res.json();
  }

  // ---------- Contexto ----------
  function renderContexto(ctx, ind) {
    const atual = new Date(ind.atualizadoEm);
    $('#selo-atualizado').textContent = `Atualizado em ${atual.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Recife' })}`;
    const g = ctx.governoAtual;
    let html = `<div class="caixa"><span class="icone" aria-hidden="true">🏛️</span><div><strong>Governo atual: ${esc(g.presidente)} (${esc(g.partido)}), mandato ${esc(g.mandato)}</strong>
      <p>${esc(ctx.baseComparacao.explicacao)}</p></div></div>`;
    if (ctx.aviso) {
      html += `<div class="caixa"><span class="icone" aria-hidden="true">🗳️</span><div><p>${rich(ctx.aviso)}</p>
        ${ctx.avisoFonte ? `<p>${link(ctx.avisoFonte)}</p>` : ''}</div></div>`;
    }
    $('#contexto').innerHTML = html;
    $('#explicacao-base').textContent = ctx.baseComparacao.explicacao;
    $('#resumo-sub').innerHTML = `Os principais números do país hoje, comparados com <b>${esc(ctx.baseComparacao.rotulo)}</b>. Verde quando melhorou, vermelho quando piorou e cinza quando depende do ponto de vista.`;
  }

  // ---------- Indicadores ----------
  function valorFmt(i, v) {
    const n = fmt(v, i.casas ?? 1);
    if (i.unidade === 'R$ bi') return { num: (v < 0 ? '−' : '') + 'R$ ' + fmt(Math.abs(v), i.casas ?? 1), un: 'bi' };
    if (i.prefixo) return { num: 'R$ ' + n, un: '' };
    if (i.unidade === '%') return { num: n + '%', un: '' };
    return { num: n, un: i.unidade };
  }

  function avaliar(i) {
    const delta = i.valor - i.valorAntes;
    const rel = Math.abs(delta) / Math.max(Math.abs(i.valorAntes), 1e-9);
    const sobe = delta > 0;
    const seta = Math.abs(delta) < 1e-9 ? '=' : sobe ? '▲' : '▼';
    if (i.melhorQuando === 'neutro') {
      const t = Math.abs(delta) < 1e-9 ? 'Igual' : sobe ? 'Subiu' : 'Caiu';
      return { classe: 'neutro', texto: `${seta} ${t}` };
    }
    let melhorou = i.melhorQuando === 'menor' ? delta < 0 : delta > 0;
    if (i.id === 'salario' && Number.isFinite(i.ganhoReal)) melhorou = i.ganhoReal > 0;
    if (rel < 0.01 && i.id !== 'salario') return { classe: 'neutro', texto: `${seta} Estável` };
    return melhorou ? { classe: 'bom', texto: `${seta} Melhorou` } : { classe: 'ruim', texto: `${seta} Piorou` };
  }

  function variacao(i) {
    const d = i.valor - i.valorAntes;
    const sinal = d > 0 ? '+' : d < 0 ? '−' : '';
    if (Math.abs(d) < 1e-9) return 'sem mudança';
    if (i.unidade === '%' || i.unidade.startsWith('% ')) return `${sinal}${fmt(Math.abs(d), i.casas ?? 1)} ponto${Math.abs(d) >= 2 ? 's' : ''}`;
    if (i.unidade === 'R$ bi') return `${sinal}R$ ${fmt(Math.abs(d), 1)} bi`;
    const pct = (d / Math.abs(i.valorAntes)) * 100;
    return `${sinal}${fmt(Math.abs(pct), 1)}%`;
  }

  function renderIndicadores(ind) {
    $('#indicadores').innerHTML = ind.itens.map((i) => {
      const a = avaliar(i);
      const v = valorFmt(i, i.valor);
      const antes = valorFmt(i, i.valorAntes);
      let extra = '';
      if (i.id === 'salario' && Number.isFinite(i.ganhoReal)) {
        extra = `<p class="ind-extra${i.ganhoReal < 0 ? ' ruim' : ''}">${i.ganhoReal >= 0 ? 'Ganho' : 'Perda'} real de ${fmt(Math.abs(i.ganhoReal), 1)}% acima da inflação</p>`;
      }
      return `<article class="card">
        <div class="ind-topo"><h3 class="ind-nome">${esc(i.nome)}</h3><span class="badge ${a.classe}">${a.texto}</span></div>
        <div><p class="ind-valor">${v.num}${v.un ? `<small>${esc(v.un)}</small>` : ''}</p><p class="ind-ref">${esc(i.referencia)}</p></div>
        <div class="ind-comp"><span>Em ${esc(i.referenciaAntes)}: <b>${antes.num}${antes.un ? ' ' + esc(antes.un) : ''}</b></span><b class="var">${variacao(i)}</b></div>
        ${extra}
        <p class="ind-exp">${rich(i.explicacao)}</p>
        <p class="fonte">Fonte: ${link(i.fonte)}</p>
      </article>`;
    }).join('');

    const acc = ind.inflacaoAcumuladaDesdeBase;
    if (acc && Number.isFinite(acc.valor)) {
      $('#nota-inflacao').innerHTML = `Inflação acumulada desde o início do mandato: <b>${fmt(acc.valor, 1)}%</b> (até ${esc(acc.ate)}). Ou seja, o que custava R$ 100 passou a custar R$ ${fmt(100 + acc.valor, 2)}.`;
    }
  }

  // ---------- Medidas ----------
  let medidas = [];
  let filtro = 'todos';

  function renderPlacar(dados) {
    const cont = Object.fromEntries(Object.keys(TIPOS).map((t) => [t, 0]));
    dados.itens.forEach((m) => { cont[m.tipo] = (cont[m.tipo] || 0) + 1; });
    const aumentos = dados.itens.filter((m) => AUMENTOS.includes(m.tipo));
    const finalizados = aumentos.filter((m) => FINALIZADOS.includes(m.status)).length;
    const reduz = cont['reduziu'];

    $('#nota-contagem').innerHTML = rich(dados.notaContagem);
    $('#placar').innerHTML =
      `<div class="destaque-soma"><b>${aumentos.length} medidas</b><span>aumentaram impostos de alguma forma desde 2023 (${finalizados} já encerradas). No mesmo período, ${reduz} medidas reduziram impostos.</span></div>` +
      Object.entries(TIPOS).map(([t, info]) =>
        `<div class="placar-item" style="--c:${info.cor}"><p class="placar-num">${cont[t]}</p><p class="placar-rot">${info.curto}</p><p class="placar-det">${info.det}</p></div>`
      ).join('');

    $('#nota-fontes-medidas').innerHTML = `Para comparar com outras contagens: ${dados.notaFontes.map(link).join(' · ')}.`;
  }

  function renderFiltros() {
    const cont = medidas.reduce((a, m) => ((a[m.tipo] = (a[m.tipo] || 0) + 1), a), {});
    const chips = [['todos', 'Todas', null, medidas.length], ...Object.entries(TIPOS).map(([t, i]) => [t, i.curto, i.cor, cont[t] || 0])];
    $('#filtros').innerHTML = chips.filter((c) => c[3] > 0).map(([id, rot, cor, n]) =>
      `<button type="button" class="chip" data-filtro="${id}" aria-pressed="${filtro === id}" ${cor ? `style="--c:${cor}"` : ''}>${cor ? '<i></i>' : ''}${esc(rot)} <span>${n}</span></button>`
    ).join('');
  }

  function situacao(m) {
    const rot = STATUS[m.status] || m.status;
    const txt = m.statusTexto || '';
    const norm = (x) => x.toLowerCase().replace(/[.\s]+$/, '');
    if (norm(txt) === norm(rot)) return `<span class="status">${esc(rot)}.</span>`;
    if (norm(txt).startsWith(norm(rot))) return `<span class="status">${esc(rot)}</span>${esc(txt.slice(rot.length))}`;
    return `<span class="status">${esc(rot)}.</span> ${esc(txt)}`;
  }

  function renderMedidas() {
    const lista = medidas
      .filter((m) => filtro === 'todos' || m.tipo === filtro)
      .sort((a, b) => b.data.localeCompare(a.data));
    if (!lista.length) { $('#medidas').innerHTML = '<li class="vazio">Nenhuma medida nesse filtro.</li>'; return; }
    let ano = null;
    $('#medidas').innerHTML = lista.map((m) => {
      const t = TIPOS[m.tipo];
      const a = m.data.slice(0, 4);
      const cab = a !== ano ? `<li class="ano" aria-hidden="false">${a}</li>` : '';
      ano = a;
      return `${cab}<li class="medida" style="--c:${t.cor}">
        <div>
          <div class="medida-meta"><span class="tag">${esc(t.rotulo)}</span><time datetime="${esc(m.data)}">${dataBR(m.data)}</time></div>
          <h3>${esc(m.titulo)}</h3>
          <p class="medida-resumo">${rich(m.resumo)}</p>
          <dl class="medida-info">
            <div><dt>Quem sente: </dt><dd>${esc(m.quemSente)}</dd></div>
            <div><dt>Situação: </dt><dd>${situacao(m)}</dd></div>
            <div><dt>Norma: </dt><dd>${esc(m.instrumento)}</dd></div>
          </dl>
          <p class="medida-fontes">${m.fontes.map(link).join('')}</p>
        </div>
      </li>`;
    }).join('');
  }

  // ---------- Gastos ----------
  function renderGastos(g) {
    $('#gastos-titulo').textContent = g.titulo;
    $('#gastos-intro').innerHTML = rich(g.intro);
    const max = Math.max(...g.itens.map((i) => i.valorBi));
    $('#lista-gastos').innerHTML = g.itens.map((i) => {
      const porPessoa = (i.valorBi * 1e9) / g.populacao;
      const bi = i.valorBi >= 1000 ? `R$ ${fmt(i.valorBi / 1000, 2)} tri` : `R$ ${fmt(i.valorBi, 1)} bi`;
      return `<div class="gasto">
        <p class="gasto-nome">${esc(i.nome)}</p>
        <p class="gasto-val"><b>${bi}</b><span>R$ ${fmt(porPessoa, 0)} por brasileiro/ano</span></p>
        <div class="barra" aria-hidden="true"><i style="--w:${((i.valorBi / max) * 100).toFixed(1)}%"></i></div>
        <p class="gasto-exp">${rich(i.explicacao)}</p>
      </div>`;
    }).join('');
    $('#notas-gastos').innerHTML = `<p>${rich(g.notaRolagem)}</p><p>${rich(g.notaSobreposicao)}</p><p>Fontes: ${g.fontes.map(link).join(' · ')}</p>`;
  }

  // ---------- Tributos ----------
  let tributos = [];
  let esfera = 'Todas';
  function renderTributos() {
    const esferas = ['Todas', 'Federal', 'Estadual', 'Municipal'];
    $('#filtros-esfera').innerHTML = esferas.map((e) =>
      `<button type="button" class="chip" data-esfera="${e}" aria-pressed="${esfera === e}">${e}</button>`).join('');
    $('#lista-tributos').innerHTML = tributos
      .filter((t) => esfera === 'Todas' || t.esfera.includes(esfera))
      .map((t) => `<article class="card tributo">
        <div class="tributo-topo"><span class="sigla">${esc(t.sigla)}</span><span class="esfera">${esc(t.esfera)}</span></div>
        <p class="tributo-nome">${esc(t.nome)}</p>
        <p>${rich(t.oQueE)}</p>
        ${t.exemplo ? `<p class="ex">${rich(t.exemplo)}</p>` : ''}
        ${t.reforma ? `<p class="ref"><b>Reforma tributária:</b> ${rich(t.reforma)}</p>` : ''}
      </article>`).join('');
  }

  // ---------- Glossário ----------
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function renderGlossario(lista, busca = '') {
    const q = norm(busca.trim());
    const itens = lista.filter((g) => !q || norm(g.termo + ' ' + g.definicao + ' ' + (g.aliases || []).join(' ')).includes(q));
    $('#lista-glossario').innerHTML = itens.length
      ? itens.map((g) => `<div id="termo-${esc(norm(g.termo).replace(/[^a-z0-9]+/g, '-'))}"><dt>${esc(g.termo)}</dt><dd>${esc(g.definicao)}</dd></div>`).join('')
      : '<p class="vazio">Nenhum termo encontrado.</p>';
  }

  function renderChangelog(c) {
    $('#changelog').innerHTML = c.itens.slice(0, 6).map((i) =>
      `<li><time datetime="${esc(i.data)}">${dataBR(i.data)}</time>${esc(i.texto)}</li>`).join('');
  }

  // ---------- Popover ----------
  const pop = $('#popover');
  let aberto = null;
  function abrirTermo(btn) {
    const nome = btn.dataset.termo;
    const g = glossario.get(nome.toLowerCase());
    if (!g) return;
    $('#popover-termo').textContent = g.termo;
    $('#popover-def').textContent = g.definicao;
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const left = Math.min(Math.max(16, r.left + window.scrollX), window.scrollX + document.documentElement.clientWidth - w - 16);
    pop.style.left = `${left}px`;
    pop.style.top = `${r.bottom + window.scrollY + 8}px`;
    aberto = btn;
    btn.setAttribute('aria-expanded', 'true');
  }
  function fecharTermo() {
    if (!aberto) return;
    pop.hidden = true;
    aberto.setAttribute('aria-expanded', 'false');
    aberto = null;
  }

  document.addEventListener('click', (e) => {
    const termo = e.target.closest('.termo');
    if (termo) { e.preventDefault(); aberto === termo ? fecharTermo() : (fecharTermo(), abrirTermo(termo)); return; }
    if (!e.target.closest('#popover')) fecharTermo();
    const chip = e.target.closest('[data-filtro]');
    if (chip) { filtro = chip.dataset.filtro; renderFiltros(); renderMedidas(); }
    const esf = e.target.closest('[data-esfera]');
    if (esf) { esfera = esf.dataset.esfera; renderTributos(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharTermo(); });
  window.addEventListener('resize', fecharTermo);

  // ---------- Início ----------
  (async () => {
    try {
      const [ctx, ind, med, gas, tri, glo, chg] = await Promise.all(
        ['contexto', 'indicadores', 'medidas', 'gastos', 'tributos', 'glossario', 'changelog'].map(carregar));
      glo.itens.forEach((g) => {
        glossario.set(g.termo.toLowerCase(), g);
        (g.aliases || []).forEach((a) => glossario.set(a.toLowerCase(), g));
      });
      renderContexto(ctx, ind);
      renderIndicadores(ind);
      medidas = med.itens;
      renderPlacar(med);
      renderFiltros();
      renderMedidas();
      renderGastos(gas);
      tributos = tri.itens;
      $('#tributos-intro').textContent = tri.intro;
      renderTributos();
      const ordenado = [...glo.itens].sort((a, b) => a.termo.localeCompare(b.termo, 'pt-BR'));
      renderGlossario(ordenado);
      $('#busca-glossario').addEventListener('input', (e) => renderGlossario(ordenado, e.target.value));
      renderChangelog(chg);
    } catch (e) {
      console.error(e);
      $('#selo-atualizado').textContent = 'Não foi possível carregar os dados. Tente recarregar a página.';
    }
  })();
})();
