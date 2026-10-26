// Atualiza data/indicadores.json com dados oficiais (Banco Central e IBGE).
// Roda todo dia pelo GitHub Actions. Se uma fonte falhar, mantém o valor anterior.
import { readFile, writeFile } from 'node:fs/promises';

const ARQUIVO = new URL('../data/indicadores.json', import.meta.url);
const CONTEXTO = new URL('../data/contexto.json', import.meta.url);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const LIMITES = {
  ipca12m: [-5, 50],
  selic: [0, 50],
  desemprego: [1, 30],
  dbgg: [30, 150],
  dolar: [1, 20],
  salario: [800, 10000],
};

async function buscarJSON(url, tentativas = 3) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'raio-x-brasil/1.0 (+github actions)', Accept: 'application/json' },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      ultimoErro = e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error(`${url} -> ${ultimoErro?.message}`);
}

const num = (v) => Number(String(v).replace(',', '.'));
const brData = (d) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Recife' });

function rotuloSgs(dataBr, mensal) {
  const [dd, mm, aaaa] = dataBr.split('/');
  return mensal ? `${MESES[Number(mm) - 1]}/${aaaa}` : `${dd}/${mm}/${aaaa}`;
}

async function sgsUltimo(serie) {
  const dados = await buscarJSON(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`);
  if (!Array.isArray(dados) || !dados.length) throw new Error(`SGS ${serie} vazio`);
  return dados.at(-1);
}

async function sgsPeriodo(serie, inicio, fim) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${inicio}&dataFinal=${fim}`;
  const dados = await buscarJSON(url);
  if (!Array.isArray(dados) || !dados.length) throw new Error(`SGS ${serie} sem dados no período`);
  return dados;
}

function rotuloTrimestre(codigo) {
  // codigo AAAAMM -> "jun-ago/2026"
  const ano = Number(codigo.slice(0, 4));
  const mes = Number(codigo.slice(4, 6));
  const ini = (mes - 3 + 12) % 12;
  return `${MESES[ini]}-${MESES[mes - 1]}/${ano}`;
}

async function sidraDesemprego(periodo) {
  const url = `https://apisidra.ibge.gov.br/values/t/6381/n1/all/v/4099/p/${encodeURIComponent(periodo)}`;
  const dados = await buscarJSON(url);
  if (!Array.isArray(dados) || dados.length < 2) throw new Error('SIDRA vazio');
  const cab = dados[0];
  const chaveCod = Object.keys(cab).find((k) => /Trimestre/i.test(cab[k]) && /Código/i.test(cab[k]));
  const linha = dados.at(-1);
  return { valor: num(linha.V), codigo: linha[chaveCod] };
}

function dentroDoLimite(id, valor) {
  const lim = LIMITES[id];
  return Number.isFinite(valor) && (!lim || (valor >= lim[0] && valor <= lim[1]));
}

async function main() {
  const json = JSON.parse(await readFile(ARQUIVO, 'utf8'));
  const contexto = JSON.parse(await readFile(CONTEXTO, 'utf8'));
  const base = new Date(contexto.baseComparacao.data + 'T12:00:00');
  const baseFim = brData(base);
  const baseIniMes = `01/${String(base.getMonth() + 1).padStart(2, '0')}/${base.getFullYear()}`;
  const baseIniDia = brData(new Date(base.getTime() - 15 * 864e5));
  const hoje = brData(new Date());

  const avisos = [];
  let mudou = false;

  for (const item of json.itens) {
    if (!item.auto) continue;
    try {
      let valor, ref, valorAntes, refAntes;
      if (item.auto.tipo === 'sgs') {
        const s = item.auto.serie;
        const mensal = [13522, 13762, 1619, 433].includes(s);
        const ult = await sgsUltimo(s);
        valor = num(ult.valor);
        ref = rotuloSgs(ult.data, mensal);
        const antes = await sgsPeriodo(s, mensal ? baseIniMes : baseIniDia, baseFim);
        valorAntes = num(antes.at(-1).valor);
        refAntes = rotuloSgs(antes.at(-1).data, mensal);
      } else if (item.auto.tipo === 'sidra-desemprego') {
        const ult = await sidraDesemprego('last 1');
        valor = ult.valor;
        ref = rotuloTrimestre(ult.codigo);
        const codBase = `${base.getFullYear()}${String(base.getMonth() + 1).padStart(2, '0')}`;
        const antes = await sidraDesemprego(codBase);
        valorAntes = antes.valor;
        refAntes = rotuloTrimestre(antes.codigo);
      } else continue;

      if (!dentroDoLimite(item.id, valor) || !dentroDoLimite(item.id, valorAntes)) {
        throw new Error(`valor fora do esperado (${valor} / ${valorAntes})`);
      }
      const novo = { valor, referencia: ref, valorAntes, referenciaAntes: refAntes };
      for (const [k, v] of Object.entries(novo)) {
        if (item[k] !== v) { item[k] = v; mudou = true; }
      }
      item.verificadoEm = hoje;
      console.log(`ok  ${item.id}: ${valor} (${ref}) | antes ${valorAntes} (${refAntes})`);
    } catch (e) {
      avisos.push(`${item.id}: ${e.message}`);
      console.warn(`ERRO ${item.id}: ${e.message} (mantido valor anterior)`);
    }
  }

  // Inflação acumulada desde a base, para calcular o ganho real do salário mínimo.
  try {
    const mensal = await sgsPeriodo(433, brData(new Date(base.getTime() + 2 * 864e5)), hoje);
    const fator = mensal.reduce((acc, m) => acc * (1 + num(m.valor) / 100), 1);
    const acumulada = +((fator - 1) * 100).toFixed(2);
    const ate = rotuloSgs(mensal.at(-1).data, true);
    json.inflacaoAcumuladaDesdeBase = { valor: acumulada, ate };
    const sal = json.itens.find((i) => i.id === 'salario');
    if (sal) sal.ganhoReal = +(((sal.valor / sal.valorAntes) / fator - 1) * 100).toFixed(1);
    console.log(`ok  inflação acumulada desde a base: ${acumulada}% até ${ate}`);
  } catch (e) {
    avisos.push(`inflacao acumulada: ${e.message}`);
  }

  json.atualizadoEm = new Date().toISOString();
  json.avisosColeta = avisos;
  await writeFile(ARQUIVO, JSON.stringify(json, null, 2) + '\n');
  console.log(mudou ? 'Indicadores alterados.' : 'Sem mudança nos valores.');
  if (avisos.length) console.log('Avisos:\n- ' + avisos.join('\n- '));
  // Só falha se TODAS as fontes automáticas falharem (provável bloqueio de rede).
  const autos = json.itens.filter((i) => i.auto).length;
  if (avisos.filter((a) => !a.startsWith('inflacao')).length >= autos) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
