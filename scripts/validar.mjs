// Valida os arquivos de data/ antes de publicar.
// Se algo estiver errado, sai com erro e o GitHub Actions descarta as mudanças.
import { readFile } from 'node:fs/promises';

const ler = async (nome) => JSON.parse(await readFile(new URL(`../data/${nome}`, import.meta.url), 'utf8'));
const erros = [];
const erro = (m) => erros.push(m);

const TIPOS = ['criou', 'aumentou', 'cortou-beneficio', 'reduziu', 'nao-vingou', 'regra'];
const STATUS = ['vigente', 'encerrado', 'derrubado', 'caducou', 'em-transicao', 'suspenso', 'em-tramitacao'];
const DATA = /^\d{4}-\d{2}(-\d{2})?$/;
const URL_OK = /^https:\/\/[^\s]+$/;

let arquivos;
try {
  arquivos = {
    contexto: await ler('contexto.json'),
    indicadores: await ler('indicadores.json'),
    medidas: await ler('medidas.json'),
    tributos: await ler('tributos.json'),
    gastos: await ler('gastos.json'),
    glossario: await ler('glossario.json'),
    changelog: await ler('changelog.json'),
    historico: await ler('historico.json'),
  };
} catch (e) {
  console.error('JSON inválido:', e.message);
  process.exit(1);
}

const { contexto, indicadores, medidas, tributos, gastos, glossario, changelog, historico } = arquivos;

// Glossário
const termos = new Set();
for (const g of glossario.itens) {
  if (!g.termo || !g.definicao) erro(`glossário: item sem termo/definição ${JSON.stringify(g)}`);
  termos.add(g.termo.toLowerCase());
  (g.aliases || []).forEach((a) => termos.add(a.toLowerCase()));
}

function checarTermos(texto, onde) {
  for (const m of String(texto || '').matchAll(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g)) {
    if (!termos.has(m[1].trim().toLowerCase())) erro(`${onde}: termo [[${m[1]}]] não existe no glossário`);
  }
}

// Medidas
const ids = new Set();
for (const m of medidas.itens) {
  const onde = `medida ${m.id}`;
  if (!m.id || ids.has(m.id)) erro(`${onde}: id ausente ou repetido`);
  ids.add(m.id);
  if (!DATA.test(m.data || '')) erro(`${onde}: data inválida (${m.data})`);
  if (!TIPOS.includes(m.tipo)) erro(`${onde}: tipo inválido (${m.tipo})`);
  if (!STATUS.includes(m.status)) erro(`${onde}: status inválido (${m.status})`);
  for (const c of ['titulo', 'resumo', 'quemSente', 'statusTexto', 'instrumento']) if (!m[c]) erro(`${onde}: falta ${c}`);
  if (!Array.isArray(m.fontes) || !m.fontes.length) erro(`${onde}: precisa de pelo menos uma fonte`);
  for (const f of m.fontes || []) if (!URL_OK.test(f.url || '')) erro(`${onde}: URL de fonte inválida`);
  if (/—/.test(m.titulo + m.resumo)) erro(`${onde}: não usar travessão (—)`);
  checarTermos(m.resumo, onde);
}

// Indicadores
for (const i of indicadores.itens) {
  if (!Number.isFinite(i.valor) || !Number.isFinite(i.valorAntes)) erro(`indicador ${i.id}: valor não numérico`);
  if (!['menor', 'maior', 'neutro'].includes(i.melhorQuando)) erro(`indicador ${i.id}: melhorQuando inválido`);
  if (!URL_OK.test(i.fonte?.url || '')) erro(`indicador ${i.id}: fonte inválida`);
  checarTermos(i.explicacao, `indicador ${i.id}`);
}

// Histórico dos gráficos
for (const g of ['governoAtual', 'governoAnterior']) if (!DATA.test(contexto[g]?.inicio || '') || !DATA.test(contexto[g]?.fim || '')) erro(`contexto.${g}: inicio/fim inválidos`);
for (const [id, s] of Object.entries(historico.series || {})) {
  if (!indicadores.itens.some((i) => i.id === id)) erro(`histórico ${id}: indicador não existe`);
  const p = s.pontos || [];
  if (p.length < 2) erro(`histórico ${id}: poucos pontos`);
  p.forEach(([d, v], k) => {
    if (!DATA.test(d) || !Number.isFinite(v)) erro(`histórico ${id}: ponto inválido ${JSON.stringify([d, v])}`);
    else if (k && d <= p[k - 1][0]) erro(`histórico ${id}: datas fora de ordem em ${d}`);
  });
}

// Tributos
for (const t of tributos.itens) for (const c of ['sigla', 'nome', 'esfera', 'oQueE']) if (!t[c]) erro(`tributo ${t.sigla}: falta ${c}`);

// Gastos
for (const g of gastos.itens) {
  if (!g.nome || !Number.isFinite(g.valorBi) || g.valorBi <= 0) erro(`gasto ${g.nome}: valor inválido`);
  checarTermos(g.explicacao, `gasto ${g.nome}`);
}
checarTermos(gastos.notaRolagem, 'gastos.notaRolagem');

// Changelog
for (const c of changelog.itens) if (!DATA.test(c.data || '') || !c.texto) erro(`changelog: item inválido ${JSON.stringify(c)}`);

if (erros.length) {
  console.error(`✗ ${erros.length} erro(s):\n- ` + erros.join('\n- '));
  process.exit(1);
}
console.log(`✓ Dados válidos: ${medidas.itens.length} medidas, ${indicadores.itens.length} indicadores, ${glossario.itens.length} termos.`);
