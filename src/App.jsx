import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { PROVAS, TABELA_INI, TAXAS_INI, avaliar, relatorio, fmt, hoje, corNivel, toAval } from "./calc";

const inp = "w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";
const btn = "bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold";
const barCor = (v) => (v >= 100 ? "bg-green-600" : v >= 75 ? "bg-yellow-500" : "bg-red-500");
const Card = ({ children }) => <div className="bg-white rounded-xl shadow p-4">{children}</div>;

function Tela({ children, sair }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-blue-900 p-4 flex justify-between items-center">
        <h1 className="text-white text-xl font-bold">MundoTAF</h1>
        {sair && <button onClick={() => supabase.auth.signOut()} className="text-blue-200 text-sm">Sair</button>}
      </header>
      <main className="max-w-4xl mx-auto p-4 space-y-4">{children}</main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [cfg, setCfg] = useState({ tabela: TABELA_INI, taxas: TAXAS_INI, fator: 30 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return setPerfil(null);
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => setPerfil(data));
    supabase.from("config").select("*").eq("id", 1).single().then(({ data }) => data && setCfg({
      tabela: data.tabela || TABELA_INI, taxas: data.taxas || TAXAS_INI, fator: Number(data.fator) || 30 }));
  }, [session]);

  if (session === undefined) return <Tela><p>Carregando…</p></Tela>;
  if (!session) return <Entrada />;
  if (!perfil) return <Tela sair><p>Carregando perfil…</p></Tela>;
  return perfil.is_admin ? <Admin cfg={cfg} setCfg={setCfg} /> : <Aluno perfil={perfil} cfg={cfg} />;
}

/* ---------- ENTRADA (público) ---------- */
function Entrada() {
  const [nomes, setNomes] = useState([]);
  const [modo, setModo] = useState("login");
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ email: "", senha: "", nome: "", sexo: "M", idade: "", freq: 3, concurso: "" });
  const set = (k, v) => setF({ ...f, [k]: v });

  useEffect(() => { supabase.rpc("lista_alunos").then(({ data }) => setNomes(data || [])); }, []);

  const enviar = async () => {
    setMsg("");
    if (modo === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.senha });
      if (error) setMsg("E-mail ou senha incorretos.");
      return;
    }
    if (!f.nome.trim()) return setMsg("Informe seu nome.");
    if (f.senha.length < 6) return setMsg("A senha precisa ter ao menos 6 caracteres.");
    const { data, error } = await supabase.auth.signUp({
      email: f.email, password: f.senha,
      options: { data: { nome: f.nome, sexo: f.sexo, idade: f.idade || "", freq: String(f.freq), concurso: f.concurso || "" } },
    });
    if (error) return setMsg(error.message);
    if (!data.session) setMsg("Cadastro feito! Confirme pelo link enviado ao seu e-mail e depois entre.");
  };

  return (
    <Tela>
      <Card>
        <div className="flex gap-2 mb-3">
          {["login", "cadastro"].map((m) => (
            <button key={m} onClick={() => setModo(m)} className={`flex-1 py-2 rounded-lg font-semibold ${modo === m ? "bg-blue-700 text-white" : "border"}`}>
              {m === "login" ? "Entrar" : "Cadastrar"}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {modo === "cadastro" && (
            <>
              <input className={inp} placeholder="Nome completo" value={f.nome} onChange={(e) => set("nome", e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <select className={inp} value={f.sexo} onChange={(e) => set("sexo", e.target.value)}><option value="M">Masculino</option><option value="F">Feminino</option></select>
                <input type="number" className={inp} placeholder="Idade" value={f.idade} onChange={(e) => set("idade", e.target.value)} />
                <select className={inp} value={f.freq} onChange={(e) => set("freq", e.target.value)}>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}x por semana</option>)}</select>
                <div><label className="text-xs text-slate-500">Data do concurso</label><input type="date" className={inp} value={f.concurso} onChange={(e) => set("concurso", e.target.value)} /></div>
              </div>
            </>
          )}
          <input type="email" className={inp} placeholder="E-mail" value={f.email} onChange={(e) => set("email", e.target.value)} />
          <input type="password" className={inp} placeholder="Senha" value={f.senha} onChange={(e) => set("senha", e.target.value)} />
          <button onClick={enviar} className={`${btn} w-full`}>{modo === "login" ? "Entrar" : "Criar conta"}</button>
          {msg && <p className="text-sm text-blue-800 bg-blue-50 p-2 rounded">{msg}</p>}
        </div>
      </Card>
      <Card>
        <h2 className="font-bold mb-2">Alunos MundoTAF ({nomes.length})</h2>
        <ul className="divide-y">{nomes.map((n, i) => <li key={i} className="py-2">{n.nome}</li>)}</ul>
      </Card>
    </Tela>
  );
}

/* ---------- RESULTADO ---------- */
function Grafico({ vals, min }) {
  if (vals.length < 2) return null;
  const W = 260, H = 60, top = Math.max(...vals, min) * 1.1 || 1;
  const x = (i) => 10 + (i * (W - 20)) / (vals.length - 1);
  const y = (v) => H - 8 - (v / top) * (H - 16);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xs h-16">
      <line x1="0" x2={W} y1={y(min)} y2={y(min)} stroke="#16a34a" strokeDasharray="4" />
      <polyline fill="none" stroke="#1d4ed8" strokeWidth="2" points={vals.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
      {vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#1d4ed8" />)}
    </svg>
  );
}

function Resultado({ aluno, cfg, onRemover }) {
  const [ok, setOk] = useState("");
  if (!aluno.avals.length) return <Card><p className="text-slate-600">Aguardando a primeira avaliação com o treinador.</p></Card>;
  const r = avaliar(aluno, cfg.tabela, cfg.taxas, cfg.fator);
  const txt = relatorio(aluno, r);
  const copiar = () => navigator.clipboard?.writeText(txt).then(() => { setOk("Copiado!"); setTimeout(() => setOk(""), 2000); });

  return (
    <>
      <Card>
        <h2 className="text-lg font-bold">{aluno.nome}</h2>
        <p className="text-sm text-slate-500 mb-3">{aluno.sexo === "M" ? "Masculino" : "Feminino"} · {aluno.freq}x/sem · Última avaliação {fmt(r.ult.data)}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className={`${corNivel[r.nivel]} text-white rounded-lg p-3`}><p className="text-xs">Nível</p><p className="font-bold">{r.nivel}</p></div>
          <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs">% do mínimo</p><p className="text-xl font-bold text-blue-800">{r.pctGeral}%</p></div>
          <div className="bg-slate-100 rounded-lg p-3"><p className="text-xs">Pontuação</p><p className="text-xl font-bold">{r.pontos}/25</p></div>
          <div className="bg-slate-100 rounded-lg p-3"><p className="text-xs">Prazo p/ aprovar</p><p className="text-xl font-bold">{r.prazo === 0 ? "Apto" : `${r.prazo} sem`}</p>
            {r.prazo > 0 && <p className="text-xs text-slate-500">até {r.dataAprov.toLocaleDateString("pt-BR")}</p>}</div>
        </div>
        {r.diasConcurso !== null && (
          <p className={`mt-3 rounded-lg p-3 text-sm ${r.atraso ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
            📅 Concurso em <b>{r.diasConcurso} dias</b> ({fmt(aluno.concurso)}). {r.atraso ? "⚠ A previsão passa da data do concurso." : "Previsão dentro do prazo."}
          </p>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold mb-3">Desempenho e treino</h3>
        <div className="space-y-3">
          {r.provas.map((p) => (
            <div key={p.k} className="border rounded-lg p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-semibold">{p.nome}: {p.atual} {p.un} {p.calibrada && <span className="text-green-700 text-xs">✓ calibrado</span>}</span>
                <span className={`text-white text-xs px-2 py-0.5 rounded ${p.pontos ? "bg-green-600" : "bg-red-600"}`}>{p.pontos ? `${p.pontos} pt` : "Reprovado"}</span>
              </div>
              <div className="text-xs text-slate-600 flex justify-between"><span>Mínimo ({p.min})</span><span>{p.pctMin}% · {p.semMin} sem</span></div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden mb-1"><div className={`h-full ${barCor(p.pctMin)}`} style={{ width: `${p.pctMin}%` }} /></div>
              <div className="text-xs text-slate-600 flex justify-between"><span>Nota máxima ({p.max})</span><span>{p.pctMax}% · {p.semMax} sem</span></div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${p.pctMax}%` }} /></div>
              {p.hist.length > 1 && <><p className="text-xs text-slate-500 mt-2">Evolução: {p.hist.join(" → ")}</p><Grafico vals={p.hist} min={p.min} /></>}
              <p className="text-sm mt-2 bg-slate-50 p-2 rounded"><b>Treino:</b> {p.orient}</p>
            </div>
          ))}
        </div>
        {r.prazo > 0 && <p className="mt-3 text-sm bg-blue-50 border-l-4 border-blue-700 p-3"><b>Prioridade:</b> {r.gargalo.nome}.</p>}
      </Card>

      <Card>
        <h3 className="font-semibold mb-2">Histórico</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-100"><th className="p-2 text-left">Data</th>{PROVAS.map((p) => <th key={p.k} className="p-2">{p.nome}</th>)}{onRemover && <th />}</tr></thead>
            <tbody>{r.avs.map((a) => (
              <tr key={a.id} className="border-b text-center">
                <td className="p-2 text-left">{fmt(a.data)}</td>{PROVAS.map((p) => <td key={p.k} className="p-2">{a[p.k]}</td>)}
                {onRemover && <td><button className="text-red-600 text-xs" onClick={() => onRemover(a.id)}>remover</button></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-2"><h3 className="font-semibold">Relatório (WhatsApp)</h3>
          <button onClick={copiar} className="bg-green-600 text-white px-3 py-1 rounded-lg text-sm">{ok || "Copiar"}</button></div>
        <textarea readOnly value={txt} className="w-full h-40 border rounded-lg p-2 text-xs font-mono" onFocus={(e) => e.target.select()} />
      </Card>
    </>
  );
}

/* ---------- ALUNO ---------- */
function Aluno({ perfil, cfg }) {
  const [avals, setAvals] = useState(null);
  useEffect(() => {
    supabase.from("avaliacoes").select("*").eq("aluno_id", perfil.id).then(({ data }) => setAvals((data || []).map(toAval)));
  }, [perfil.id]);
  return <Tela sair>{avals === null ? <p>Carregando…</p> : <Resultado aluno={{ ...perfil, avals }} cfg={cfg} />}</Tela>;
}

/* ---------- TREINADOR ---------- */
function Admin({ cfg, setCfg }) {
  const [perfis, setPerfis] = useState([]);
  const [avs, setAvs] = useState([]);
  const [tela, setTela] = useState("lista");
  const [verId, setVerId] = useState(null);
  const [form, setForm] = useState(null);
  const [sexoTab, setSexoTab] = useState("M");
  const [msg, setMsg] = useState("");
  const aviso = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  const carregar = async () => {
    const [p, a] = await Promise.all([
      supabase.from("profiles").select("*").eq("is_admin", false).order("nome"),
      supabase.from("avaliacoes").select("*"),
    ]);
    setPerfis(p.data || []); setAvs(a.data || []);
  };
  useEffect(() => { carregar(); }, []);

  const alunos = perfis.map((p) => ({ ...p, avals: avs.filter((v) => v.aluno_id === p.id).map(toAval) }));
  const aluno = alunos.find((a) => a.id === verId);

  const salvarAval = async () => {
    const { error } = await supabase.from("avaliacoes").insert({
      aluno_id: verId, data: form.data, corrida: form.corrida || 0, barra: form.barra || 0,
      abdominal: form.abdominal || 0, meio_sugado: form.meioSugado || 0, natacao: form.natacao || 0,
    });
    if (error) return aviso("Erro ao salvar: " + error.message);
    setForm(null); await carregar(); aviso("Avaliação salva!");
  };
  const removerAval = async (id) => { await supabase.from("avaliacoes").delete().eq("id", id); carregar(); };
  const salvarPerfil = async (campos) => { await supabase.from("profiles").update(campos).eq("id", verId); carregar(); aviso("Dados atualizados."); };
  const salvarCfg = async () => {
    const { error } = await supabase.from("config").update({ tabela: cfg.tabela, taxas: cfg.taxas, fator: cfg.fator }).eq("id", 1);
    aviso(error ? "Erro: " + error.message : "Índices salvos.");
  };

  return (
    <Tela sair>
      <div className="flex gap-2">
        {[["lista", "Alunos"], ["indices", "Índices"]].map(([t, l]) => (
          <button key={t} onClick={() => { setTela(t); setVerId(null); }} className={`px-4 py-2 rounded-lg font-semibold ${tela === t ? "bg-blue-700 text-white" : "bg-white border"}`}>{l}</button>
        ))}
      </div>
      {msg && <p className="bg-blue-100 text-blue-900 text-sm rounded-lg p-2">{msg}</p>}

      {tela === "lista" && !aluno && (
        <Card>
          <h2 className="text-lg font-bold mb-3">Alunos ({alunos.length})</h2>
          <div className="space-y-2">
            {alunos.map((a) => {
              const r = a.avals.length ? avaliar(a, cfg.tabela, cfg.taxas, cfg.fator) : null;
              return (
                <button key={a.id} onClick={() => setVerId(a.id)} className="w-full text-left flex flex-wrap justify-between items-center gap-2 border rounded-lg p-3 hover:bg-slate-50">
                  <div>
                    <p className="font-semibold">{a.nome} {r?.atraso && <span className="text-red-600 text-xs">⚠ prazo após o concurso</span>}</p>
                    <p className="text-xs text-slate-500">{a.sexo === "M" ? "Masc." : "Fem."} · {a.freq}x/sem · {a.avals.length} avaliação(ões)</p>
                  </div>
                  {r ? <div className="flex gap-2 items-center">
                    <span className={`text-white text-xs px-2 py-1 rounded ${corNivel[r.nivel]}`}>{r.nivel}</span>
                    <span className="text-sm font-semibold">{r.pctGeral}%</span><span className="text-sm">{r.pontos}/25</span>
                  </div> : <span className="text-xs text-orange-600">Sem avaliação</span>}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {tela === "lista" && aluno && (
        <>
          <button onClick={() => setVerId(null)} className="bg-white border px-4 py-2 rounded-lg">← Voltar</button>
          <Card>
            <h3 className="font-semibold mb-2">Dados do aluno</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select className={inp} value={aluno.freq} onChange={(e) => salvarPerfil({ freq: Number(e.target.value) })}>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}x/sem</option>)}</select>
              <select className={inp} value={aluno.sexo} onChange={(e) => salvarPerfil({ sexo: e.target.value })}><option value="M">Masculino</option><option value="F">Feminino</option></select>
              <input type="date" className={inp} value={aluno.concurso || ""} onChange={(e) => salvarPerfil({ concurso: e.target.value || null })} />
              <button onClick={() => setForm({ data: hoje(), corrida: "", barra: "", abdominal: "", meioSugado: "", natacao: "" })} className="bg-green-700 text-white rounded-lg font-semibold">+ Avaliação</button>
            </div>
            {form && (
              <div className="mt-4 border-t pt-4 grid sm:grid-cols-2 gap-3">
                <div><label className="text-sm">Data do teste</label><input type="date" className={inp} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
                {PROVAS.map((p) => (
                  <div key={p.k}><label className="text-sm">{p.nome} ({p.un[aluno.sexo]}) — mín. {cfg.tabela[aluno.sexo][p.k][0]}</label>
                    <input type="number" inputMode="numeric" className={inp} value={form[p.k]} onChange={(e) => setForm({ ...form, [p.k]: e.target.value })} /></div>
                ))}
                <div className="flex gap-2 sm:col-span-2"><button onClick={salvarAval} className={btn}>Salvar</button><button onClick={() => setForm(null)} className="border px-4 rounded-lg">Cancelar</button></div>
              </div>
            )}
          </Card>
          <Resultado aluno={aluno} cfg={cfg} onRemover={removerAval} />
        </>
      )}

      {tela === "indices" && (
        <Card>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold">Tabela de pontos</h2>
            <div className="flex gap-1">{["M", "F"].map((s) => <button key={s} onClick={() => setSexoTab(s)} className={`px-3 py-1 rounded ${sexoTab === s ? "bg-blue-700 text-white" : "border"}`}>{s}</button>)}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-100"><th className="p-2 text-left">Prova</th>{[1, 2, 3, 4, 5].map((n) => <th key={n}>{n} pt</th>)}<th>%/sem</th></tr></thead>
              <tbody>{PROVAS.map((p) => (
                <tr key={p.k} className="border-b">
                  <td className="p-2">{p.nome}</td>
                  {cfg.tabela[sexoTab][p.k].map((v, i) => (
                    <td key={i} className="p-1"><input type="number" className="border rounded px-1 w-16" value={v} onChange={(e) => {
                      const arr = [...cfg.tabela[sexoTab][p.k]]; arr[i] = Number(e.target.value);
                      setCfg({ ...cfg, tabela: { ...cfg.tabela, [sexoTab]: { ...cfg.tabela[sexoTab], [p.k]: arr } } });
                    }} /></td>
                  ))}
                  <td className="p-1"><input type="number" step="0.5" className="border rounded px-1 w-16" value={cfg.taxas[p.k]} onChange={(e) => setCfg({ ...cfg, taxas: { ...cfg.taxas, [p.k]: Number(e.target.value) } })} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <label className="font-semibold">Fator de tempo (%):</label>
            <input type="number" className="border rounded px-2 py-1 w-20" value={cfg.fator} onChange={(e) => setCfg({ ...cfg, fator: Number(e.target.value) || 1 })} />
            <button onClick={salvarCfg} className={btn}>Salvar índices</button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Aprovação exige ao menos 1 ponto em cada prova. Confira sempre o edital vigente.</p>
        </Card>
      )}
    </Tela>
  );
}
