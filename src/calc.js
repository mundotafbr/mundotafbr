export const PROVAS = [
  { k: "corrida", nome: "Corrida 12 min", un: { M: "m", F: "m" } },
  { k: "barra", nome: "Barra", un: { M: "rep", F: "seg (sustentação)" } },
  { k: "abdominal", nome: "Abdominal remador", un: { M: "rep", F: "rep" } },
  { k: "meioSugado", nome: "Meio sugado", un: { M: "rep", F: "rep" } },
  { k: "natacao", nome: "Natação", un: { M: "m", F: "m" } },
];
export const TABELA_INI = {
  M: { corrida: [2300, 2400, 2500, 2600, 2700], barra: [4, 5, 6, 7, 8], abdominal: [39, 41, 43, 45, 47], meioSugado: [12, 13, 14, 15, 16], natacao: [50, 75, 100, 125, 150] },
  F: { corrida: [1900, 2000, 2100, 2200, 2300], barra: [11, 12, 13, 14, 15], abdominal: [29, 31, 33, 35, 37], meioSugado: [9, 10, 11, 12, 13], natacao: [25, 50, 75, 100, 125] },
};
export const TAXAS_INI = { corrida: 2.5, barra: 10, abdominal: 10, meioSugado: 10, natacao: 10 };
const ADAPTACAO = 3;
const FREQ = { 2: 1.3, 3: 1, 4: 0.85, 5: 0.75 };
const DIA = 86400000;
export const hoje = () => new Date().toISOString().slice(0, 10);
export const fmt = (d) => (d ? new Date(d + "T12:00").toLocaleDateString("pt-BR") : "-");
export const corNivel = { Apto: "bg-green-600", "Quase apto": "bg-lime-500", Intermediário: "bg-yellow-500", Básico: "bg-orange-500", Iniciante: "bg-red-600" };

export const toAval = (r) => ({
  id: r.id, data: r.data, corrida: Number(r.corrida) || 0, barra: Number(r.barra) || 0,
  abdominal: Number(r.abdominal) || 0, meioSugado: Number(r.meio_sugado) || 0, natacao: Number(r.natacao) || 0,
});

function semanasAte(atual, meta, r, fator, fm, calibrada) {
  if (atual >= meta) return 0;
  const base = atual > 0 ? atual : 1;
  const extra = atual > 0 ? 0 : ADAPTACAO;
  const rEf = calibrada ? r : r * (1 + (1 - Math.min(base / meta, 1)));
  const bruto = Math.log(meta / base) / Math.log(1 + rEf);
  const mult = (calibrada ? 1 : fator / 100) * fm;
  return extra + Math.max(1, Math.ceil(bruto * mult));
}
function semanasBarra(atual, meta) {
  atual = Math.floor(atual);
  if (atual >= meta) return 0;
  let t = 0;
  for (let n = atual + 1; n <= meta; n++) t += n === 1 ? ADAPTACAO : Math.max(1, 2 - 0.25 * (n - 2));
  return t;
}
function orientacao(k, pct, sexo) {
  const f = pct < 50 ? 0 : pct < 100 ? 1 : 2;
  const O = {
    corrida: [
      "Base aeróbica: 3x/sem, 20–30 min alternando trote e caminhada (3 min / 1 min). Aumente 10% do volume por semana.",
      "3x/sem: intervalado 6–8 × 400 m no ritmo-alvo (pausa 1:30), rodagem leve 30–40 min e simulado de 12 min quinzenal.",
      "Índice atingido. Mantenha 2x/sem com intervalados de 800 m e simulados quinzenais.",
    ],
    barra: sexo === "F" ? [
      "Pegada e dorsais: isometria com pés apoiados, remada australiana 4×10 e suspensão passiva 4× máx., 3x/sem.",
      "Isometria no topo: 5 × máx. (pausa 2 min) e negativas lentas 4×3, 3x/sem.",
      "Índice atingido. Mantenha 2x/sem, 3 × máx., buscando +1 s por semana.",
    ] : [
      "Progressão: negativa 4×3–5 (descida de 5 s), remada australiana 4×10, barra com elástico 3×6, 3x/sem.",
      "Volume submáximo: 6–8 séries de 50–60% do máximo, 3–4x/sem. Teste o máximo a cada 2 semanas.",
      "Índice atingido. 2x/sem com sobrecarga leve para ganhar pontos e margem.",
    ],
    abdominal: [
      "Core básico: prancha 3×30 s, abdominal grupado 4×15, elevação de pernas 3×10, 3–4x/sem.",
      "Séries fracionadas: 5 × 60% do máximo, pausa 1 min, 4x/sem. Simulado cronometrado quinzenal.",
      "Índice atingido. Mantenha 2–3x/sem e treine a técnica do remador.",
    ],
    meioSugado: [
      "Técnica em partes (agachamento → prancha → retorno), 4×5 perfeitas, mais agachamento e flexão.",
      "5 séries de 50–60% do máximo, 3x/sem, com pliometria leve e core.",
      "Índice atingido. Mantenha 2x/sem com séries cronometradas no padrão do edital.",
    ],
    natacao: [
      "Adaptação: respiração lateral, flutuação e pernada com prancha 8×25 m, 2–3x/sem.",
      "Crawl: séries de 25–50 m com pausa de 30 s, aumentando o trecho contínuo a cada semana, 3x/sem.",
      "Índice atingido. Nado contínuo progressivo para ganhar distância e pontos.",
    ],
  };
  return O[k][f];
}

export function avaliar(aluno, tabela, taxas, fator) {
  const avs = [...(aluno.avals || [])].sort((a, b) => a.data.localeCompare(b.data));
  const ult = avs[avs.length - 1] || {};
  const prim = avs[0] || {};
  const semDec = avs.length >= 2 ? (new Date(ult.data) - new Date(prim.data)) / DIA / 7 : 0;
  const fm = FREQ[aluno.freq] || 1;
  const t = tabela[aluno.sexo];
  const provas = PROVAS.map((p) => {
    const atual = Number(ult[p.k]) || 0;
    const niv = t[p.k], min = niv[0], max = niv[4];
    let pontos = 0;
    niv.forEach((v, i) => { if (atual >= v) pontos = i + 1; });
    const pctMin = Math.round(Math.min(atual / min, 1) * 100);
    const pctMax = Math.round(Math.min(atual / max, 1) * 100);
    const a0 = Number(prim[p.k]) || 0;
    const rc = semDec >= 1 && a0 > 0 && atual > a0 ? Math.pow(atual / a0, 1 / semDec) - 1 : 0;
    const barraM = p.k === "barra" && aluno.sexo === "M";
    const calc = (meta) => rc ? semanasAte(atual, meta, rc, fator, fm, true)
      : barraM ? Math.ceil(semanasBarra(atual, meta) * fm)
      : semanasAte(atual, meta, taxas[p.k] / 100, fator, fm, false);
    return { ...p, un: p.un[aluno.sexo], atual, min, max, pontos, pctMin, pctMax,
      calibrada: !!rc, taxaReal: rc ? Math.round(rc * 1000) / 10 : null,
      semMin: calc(min), semMax: calc(max), orient: orientacao(p.k, pctMin, aluno.sexo),
      hist: avs.map((a) => Number(a[p.k]) || 0) };
  });
  const pior = Math.min(...provas.map((p) => p.pctMin));
  const pctGeral = Math.round(provas.reduce((a, p) => a + p.pctMin, 0) / provas.length);
  const pontos = provas.reduce((a, p) => a + p.pontos, 0);
  const nivel = pior >= 100 ? "Apto" : pior >= 90 ? "Quase apto" : pior >= 75 ? "Intermediário" : pior >= 50 ? "Básico" : "Iniciante";
  const prazo = Math.max(...provas.map((p) => p.semMin));
  const prazoMax = Math.max(...provas.map((p) => p.semMax));
  const gargalo = provas.reduce((a, b) => (b.semMin > a.semMin ? b : a));
  const dataAprov = ult.data ? new Date(new Date(ult.data + "T12:00").getTime() + (prazo + 1) * 7 * DIA) : null;
  const diasConcurso = aluno.concurso ? Math.ceil((new Date(aluno.concurso + "T12:00") - new Date()) / DIA) : null;
  const atraso = !!(aluno.concurso && prazo > 0 && dataAprov && dataAprov > new Date(aluno.concurso + "T12:00"));
  return { provas, pior, pctGeral, pontos, pctNota: Math.round((pontos / 25) * 100), nivel, prazo, prazoMax, gargalo, ult, avs, dataAprov, diasConcurso, atraso };
}

export function relatorio(aluno, r) {
  const l = [`*MundoTAF – Avaliação de ${aluno.nome}*`, `Data: ${fmt(r.ult.data)} · Nível: ${r.nivel}`, `Pontuação: ${r.pontos}/25 · ${r.pctGeral}% do índice mínimo`, ""];
  r.provas.forEach((p) => l.push(`• ${p.nome}: ${p.atual} ${p.un} (mín. ${p.min}) – ${p.pctMin}% – ${p.semMin === 0 ? "OK" : p.semMin + " sem"}`));
  l.push("", r.prazo === 0 ? "✅ Você já atinge todos os índices mínimos!" : `🎯 Previsão para aprovar: ${r.prazo} semanas (até ${r.dataAprov.toLocaleDateString("pt-BR")})`);
  if (r.diasConcurso !== null) l.push(`📅 Concurso em ${r.diasConcurso} dias (${fmt(aluno.concurso)})`);
  if (r.prazo > 0) l.push(`⚠️ Prioridade: ${r.gargalo.nome}`);
  l.push("", "*Treino:*");
  r.provas.forEach((p) => l.push(`- ${p.nome}: ${p.orient}`));
  l.push("", "MundoTAF · Bruno Amorim");
  return l.join("\n");
}
