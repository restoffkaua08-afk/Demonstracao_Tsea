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
  linhaÓleoFinalizada: boolean;
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

const OPERATIONAL_LIMITS = {
  tankMin: 1,
  tankMax: 3,
  oilMinL: 0,
  oilMaxL: 300,
  oilStepL: 1,
  pressureMinMbar: 0.01,
  pressureMaxMbar: 1013,
  maxCycleSeconds: 3600,
  minCycleSeconds: 30,
  maxHoseLossMbar: 15,
};

const ALARM_TEXT = {
  gatewayOffline: {
    code: "ALM-001",
    title: "GATEWAY OFFLINE",
    message: "A IHM perdeu comunicação com o Gateway. Verifique servidor, cabo, Wi-Fi ou rede local.",
  },
  oilShortage: {
    code: "ALM-002",
    title: "ÓLEO INSUFICIENTE",
    message: "O volume informado não cobre a receita selecionada.",
  },
  sensorOffline: {
    code: "ALM-003",
    title: "SENSOR DE PRESSÃO OFFLINE",
    message: "O sensor de pressão/vácuo não está comunicando corretamente.",
  },
  emergency: {
    code: "ALM-004",
    title: "EMERGÊNCIA / PARADA CRÍTICA",
    message: "Condição crítica detectada. O ciclo deve ser bloqueado e os atuadores devem ser desligados.",
  },
  recipeInvalid: {
    code: "ALM-005",
    title: "RECEITA FORA DOS LIMITES",
    message: "A receita selecionada possui parâmetros fora do limite permitido para a demonstração.",
  },
  operationState: {
    code: "ALM-006",
    title: "ESTADO OPERACIONAL INVÁLIDO",
    message: "A operação não pode avançar no estado atual.",
  },
};

const LIMITS = {
  tankMin: 1,
  tankMax: 3,
  oilMinL: 0,
  oilMaxL: 300,
  oilStepL: 1,
};

const defaultRecipes: Recipe[] = [];

const hoses: Hose[] = [];

const checklistPreText: Record<keyof ChecklistPre, { title: string; detail: string }> = {
  mangueira: {
    title: "Mangueira de vacuo conectada",
    detail: "Conferir engate, vedação e ausência de dobra na linha.",
  },
  valvulaSuperior: {
    title: "Válvula superior liberada",
    detail: "Linha de vacuo preparada para aplicar pressao negativa no tanque.",
  },
  valvulaInferior: {
    title: "Válvula inferior fechada",
    detail: "Evita entrada indevida de oleo/ar antes da etapa correta.",
  },
  tanquesPosicionados: {
    title: "Tanques posicionados",
    detail: "Tanques/reguladores alinhados, apoiados e sem obstrucao fisica.",
  },
  oleoDisponivel: {
    title: "Óleo disponivel",
    detail: "Volume informado precisa cobrir a receita selecionada.",
  },
  emergenciaLiberada: {
    title: "Emergencia liberada",
    detail: "Botao de emergencia e bloqueios fisicos devem estar liberados.",
  },
  sensoresComunicando: {
    title: "Sensores comunicando",
    detail: "Pressão/vacuo, Gateway e sinal do controlador devem estar online.",
  },
  intertravamentosLiberados: {
    title: "Intertravamentos liberados",
    detail: "Condicoes minimas para bomba, válvulas, oleo e seguranca.",
  },
  receitaRevisada: {
    title: "Receita revisada",
    detail: "Conferir pressao alvo, tempo, tanque, mangueira e operador.",
  },
};

const checklistPosText: Record<keyof Omit<ChecklistPos, "observacao">, { title: string; detail: string }> = {
  tempoOk: {
    title: "Tempo de ciclo registrado",
    detail: "Confirmar duração total apresentada pela IHM.",
  },
  semAnomalia: {
    title: "Sem anomalia visual",
    detail: "Sem ruido anormal, vazamento, oscilacao critica ou comportamento inesperado.",
  },
  oleoRestanteVisivel: {
    title: "Óleo restante conferido",
    detail: "Reservatorio e linha de oleo coerentes com a operacao.",
  },
  pressaoFinalOk: {
    title: "Pressão final registrada",
    detail: "Valor final salvo para rastreabilidade e relatorio.",
  },
  bombasDesligaram: {
    title: "Bombas desligadas",
    detail: "B1, B2/Roots simulada e linha de oleo em estado seguro.",
  },
  linhaÓleoFinalizada: {
    title: "Linha de oleo finalizada",
    detail: "Etapa de injeção/enchimento concluida sem alerta pendente.",
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

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number) {
  return Math.round(clampNumber(value, min, max));
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
        <span>Pressão</span><b>{fmt(pressure, "mbar")}</b>
        <span>Perda</span><b>{fmt(loss, "mbar")}</b>
        <span>Óleo</span><b>{fmt(oil, "L")}</b>
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
  const [oleoColocado, setÓleoColocado] = useState(80);

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
    linhaÓleoFinalizada: false,
    operadorConfirmouFisico: false,
    alarmesRevisados: false,
    dadosEnviados: false,
    observacao: "",
  });

  const [logs, setLogs] = useState<{ time: string; msg: string }[]>([]);
  const [gatewayRecipes, setGatewayRecipes] = useState<Recipe[]>([]);
  const [realHoses, setRealHoses] = useState<any[]>([]);
  const [realTanks, setRealTanks] = useState<any[]>([]);
  const [realLimits, setRealLimits] = useState<any>(null);

  const recipes = gatewayRecipes;
  const recipe = recipes.find((r) => r.id === recipeId) || recipes[0] || EMPTY_RECIPE;
  const hosesDisponiveis: Hose[] = realHoses.map((item: any) => ({
    id: String(item.id || item.code),
    descricao: `${item.label || item.descricao || item.code} · ${item.length_m ?? "--"} m · Ø ${item.internal_diameter_mm ?? "--"} mm · Vol. ${item.internal_volume_l ?? "--"} L`,
    perdaBase: Number(item.calibrated_loss_mbar ?? item.loss_base_mbar ?? 0),
    comprimento: Number(item.length_m ?? 0),
  }));
  const hose = hosesDisponiveis.find((h) => h.id === hoseId) || hosesDisponiveis[0] || { id: "__SEM_MANGUEIRA__", descricao: "Nenhuma mangueira real cadastrada", perdaBase: 0, comprimento: 0 };

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

    async function carregarParametrosReais() {
      try {
        const response = await fetch(`${GATEWAY_API}/real/parameters`);
        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();

        if (!active) return;

        setRealHoses(Array.isArray(data?.hoses) ? data.hoses : []);
        setRealTanks(Array.isArray(data?.tanks) ? data.tanks : []);
        setRealLimits(data?.limits || null);
      } catch {
        if (!active) return;

        setRealHoses([]);
        setRealTanks([]);
        setRealLimits(null);
      }
    }

    carregarParametrosReais();
    const timer = window.setInterval(carregarParametrosReais, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function carregarReceitasGateway() {
      try {
        const response = await fetch(`${GATEWAY_API}/real/recipes`);
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
    if (realHoses.length && !realHoses.some((item: any) => String(item.id || item.code) === hoseId)) {
      setHoseId(String(realHoses[0].id || realHoses[0].code));
    }

    if (!realHoses.length) {
      setHoseId("");
    }
  }, [realHoses, hoseId]);


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
  const receitaExcedeLimiteÓleo = recipes.length > 0 && oilNeeded > OPERATIONAL_LIMITS.oilMaxL;
  const oilInsuficiente = recipes.length > 0 && oleoColocado < oilNeeded;

  const recipeTimeInvalid = recipes.length > 0 && (
    recipe.tempoEstimado < OPERATIONAL_LIMITS.minCycleSeconds ||
    recipe.tempoEstimado > OPERATIONAL_LIMITS.maxCycleSeconds
  );

  const pressureTargetInvalid = recipes.length > 0 && (
    recipe.pressaoAlvo < OPERATIONAL_LIMITS.pressureMinMbar ||
    recipe.pressaoAlvo > OPERATIONAL_LIMITS.pressureMaxMbar
  );

  const recipeSequenceInvalid = recipes.length > 0 && (
    recipe.b2StartSeg < 0 ||
    recipe.oilStartSeg < recipe.b2StartSeg ||
    recipe.estabilizacaoSeg < recipe.oilStartSeg ||
    recipe.tempoEstimado < recipe.estabilizacaoSeg
  );

  const recipeInvalid = receitaExcedeLimiteÓleo || recipeTimeInvalid || pressureTargetInvalid || recipeSequenceInvalid;
  const parametrosReaisIncompletos = realTanks.length === 0 || realHoses.length === 0;
  const gatewayBloqueado = !gatewayOnline;
  const sensorBloqueado = gatewayState?.hardware?.sensor_online === false;
  const emergencyBloqueada = status === "BLOQUEADO" || gatewayState?.hardware?.emergency === true;
  const inicioBloqueado = gatewayBloqueado || sensorBloqueado || emergencyBloqueada || recipeInvalid || oilInsuficiente || parametrosReaisIncompletos || !allCheckedPre || !recipes.length;

  const alarmInfo = useMemo<AlarmInfo | null>(() => {
    if (emergencyBloqueada) {
      return {
        key: "emergencia",
        severity: "red",
        title: `${ALARM_TEXT.emergency.code} - ${ALARM_TEXT.emergency.title}`,
        message: ALARM_TEXT.emergency.message,
      };
    }

    if (sensorBloqueado) {
      return {
        key: "sensor_offline",
        severity: "red",
        title: `${ALARM_TEXT.sensorOffline.code} - ${ALARM_TEXT.sensorOffline.title}`,
        message: ALARM_TEXT.sensorOffline.message,
      };
    }

    if (!gatewayOnline && phase !== "boot") {
      return {
        key: "gateway_offline",
        severity: "yellow",
        title: `${ALARM_TEXT.gatewayOffline.code} - ${ALARM_TEXT.gatewayOffline.title}`,
        message: ALARM_TEXT.gatewayOffline.message,
      };
    }

    if (recipeInvalid) {
      return {
        key: "recipe_invalid",
        severity: "yellow",
        title: `${ALARM_TEXT.recipeInvalid.code} - ${ALARM_TEXT.recipeInvalid.title}`,
        message: ALARM_TEXT.recipeInvalid.message,
      };
    }

    if (oilInsuficiente) {
      return {
        key: "oleo_insuficiente",
        severity: "yellow",
        title: `${ALARM_TEXT.oilShortage.code} - ${ALARM_TEXT.oilShortage.title}`,
        message: ALARM_TEXT.oilShortage.message,
      };
    }

    return null;
  }, [emergencyBloqueada, sensorBloqueado, gatewayOnline, phase, recipeInvalid, oilInsuficiente]);

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

    if (gatewayBloqueado) {
      addLog("Inicio bloqueado: Gateway offline.");
      return;
    }

    if (parametrosReaisIncompletos) {
      addLog("Início bloqueado: cadastre tanque/regulador e mangueira real no sistema do gerente.");
      return;
    }

    if (receitaExcedeLimiteÓleo) {
      addLog(`Inicio bloqueado: receita exige ${oilNeeded} L, acima do limite de ${OPERATIONAL_LIMITS.oilMaxL} L da IHM.`);
      return;
    }

    if (oilInsuficiente || !allCheckedPre) {
      addLog("Inicio bloqueado por checklist incompleto ou oleo insuficiente.");
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
      linhaÓleoFinalizada: false,
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
        <button onClick={() => { setDrawerOpen(false); setPhase("operacao"); setTab("informacoes"); }}>DIAGNOSTICO</button>
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
              <div>Pressão alvo: {r.pressaoAlvo} mbar</div>
              <div>Óleo/tanque: {r.oleoPorTanque} L</div>
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
          <div className="field"><label>Quantidade de tanques</label><input type="number" min={OPERATIONAL_LIMITS.tankMin} max={OPERATIONAL_LIMITS.tankMax} step={1} value={qtdTanques} onChange={(e) => setQtdTanques(clampInteger(Number(e.target.value), OPERATIONAL_LIMITS.tankMin, OPERATIONAL_LIMITS.tankMax))} /></div>
          <div className="field"><label>Mangueira</label><select value={hoseId} onChange={(e) => setHoseId(e.target.value as HoseKey)}>{hosesDisponiveis.map((h) => <option key={h.id} value={h.id}>{h.descricao}</option>)}</select></div>
          <div className="field"><label>Óleo no reservatorio (L)</label><input type="number" min={OPERATIONAL_LIMITS.oilMinL} max={OPERATIONAL_LIMITS.oilMaxL} step={OPERATIONAL_LIMITS.oilStepL} value={oleoColocado} onChange={(e) => setÓleoColocado(clampNumber(Number(e.target.value), OPERATIONAL_LIMITS.oilMinL, OPERATIONAL_LIMITS.oilMaxL))} /></div>
          <div className={oilInsuficiente || receitaExcedeLimiteÓleo ? "oil-warning limit-box" : "oil-ok limit-box"}>
            <b>Óleo necessario: {oilNeeded} L</b>
            <span>Limite operacional da IHM: {OPERATIONAL_LIMITS.oilMinL} a {OPERATIONAL_LIMITS.oilMaxL} L.</span>
            {receitaExcedeLimiteÓleo && <span>Receita acima do limite demonstrativo. Ajuste a receita no gerente.</span>}
            {gatewayBloqueado && <span>Gateway offline: inicio bloqueado ate normalizar a comunicacao.</span>}
          </div>
        </div>
        <button className="next-btn standard-btn compact" disabled={oilInsuficiente || receitaExcedeLimiteÓleo || !recipes.length} onClick={() => setPhase("checklist_pre")}>CONTINUAR</button>
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
          <p><b>Óleo colocado:</b> {oleoColocado} L</p>
          <p><b>Óleo necessario:</b> {oilNeeded} L</p>
          <p><b>Pressão alvo:</b> {recipe.pressaoAlvo} mbar</p>
          {oilInsuficiente && <p className="warn-text">Volume de óleo insuficiente para iniciar.</p>}
          {gatewayBloqueado && <p className="warn-text">Gateway offline. Início bloqueado.</p>}
          {sensorBloqueado && <p className="warn-text">Sensor de pressão offline. Início bloqueado.</p>}
          {recipeTimeInvalid && <p className="warn-text">Tempo da receita fora do limite operacional.</p>}
          {pressureTargetInvalid && <p className="warn-text">Pressão alvo fora da faixa permitida.</p>}
          {recipeSequenceInvalid && <p className="warn-text">Sequência da receita inválida: revise B2, óleo, estabilizaÃ§Ã£o e tempo final.</p>}
          {receitaExcedeLimiteÓleo && <p className="warn-text">Receita exige mais óleo que o limite demonstrativo.</p>}
          {receitaExcedeLimiteÓleo && <p className="warn-text">Receita exige mais oleo que o limite operacional da IHM.</p>}
          {gatewayBloqueado && <p className="warn-text">Gateway offline. Inicio bloqueado ate normalizar a comunicacao.</p>}
        </div>
        <div className="button-row">
          <button className="cancel-btn standard-btn compact" onClick={() => setPhase("inicial")}>CANCELAR</button>
          <button className="start-btn standard-btn compact" disabled={inicioBloqueado} onClick={iniciarOperacao}>INICIAR</button>
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
            <div className="machines-layout machines-priority">
              <div className="pump-stack pump-stack-priority">
                <PumpCard name="B1" subtitle="Bomba primaria" on={b1Ligada} detail="Evacuacao inicial do tanque e manutencao da linha de vacuo." />
                <PumpCard name="B2" subtitle="Roots simulada" on={b2Ligada} detail="Reforco de vacuo acionado somente dentro da faixa permitida." />
                <PumpCard name="OLEO" subtitle="Linha de injeção" on={oilLigada} detail="Entrada controlada de oleo conforme etapa da receita." />
              </div>

              <div className="machine-info-grid pump-info-compact">
                <article><span>Pressão geral</span><b>{fmt(pressaoMaquina, "mbar")}</b><small>Antes da perda da linha</small></article>
                <article><span>Pressão no regulador</span><b>{fmt(pressaoMedia, "mbar")}</b><small>Valor compensado no tanque</small></article>
                <article><span>Gateway</span><b>{gatewayOnline ? "ONLINE" : "OFFLINE"}</b><small>Comunicacao com gerente</small></article>
                <article><span>Seguranca</span><b>{alarmInfo?.severity === "red" ? "BLOQUEADO" : "LIBERADO"}</b><small>Intertravamento</small></article>
              </div>
            </div>
          )}

          {tab === "oleo" && (
            <div className="oil-layout oil-layout-focused">
              <article className="oil-flow-card oil-flow-main">
                <h3>Linha de injeção de oleo</h3>

                <div className="oil-inline-metrics">
                  <div><span>Reservatorio</span><b>{fmt(oilRestante, "L")}</b></div>
                  <div><span>Pressão tanque</span><b>{fmt(pressaoMedia, "mbar")}</b></div>
                  <div><span>Injetado</span><b>{fmt(oilInjetado, "L")}</b></div>
                  <div><span>Vazao</span><b>{fmt(oilFlow, "L/min")}</b></div>
                </div>

                <div className={`oil-demo-line ${oilLigada ? "active" : ""}`}>
                  <div className="pipe-reservoir oil-source-with-level">
                    <div className="pipe-reservoir-oil" style={{ height: `${Math.max(6, Math.min(92, (oilRestante / Math.max(oleoColocado, 1)) * 100))}%` }} />
                  </div>
                  <div className="pipe-hose">{oilLigada && <><span /><span /><span /><span /></>}</div>
                  <div className="pipe-tank">
                    <div className="pipe-tank-oil" style={{ height: `${Math.max(4, Math.min(80, oilInjetado / Math.max(oilNeeded, 1) * 80))}%` }} />
                  </div>
                </div>

                <p>{oilLigada ? "Injetando oleo na etapa atual" : "Linha aguardando etapa de oleo"}</p>
              </article>

              <div className="oil-metrics oil-metrics-focused">
                <article><span>Óleo inicial</span><b>{fmt(oleoColocado, "L")}</b></article>
                <article><span>Óleo necessario</span><b>{fmt(oilNeeded, "L")}</b></article>
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

              <div className="diagnostic-panel">
                <p><b>ID:</b> {operationId || "--"}</p>
                <p><b>Receita:</b> {recipe.title}</p>
                <p><b>Operador:</b> OPERADOR 01</p>
                <p><b>Tanques:</b> {qtdTanques}</p>
                <p><b>Mangueira:</b> {hose.descricao}</p>
                <p><b>Tempo:</b> {timeFmt(elapsedLive)}</p>
                <p><b>Gateway:</b> {gatewayOnline ? "Online" : "Offline"}</p>
                <p><b>Sensor pressão:</b> {sensorBloqueado ? "Falha" : "Online"}</p>
                <p><b>Emergência:</b> {emergencyBloqueada ? "Ativa/Bloqueada" : "Normal"}</p>
                <p><b>Limites:</b> {recipeInvalid ? "Receita inválida" : "Conforme"}</p>
                <p><b>Início:</b> {inicioBloqueado ? "Bloqueado" : "Liberado"}</p>
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
          <p><b>Causa provÃ¡vel:</b> {alarmInfo ? alarmInfo.message : "Nenhuma condição crítica detectada."}</p>
          <p><b>AÃ§Ã£o recomendada:</b> {alarmInfo?.severity === "red" ? "Parar o ciclo, verificar bancada e reconhecer a falha." : alarmInfo ? "Verificar condição indicada e corrigir antes de iniciar." : "OperaÃ§Ã£o liberada."}</p>
          <p><b>Pressão maquina:</b> {fmt(pressaoMaquina, "mbar")}</p>
          <p><b>Pressão media:</b> {fmt(pressaoMedia, "mbar")}</p>
          <p><b>Óleo colocado:</b> {oleoColocado} L</p>
          <p><b>Óleo necessario:</b> {oilNeeded} L</p>
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
          <p><b>Pressão final:</b> {fmt(pressaoMedia, "mbar")}</p>
          <p><b>Óleo colocado:</b> {oleoColocado} L</p>
          <p><b>Óleo injetado:</b> {fmt(oilInjetado, "L")}</p>
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
