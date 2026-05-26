import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Phase =
  | "boot"
  | "inicial"
  | "preparar_receita"
  | "preparar_dados"
  | "checklist_pre"
  | "revisao"
  | "operacao"
  | "finalizacao"
  | "registros_dia"
  | "alarmes";

type OperationTab = "reguladores" | "bombas" | "oleo" | "informacoes";
type Status = "PRONTO" | "EM CICLO" | "PAUSADO" | "FINALIZADO" | "BLOQUEADO";
type RecipeKey = string;
type HoseKey = string;
type AlarmSeverity = "yellow" | "red";

type ChecklistPre = {
  mangueira: boolean;
  valvulaSuperior: boolean;
  valvulaInferior: boolean;
  tanquesPosicionados: boolean;
  oleoDisponivel: boolean;
  emergenciaLiberada: boolean;
  sensoresComunicando: boolean;
  intertravamentosLiberados: boolean;
  receitaRevisada: boolean;
};

type ChecklistPos = {
  tempoOk: boolean;
  semAnomalia: boolean;
  oleoRestanteVisivel: boolean;
  pressaoFinalOk: boolean;
  bombasDesligaram: boolean;
  linhaOleoFinalizada: boolean;
  operadorConfirmouFisico: boolean;
  alarmesRevisados: boolean;
  dadosEnviados: boolean;
  observacao?: string;
};

type Recipe = {
  id: RecipeKey;
  title: string;
  tipoTanque: string;
  tempoEstimado: number;
  pressaoAlvo: number;
  b2StartSeg: number;
  oilStartSeg: number;
  estabilizacaoSeg: number;
  oleoPorTanque: number;
  observacao: string;
};

type Hose = {
  id: HoseKey;
  descricao: string;
  perdaBase: number;
  comprimento: number;
};

type Registro = {
  id: string;
  horario: string;
  status: string;
  qtdTanques: number;
  receita: string;
  mangueira: string;
};

type AlarmInfo = {
  key: string;
  severity: AlarmSeverity;
  title: string;
  message: string;
};

const GATEWAY_API = "http://127.0.0.1:8020/api";

const defaultRecipes: Recipe[] = [];

const hoses: Hose[] = [
  { id: "MG-01", descricao: "Curta - 5 m", perdaBase: 0.7, comprimento: 5 },
  { id: "MG-02", descricao: "Media - 8 m", perdaBase: 1.2, comprimento: 8 },
  { id: "MG-03", descricao: "Longa - 12 m", perdaBase: 1.8, comprimento: 12 },
];

const checklistPreText: Record<keyof ChecklistPre, { title: string; detail: string }> = {
  mangueira: {
    title: "Mangueira de vacuo conectada",
    detail: "Conferir engate, vedacao e ausencia de dobra na linha.",
  },
  valvulaSuperior: {
    title: "Valvula superior liberada",
    detail: "Linha de vacuo preparada para aplicar pressao negativa no tanque.",
  },
  valvulaInferior: {
    title: "Valvula inferior fechada",
    detail: "Evita entrada indevida de oleo/ar antes da etapa correta.",
  },
  tanquesPosicionados: {
    title: "Tanques posicionados",
    detail: "Tanques/reguladores alinhados, apoiados e sem obstrucao fisica.",
  },
  oleoDisponivel: {
    title: "Oleo disponivel",
    detail: "Volume informado precisa cobrir a receita selecionada.",
  },
  emergenciaLiberada: {
    title: "Emergencia liberada",
    detail: "Botao de emergencia e bloqueios fisicos devem estar liberados.",
  },
  sensoresComunicando: {
    title: "Sensores comunicando",
    detail: "Pressao/vacuo, Gateway e sinal do controlador devem estar online.",
  },
  intertravamentosLiberados: {
    title: "Intertravamentos liberados",
    detail: "Condicoes minimas para bomba, valvulas, oleo e seguranca.",
  },
  receitaRevisada: {
    title: "Receita revisada",
    detail: "Conferir pressao alvo, tempo, tanque, mangueira e operador.",
  },
};

const checklistPosText: Record<keyof Omit<ChecklistPos, "observacao">, { title: string; detail: string }> = {
  tempoOk: {
    title: "Tempo de ciclo registrado",
    detail: "Confirmar duracao total apresentada pela IHM.",
  },
  semAnomalia: {
    title: "Sem anomalia visual",
    detail: "Sem ruido anormal, vazamento, oscilacao critica ou comportamento inesperado.",
  },
  oleoRestanteVisivel: {
    title: "Oleo restante conferido",
    detail: "Reservatorio e linha de oleo coerentes com a operacao.",
  },
  pressaoFinalOk: {
    title: "Pressao final registrada",
    detail: "Valor final salvo para rastreabilidade e relatorio.",
  },
  bombasDesligaram: {
    title: "Bombas desligadas",
    detail: "B1, B2/Roots simulada e linha de oleo em estado seguro.",
  },
  linhaOleoFinalizada: {
    title: "Linha de oleo finalizada",
    detail: "Etapa de injecao/enchimento concluida sem alerta pendente.",
  },
  operadorConfirmouFisico: {
    title: "Conferencia fisica feita",
    detail: "Operador confirmou maquina, tanque, mangueira e painel.",
  },
  alarmesRevisados: {
    title: "Alarmes revisados",
    detail: "Eventos amarelos/vermelhos foram verificados antes do encerramento.",
  },
  dadosEnviados: {
    title: "Dados enviados ao Gateway",
    detail: "Registro da operacao enviado para painel, historico e relatorios.",
  },
};

const EMPTY_RECIPE: Recipe = {
  id: "__SEM_RECEITA__",
  title: "Nenhuma receita cadastrada",
  tipoTanque: "Nao definido",
  tempoEstimado: 0,
  pressaoAlvo: 1013,
  b2StartSeg: 0,
  oilStartSeg: 0,
  estabilizacaoSeg: 0,
  oleoPorTanque: 0,
  observacao: "Cadastre uma receita no sistema do gerente.",
};

function fmt(v: number, u: string) {
  if (!Number.isFinite(v)) return `-- ${u}`;
  return `${v.toFixed(v >= 100 ? 1 : 2)} ${u}`;
}

function timeFmt(s: number) {
  const safe = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, "0")}`;
}

function now() {
  return new Date().toLocaleTimeString("pt-BR");
}

function humanStage(stage: string) {
  const map: Record<string, string> = {
    PREPARO: "PREPARO",
    VACUO_INICIAL: "VACUO INICIAL",
    VACUO_PROFUNDO: "VACUO PROFUNDO",
    INJECAO_DE_OLEO: "INJECAO DE OLEO",
    ESTABILIZACAO: "ESTABILIZACAO",
    FINALIZACAO: "FINALIZACAO",
    BLOQUEADO: "BLOQUEADO",
  };

  return map[stage] || stage || "PREPARO";
}

function gatewayToRecipe(raw: any): Recipe {
  const estimated = Number(raw?.estimated_seconds || raw?.max_cycle_seconds || 205);
  const oilPerTank = Number(raw?.oil_per_tank_l || raw?.oleoPorTanque || Math.max(30, Number(raw?.min_oil_flow_l_min || 2) * 25));

  return {
    id: String(raw?.id || `REC-${Date.now()}`),
    title: String(raw?.title || raw?.name || "Receita Operacional"),
    tipoTanque: String(raw?.tank_type || raw?.tipoTanque || "Comum"),
    tempoEstimado: estimated,
    pressaoAlvo: Number(raw?.target_pressure_mbar || raw?.pressaoAlvo || 8),
    b2StartSeg: Number(raw?.b2_start_seconds || 24),
    oilStartSeg: Number(raw?.oil_start_seconds || 90),
    estabilizacaoSeg: Number(raw?.stabilization_seconds || 165),
    oleoPorTanque: oilPerTank,
    observacao: String(raw?.note || raw?.observacao || "Receita recebida do Gateway"),
  };
}

function normalizeGatewayStatus(value: unknown): Status {
  const text = String(value || "").toUpperCase();

  if (text === "EM_CICLO") return "EM CICLO";
  if (text === "PAUSADO") return "PAUSADO";
  if (text === "FINALIZADO") return "FINALIZADO";
  if (text === "BLOQUEADO") return "BLOQUEADO";
  return "PRONTO";
}

function PumpCard({ name, subtitle, on, detail }: { name: string; subtitle: string; on: boolean; detail: string }) {
  return (
    <article className={`pump-card ${on ? "on" : "off"}`}>
      <div className="pump-head">
        <div className={`machine-led ${on ? "on" : "off"}`} aria-hidden="true" />

        <div>
          <strong>{name}</strong>
          <small>{subtitle}</small>
        </div>
      </div>

      <p>{detail}</p>

      <div className="pump-state-row">
        <b>{on ? "LIGADA" : "DESLIGADA"}</b>
        <small>{on ? "Sinal ativo" : "Aguardando comando"}</small>
      </div>
    </article>
  );
}

function ProcessTank({ tank, index, oilActive }: { tank: any; index: number; oilActive: boolean }) {
  const pressure = Number(tank.pressao ?? tank.pressure_mbar ?? 1013);
  const loss = Number(tank.perda ?? tank.hose_loss_mbar ?? 0);
  const oil = Number(tank.oleo ?? tank.oil_in_l ?? 0);
  const oilHeight = Math.max(4, Math.min(78, oil * 2.2));
  const vacuumHeight = Math.max(10, Math.min(84, 92 - Math.log10(Math.max(pressure, 1)) * 24));

  return (
    <article className="process-tank-card">
      <div className="tank-name">T{index + 1}</div>

      <div className="process-visual">
        <div className="vacuum-line" />
        <div className={`oil-hose ${oilActive ? "active" : ""}`}>
          {oilActive && (
            <>
              <span />
              <span />
              <span />
            </>
          )}
        </div>

        <div className="process-tank">
          <div className="vacuum-zone" style={{ height: `${vacuumHeight}%` }} />
          <div className="oil-level" style={{ height: `${oilHeight}%` }} />
        </div>
      </div>

      <div className="tank-readings">
        <span>Pressao</span><b>{fmt(pressure, "mbar")}</b>
        <span>Perda</span><b>{fmt(loss, "mbar")}</b>
        <span>Oleo</span><b>{fmt(oil, "L")}</b>
      </div>
    </article>
  );
}

function AlarmOverlay({
  alarm,
  onSilence,
  onOpenAlarms,
  onEmergencyStop,
}: {
  alarm: AlarmInfo | null;
  onSilence: () => void;
  onOpenAlarms: () => void;
  onEmergencyStop: () => void;
}) {
  if (!alarm) return null;

  return (
    <div className={`alarm-overlay ${alarm.severity}`}>
      <div className="alarm-modal">
        <h2>{alarm.title}</h2>
        <p>{alarm.message}</p>

        {alarm.severity === "red" && (
          <button className="emergency-round" onClick={onEmergencyStop}>
            PARAR TUDO
          </button>
        )}

        <div className="alarm-actions">
          <button onClick={onOpenAlarms}>VERIFICAR ALARMES</button>
          <button className="secondary" onClick={onSilence}>SILENCIAR AVISO</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<OperationTab>("reguladores");
  const [status, setStatus] = useState<Status>("PRONTO");
  const [elapsed, setElapsed] = useState(0);
  const [operationId, setOperationId] = useState("");
  const [gatewayState, setGatewayState] = useState<any>(null);
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [silencedAlarmKey, setSilencedAlarmKey] = useState("");

  const [registros, setRegistros] = useState<Registro[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("tsea_ihm_registros_dia") || "[]");
    } catch {
      return [];
    }
  });

  const [recipeId, setRecipeId] = useState<RecipeKey>("");
  const [qtdTanques, setQtdTanques] = useState(1);
  const [hoseId, setHoseId] = useState<HoseKey>("MG-02");
  const [oleoColocado, setOleoColocado] = useState(80);

  const [checklistPre, setChecklistPre] = useState<ChecklistPre>({
    mangueira: false,
    valvulaSuperior: false,
    valvulaInferior: false,
    tanquesPosicionados: false,
    oleoDisponivel: false,
    emergenciaLiberada: true,
    sensoresComunicando: false,
    intertravamentosLiberados: false,
    receitaRevisada: false,
  });

  const [checklistPos, setChecklistPos] = useState<ChecklistPos>({
    tempoOk: false,
    semAnomalia: false,
    oleoRestanteVisivel: false,
    pressaoFinalOk: false,
    bombasDesligaram: false,
    linhaOleoFinalizada: false,
    operadorConfirmouFisico: false,
    alarmesRevisados: false,
    dadosEnviados: false,
    observacao: "",
  });

  const [logs, setLogs] = useState<{ time: string; msg: string }[]>([]);
  const [gatewayRecipes, setGatewayRecipes] = useState<Recipe[]>([]);

  const recipes = gatewayRecipes.length ? gatewayRecipes : defaultRecipes;
  const recipe = recipes.find((r) => r.id === recipeId) || recipes[0] || EMPTY_RECIPE;
  const hose = hoses.find((h) => h.id === hoseId) || hoses[1] || hoses[0];

  const addLog = (msg: string) => setLogs((prev) => [{ time: now(), msg }, ...prev].slice(0, 60));

  useEffect(() => {
    if (phase === "boot") {
      const timer = window.setTimeout(() => setPhase("inicial"), 1400);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  useEffect(() => {
    try {
      localStorage.setItem("tsea_ihm_registros_dia", JSON.stringify(registros));
    } catch {}
  }, [registros]);

  useEffect(() => {
    let active = true;

    async function carregarReceitasGateway() {
      try {
        const response = await fetch(`${GATEWAY_API}/recipes`);
        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        const list = Array.isArray(data) ? data.map(gatewayToRecipe) : [];

        if (active) setGatewayRecipes(list);
      } catch {
        if (active) setGatewayRecipes([]);
      }
    }

    carregarReceitasGateway();
    const timer = window.setInterval(carregarReceitasGateway, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (recipes.length && !recipes.some((item) => item.id === recipeId)) {
      setRecipeId(recipes[0].id);
    }

    if (!recipes.length) {
      setRecipeId("");
    }
  }, [gatewayRecipes, recipeId, recipes]);

  useEffect(() => {
    let active = true;

    async function pollState() {
      try {
        const response = await fetch(`${GATEWAY_API}/state`);
        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        if (!active) return;

        setGatewayOnline(true);
        setGatewayState(data);

        if (data?.operation_id) setOperationId(String(data.operation_id));
        if (data?.status) setStatus(normalizeGatewayStatus(data.status));
        if (Number.isFinite(Number(data?.elapsed_seconds))) setElapsed(Number(data.elapsed_seconds));
      } catch {
        if (active) setGatewayOnline(false);
      }
    }

    pollState();
    const timer = window.setInterval(pollState, 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const stageRaw = String(gatewayState?.stage || "");
  const elapsedLive = Number(gatewayState?.elapsed_seconds ?? elapsed);
  const b1Ligada = Boolean(gatewayState?.pumps?.b1) || (status === "EM CICLO" && elapsedLive < recipe.tempoEstimado);
  const b2Ligada = Boolean(gatewayState?.pumps?.b2) || (status === "EM CICLO" && elapsedLive >= recipe.b2StartSeg && elapsedLive < recipe.oilStartSeg);
  const oilLigada = Boolean(gatewayState?.pumps?.oil) || (status === "EM CICLO" && elapsedLive >= recipe.oilStartSeg);
  const etapaAtual = humanStage(stageRaw || etapaLocal());

  const pressaoMaquina = Number(
    gatewayState?.pressure_machine_mbar ??
      (status === "EM CICLO" ? Math.max(recipe.pressaoAlvo, 1013 * Math.exp(-elapsedLive / 4.8)) : 1013)
  );

  const pressaoMedia = Number(gatewayState?.pressure_avg_tank_mbar ?? pressaoMaquina + hose.perdaBase);
  const oilInjetado = Number(gatewayState?.oil?.injected_l ?? Math.min(oleoColocado, oilLigada ? Math.max(0, elapsedLive - recipe.oilStartSeg) * 0.8 : 0));
  const oilRestante = Number(gatewayState?.oil?.remaining_l ?? Math.max(0, oleoColocado - oilInjetado));
  const oilFlow = Number(gatewayState?.oil?.flow_l_min ?? (oilLigada ? qtdTanques * 1.5 : 0));

  const tanques = Array.isArray(gatewayState?.tanks) && gatewayState.tanks.length
    ? gatewayState.tanks.map((t: any, index: number) => ({
        id: t.id || `T${index + 1}`,
        pressao: Number(t.pressure_mbar || pressaoMedia),
        perda: Number(t.hose_loss_mbar || hose.perdaBase),
        oleo: Number(t.oil_in_l || 0),
        risco: Number(t.risk_pct || 0),
      }))
    : Array.from({ length: qtdTanques }).map((_, index) => ({
        id: `T${index + 1}`,
        pressao: pressaoMedia + index * 0.5,
        perda: hose.perdaBase + index * 0.2,
        oleo: oilLigada ? Math.max(0, elapsedLive - recipe.oilStartSeg) / 2 : 0,
        risco: 18,
      }));

  const allCheckedPre = Object.values(checklistPre).every((v) => v === true);
  const allCheckedPos = Object.entries(checklistPos).filter(([k]) => k !== "observacao").every(([, v]) => v === true);
  const oilNeeded = qtdTanques * recipe.oleoPorTanque;
  const oilInsuficiente = recipes.length > 0 && oleoColocado < oilNeeded;

  const alarmInfo = useMemo<AlarmInfo | null>(() => {
    if (status === "BLOQUEADO" || gatewayState?.hardware?.emergency || gatewayState?.alarm) {
      return {
        key: "emergencia",
        severity: "red",
        title: "ALARME VERMELHO - PARADA CRITICA",
        message: "Condicao critica detectada. O ciclo deve ser bloqueado e os atuadores devem ser desligados.",
      };
    }

    if (!gatewayOnline && phase !== "boot") {
      return {
        key: "gateway_offline",
        severity: "yellow",
        title: "ALARME AMARELO - GATEWAY OFFLINE",
        message: "A IHM perdeu comunicacao com o Gateway. Verifique cabo, servidor ou rede local.",
      };
    }

    if (oilInsuficiente) {
      return {
        key: "oleo_insuficiente",
        severity: "yellow",
        title: "ALARME AMARELO - OLEO INSUFICIENTE",
        message: "O volume informado nao cobre a receita selecionada. Corrija antes de iniciar.",
      };
    }

    return null;
  }, [gatewayOnline, gatewayState, oilInsuficiente, phase, status]);

  const visibleAlarm = alarmInfo && alarmInfo.key !== silencedAlarmKey ? alarmInfo : null;
  const screenClass = visibleAlarm ? `alarm-shadow-${visibleAlarm.severity}` : "";

  function etapaLocal() {
    if (status !== "EM CICLO") return "PREPARO";
    if (elapsedLive < recipe.b2StartSeg) return "VACUO_INICIAL";
    if (elapsedLive < recipe.oilStartSeg) return "VACUO_PROFUNDO";
    if (elapsedLive < recipe.estabilizacaoSeg) return "INJECAO_DE_OLEO";
    if (elapsedLive < recipe.tempoEstimado) return "ESTABILIZACAO";
    return "FINALIZACAO";
  }

  async function acionarEmergencia() {
    try {
      await fetch(`${GATEWAY_API}/command/emergency`, { method: "POST" });
    } catch {}

    setStatus("BLOQUEADO");
    addLog("Parada critica acionada pela IHM.");
    setPhase("alarmes");
  }

  async function iniciarOperacao() {
    if (!recipes.length || recipe.id === "__SEM_RECEITA__") {
      addLog("Nenhuma receita cadastrada no Gateway.");
      return;
    }

    if (oilInsuficiente || !allCheckedPre) {
      addLog("Inicio bloqueado por checklist ou oleo insuficiente.");
      return;
    }

    try {
      const response = await fetch(`${GATEWAY_API}/command/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_id: recipeId,
          tank_count: qtdTanques,
          hose_id: hoseId,
          oil_reservoir_l: oleoColocado,
          operator: "OPERADOR 01",
          shift: "MANHA",
        }),
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      const realOperationId = String(data?.operation_id || `OP-${Date.now()}`);

      setOperationId(realOperationId);
      setStatus("EM CICLO");
      setElapsed(0);
      setLogs([{ time: now(), msg: "Operacao iniciada pela IHM e enviada ao Gateway." }]);

      await fetch(`${GATEWAY_API}/checklist/pre`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: realOperationId,
          items: checklistPre,
          observation: "Checklist pre-operacional confirmado na IHM.",
        }),
      });

      setPhase("operacao");
    } catch (error) {
      addLog(`Falha ao iniciar no Gateway: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function finalizarOperacaoCompleta() {
    try {
      await fetch(`${GATEWAY_API}/checklist/final`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: operationId,
          items: checklistPos,
          observation: checklistPos.observacao || "Checklist final confirmado na IHM.",
        }),
      });

      await fetch(`${GATEWAY_API}/command/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      addLog("Checklist final e STOP enviados ao Gateway.");
    } catch (error) {
      addLog(`Falha ao finalizar no Gateway: ${error instanceof Error ? error.message : String(error)}`);
    }

    registrar("CONCLUIDO");
    reiniciar();
  }

  function reiniciar() {
    setPhase("boot");
    setDrawerOpen(false);
    setStatus("PRONTO");
    setElapsed(0);
    setOperationId("");
    setLogs([]);
    setChecklistPre({
      mangueira: false,
      valvulaSuperior: false,
      valvulaInferior: false,
      tanquesPosicionados: false,
      oleoDisponivel: false,
      emergenciaLiberada: true,
      sensoresComunicando: false,
      intertravamentosLiberados: false,
      receitaRevisada: false,
    });
    setChecklistPos({
      tempoOk: false,
      semAnomalia: false,
      oleoRestanteVisivel: false,
      pressaoFinalOk: false,
      bombasDesligaram: false,
      linhaOleoFinalizada: false,
      operadorConfirmouFisico: false,
      alarmesRevisados: false,
      dadosEnviados: false,
      observacao: "",
    });
    setTimeout(() => setPhase("inicial"), 800);
  }

  function registrar(statusFinal: string) {
    setRegistros((prev) => [
      {
        id: operationId || `LOCAL-${Date.now()}`,
        horario: new Date().toLocaleString(),
        status: statusFinal,
        qtdTanques,
        receita: recipe.title,
        mangueira: hose.descricao,
      },
      ...prev,
    ].slice(0, 50));
  }

  function renderMenu() {
    return (
      <div className={`drawer ${drawerOpen ? "open" : ""}`}>
        <div><button onClick={() => setDrawerOpen(false)}>FECHAR</button></div>
        <button disabled={phase !== "operacao" || status !== "FINALIZADO"} onClick={() => setPhase("finalizacao")}>FINALIZAR OPERACAO</button>
        <button onClick={() => { setDrawerOpen(false); setPhase("alarmes"); }}>ALARMES</button>
        <button disabled={phase === "operacao" && status !== "FINALIZADO"} onClick={reiniciar}>INICIO</button>
      </div>
    );
  }

  function renderAlarm() {
    if (phase === "alarmes") return null;

    return (
      <AlarmOverlay
        alarm={visibleAlarm}
        onSilence={() => visibleAlarm && setSilencedAlarmKey(visibleAlarm.key)}
        onOpenAlarms={() => setPhase("alarmes")}
        onEmergencyStop={acionarEmergencia}
      />
    );
  }

  if (phase === "boot") {
    return (
      <div className="boot">
        <div className="boot-title">TSEA</div>
        <div className="boot-sub">V-TWIN IHM OPERADOR</div>
      </div>
    );
  }

  if (phase === "inicial") {
    return (
      <div className={`inicial ${screenClass}`}>
        {renderAlarm()}
        <div className="buttons ihm-buttons">
          <button className="big-btn standard-btn" onClick={() => setPhase("preparar_receita")}>PREPARAR OPERACAO</button>
          <button className="big-btn standard-btn" onClick={() => setPhase("registros_dia")}>REGISTROS DO DIA</button>
        </div>
        {renderMenu()}
      </div>
    );
  }

  if (phase === "registros_dia") {
    return (
      <div className={`registros-dia ${screenClass}`}>
        {renderAlarm()}
        <button className="standard-btn compact" onClick={() => setPhase("inicial")}>VOLTAR</button>
        <h2>REGISTROS DO DIA</h2>
        <ul>{registros.map((r) => <li key={r.id}>{r.horario} | {r.status} | {r.qtdTanques} tanque(s) | {r.receita}</li>)}</ul>
        {renderMenu()}
      </div>
    );
  }

  if (phase === "preparar_receita") {
    return (
      <div className={`preparo ${screenClass}`}>
        {renderAlarm()}
        <h2>ESCOLHA A RECEITA</h2>
        <div className="recipes">
          {recipes.length === 0 ? (
            <div className="oil-warning">Nenhuma receita cadastrada no Gateway. Cadastre uma receita no sistema do gerente.</div>
          ) : recipes.map((r) => (
            <button key={r.id} className={`recipe-card ${recipeId === r.id ? "selected" : ""}`} onClick={() => setRecipeId(r.id)}>
              <div className="recipe-title">{r.title}</div>
              <div>Tanque: {r.tipoTanque}</div>
              <div>Tempo: {r.tempoEstimado}s</div>
              <div>Pressao alvo: {r.pressaoAlvo} mbar</div>
              <div>Oleo/tanque: {r.oleoPorTanque} L</div>
              <div className="recipe-note">{r.observacao}</div>
            </button>
          ))}
        </div>
        <button className="next-btn standard-btn compact" disabled={!recipes.length} onClick={() => setPhase("preparar_dados")}>CONTINUAR</button>
        {renderMenu()}
      </div>
    );
  }

  if (phase === "preparar_dados") {
    return (
      <div className={`preparo ${screenClass}`}>
        {renderAlarm()}
        <h2>DADOS DA OPERACAO</h2>
        <div className="form-grid">
          <div className="field"><label>Quantidade de tanques</label><input type="number" min={1} max={3} value={qtdTanques} onChange={(e) => setQtdTanques(Math.max(1, Math.min(3, Number(e.target.value) || 1)))} /></div>
          <div className="field"><label>Mangueira</label><select value={hoseId} onChange={(e) => setHoseId(e.target.value as HoseKey)}>{hoses.map((h) => <option key={h.id} value={h.id}>{h.descricao}</option>)}</select></div>
          <div className="field"><label>Oleo no reservatorio (L)</label><input type="number" min={0} value={oleoColocado} onChange={(e) => setOleoColocado(Math.max(0, Number(e.target.value) || 0))} /></div>
          <div className={oilInsuficiente ? "oil-warning" : "oil-ok"}>Oleo necessario para esta operacao: {oilNeeded} L</div>
        </div>
        <button className="next-btn standard-btn compact" disabled={oilInsuficiente || !recipes.length} onClick={() => setPhase("checklist_pre")}>CONTINUAR</button>
        {renderMenu()}
      </div>
    );
  }

  if (phase === "checklist_pre") {
    return (
      <div className={`preparo ${screenClass}`}>
        {renderAlarm()}
        <h2>CHECKLIST PRE-OPERACIONAL</h2>
        <div className="checklist refined">
          {(Object.keys(checklistPreText) as (keyof ChecklistPre)[]).map((key) => (
            <label key={key}>
              <input type="checkbox" checked={checklistPre[key]} onChange={(e) => setChecklistPre((prev) => ({ ...prev, [key]: e.target.checked }))} />
              <span><b>{checklistPreText[key].title}</b><small>{checklistPreText[key].detail}</small></span>
            </label>
          ))}
        </div>
        <button className="next-btn standard-btn compact" disabled={!allCheckedPre} onClick={() => setPhase("revisao")}>CONTINUAR</button>
        {renderMenu()}
      </div>
    );
  }

  if (phase === "revisao") {
    return (
      <div className={`preparo ${screenClass}`}>
        {renderAlarm()}
        <h2>REVISAO FINAL</h2>
        <div className="resumo review-grid">
          <p><b>Receita:</b> {recipe.title}</p>
          <p><b>Tanques:</b> {qtdTanques}</p>
          <p><b>Mangueira:</b> {hose.descricao}</p>
          <p><b>Oleo colocado:</b> {oleoColocado} L</p>
          <p><b>Oleo necessario:</b> {oilNeeded} L</p>
          <p><b>Pressao alvo:</b> {recipe.pressaoAlvo} mbar</p>
          {oilInsuficiente && <p className="warn-text">Volume de oleo insuficiente para iniciar.</p>}
        </div>
        <div className="button-row">
          <button className="cancel-btn standard-btn compact" onClick={() => setPhase("inicial")}>CANCELAR</button>
          <button className="start-btn standard-btn compact" disabled={oilInsuficiente || !allCheckedPre || !recipes.length} onClick={iniciarOperacao}>INICIAR</button>
        </div>
        {renderMenu()}
      </div>
    );
  }

  if (phase === "operacao") {
    return (
      <div className={`operacao ${screenClass}`}>
        {renderAlarm()}

        <div className="topbar">
          <button className="menu-btn" onClick={() => setDrawerOpen(true)}>MENU</button>
          <div><span>STATUS</span><strong>{status}</strong></div>
          <div><span>ETAPA</span><strong>{etapaAtual}</strong></div>
          <div className={alarmInfo ? `alarm-mini ${alarmInfo.severity}` : "alarm-mini ok"}><span>ALARME</span><strong>{alarmInfo ? alarmInfo.severity.toUpperCase() : "NORMAL"}</strong></div>
          <div><span>TEMPO</span><strong>{timeFmt(elapsedLive)} / {timeFmt(recipe.tempoEstimado)}</strong></div>
        </div>

        <div className="content-area">
          {tab === "reguladores" && (
            <div className="tanks-grid animated">
              {tanques.map((t: any, index: number) => <ProcessTank key={t.id || index} tank={t} index={index} oilActive={oilLigada} />)}
            </div>
          )}

          {tab === "bombas" && (
            <div className="machines-layout">
              <div className="pump-stack">
                <PumpCard name="B1" subtitle="Bomba primaria" on={b1Ligada} detail="Evacuacao inicial do tanque e manutencao da linha de vacuo." />
                <PumpCard name="B2" subtitle="Roots simulada" on={b2Ligada} detail="Reforco de vacuo acionado somente dentro da faixa permitida." />
                <PumpCard name="OLEO" subtitle="Linha de injecao" on={oilLigada} detail="Simula a entrada controlada de oleo apos a etapa de vacuo." />
              </div>

              <div className="machine-info-grid">
                <article><span>Pressao maquina</span><b>{fmt(pressaoMaquina, "mbar")}</b><small>Leitura base do conjunto de vacuo</small></article>
                <article><span>Pressao media tanque</span><b>{fmt(pressaoMedia, "mbar")}</b><small>Considera perda simulada da mangueira</small></article>
                <article><span>Sensor</span><b>{gatewayState?.hardware?.sensor_online === false ? "FALHA" : "ONLINE"}</b><small>Leitura enviada ao Gateway</small></article>
                <article><span>PLC / Gateway</span><b>{gatewayOnline ? "ONLINE" : "OFFLINE"}</b><small>Comunica IHM e sistema do gerente</small></article>
                <article><span>Intertravamento</span><b>{alarmInfo?.severity === "red" ? "BLOQUEADO" : "LIBERADO"}</b><small>Protecao logica do ciclo</small></article>
                <article><span>Receita</span><b>{recipe.title}</b><small>{recipe.tipoTanque}</small></article>
              </div>
            </div>
          )}

          {tab === "oleo" && (
            <div className="oil-layout">
              <article className="oil-reservoir-card">
                <h3>Reservatorio de oleo</h3>
                <div className="oil-reservoir">
                  <div className="oil-fill" style={{ height: `${Math.max(6, Math.min(92, (oilRestante / Math.max(oleoColocado, 1)) * 100))}%` }} />
                </div>
                <p>Restante: <b>{fmt(oilRestante, "L")}</b></p>
              </article>

              <article className="oil-flow-card">
                <h3>Linha de injecao</h3>
                <div className={`oil-demo-line ${oilLigada ? "active" : ""}`}>
                  <div className="pipe-reservoir" />
                  <div className="pipe-hose">{oilLigada && <><span /><span /><span /><span /></>}</div>
                  <div className="pipe-tank">
                    <div className="pipe-tank-oil" style={{ height: `${Math.max(4, Math.min(80, oilInjetado / Math.max(oilNeeded, 1) * 80))}%` }} />
                  </div>
                </div>
                <p>{oilLigada ? "Injetando oleo na etapa atual" : "Linha aguardando etapa de oleo"}</p>
              </article>

              <div className="oil-metrics">
                <article><span>Oleo colocado</span><b>{fmt(oleoColocado, "L")}</b></article>
                <article><span>Oleo necessario</span><b>{fmt(oilNeeded, "L")}</b></article>
                <article><span>Oleo injetado</span><b>{fmt(oilInjetado, "L")}</b></article>
                <article><span>Vazao atual</span><b>{fmt(oilFlow, "L/min")}</b></article>
                <article><span>Temperatura</span><b>{fmt(Number(gatewayState?.oil?.temperature_c ?? 60), "C")}</b></article>
                <article><span>Status da linha</span><b>{oilLigada ? "ATIVA" : "AGUARDANDO"}</b></article>
              </div>
            </div>
          )}

          {tab === "informacoes" && (
            <div className="info-grid">
              <div className="etapas">
                {["PREPARO", "VACUO INICIAL", "VACUO PROFUNDO", "INJECAO DE OLEO", "ESTABILIZACAO", "FINALIZACAO"].map((e) => (
                  <div key={e} className={etapaAtual === e ? "active" : ""}>{e}</div>
                ))}
              </div>

              <div>
                <p><b>ID:</b> {operationId || "--"}</p>
                <p><b>Receita:</b> {recipe.title}</p>
                <p><b>Operador:</b> OPERADOR 01</p>
                <p><b>Tanques:</b> {qtdTanques}</p>
                <p><b>Mangueira:</b> {hose.descricao}</p>
                <p><b>Tempo:</b> {timeFmt(elapsedLive)}</p>
                <p><b>Gateway:</b> {gatewayOnline ? "Online" : "Offline"}</p>
              </div>

              <div className="logs">
                {logs.length === 0 ? <div>Sem eventos locais.</div> : logs.slice(0, 12).map((l, index) => <div key={`${l.time}-${index}`}>[{l.time}] {l.msg}</div>)}
              </div>
            </div>
          )}
        </div>

        <div className="bottom-tabs">
          {(["reguladores", "bombas", "oleo", "informacoes"] as const).map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
          ))}
        </div>

        {renderMenu()}
      </div>
    );
  }

  if (phase === "alarmes") {
    return (
      <div className={`finalizacao alarm-screen ${screenClass}`}>
        {renderAlarm()}
        <h2>ALARMES E EVENTOS</h2>

        <div className="resumo alarm-summary">
          <p><b>Status:</b> {status}</p>
          <p><b>Etapa:</b> {etapaAtual}</p>
          <p><b>Alarme:</b> {alarmInfo ? alarmInfo.title : "Sem alarme ativo"}</p>
          <p><b>Pressao maquina:</b> {fmt(pressaoMaquina, "mbar")}</p>
          <p><b>Pressao media:</b> {fmt(pressaoMedia, "mbar")}</p>
          <p><b>Oleo colocado:</b> {oleoColocado} L</p>
          <p><b>Oleo necessario:</b> {oilNeeded} L</p>
          <button className="emergency-inline" onClick={acionarEmergencia}>PARADA CRITICA</button>
        </div>

        <div className="logs alarm-log">
          {logs.length === 0 ? <div>Sem eventos locais registrados.</div> : logs.map((l, index) => <div key={`${l.time}-${index}`}>[{l.time}] {l.msg}</div>)}
        </div>

        <button className="standard-btn compact" onClick={() => setPhase(status === "EM CICLO" ? "operacao" : "inicial")}>VOLTAR</button>
        {renderMenu()}
      </div>
    );
  }

  if (phase === "finalizacao") {
    return (
      <div className={`finalizacao ${screenClass}`}>
        {renderAlarm()}
        <h2>CHECKLIST FINAL</h2>

        <div className="resumo">
          <p><b>ID:</b> {operationId}</p>
          <p><b>Receita:</b> {recipe.title}</p>
          <p><b>Tanques:</b> {qtdTanques}</p>
          <p><b>Mangueira:</b> {hose.descricao}</p>
          <p><b>Tempo:</b> {timeFmt(elapsedLive)}</p>
          <p><b>Pressao final:</b> {fmt(pressaoMedia, "mbar")}</p>
          <p><b>Oleo colocado:</b> {oleoColocado} L</p>
          <p><b>Oleo injetado:</b> {fmt(oilInjetado, "L")}</p>
        </div>

        <div className="checklist refined">
          {(Object.keys(checklistPosText) as (keyof Omit<ChecklistPos, "observacao">)[]).map((key) => (
            <label key={key}>
              <input type="checkbox" checked={Boolean(checklistPos[key])} onChange={(e) => setChecklistPos((prev) => ({ ...prev, [key]: e.target.checked }))} />
              <span><b>{checklistPosText[key].title}</b><small>{checklistPosText[key].detail}</small></span>
            </label>
          ))}
          <label className="textarea-label">
            <span><b>Observacao final</b><small>Use para registrar qualquer condicao percebida pelo operador.</small></span>
            <textarea value={checklistPos.observacao} onChange={(e) => setChecklistPos((prev) => ({ ...prev, observacao: e.target.value }))} />
          </label>
        </div>

        <button className="standard-btn compact" disabled={!allCheckedPos} onClick={finalizarOperacaoCompleta}>FINALIZAR</button>
        {renderMenu()}
      </div>
    );
  }

  return null;
}

createRoot(document.getElementById("root")!).render(<App />);
