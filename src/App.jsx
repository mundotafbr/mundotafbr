import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { avaliar, relatorio, fmt, hoje, corNivel, unid } from "./calc";

const inp = "w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";
const btn = "bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold";
const barCor = (v) => (v >= 100 ? "bg-green-600" : v >= 75 ? "bg-yellow-500" : "bg-red-500");
const Card = ({ children }) => <div className="bg-white rounded-xl shadow p-4">{children}</div>;
const useAviso = () => {
  const [msg, setMsg] = useState("");
  return [msg, (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); }];
};
const Aviso = ({ msg }) => msg ? <p className="bg-blue-100 text-blue-900 text-sm rounded-lg p-2">{msg}</p> : null;

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
  const [concursos, setConcursos] = useState([]);
  const [fator, setFator] = useState(30);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return setPerfil(null);
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => setPerfil(data));
    supabase.from("concursos").select("*").order("ordem").then(({ data }) => setConcursos(data || []));
    supabase.from("config").select("fator").eq("id", 1).single().then(({ data }) => setFator(Number(data?.fator) || 30));
  }, [session]);

  if (session === undefined) return <Tela><p>Carregando…</p></Tela>;
  if (!session) return <Entrada />;
  if (!perfil) return <Tela sair><p>Carregando perfil…</p></Tela>;
  return perfil.is_admin
    ? <Admin concursos={concursos} setConcursos={setConcursos} fator={fator} setFator={setFator} />
    : <Aluno perfil={perfil} concursos={concursos} fator={fator} />;
}

/* ---------- ENTRADA ---------- */
function Entrada() {
  const [nomes, setNomes] = useState([]);
  const [modo, setModo] = useState("login");
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ email: "", senha: "", nome: "", sexo: "M", idade: "", freq: 3 });
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
      options: { data: { nome: f.nome, sexo: f.sexo, idade: f.idade || "", freq: String(f.freq) } },
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
              <div className="grid grid-cols-3 gap-2">
                <select className={inp} value={f.sexo} onChange={(e) => set("sexo", e.target.value)}><option value="M">Masculino</option><option value="F">Feminino</option></select>
                <input type="number" className={inp} placeholder="Idade" value={f.idade} onChange={(e) => set("idade", e.target.value)} />
                <select className={inp} value={f.freq} onChange={(e) => set("freq", e.target.value)}>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}x/sem</option>)}</select>
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

/* ---------- GRÁFICO E RESULTADO ---------- */
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

function Resultado({ aluno, conc, avals, fator, dataProva, admin, onRemover, onConferir }) {
  const [ok, setOk] = useState("");
  if (!conc.provas?.length) return <Card><p className="text-slate-600">Este concurso ainda não tem provas cadastradas pelo treinador.</p></Card>;
  const r = avaliar(aluno, conc, avals, fator, dataProva);
  if (!r) return <Card><p className="text-slate-600">Nenhum resultado ainda. Toque em <b>+ Lançar resultado</b>.</p></Card>;
  const txt = relatorio(aluno, conc, r, dataProva);
  const copiar = () => navigator.clipboard?.writeText(txt).then(() => { setOk("Copiado!"); setTimeout(() => setOk(""), 2000); });

  return (
    <>
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className={`${corNivel[r.nivel]} text-white rounded-lg p-3`}><p className="text-xs">Nível</p><p className="font-bold">{r.nivel}</p></div>
          <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs">% do mínimo</p><p className="text-xl font-bold text-blue-800">{r.pctGeral}%</p></div>
          <div className="bg-slate-100 rounded-lg p-3"><p className="text-xs">Pontuação</p><p className="text-xl font-bold">{r.pontos}/{r.pontosMax}</p></div>
          <div className="bg-slate-100 rounded-lg p-3"><p className="text-xs">Prazo p/ aprovar</p><p className="text-xl font-bold">{r.prazo === 0 ? "Apto" : `${r.prazo} sem`}</p>
            {r.prazo > 0 && <p className="text-xs text-slate-500">até {r.dataAprov.toLocaleDateString("pt-BR")}</p>}</div>
        </div>
        {r.diasConcurso !== null && (
          <p className={`mt-3 rounded-lg p-3 text-sm ${r.atraso ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
            📅 Prova em <b>{r.diasConcurso} dias</b> ({fmt(dataProva)}). {r.atraso ? "⚠ A previsão passa da data da prova." : "Previsão dentro do prazo."}
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
            <thead><tr className="bg-slate-100"><th className="p-2 text-left">Data</th>{conc.provas.map((p) => <th key={p.k} className="p-2">{p.nome}</th>)}<th className="p-2">Status</th><th /></tr></thead>
            <tbody>{r.avs.map((a) => (
              <tr key={a.id} className="border-b text-center">
                <td className="p-2 text-left">{fmt(a.data)}</td>
                {conc.provas.map((p) => <td key={p.k} className="p-2">{a.valores?.[p.k] ?? "-"}</td>)}
                <td className="p-2">
                  {admin
                    ? <button onClick={() => onConferir(a.id, !a.conferido)} className={`text-xs px-2 py-1 rounded ${a.conferido ? "bg-green-600 text-white" : "border border-orange-500 text-orange-600"}`}>{a.conferido ? "✓ conferido" : "conferir"}</button>
                    : <span className={`text-xs ${a.conferido ? "text-green-700" : "text-orange-600"}`}>{a.conferido ? "✓ conferido" : "pendente"}</span>}
                </td>
                <td><button className="text-red-600 text-xs" onClick={() => onRemover(a.id)}>remover</button></td>
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

/* ---------- PAINEL (aluno e treinador) ---------- */
function Painel({ aluno, inscr, avals, concursos, fator, admin, reload }) {
  const [sel, setSel] = useState(inscr[0]?.concurso_id || null);
  const [novo, setNovo] = useState({ concurso_id: "", data_prova: "" });
  const [form, setForm] = useState(null);
  const [msg, aviso] = useAviso();

  useEffect(() => { if (!inscr.some((i) => i.concurso_id === sel)) setSel(inscr[0]?.concurso_id || null); }, [inscr]);

  const disp = concursos.filter((c) => !inscr.some((i) => i.concurso_id === c.id));
  const conc = concursos.find((c) => c.id === sel);
  const ins = inscr.find((i) => i.concurso_id === sel);
  const nomeConc = (id) => concursos.find((c) => c.id === id)?.nome || id;

  const salvarPerfil = async (campos) => { await supabase.from("profiles").update(campos).eq("id", aluno.id); reload(); };
  const inscrever = async () => {
    if (!novo.concurso_id) return aviso("Escolha o concurso.");
    const { error } = await supabase.from("inscricoes").insert({ aluno_id: aluno.id, concurso_id: novo.concurso_id, data_prova: novo.data_prova || null });
    if (error) return aviso("Erro: " + error.message);
    setSel(novo.concurso_id); setNovo({ concurso_id: "", data_prova: "" }); reload();
  };
  const mudarData = async (d) => {
    await supabase.from("inscricoes").update({ data_prova: d || null }).eq("aluno_id", aluno.id).eq("concurso_id", sel); reload();
  };
  const sairConc = async () => {
    if (!confirm(`Remover ${conc.nome} e todos os resultados dele?`)) return;
    await supabase.from("avaliacoes").delete().eq("aluno_id", aluno.id).eq("concurso_id", sel);
    await supabase.from("inscricoes").delete().eq("aluno_id", aluno.id).eq("concurso_id", sel);
    reload();
  };
  const salvarAval = async () => {
    if (!form.data) return aviso("Informe a data do teste.");
    const valores = {};
    conc.provas.forEach((p) => (valores[p.k] = Number(form.v[p.k]) || 0));
    const { error } = await supabase.from("avaliacoes").insert({ aluno_id: aluno.id, concurso_id: sel, data: form.data, valores });
    if (error) return aviso("Erro: " + error.message);
    setForm(null); reload(); aviso("Resultado salvo!");
  };
  const remover = async (id) => { if (!confirm("Remover esta avaliação?")) return; await supabase.from("avaliacoes").delete().eq("id", id); reload(); };
  const conferir = async (id, v) => { await supabase.from("avaliacoes").update({ conferido: v }).eq("id", id); reload(); };

  return (
    <>
      <Card>
        <h2 className="text-lg font-bold">{aluno.nome}</h2>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <select className={inp} value={aluno.sexo} onChange={(e) => salvarPerfil({ sexo: e.target.value })}><option value="M">Masculino</option><option value="F">Feminino</option></select>
          <select className={inp} value={aluno.freq} onChange={(e) => salvarPerfil({ freq: Number(e.target.value) })}>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}x por semana</option>)}</select>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-2">{admin ? "Concursos do aluno" : "Meus concursos"}</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {inscr.map((i) => (
            <button key={i.concurso_id} onClick={() => { setSel(i.concurso_id); setForm(null); }}
              className={`px-4 py-2 rounded-lg font-semibold ${sel === i.concurso_id ? "bg-blue-700 text-white" : "border"}`}>{nomeConc(i.concurso_id)}</button>
          ))}
          {!inscr.length && <p className="text-sm text-slate-500">Nenhum concurso ainda. Adicione abaixo.</p>}
        </div>
        {disp.length > 0 && (
          <div className="grid sm:grid-cols-3 gap-2 border-t pt-3 items-end">
  <div><label className="text-xs text-slate-500">Concurso</label>
    <select className={inp} value={novo.concurso_id} onChange={(e) => setNovo({ ...novo, concurso_id: e.target.value })}>
      <option value="">+ Adicionar concurso…</option>{disp.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
    </select></div>
  <div><label className="text-xs text-slate-500">Data da prova</label>
    <input type="date" className={inp} value={novo.data_prova} onChange={(e) => setNovo({ ...novo, data_prova: e.target.value })} /></div>
  <button onClick={inscrever} className={btn}>Adicionar</button>
          </div>
        )}
        <Aviso msg={msg} />
      </Card>

      {conc && (
        <>
          <Card>
            <div className="flex flex-wrap gap-2 items-end">
              <div><label className="text-xs text-slate-500">Data da prova – {conc.nome}</label>
                <input type="date" className={inp} value={ins?.data_prova || ""} onChange={(e) => mudarData(e.target.value)} /></div>
              {conc.provas?.length > 0 && <button onClick={() => setForm({ data: hoje(), v: {} })} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold">+ Lançar resultado</button>}
              <button onClick={sairConc} className="text-red-600 text-sm ml-auto">Remover concurso</button>
            </div>
            {form && (
              <div className="mt-4 border-t pt-4 grid sm:grid-cols-2 gap-3">
                <div><label className="text-sm">Data do teste</label><input type="date" className={inp} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
                {conc.provas.map((p) => (
                  <div key={p.k}><label className="text-sm">{p.nome} ({unid(p, aluno.sexo)}) — mín. {p[aluno.sexo]?.[0]}</label>
                    <input type="number" inputMode="decimal" className={inp} value={form.v[p.k] ?? ""} onChange={(e) => setForm({ ...form, v: { ...form.v, [p.k]: e.target.value } })} /></div>
                ))}
                <div className="flex gap-2 sm:col-span-2"><button onClick={salvarAval} className={btn}>Salvar</button><button onClick={() => setForm(null)} className="border px-4 rounded-lg">Cancelar</button></div>
              </div>
            )}
          </Card>
          <Resultado aluno={aluno} conc={conc} avals={avals} fator={fator} dataProva={ins?.data_prova} admin={admin} onRemover={remover} onConferir={conferir} />
        </>
      )}
    </>
  );
}

/* ---------- ALUNO ---------- */
function Aluno({ perfil, concursos, fator }) {
  const [d, setD] = useState(null);
  const carregar = async () => {
    const [p, i, a] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", perfil.id).single(),
      supabase.from("inscricoes").select("*").eq("aluno_id", perfil.id),
      supabase.from("avaliacoes").select("*").eq("aluno_id", perfil.id),
    ]);
    setD({ aluno: p.data || perfil, inscr: i.data || [], avals: a.data || [] });
  };
  useEffect(() => { carregar(); }, [perfil.id]);
  return <Tela sair>{!d ? <p>Carregando…</p> : <Painel {...d} concursos={concursos} fator={fator} reload={carregar} />}</Tela>;
}

/* ---------- TREINADOR ---------- */
function Admin({ concursos, setConcursos, fator, setFator }) {
  const [perfis, setPerfis] = useState([]);
  const [inscr, setInscr] = useState([]);
  const [avs, setAvs] = useState([]);
  const [tela, setTela] = useState("lista");
  const [verId, setVerId] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [msg, aviso] = useAviso();

  const carregar = async () => {
    const [p, i, a] = await Promise.all([
      supabase.from("profiles").select("*").eq("is_admin", false).order("nome"),
      supabase.from("inscricoes").select("*"),
      supabase.from("avaliacoes").select("*"),
    ]);
    setPerfis(p.data || []); setInscr(i.data || []); setAvs(a.data || []);
  };
  useEffect(() => { carregar(); }, []);

  const doAluno = (id) => ({ inscr: inscr.filter((x) => x.aluno_id === id), avals: avs.filter((x) => x.aluno_id === id) });
  const lista = perfis.filter((p) => !filtro || inscr.some((i) => i.aluno_id === p.id && i.concurso_id === filtro));
  const aluno = perfis.find((p) => p.id === verId);

  return (
    <Tela sair>
      <div className="flex gap-2">
        {[["lista", "Alunos"], ["indices", "Índices"]].map(([t, l]) => (
          <button key={t} onClick={() => { setTela(t); setVerId(null); }} className={`px-4 py-2 rounded-lg font-semibold ${tela === t ? "bg-blue-700 text-white" : "bg-white border"}`}>{l}</button>
        ))}
      </div>
      <Aviso msg={msg} />

      {tela === "lista" && !aluno && (
        <Card>
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <h2 className="text-lg font-bold">Alunos ({lista.length})</h2>
            <select className="border rounded-lg px-3 py-2" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="">Todos os concursos</option>{concursos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            {lista.map((a) => {
              const d = doAluno(a.id);
              const pend = d.avals.filter((v) => !v.conferido).length;
              return (
                <button key={a.id} onClick={() => setVerId(a.id)} className="w-full text-left border rounded-lg p-3 hover:bg-slate-50">
                  <p className="font-semibold">{a.nome} {pend > 0 && <span className="text-orange-600 text-xs">· {pend} para conferir</span>}</p>
                  <p className="text-xs text-slate-500 mb-1">{a.sexo === "M" ? "Masc." : "Fem."} · {a.freq}x/sem</p>
                  <div className="flex flex-wrap gap-1">
                    {d.inscr.filter((i) => !filtro || i.concurso_id === filtro).map((i) => {
                      const c = concursos.find((x) => x.id === i.concurso_id);
                      const r = c && avaliar(a, c, d.avals, fator, i.data_prova);
                      return <span key={i.concurso_id} className={`text-xs px-2 py-1 rounded text-white ${r ? corNivel[r.nivel] : "bg-slate-400"}`}>
                        {c?.nome}: {r ? `${r.nivel} · ${r.pontos}/${r.pontosMax}` : "sem resultado"}{r?.atraso ? " ⚠" : ""}</span>;
                    })}
                    {!d.inscr.length && <span className="text-xs text-slate-400">Sem concurso</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {tela === "lista" && aluno && (
        <>
          <button onClick={() => setVerId(null)} className="bg-white border px-4 py-2 rounded-lg">← Voltar</button>
          <Painel aluno={aluno} {...doAluno(aluno.id)} concursos={concursos} fator={fator} admin reload={carregar} />
        </>
      )}

      {tela === "indices" && <Indices concursos={concursos} setConcursos={setConcursos} fator={fator} setFator={setFator} aviso={aviso} />}
    </Tela>
  );
}

/* ---------- ÍNDICES POR CONCURSO ---------- */
function Indices({ concursos, setConcursos, fator, setFator, aviso }) {
  const [sel, setSel] = useState(null);
  const [sx, setSx] = useState("M");
  const [novoNome, setNovoNome] = useState("");
  const c = concursos.find((x) => x.id === sel) || concursos[0];

  const upd = (campos) => setConcursos(concursos.map((x) => (x.id === c.id ? { ...x, ...campos } : x)));
  const setP = (i, campos) => upd({ provas: c.provas.map((p, j) => (j === i ? { ...p, ...campos } : p)) });
  const setNivel = (i, n, v) => { const arr = [...(c.provas[i][sx] || [0, 0, 0, 0, 0])]; arr[n] = Number(v); setP(i, { [sx]: arr }); };
  const addProva = () => upd({ provas: [...c.provas, { k: "p" + Date.now(), nome: "Nova prova", un: "rep", M: [0, 0, 0, 0, 0], F: [0, 0, 0, 0, 0], taxa: 10 }] });

  const salvar = async () => {
    const { error } = await supabase.from("concursos").update({ nome: c.nome, provas: c.provas }).eq("id", c.id);
    await supabase.from("config").update({ fator }).eq("id", 1);
    aviso(error ? "Erro: " + error.message : `${c.nome} salvo.`);
  };
  const criar = async () => {
    const nome = novoNome.trim();
    const id = nome.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
    if (!id) return aviso("Informe o nome do concurso.");
    const { data, error } = await supabase.from("concursos").insert({ id, nome, provas: [], ordem: concursos.length + 1 }).select().single();
    if (error) return aviso("Erro: " + error.message);
    setConcursos([...concursos, data]); setSel(id); setNovoNome("");
  };
  const excluir = async () => {
    if (!confirm(`Excluir ${c.nome}? Os resultados dos alunos nesse concurso serão apagados.`)) return;
    await supabase.from("concursos").delete().eq("id", c.id);
    setConcursos(concursos.filter((x) => x.id !== c.id)); setSel(null);
  };

  return (
    <Card>
      <div className="flex flex-wrap gap-2 mb-3">
        {concursos.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={`px-3 py-1 rounded-lg font-semibold ${c?.id === x.id ? "bg-blue-700 text-white" : "border"}`}>{x.nome}</button>)}
        <input className="border rounded-lg px-2 py-1 text-sm" placeholder="Novo concurso (ex.: PRF)" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
        <button onClick={criar} className="bg-green-700 text-white px-3 py-1 rounded-lg text-sm">+ Criar</button>
      </div>
      {c && (
        <>
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <input className="border rounded-lg px-2 py-1 font-bold" value={c.nome} onChange={(e) => upd({ nome: e.target.value })} />
            <div className="flex gap-1">{["M", "F"].map((s) => <button key={s} onClick={() => setSx(s)} className={`px-3 py-1 rounded ${sx === s ? "bg-blue-700 text-white" : "border"}`}>{s === "M" ? "Masculino" : "Feminino"}</button>)}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-100"><th className="p-2 text-left">Prova</th><th>Unidade</th>{[1, 2, 3, 4, 5].map((n) => <th key={n}>{n} pt</th>)}<th>%/sem</th><th /></tr></thead>
              <tbody>{c.provas.map((p, i) => (
                <tr key={p.k} className="border-b">
                  <td className="p-1"><input className="border rounded px-1 w-36" value={p.nome} onChange={(e) => setP(i, { nome: e.target.value })} /></td>
                  <td className="p-1"><input className="border rounded px-1 w-20" value={unid(p, sx)} onChange={(e) => setP(i, { [sx === "F" ? "unF" : "un"]: e.target.value })} /></td>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <td key={n} className="p-1"><input type="number" className="border rounded px-1 w-16" value={p[sx]?.[n] ?? 0} onChange={(e) => setNivel(i, n, e.target.value)} /></td>
                  ))}
                  <td className="p-1"><input type="number" step="0.5" className="border rounded px-1 w-14" value={p.taxa} onChange={(e) => setP(i, { taxa: Number(e.target.value) })} /></td>
                  <td><button onClick={() => upd({ provas: c.provas.filter((_, j) => j !== i) })} className="text-red-600 text-xs">✕</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <button onClick={addProva} className="mt-2 border px-3 py-1 rounded-lg text-sm">+ Adicionar prova</button>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <label className="font-semibold">Fator de tempo (%):</label>
            <input type="number" className="border rounded px-2 py-1 w-20" value={fator} onChange={(e) => setFator(Number(e.target.value) || 1)} />
            <button onClick={salvar} className={btn}>Salvar {c.nome}</button>
            <button onClick={excluir} className="text-red-600 ml-auto">Excluir concurso</button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Aprovação exige ao menos 1 ponto em cada prova. Confira sempre o edital vigente.</p>
        </>
      )}
    </Card>
  );
}
