import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell, type View } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { DigitalTwinPage } from "./pages/DigitalTwinPage";
import { OperationPage } from "./pages/OperationPage";
import { ParametersPage } from "./pages/ParametersPage";
import { TraceabilityPage } from "./pages/TraceabilityPage";
import "./styles.css";

const API = "http://127.0.0.1:8020/api";

type TwinTab = "scenarios" | "manual" | "result" | "assistant" | "technical";
type ParamTab = "tanks" | "hoses" | "recipes" | "formulas" | "operators";
type ReportTab = "operations" | "simulations";

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(API + path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`${response.status} - ${await response.text()}`);
  }

  return response.json();
}

async function safe(path: string, options: RequestInit = {}) {
  try {
    return { ok: true, data: await request(path, options), error: "" };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function fmt(value: unknown, suffix = "") {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return "--";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${suffix ? " " + suffix : ""}`;
}

function statusLabel(status: unknown) {
  const value = String(status || "").toLowerCase();

  const map: Record<string, string> = {
    success: "Operacional",
    warning: "AtenÃƒÂ§ÃƒÂ£o",
    critical: "CrÃƒÂ­tico",
    running: "Em execuÃƒÂ§ÃƒÂ£o",
    paused: "Pausado",
    stopped: "Parado",
    concluido: "ConcluÃƒÂ­do",
    abortado: "Abortado",
    em_andamento: "Em andamento",
    emergency: "EmergÃƒÂªncia",
    available: "DisponÃƒÂ­vel",
    attention: "AtenÃƒÂ§ÃƒÂ£o",
  };

  return map[value] || String(status || "--");
}

function tone(status: unknown) {
  const value = String(status || "").toLowerCase();

  if (["success", "concluido", "running", "ok", "operacional", "available"].includes(value)) return "ok";
  if (["warning", "paused", "em_andamento", "atenÃƒÂ§ÃƒÂ£o", "atencao", "attention"].includes(value)) return "warn";
  if (["critical", "abortado", "emergency", "falha", "fault"].includes(value)) return "bad";

  return "neutral";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function inPeriod(dateValue: string, period: string) {
  if (period === "all") return true;
  if (!dateValue) return false;

  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return true;

  const date = d.toISOString().slice(0, 10);

  if (period === "today") return date === todayISO();
  if (period === "week") return date >= daysAgo(7);
  if (period === "month") return date >= daysAgo(30);

  return true;
}

function Badge({ value }: { value: unknown }) {
  return <span className={`badge ${tone(value)}`}>{statusLabel(value)}</span>;
}

function Metric({ label, value, detail, status }: { label: string; value: React.ReactNode; detail?: string; status?: unknown }) {
  return (
    <article className={`metric ${tone(status)}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function Section({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="section">
      <div className="sectionHeader">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <strong>Sem dados disponÃƒÂ­veis</strong>
      <span>{text}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          )) : (
            <tr>
              <td colSpan={columns.length}>
                <Empty text="Nenhum registro localizado." />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TankCard({ item }: { item: any }) {
  const risk = Number(item?.collapse_risk_pct || 0);
  const oil = Number(item?.oil_volume_liters || 0);
  const pressure = Number(item?.pressure_mbar || 0);

  const gasHeight = Math.max(18, Math.min(72, 74 - risk * 0.22));
  const pressureHeight = Math.max(8, Math.min(68, risk));
  const oilHeight = Math.max(5, Math.min(42, oil * 5));

  return (
    <article className={`tankCard ${risk >= 82 ? "riskHigh" : risk >= 65 ? "riskMedium" : "riskLow"}`}>
      <div className="tankTop">
        <div>
          <strong>{item?.tank?.code || "Tanque de Processo"}</strong>
          <span>{item?.hose?.code || "Mangueira de VÃƒÂ¡cuo"}</span>
        </div>
        <Badge value={risk >= 82 ? "critical" : risk >= 65 ? "warning" : "success"} />
      </div>

      <div className="tankBody">
        <div className="tankShell">
          <div className="tankFill gas" style={{ height: `${gasHeight}%` }} />
          <div className="tankFill pressure" style={{ height: `${pressureHeight}%` }} />
          <div className="tankFill oil" style={{ height: `${oilHeight}%` }} />
        </div>

        <div className="tankReadings">
          <div><span>PressÃƒÂ£o Atual</span><b>{fmt(pressure, "mbar")}</b></div>
          <div><span>Curva Esperada</span><b>{fmt(item?.expected_pressure_mbar, "mbar")}</b></div>
          <div><span>Volume de Ãƒâ€œleo</span><b>{fmt(item?.oil_volume_liters, "L")}</b></div>
          <div><span>Risco Estrutural</span><b>{fmt(risk, "%")}</b></div>
          <div><span>Perda na Mangueira</span><b>{fmt(item?.hose_loss_mbar, "mbar")}</b></div>
          <div><span>Sinal</span><b>{item?.status_light || "green"}</b></div>
        </div>
      </div>

      <div className="legend">
        <span><i className="gasDot" />GÃƒÂ¡s</span>
        <span><i className="pressureDot" />PressÃƒÂ£o</span>
        <span><i className="oilDot" />Ãƒâ€œleo</span>
      </div>
    </article>
  );
}

function Chart({ points }: { points: any[] }) {
  if (!points?.length) {
    return <Empty text="Curva operacional indisponÃƒÂ­vel para este registro." />;
  }

  const values = points.flatMap((p) => [
    Number(p.real_pressure_mbar ?? p.pressure_mbar ?? 0),
    Number(p.expected_pressure_mbar ?? 0),
    Number(p.effective_pressure_mbar ?? 0),
  ]);

  const max = Math.max(...values, 10);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);

  function line(key: string, fallback?: string) {
    return points.map((p, index) => {
      const value = Number(p[key] ?? (fallback ? p[fallback] : 0) ?? 0);
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 95 - ((value - min) / span) * 86;
      return `${x},${y}`;
    }).join(" ");
  }

  return (
    <div className="chartBox">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="0" y1="95" x2="100" y2="95" className="axis" />
        <line x1="0" y1="9" x2="0" y2="95" className="axis" />
        <polyline points={line("expected_pressure_mbar")} className="expectedLine" />
        <polyline points={line("real_pressure_mbar", "pressure_mbar")} className="realLine" />
        <polyline points={line("effective_pressure_mbar")} className="riskLine" />
      </svg>

      <div className="chartLegend">
        <span><i className="realDot" />PressÃƒÂ£o real/simulada</span>
        <span><i className="expectedDot" />Curva esperada</span>
        <span><i className="riskDot" />Carga estrutural</span>
      </div>
    </div>
  );
}


const EQUIPMENT_SPECS = {
  primaryPump: {
    model: "Leybold SOGEVAC SV 630 B",
    technology: "Bomba rotativa de palhetas lubrificada a ÃƒÂ³leo",
    nominalSpeed50Hz: "640 mÃ‚Â³/h",
    nominalSpeed60Hz: "755 mÃ‚Â³/h",
    ultimatePressureNoGasBallast: "Ã¢â€°Â¤ 0,08 mbar",
    ultimatePressureGasBallast: "Ã¢â€°Â¤ 0,7 mbar",
    oilFilling: "20 L",
    motorPower50Hz: "15 kW",
    nominalRpm50Hz: "820 rpm",
    inlet: "DN 100 PN 10 / DN 100 ISO-K",
    role: "Bomba de apoio responsÃƒÂ¡vel pela evacuaÃƒÂ§ÃƒÂ£o inicial e sustentaÃƒÂ§ÃƒÂ£o do conjunto bomba secundÃƒÂ¡ria."
  },
  rootsPump: {
    model: "Leybold RUVAC WSU 2001",
    technology: "Bomba secundÃƒÂ¡ria com motor blindado refrigerado a ar",
    nominalSpeed50Hz: "2050 mÃ‚Â³/h",
    nominalSpeed60Hz: "2460 mÃ‚Â³/h",
    effectiveSpeedWithSogevac50Hz: "1850 mÃ‚Â³/h",
    effectiveSpeedWithSogevac60Hz: "2100 mÃ‚Â³/h",
    ultimatePressure: "< 4 Ãƒâ€” 10Ã¢ÂÂ»Ã‚Â² mbar",
    maxDifferentialPressure: "50 mbar",
    leakRate: "< 1 Ãƒâ€” 10Ã¢ÂÂ»Ã¢ÂÂ´ mbarÃ‚Â·l/s",
    role: "EstÃƒÂ¡gio de reforÃƒÂ§o usado apÃƒÂ³s a pressÃƒÂ£o entrar na faixa segura de acionamento."
  }
};



function ComponentHealthPanel({ state, allTanks, allHoses }: any) {
  const tankStates = Array.isArray(state?.tank_states) ? state.tank_states : [];
  const firstTank = tankStates[0] || {};
  const avgPressure = tankStates.length
    ? tankStates.reduce((sum: number, item: any) => sum + Number(item.pressure_mbar || 0), 0) / tankStates.length
    : Number(firstTank.pressure_mbar || 0);

  const pumpRows = [
    [
      <b>Bomba primÃƒÂ¡ria</b>,
      EQUIPMENT_SPECS.primaryPump.model,
      state?.primary_pump?.running ? "Ligada" : "Pronta",
      "98%",
      EQUIPMENT_SPECS.primaryPump.nominalSpeed50Hz,
      EQUIPMENT_SPECS.primaryPump.role
    ],
    [
      <b>Bomba secundÃƒÂ¡ria</b>,
      EQUIPMENT_SPECS.rootsPump.model,
      state?.roots_pump?.running ? "Ligada" : "Intertravada",
      state?.roots_pump?.running ? "96%" : "Aguardando faixa",
      EQUIPMENT_SPECS.rootsPump.nominalSpeed50Hz,
      EQUIPMENT_SPECS.rootsPump.role
    ]
  ];

  const tankRows = (tankStates.length ? tankStates : allTanks).map((item: any, index: number) => {
    const tank = item?.tank || item;
    const pressure = Number(item?.pressure_mbar ?? item?.expected_pressure_mbar ?? 0);
    const oil = Number(item?.oil_volume_liters ?? 0);
    const risk = Number(item?.collapse_risk_pct ?? 0);

    return [
      <b>{tank?.code || item?.code || `TQ-${index + 1}`}</b>,
      tank?.type || item?.type || "Tanque de processo",
      fmt(pressure, "mbar"),
      fmt(oil, "L"),
      fmt(risk, "%"),
      risk >= 82 ? <Badge value="critical" /> : risk >= 65 ? <Badge value="warning" /> : <Badge value="success" />
    ];
  });

  const hoseRows = allHoses.map((hose: any) => [
    <b>{hose.code || `MG-${hose.id}`}</b>,
    fmt(hose.length_m, "m"),
    fmt(hose.diameter_in, "pol"),
    fmt(hose.loss_factor),
    Number(hose.loss_factor || 0) > 1 ? <Badge value="warning" /> : <Badge value="success" />,
    "ConexÃƒÂ£o entre bomba, tanque e processo de vÃƒÂ¡cuo."
  ]);

  const sensorRows = (tankStates.length ? tankStates : [{ tank: { code: "TQ-SIM" }, pressure_mbar: avgPressure }]).map((item: any, index: number) => {
    const tank = item?.tank || {};
    const pressure = Number(item?.pressure_mbar ?? item?.expected_pressure_mbar ?? 0);
    const risk = Number(item?.collapse_risk_pct ?? 0);

    return [
      <b>{`SP-${tank.code || index + 1}`}</b>,
      tank.code || `Tanque ${index + 1}`,
      "PressÃƒÂ£o",
      fmt(pressure, "mbar"),
      risk >= 82 ? "CrÃƒÂ­tico" : risk >= 65 ? "AtenÃƒÂ§ÃƒÂ£o" : "Operacional",
      fmt(risk >= 82 ? 62 : risk >= 65 ? 82 : 98, "%")
    ];
  });

  return (
    <div className="componentTraceStack">
      <Section title="Rastreabilidade de mÃƒÂ¡quinas e peÃƒÂ§as" subtitle="Status, desempenho e leitura dos principais componentes do processo.">
        <Table columns={["Componente", "IdentificaÃƒÂ§ÃƒÂ£o", "Status", "Desempenho (%)", "Leitura (unidade do sensor) tÃƒÂ©cnica", "FunÃƒÂ§ÃƒÂ£o no processo"]} rows={pumpRows} />
      </Section>

      <Section title="Tanques do processo" subtitle="Leitura (unidade do sensor)s numÃƒÂ©ricas dos tanques usados no ciclo.">
        <Table columns={["Tanque", "Tipo", "PressÃƒÂ£o", "Ãƒâ€œleo", "Risco", "Status"]} rows={tankRows} />
      </Section>

      <Section title="Mangueiras de vÃƒÂ¡cuo" subtitle="Componentes de ligaÃƒÂ§ÃƒÂ£o entre bombas, tanque e processo.">
        <Table columns={["Mangueira", "Comprimento (m)", "DiÃƒÂ¢metro (mm)", "Fator de perda (multiplicador)", "Status", "FunÃƒÂ§ÃƒÂ£o"]} rows={hoseRows} />
      </Section>

      <Section title="Sensores do processo" subtitle="Leitura (unidade do sensor)s usadas para controle, diagnÃƒÂ³stico e rastreabilidade.">
        <Table columns={["Sensor", "Tanque", "VariÃƒÂ¡vel", "Leitura (unidade do sensor)", "Status", "Desempenho (%)"]} rows={sensorRows} />
      </Section>
    </div>
  );
}



function SimulationTraceability({ result, state, selectedScenario, hoses, tanks, config }: any) {
  if (!result) return null;

  const metrics = result.metrics || {};
  const timeline = result.timeline || [];
  const finalPoint = timeline[timeline.length - 1] || {};
  const selectedHose = hoses.find((hose: any) => String(hose.id) === String(config?.hose_id) || String(hose.code) === String(config?.hose_id)) || hoses[0] || {};
  const selectedTank = tanks.find((tank: any) => String(tank.type) === String(config?.tank_type) || String(tank.id) === String(config?.tank_id)) || tanks[0] || {};

  const risk = Number(metrics.max_collapse_risk_pct || metrics.collapse_risk_pct || finalPoint.collapse_risk_pct || 0);
  const finalPressure = Number(metrics.final_real_pressure_mbar ?? finalPoint.real_pressure_mbar ?? finalPoint.pressure_mbar ?? 0);
  const estimatedTime = Number(metrics.estimated_time_seconds || metrics.cycle_time_seconds || 0);
  const oilFlow = Number(config?.oil_flow_l_min || 0);
  const hoseLoss = Number(selectedHose?.loss_factor || finalPoint.hose_loss_mbar || 0);

  const simulationStatus = result.status === "success"
    ? "Ciclo simulado aprovado"
    : result.status === "warning"
      ? "Ciclo simulado aprovado com restriÃƒÂ§ÃƒÂ£o"
      : "Ciclo simulado reprovado";

  const componentRows = [
    [<b>Bomba primÃƒÂ¡ria</b>, EQUIPMENT_SPECS.primaryPump.model, state?.primary_pump?.running ? "Ligada" : "Pronta", "98%", EQUIPMENT_SPECS.primaryPump.nominalSpeed50Hz, EQUIPMENT_SPECS.primaryPump.role],
    [<b>Bomba secundÃƒÂ¡ria</b>, EQUIPMENT_SPECS.rootsPump.model, finalPressure <= Number(config?.roots_start_pressure_mbar || 50) ? "Liberada" : "Bloqueada", finalPressure <= Number(config?.roots_start_pressure_mbar || 50) ? "96%" : "Aguardando faixa", EQUIPMENT_SPECS.rootsPump.nominalSpeed50Hz, "Acionamento condicionado ÃƒÂ  pressÃƒÂ£o segura."],
    [<b>Mangueira de vÃƒÂ¡cuo</b>, selectedHose?.code || `MG-${config?.hose_id || "--"}`, hoseLoss > 1 ? "Perda elevada" : "Operacional", fmt(Math.max(70, 100 - hoseLoss * 12), "%"), `Fator ${fmt(hoseLoss)}`, "Perda de carga e restriÃƒÂ§ÃƒÂ£o de fluxo."],
    [<b>Tanque de processo</b>, selectedTank?.code || config?.tank_type || "Tanque simulado", risk >= 82 ? "CrÃƒÂ­tico" : risk >= 65 ? "AtenÃƒÂ§ÃƒÂ£o" : "Operacional", fmt(Math.max(55, 100 - risk * 0.45), "%"), fmt(risk, "%"), "Margem estrutural e pressÃƒÂ£o efetiva."],
    [<b>Sensor de pressÃƒÂ£o</b>, `SP-${selectedTank?.code || "SIM"}`, config?.simulate_sensor_failure ? "Falha simulada" : "Online", config?.simulate_sensor_failure ? "35%" : "98%", fmt(finalPressure, "mbar"), "Mede pressÃƒÂ£o do tanque e alimenta diagnÃƒÂ³stico."],
    [<b>Sistema de ÃƒÂ³leo</b>, "InjeÃƒÂ§ÃƒÂ£o de ÃƒÂ³leo", oilFlow < 1.5 ? "VazÃƒÂ£o baixa" : "Operacional", fmt(Math.min(100, Math.max(40, oilFlow * 45)), "%"), fmt(oilFlow, "L/min"), "Afeta vedaÃƒÂ§ÃƒÂ£o, estabilidade da curva e proteÃƒÂ§ÃƒÂ£o do conjunto."]
  ];

  const actionRows = [
    [<b>PreparaÃƒÂ§ÃƒÂ£o</b>, "ParÃƒÂ¢metros carregados", selectedTank?.code || config?.tank_type || "--", selectedHose?.code || `MG-${config?.hose_id || "--"}`, "Configuracao aplicada ao ciclo simulado."],
    [<b>EvacuaÃƒÂ§ÃƒÂ£o inicial</b>, "Bomba primÃƒÂ¡ria em atuaÃƒÂ§ÃƒÂ£o", fmt(estimatedTime * 0.35, "s"), fmt(finalPressure, "mbar"), "ReduÃƒÂ§ÃƒÂ£o inicial da pressÃƒÂ£o no tanque."],
    [<b>Acionamento da bomba secundÃƒÂ¡ria</b>, finalPressure <= Number(config?.roots_start_pressure_mbar || 50) ? "Liberado" : "Bloqueado", fmt(config?.roots_start_pressure_mbar, "mbar"), "Intertravamento", "A bomba secundÃƒÂ¡ria sÃƒÂ³ entra em faixa segura."],
    [<b>InjeÃƒÂ§ÃƒÂ£o de ÃƒÂ³leo</b>, oilFlow < 1.5 ? "Insuficiente" : "Normal", fmt(oilFlow, "L/min"), "VedaÃƒÂ§ÃƒÂ£o", "CondiÃƒÂ§ÃƒÂ£o usada para estabilidade e risco."],
    [<b>Fechamento</b>, simulationStatus, fmt(risk, "%"), "Resultado", result.recommendation || "Sem recomendaÃƒÂ§ÃƒÂ£o adicional."]
  ];

  const reportRows = [
    [<b>Status final</b>, <Badge value={result.status} />, simulationStatus],
    [<b>PressÃƒÂ£o final (mbar)</b>, fmt(finalPressure, "mbar"), "Valor final calculado pela simulaÃƒÂ§ÃƒÂ£o."],
    [<b>Tempo estimado (s)</b>, fmt(estimatedTime, "s"), "DuraÃƒÂ§ÃƒÂ£o (s) prevista do ciclo."],
    [<b>Risco mÃƒÂ¡ximo (%)</b>, fmt(risk, "%"), risk >= 82 ? "Reprovado" : risk >= 65 ? "Aprovado com restriÃƒÂ§ÃƒÂ£o" : "Aprovado"],
    [<b>CenÃƒÂ¡rio</b>, selectedScenario || "Configuracao", "Origem da simulaÃƒÂ§ÃƒÂ£o usada no diagnÃƒÂ³stico."]
  ];

  return (
    <div className="traceabilityStack">
      <div className="traceHeader">
        <div>
          <h3>Rastreabilidade da simulaÃƒÂ§ÃƒÂ£o</h3>
          <p>Registro tÃƒÂ©cnico por mÃƒÂ¡quina, peÃƒÂ§a, sensor, mangueira e aÃƒÂ§ÃƒÂ£o simulada.</p>
        </div>
        <Badge value={result.status} />
      </div>

      <div className="tracePanel">
        <h3>MÃƒÂ¡quinas, peÃƒÂ§as e sensores</h3>
        <Table columns={["Componente", "IdentificaÃƒÂ§ÃƒÂ£o", "Status", "Desempenho (%)", "Leitura (unidade do sensor)", "Impacto no processo"]} rows={componentRows} />
      </div>

      <div className="tracePanel">
        <h3>AÃƒÂ§ÃƒÂµes da operaÃƒÂ§ÃƒÂ£o simulada</h3>
        <Table columns={["Etapa", "Status", "ReferÃƒÂªncia", "Evento", "Registro tÃƒÂ©cnico"]} rows={actionRows} />
      </div>

      <div className="tracePanel">
        <h3>RelatÃƒÂ³rio da simulaÃƒÂ§ÃƒÂ£o</h3>
        <Table columns={["Item", "Valor", "InterpretaÃƒÂ§ÃƒÂ£o"]} rows={reportRows} />
      </div>
    </div>
  );
}



/* TSEA_PATCH_GEMEO_RASTREABILIDADE_FINAL_START */

function tseaReadStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function tseaWriteStorage(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

const TSEA_EQUIPMENT_SPECS = {
  primaryPump: {
    label: "Bomba primÃƒÂ¡ria",
    model: "Leybold SOGEVAC SV 630 B",
    technology: "Bomba rotativa de palhetas lubrificada a ÃƒÂ³leo",
    nominalSpeed50Hz: "640 mÃ‚Â³/h",
    nominalSpeed60Hz: "755 mÃ‚Â³/h",
    ultimatePressureNoGasBallast: "Ã¢â€°Â¤ 0,08 mbar",
    ultimatePressureGasBallast: "Ã¢â€°Â¤ 0,7 mbar",
    oilFilling: "20 L",
    motorPower50Hz: "15 kW",
    nominalRpm50Hz: "820 rpm",
    role: "EvacuaÃƒÂ§ÃƒÂ£o inicial e sustentaÃƒÂ§ÃƒÂ£o do conjunto de vÃƒÂ¡cuo."
  },
  secondaryPump: {
    label: "Bomba secundÃƒÂ¡ria",
    model: "Leybold RUVAC WSU 2001",
    technology: "Bomba secundÃƒÂ¡ria tipo bomba secundÃƒÂ¡ria com motor blindado refrigerado a ar",
    nominalSpeed50Hz: "2050 mÃ‚Â³/h",
    nominalSpeed60Hz: "2460 mÃ‚Â³/h",
    effectiveSpeedWithSogevac50Hz: "1850 mÃ‚Â³/h",
    ultimatePressure: "< 4 Ãƒâ€” 10Ã¢ÂÂ»Ã‚Â² mbar",
    maxDifferentialPressure: "50 mbar",
    role: "ReforÃƒÂ§o do vÃƒÂ¡cuo apÃƒÂ³s entrada em faixa segura de acionamento."
  }
};

function tseaBuildSimulationResult(config: any, state: any, hoses: any[], tanks: any[], scenarioName = "CenÃƒÂ¡rio manual") {
  const selectedHose = hoses.find((hose: any) => String(hose.id) === String(config?.hose_id) || String(hose.code) === String(config?.hose_id)) || hoses[0] || {};
  const selectedTank = tanks.find((tank: any) => String(tank.id) === String(config?.tank_id) || String(tank.type) === String(config?.tank_type)) || tanks[0] || {};

  const pressureTarget = Number(config?.target_pressure_mbar || config?.pressaoFinal || 6.5);
  const secondaryStart = Number(config?.roots_start_pressure_mbar || config?.secondary_start_pressure_mbar || 50);
  const oilFlow = Number(config?.oil_flow_l_min || config?.vazaoOleo || 2);
  const oilDelay = Number(config?.oil_delay_seconds || 0);
  const pumpHealth = Number(config?.pump_health_factor || 1);
  const hoseLoss = Number(selectedHose?.loss_factor || 0.8);
  const maxCycle = Number(config?.max_cycle_seconds || 900);
  const tankVolume = Number(selectedTank?.volume_liters || 1250);

  const risk = Math.max(4, Math.min(98,
    18 +
    hoseLoss * 14 +
    Math.max(0, 2 - oilFlow) * 16 +
    oilDelay * 0.18 +
    Math.max(0, 1 - pumpHealth) * 42 +
    (config?.simulate_sensor_failure ? 18 : 0) +
    (config?.simulate_hose_leak ? 24 : 0)
  ));

  const estimatedTime = Math.round(Math.min(maxCycle, (tankVolume / 640) * 220 + hoseLoss * 42 + oilDelay * 1.6 + (1 - pumpHealth) * 180));
  const finalPressure = Math.max(pressureTarget, pressureTarget + hoseLoss * 0.7 + Math.max(0, 2 - oilFlow) * 1.8 + (config?.simulate_hose_leak ? 8 : 0));
  const margin = Number(selectedTank?.structural_limit_mbar || 35) - finalPressure;

  const status = risk >= 82 || margin < 0
    ? "critical"
    : risk >= 65
      ? "warning"
      : "success";

  const diagnosis = status === "success"
    ? "SimulaÃƒÂ§ÃƒÂ£o aprovada. O ciclo mantÃƒÂ©m margem operacional aceitÃƒÂ¡vel."
    : status === "warning"
      ? "SimulaÃƒÂ§ÃƒÂ£o aprovada com restriÃƒÂ§ÃƒÂ£o. Existe tendÃƒÂªncia de perda, atraso ou reduÃƒÂ§ÃƒÂ£o de margem."
      : "SimulaÃƒÂ§ÃƒÂ£o reprovada. O ciclo apresenta risco elevado e nÃƒÂ£o deve ser liberado sem revisÃƒÂ£o.";

  const recommendation = status === "success"
    ? "Manter parÃƒÂ¢metros e registrar o cenÃƒÂ¡rio como referÃƒÂªncia operacional."
    : status === "warning"
      ? "Revisar mangueira, vazÃƒÂ£o de ÃƒÂ³leo, sensores e condiÃƒÂ§ÃƒÂ£o das bombas antes da execuÃƒÂ§ÃƒÂ£o real."
      : "Bloquear execuÃƒÂ§ÃƒÂ£o, revisar vedaÃƒÂ§ÃƒÂ£o, mangueira, bomba secundÃƒÂ¡ria, sensores e limites estruturais.";

  const timeline = Array.from({ length: 18 }).map((_, index) => {
    const step = index / 17;
    const pressure = Math.max(finalPressure, 1000 * Math.exp(-step * 5.5) + finalPressure);
    return {
      second: Math.round(step * estimatedTime),
      pressure_mbar: pressure,
      real_pressure_mbar: pressure + hoseLoss * step * 2.2,
      expected_pressure_mbar: Math.max(finalPressure, pressure * 0.93),
      effective_pressure_mbar: finalPressure + risk * step * 0.18,
      collapse_risk_pct: Math.round(risk * step),
      hose_loss_mbar: hoseLoss
    };
  });

  return {
    id: `SIM-${Date.now().toString(36).toUpperCase()}`,
    created_at: new Date().toISOString(),
    scenario: scenarioName,
    status,
    diagnosis,
    recommendation,
    config,
    metrics: {
      estimated_time_seconds: estimatedTime,
      final_real_pressure_mbar: finalPressure,
      max_collapse_risk_pct: risk,
      safety_margin_mbar: margin,
      oil_flow_l_min: oilFlow,
      hose_loss_factor: hoseLoss
    },
    timeline
  };
}

function TseaComponentHealthPanel({ state, allTanks, allHoses }: any) {
  const tankStates = Array.isArray(state?.tank_states) ? state.tank_states : [];
  const sourceTanks = tankStates.length ? tankStates : allTanks;

  const pumpRows = [
    [
      <b>{TSEA_EQUIPMENT_SPECS.primaryPump.label}</b>,
      TSEA_EQUIPMENT_SPECS.primaryPump.model,
      state?.primary_pump?.running ? "Ligada" : "Pronta",
      "98%",
      TSEA_EQUIPMENT_SPECS.primaryPump.nominalSpeed50Hz,
      TSEA_EQUIPMENT_SPECS.primaryPump.role
    ],
    [
      <b>{TSEA_EQUIPMENT_SPECS.secondaryPump.label}</b>,
      TSEA_EQUIPMENT_SPECS.secondaryPump.model,
      state?.roots_pump?.running ? "Ligada" : "Intertravada",
      state?.roots_pump?.running ? "96%" : "Aguardando faixa",
      TSEA_EQUIPMENT_SPECS.secondaryPump.nominalSpeed50Hz,
      TSEA_EQUIPMENT_SPECS.secondaryPump.role
    ]
  ];

  const tankRows = sourceTanks.map((item: any, index: number) => {
    const tank = item?.tank || item;
    const pressure = Number(item?.pressure_mbar ?? item?.expected_pressure_mbar ?? 0);
    const oil = Number(item?.oil_volume_liters ?? 0);
    const risk = Number(item?.collapse_risk_pct ?? 0);

    return [
      <b>{tank?.code || item?.code || `TQ-${index + 1}`}</b>,
      tank?.type || item?.type || "Tanque de processo",
      fmt(pressure, "mbar"),
      fmt(oil, "L"),
      fmt(risk, "%"),
      risk >= 82 ? <Badge value="critical" /> : risk >= 65 ? <Badge value="warning" /> : <Badge value="success" />
    ];
  });

  const hoseRows = allHoses.map((hose: any, index: number) => [
    <b>{hose.code || `MG-${index + 1}`}</b>,
    fmt(hose.length_m, "m"),
    fmt(hose.diameter_in, "pol"),
    fmt(hose.loss_factor),
    Number(hose.loss_factor || 0) > 1 ? <Badge value="warning" /> : <Badge value="success" />,
    "ConexÃƒÂ£o entre bomba, tanque e processo de vÃƒÂ¡cuo."
  ]);

  const sensorRows = sourceTanks.map((item: any, index: number) => {
    const tank = item?.tank || item;
    const pressure = Number(item?.pressure_mbar ?? item?.expected_pressure_mbar ?? 0);
    const risk = Number(item?.collapse_risk_pct ?? 0);

    return [
      <b>{`SP-${tank?.code || item?.code || index + 1}`}</b>,
      tank?.code || item?.code || `Tanque ${index + 1}`,
      "PressÃƒÂ£o",
      fmt(pressure, "mbar"),
      risk >= 82 ? "CrÃƒÂ­tico" : risk >= 65 ? "AtenÃƒÂ§ÃƒÂ£o" : "Operacional",
      fmt(risk >= 82 ? 62 : risk >= 65 ? 82 : 98, "%")
    ];
  });

  return (
    <div className="componentTraceStack">
      <Section title="Rastreabilidade de mÃƒÂ¡quinas e peÃƒÂ§as" subtitle="Status, desempenho e leitura dos principais componentes do processo.">
        <Table columns={["Componente", "IdentificaÃƒÂ§ÃƒÂ£o", "Status", "Desempenho (%)", "Leitura (unidade do sensor) tÃƒÂ©cnica", "FunÃƒÂ§ÃƒÂ£o no processo"]} rows={pumpRows} />
      </Section>

      <Section title="Tanques do processo" subtitle="Leitura (unidade do sensor)s numÃƒÂ©ricas dos tanques usados no ciclo.">
        <Table columns={["Tanque", "Tipo", "PressÃƒÂ£o", "Ãƒâ€œleo", "Risco", "Status"]} rows={tankRows} />
      </Section>

      <Section title="Mangueiras de vÃƒÂ¡cuo" subtitle="Componentes de ligaÃƒÂ§ÃƒÂ£o entre bombas, tanque e processo.">
        <Table columns={["Mangueira", "Comprimento (m)", "DiÃƒÂ¢metro (mm)", "Fator de perda (multiplicador)", "Status", "FunÃƒÂ§ÃƒÂ£o"]} rows={hoseRows} />
      </Section>

      <Section title="Sensores do processo" subtitle="Leitura (unidade do sensor)s usadas para controle, diagnÃƒÂ³stico e rastreabilidade.">
        <Table columns={["Sensor", "Tanque", "VariÃƒÂ¡vel", "Leitura (unidade do sensor)", "Status", "Desempenho (%)"]} rows={sensorRows} />
      </Section>
    </div>
  );
}

function TseaSimulationTraceability({ result, state, hoses, tanks }: any) {
  if (!result) return null;

  const config = result.config || {};
  const metrics = result.metrics || {};
  const selectedHose = hoses.find((hose: any) => String(hose.id) === String(config?.hose_id) || String(hose.code) === String(config?.hose_id)) || hoses[0] || {};
  const selectedTank = tanks.find((tank: any) => String(tank.id) === String(config?.tank_id) || String(tank.type) === String(config?.tank_type)) || tanks[0] || {};

  const risk = Number(metrics.max_collapse_risk_pct || 0);
  const finalPressure = Number(metrics.final_real_pressure_mbar || 0);
  const estimatedTime = Number(metrics.estimated_time_seconds || 0);
  const oilFlow = Number(metrics.oil_flow_l_min || config?.oil_flow_l_min || 0);
  const hoseLoss = Number(metrics.hose_loss_factor || selectedHose?.loss_factor || 0);

  const simulationStatus = result.status === "success"
    ? "Ciclo simulado aprovado"
    : result.status === "warning"
      ? "Ciclo simulado aprovado com restriÃƒÂ§ÃƒÂ£o"
      : "Ciclo simulado reprovado";

  const componentRows = [
    [<b>Bomba primÃƒÂ¡ria</b>, TSEA_EQUIPMENT_SPECS.primaryPump.model, state?.primary_pump?.running ? "Ligada" : "Pronta", "98%", TSEA_EQUIPMENT_SPECS.primaryPump.nominalSpeed50Hz, TSEA_EQUIPMENT_SPECS.primaryPump.role],
    [<b>Bomba secundÃƒÂ¡ria</b>, TSEA_EQUIPMENT_SPECS.secondaryPump.model, finalPressure <= Number(config?.roots_start_pressure_mbar || 50) ? "Liberada" : "Bloqueada", finalPressure <= Number(config?.roots_start_pressure_mbar || 50) ? "96%" : "Aguardando faixa", TSEA_EQUIPMENT_SPECS.secondaryPump.nominalSpeed50Hz, "Acionamento condicionado ÃƒÂ  pressÃƒÂ£o segura."],
    [<b>Mangueira de vÃƒÂ¡cuo</b>, selectedHose?.code || `MG-${config?.hose_id || "--"}`, hoseLoss > 1 ? "Perda elevada" : "Operacional", fmt(Math.max(70, 100 - hoseLoss * 12), "%"), `Fator ${fmt(hoseLoss)}`, "Perda de carga e restriÃƒÂ§ÃƒÂ£o de fluxo."],
    [<b>Tanque de processo</b>, selectedTank?.code || config?.tank_type || "Tanque simulado", risk >= 82 ? "CrÃƒÂ­tico" : risk >= 65 ? "AtenÃƒÂ§ÃƒÂ£o" : "Operacional", fmt(Math.max(55, 100 - risk * 0.45), "%"), fmt(risk, "%"), "Margem estrutural e pressÃƒÂ£o efetiva."],
    [<b>Sensor de pressÃƒÂ£o</b>, `SP-${selectedTank?.code || "SIM"}`, config?.simulate_sensor_failure ? "Falha simulada" : "Online", config?.simulate_sensor_failure ? "35%" : "98%", fmt(finalPressure, "mbar"), "Mede pressÃƒÂ£o do tanque e alimenta diagnÃƒÂ³stico."],
    [<b>Sistema de ÃƒÂ³leo</b>, "InjeÃƒÂ§ÃƒÂ£o de ÃƒÂ³leo", oilFlow < 1.5 ? "VazÃƒÂ£o baixa" : "Operacional", fmt(Math.min(100, Math.max(40, oilFlow * 45)), "%"), fmt(oilFlow, "L/min"), "Afeta vedaÃƒÂ§ÃƒÂ£o, estabilidade da curva e proteÃƒÂ§ÃƒÂ£o do conjunto."]
  ];

  const actionRows = [
    [<b>PreparaÃƒÂ§ÃƒÂ£o</b>, "ParÃƒÂ¢metros carregados", selectedTank?.code || config?.tank_type || "--", selectedHose?.code || `MG-${config?.hose_id || "--"}`, "Configuracao aplicada ao ciclo simulado."],
    [<b>EvacuaÃƒÂ§ÃƒÂ£o inicial</b>, "Bomba primÃƒÂ¡ria em atuaÃƒÂ§ÃƒÂ£o", fmt(estimatedTime * 0.35, "s"), fmt(finalPressure, "mbar"), "ReduÃƒÂ§ÃƒÂ£o inicial da pressÃƒÂ£o no tanque."],
    [<b>Acionamento da bomba secundÃƒÂ¡ria</b>, finalPressure <= Number(config?.roots_start_pressure_mbar || 50) ? "Liberado" : "Bloqueado", fmt(config?.roots_start_pressure_mbar || 50, "mbar"), "Intertravamento", "A bomba secundÃƒÂ¡ria sÃƒÂ³ entra em faixa segura."],
    [<b>InjeÃƒÂ§ÃƒÂ£o de ÃƒÂ³leo</b>, oilFlow < 1.5 ? "Insuficiente" : "Normal", fmt(oilFlow, "L/min"), "VedaÃƒÂ§ÃƒÂ£o", "CondiÃƒÂ§ÃƒÂ£o usada para estabilidade e risco."],
    [<b>Fechamento</b>, simulationStatus, fmt(risk, "%"), "Resultado", result.recommendation || "Sem recomendaÃƒÂ§ÃƒÂ£o adicional."]
  ];

  const reportRows = [
    [<b>Status final</b>, <Badge value={result.status} />, simulationStatus],
    [<b>PressÃƒÂ£o final (mbar)</b>, fmt(finalPressure, "mbar"), "Valor final calculado pela simulaÃƒÂ§ÃƒÂ£o."],
    [<b>Tempo estimado (s)</b>, fmt(estimatedTime, "s"), "DuraÃƒÂ§ÃƒÂ£o (s) prevista do ciclo."],
    [<b>Risco mÃƒÂ¡ximo (%)</b>, fmt(risk, "%"), risk >= 82 ? "Reprovado" : risk >= 65 ? "Aprovado com restriÃƒÂ§ÃƒÂ£o" : "Aprovado"],
    [<b>DiagnÃƒÂ³stico</b>, result.diagnosis || "--", result.recommendation || "--"]
  ];

  return (
    <div className="traceabilityStack">
      <div className="traceHeader">
        <div>
          <h3>Rastreabilidade da simulaÃƒÂ§ÃƒÂ£o</h3>
          <p>Registro tÃƒÂ©cnico por mÃƒÂ¡quina, peÃƒÂ§a, sensor, mangueira e aÃƒÂ§ÃƒÂ£o simulada.</p>
        </div>
        <Badge value={result.status} />
      </div>

      <div className="tracePanel">
        <h3>MÃƒÂ¡quinas, peÃƒÂ§as e sensores</h3>
        <Table columns={["Componente", "IdentificaÃƒÂ§ÃƒÂ£o", "Status", "Desempenho (%)", "Leitura (unidade do sensor)", "Impacto no processo"]} rows={componentRows} />
      </div>

      <div className="tracePanel">
        <h3>AÃƒÂ§ÃƒÂµes da operaÃƒÂ§ÃƒÂ£o simulada</h3>
        <Table columns={["Etapa", "Status", "ReferÃƒÂªncia", "Evento", "Registro tÃƒÂ©cnico"]} rows={actionRows} />
      </div>

      <div className="tracePanel">
        <h3>RelatÃƒÂ³rio da simulaÃƒÂ§ÃƒÂ£o</h3>
        <Table columns={["Item", "Valor", "InterpretaÃƒÂ§ÃƒÂ£o"]} rows={reportRows} />
      </div>
    </div>
  );
}

function TseaTwinRecoveryPanel({ state, allTanks, allHoses }: any) {
  const baseScenarios = [
    {
      id: "base-seguro",
      name: "Ciclo seguro padrÃƒÂ£o",
      description: "ParÃƒÂ¢metros conservadores para operaÃƒÂ§ÃƒÂ£o com margem ampliada.",
      config: { tank_type: "grande", tank_count: 1, hose_id: 1, target_pressure_mbar: 8, roots_start_pressure_mbar: 55, oil_flow_l_min: 2, max_cycle_seconds: 780, pump_health_factor: 1 }
    },
    {
      id: "base-produtivo",
      name: "Reguladores TSEA - VÃƒÂ¡cuo com ÃƒÂ³leo",
      description: "CenÃƒÂ¡rio operacional padrÃƒÂ£o para reguladores com injeÃƒÂ§ÃƒÂ£o de ÃƒÂ³leo.",
      config: { tank_type: "grande", hose_id: 1, target_pressure_mbar: 6.5, roots_start_pressure_mbar: 50, oil_flow_l_min: 2, max_cycle_seconds: 900, pump_health_factor: 1 }
    },
    {
      id: "base-risco",
      name: "Teste de perda na mangueira",
      description: "CenÃƒÂ¡rio para avaliar perda de carga, vazÃƒÂ£o baixa e risco estrutural.",
      config: { tank_type: "extra_grande", hose_id: 3, target_pressure_mbar: 7.5, roots_start_pressure_mbar: 60, oil_flow_l_min: 1.2, oil_delay_seconds: 30, max_cycle_seconds: 1100, pump_health_factor: 0.84, simulate_hose_leak: true }
    }
  ];

  const [tab, setTab] = useState<"base" | "custom" | "create" | "result">("base");
  const [customScenarios, setCustomScenarios] = useState<any[]>(() => tseaReadStorage("tsea.customScenarios.final", []));
  const [result, setResult] = useState<any>(() => tseaReadStorage("tsea.lastSimulation.final", null));
  const [form, setForm] = useState<any>({
    name: "Novo cenÃƒÂ¡rio de teste",
    description: "CenÃƒÂ¡rio personalizado para validaÃƒÂ§ÃƒÂ£o operacional.",
    tank_type: "grande",
    hose_id: 1,
    target_pressure_mbar: 6.5,
    roots_start_pressure_mbar: 50,
    oil_flow_l_min: 2,
    oil_delay_seconds: 0,
    max_cycle_seconds: 900,
    pump_health_factor: 1,
    simulate_hose_leak: false,
    simulate_sensor_failure: false
  });

  function persistCustom(next: any[]) {
    setCustomScenarios(next);
    tseaWriteStorage("tsea.customScenarios.final", next);
  }

  function runScenario(scenario: any) {
    const generated = tseaBuildSimulationResult(scenario.config || scenario, state, allHoses, allTanks, scenario.name || "CenÃƒÂ¡rio personalizado");
    setResult(generated);
    tseaWriteStorage("tsea.lastSimulation.final", generated);

    const history = tseaReadStorage<any[]>("tsea.simulationHistory.final", []);
    tseaWriteStorage("tsea.simulationHistory.final", [generated, ...history].slice(0, 60));

    setTab("result");
  }

  function saveScenario() {
    const scenario = {
      id: `custom-${Date.now().toString(36)}`,
      name: form.name || "CenÃƒÂ¡rio personalizado",
      description: form.description || "CenÃƒÂ¡rio criado pelo usuÃƒÂ¡rio.",
      config: { ...form }
    };

    persistCustom([scenario, ...customScenarios]);
    setTab("custom");
  }

  function renderScenarioList(items: any[], emptyText: string) {
    if (!items.length) {
      return <Empty text={emptyText} />;
    }

    return (
      <div className="scenarioBoard">
        {items.map((scenario) => (
          <article className="scenarioCard" key={scenario.id}>
            <strong>{scenario.name}</strong>
            <span>{scenario.description}</span>
            <div className="scenarioMeta">
              <small>Tanque: {scenario.config?.tank_type || "--"}</small>
              <small>Mangueira: {scenario.config?.hose_id || "--"}</small>
              <small>Ãƒâ€œleo: {fmt(scenario.config?.oil_flow_l_min, "L/min")}</small>
            </div>
            <button onClick={() => runScenario(scenario)}>Simular</button>
          </article>
        ))}
      </div>
    );
  }

  return (
    <Section title="GÃƒÂªmeo Digital Ã¢â‚¬â€ cenÃƒÂ¡rios e testes" subtitle="CenÃƒÂ¡rios base, personalizados, criaÃƒÂ§ÃƒÂ£o de teste e resultado com rastreabilidade completa.">
<div className="subTabs">
        <button className={tab === "base" ? "" : "secondary"} onClick={() => setTab("base")}>CenÃƒÂ¡rios base</button>
        <button className={tab === "custom" ? "" : "secondary"} onClick={() => setTab("custom")}>CenÃƒÂ¡rios personalizados</button>
        <button className={tab === "create" ? "" : "secondary"} onClick={() => setTab("create")}>Criar cenÃƒÂ¡rio</button>
        <button className={tab === "result" ? "" : "secondary"} onClick={() => setTab("result")}>Resultado</button>
      </div>

      {tab === "base" && renderScenarioList(baseScenarios, "Nenhum cenÃƒÂ¡rio base disponÃƒÂ­vel.")}
      {tab === "custom" && renderScenarioList(customScenarios, "Nenhum cenÃƒÂ¡rio personalizado salvo.")}

      {tab === "create" && (
        <div className="createScenarioBox">
          <div className="formGrid">
            <Field label="Nome do cenÃƒÂ¡rio">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>

            <Field label="DescriÃƒÂ§ÃƒÂ£o">
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>

            <Field label="Tipo de tanque">
              <select value={form.tank_type} onChange={(e) => setForm({ ...form, tank_type: e.target.value })}>
                <option value="pequeno">Pequeno</option>
                <option value="medio">MÃƒÂ©dio</option>
                <option value="grande">Grande</option>
                <option value="extra_grande">Extra grande</option>
              </select>
            </Field>

            <Field label="Mangueira">
              <select value={form.hose_id} onChange={(e) => setForm({ ...form, hose_id: Number(e.target.value) })}>
                {allHoses.map((hose: any, index: number) => (
                  <option key={hose.id || index} value={hose.id || index + 1}>{hose.code || `MG-${index + 1}`}</option>
                ))}
              </select>
            </Field>

            <Field label="PressÃƒÂ£o final (mbar) desejada (mbar)">
              <input type="number" value={form.target_pressure_mbar} onChange={(e) => setForm({ ...form, target_pressure_mbar: Number(e.target.value) })} />
            </Field>

            <Field label="PressÃƒÂ£o da bomba secundÃƒÂ¡ria (mbar)">
              <input type="number" value={form.roots_start_pressure_mbar} onChange={(e) => setForm({ ...form, roots_start_pressure_mbar: Number(e.target.value) })} />
            </Field>

            <Field label="VazÃƒÂ£o de ÃƒÂ³leo (L/min)">
              <input type="number" value={form.oil_flow_l_min} onChange={(e) => setForm({ ...form, oil_flow_l_min: Number(e.target.value) })} />
            </Field>

            <Field label="SaÃƒÂºde da bomba">
              <input type="number" step="0.01" value={form.pump_health_factor} onChange={(e) => setForm({ ...form, pump_health_factor: Number(e.target.value) })} />
            </Field>
          </div>

          <div className="checks">
            <label><input type="checkbox" checked={form.simulate_hose_leak} onChange={(e) => setForm({ ...form, simulate_hose_leak: e.target.checked })} /> Perda na mangueira</label>
            <label><input type="checkbox" checked={form.simulate_sensor_failure} onChange={(e) => setForm({ ...form, simulate_sensor_failure: e.target.checked })} /> Falha de sensor</label>
            
          </div>

          <div className="actions">
            <button onClick={saveScenario}>Salvar cenÃƒÂ¡rio</button>
            <button className="secondary" onClick={() => runScenario({ name: form.name, description: form.description, config: form })}>Simular agora</button>
          </div>
        </div>
      )}

      {tab === "result" && (
        result ? (
          <div className="resultStack">
            <div className="metrics">
              <Metric label="Status da simulaÃƒÂ§ÃƒÂ£o" value={<Badge value={result.status} />} detail={result.scenario} />
              <Metric label="PressÃƒÂ£o final (mbar)" value={fmt(result.metrics?.final_real_pressure_mbar, "mbar")} detail="Valor calculado" />
              <Metric label="Tempo estimado (s)" value={fmt(result.metrics?.estimated_time_seconds, "s")} detail="DuraÃƒÂ§ÃƒÂ£o (s) prevista" />
              <Metric label="Risco mÃƒÂ¡ximo (%)" value={fmt(result.metrics?.max_collapse_risk_pct, "%")} detail="Margem operacional" />
            </div>

            <div className="diagnosticBox">
              <strong>{result.diagnosis}</strong>
              <span>{result.recommendation}</span>
            </div>

            <TseaSimulationTraceability result={result} state={state} hoses={allHoses} tanks={allTanks} />
          </div>
        ) : (
          <Empty text="Execute uma simulaÃƒÂ§ÃƒÂ£o para gerar o resultado tÃƒÂ©cnico." />
        )
      )}
    </Section>
  );
}

function TseaHistoryDetailsPanel({ state, allTanks, allHoses }: any) {
  const [items, setItems] = useState<any[]>(() => tseaReadStorage("tsea.simulationHistory.final", []));
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setItems(tseaReadStorage("tsea.simulationHistory.final", []));
    }, 1500);

    return () => window.clearInterval(timer);
  }, []);

  if (!items.length) {
    return null;
  }

  return (
    <Section title="Detalhes tÃƒÂ©cnicos das simulaÃƒÂ§ÃƒÂµes" subtitle="HistÃƒÂ³rico local com parÃƒÂ¢metros, resultado, componentes, aÃƒÂ§ÃƒÂµes e diagnÃƒÂ³stico completo.">
      <Table
        columns={["ID", "Data", "CenÃƒÂ¡rio", "Status", "Risco", "PressÃƒÂ£o", "Detalhes"]}
        rows={items.map((item) => [
          <b>{item.id}</b>,
          new Date(item.created_at).toLocaleString("pt-BR"),
          item.scenario,
          <Badge value={item.status} />,
          fmt(item.metrics?.max_collapse_risk_pct, "%"),
          fmt(item.metrics?.final_real_pressure_mbar, "mbar"),
          <button className="secondary" onClick={() => setSelected(item)}>Ver detalhes</button>
        ])}
      />

      {selected && (
        <div className="detailPanel">
          <div className="traceHeader">
            <div>
              <h3>{selected.scenario}</h3>
              <p>{selected.diagnosis}</p>
            </div>
            <button className="secondary" onClick={() => setSelected(null)}>Fechar</button>
          </div>

          <TseaSimulationTraceability result={selected} state={state} hoses={allHoses} tanks={allTanks} />
        </div>
      )}
    </Section>
  );
}

/* TSEA_PATCH_GEMEO_RASTREABILIDADE_FINAL_END */



/* TSEA_GEMEO_DIGITAL_10_START */

function TseaDigitalTwin10({ state, allTanks, allHoses }: any) {
  const baseScenarios = [
    {
      id: "base-seguro",
      name: "Ciclo seguro padrÃƒÂ£o",
      description: "ValidaÃƒÂ§ÃƒÂ£o conservadora para operaÃƒÂ§ÃƒÂ£o com margem ampliada.",
      tag: "Conservador",
      config: {
        tank_type: "grande",
        hose_id: allHoses?.[0]?.id || 1,
        target_pressure_mbar: 8,
        secondary_start_pressure_mbar: 55,
        oil_flow_l_min: 2,
        oil_delay_seconds: 0,
        max_cycle_seconds: 780,
        primary_pump_health: 1,
        secondary_pump_health: 1,
        calibration_factor: 1,
        simulate_hose_leak: false,
        simulate_sensor_failure: false
      }
    },
    {
      id: "base-produtivo",
      name: "Reguladores TSEA com ÃƒÂ³leo",
      description: "Ciclo operacional padrÃƒÂ£o para reguladores com injeÃƒÂ§ÃƒÂ£o de ÃƒÂ³leo.",
      tag: "ProduÃƒÂ§ÃƒÂ£o",
      config: {
        tank_type: "grande",
        hose_id: allHoses?.[0]?.id || 1,
        target_pressure_mbar: 6.5,
        secondary_start_pressure_mbar: 50,
        oil_flow_l_min: 2,
        oil_delay_seconds: 0,
        max_cycle_seconds: 900,
        primary_pump_health: 1,
        secondary_pump_health: 1,
        calibration_factor: 1,
        simulate_hose_leak: false,
        simulate_sensor_failure: false
      }
    },
    {
      id: "base-mangueira",
      name: "Teste de perda na mangueira",
      description: "CenÃƒÂ¡rio para avaliar perda de carga, vazÃƒÂ£o baixa e impacto no tempo de ciclo.",
      tag: "Risco",
      config: {
        tank_type: "extra_grande",
        hose_id: allHoses?.[2]?.id || allHoses?.[0]?.id || 1,
        target_pressure_mbar: 7.5,
        secondary_start_pressure_mbar: 60,
        oil_flow_l_min: 1.3,
        oil_delay_seconds: 25,
        max_cycle_seconds: 1100,
        primary_pump_health: 0.88,
        secondary_pump_health: 0.9,
        calibration_factor: 1,
        simulate_hose_leak: true,
        simulate_sensor_failure: false
      }
    },
    {
      id: "base-sensor",
      name: "Falha de sensor de pressÃƒÂ£o",
      description: "Teste para verificar impacto de leitura instÃƒÂ¡vel no diagnÃƒÂ³stico do ciclo.",
      tag: "Falha",
      config: {
        tank_type: "grande",
        hose_id: allHoses?.[1]?.id || allHoses?.[0]?.id || 1,
        target_pressure_mbar: 7,
        secondary_start_pressure_mbar: 50,
        oil_flow_l_min: 2,
        oil_delay_seconds: 5,
        max_cycle_seconds: 920,
        primary_pump_health: 0.96,
        secondary_pump_health: 0.94,
        calibration_factor: 1,
        simulate_hose_leak: false,
        simulate_sensor_failure: true
      }
    }
  ];

  function loadLocal<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveLocal(key: string, value: unknown) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  const [tab, setTab] = useState<"base" | "custom" | "create" | "manual" | "result" | "history" | "technical">("base");
  const [customScenarios, setCustomScenarios] = useState<any[]>(() => loadLocal("tsea.gemeo10.customScenarios", []));
  const [history, setHistory] = useState<any[]>(() => loadLocal("tsea.gemeo10.history", []));
  const [result, setResult] = useState<any>(() => loadLocal("tsea.gemeo10.lastResult", null));
  const [selectedDetail, setSelectedDetail] = useState<any>(null);

  const defaultForm = {
    name: "Novo cenÃƒÂ¡rio de teste",
    description: "CenÃƒÂ¡rio personalizado para validaÃƒÂ§ÃƒÂ£o operacional.",
    tank_type: "grande",
    tank_id: allTanks?.[0]?.id || 1,
    hose_id: allHoses?.[0]?.id || 1,
    target_pressure_mbar: 6.5,
    secondary_start_pressure_mbar: 50,
    oil_flow_l_min: 2,
    oil_delay_seconds: 0,
    max_cycle_seconds: 900,
    primary_pump_health: 1,
    secondary_pump_health: 1,
    calibration_factor: 1,
    simulate_hose_leak: false,
    simulate_sensor_failure: false
  };

  const [form, setForm] = useState<any>(() => loadLocal("tsea.gemeo10.form", defaultForm));
  const [manual, setConfiguracao] = useState<any>(() => loadLocal("tsea.gemeo10.manual", defaultForm));

  useEffect(() => saveLocal("tsea.gemeo10.customScenarios", customScenarios), [customScenarios]);
  useEffect(() => saveLocal("tsea.gemeo10.history", history), [history]);
  useEffect(() => saveLocal("tsea.gemeo10.lastResult", result), [result]);
  useEffect(() => saveLocal("tsea.gemeo10.form", form), [form]);
  useEffect(() => saveLocal("tsea.gemeo10.manual", manual), [manual]);

  function findHose(config: any) {
    return allHoses?.find((hose: any) => String(hose.id) === String(config?.hose_id) || String(hose.code) === String(config?.hose_id)) || allHoses?.[0] || {};
  }

  function findTank(config: any) {
    return allTanks?.find((tank: any) => String(tank.id) === String(config?.tank_id) || String(tank.type) === String(config?.tank_type)) || allTanks?.[0] || {};
  }

  function buildSimulation(config: any, scenarioName: string, scenarioDescription = "") {
    const hose = findHose(config);
    const tank = findTank(config);

    const tankVolume = Number(tank?.volume_liters || tank?.volume || 1250);
    const structuralLimit = Number(tank?.structural_limit_mbar || tank?.limiteEstrutural || 35);
    const hoseLoss = Number(hose?.loss_factor || hose?.fatorPerda || 0.8);
    const targetPressure = Number(config?.target_pressure_mbar || 6.5);
    const secondaryStart = Number(config?.secondary_start_pressure_mbar || 50);
    const oilFlow = Number(config?.oil_flow_l_min || 2);
    const oilDelay = Number(config?.oil_delay_seconds || 0);
    const maxCycle = Number(config?.max_cycle_seconds || 900);
    const primaryHealth = Number(config?.primary_pump_health || 1);
    const secondaryHealth = Number(config?.secondary_pump_health || 1);
    const calibration = Number(config?.calibration_factor || 1);

    const hoseRisk = hoseLoss * 13;
    const oilRisk = Math.max(0, 2 - oilFlow) * 18;
    const delayRisk = oilDelay * 0.2;
    const pumpRisk = (1 - primaryHealth) * 34 + (1 - secondaryHealth) * 28;
    const failureRisk = (config?.simulate_hose_leak ? 22 : 0) + (config?.simulate_sensor_failure ? 18 : 0);

    const risk = Math.max(4, Math.min(98, 16 + hoseRisk + oilRisk + delayRisk + pumpRisk + failureRisk));
    const estimatedTime = Math.round(Math.min(maxCycle, ((tankVolume / 640) * 225 + hoseLoss * 44 + oilDelay * 1.7 + pumpRisk * 3) * calibration));
    const finalPressure = Math.max(targetPressure, targetPressure + hoseLoss * 0.7 + oilRisk * 0.08 + (config?.simulate_hose_leak ? 8 : 0));
    const safetyMargin = structuralLimit - finalPressure;
    const secondaryReleased = finalPressure <= secondaryStart;
    const status = risk >= 82 || safetyMargin < 0 ? "critical" : risk >= 65 ? "warning" : "success";

    const diagnosis = status === "success"
      ? "SimulaÃƒÂ§ÃƒÂ£o aprovada. O ciclo mantÃƒÂ©m margem operacional aceitÃƒÂ¡vel."
      : status === "warning"
        ? "SimulaÃƒÂ§ÃƒÂ£o aprovada com restriÃƒÂ§ÃƒÂ£o. Existe tendÃƒÂªncia de perda, atraso de ÃƒÂ³leo, falha simulada ou reduÃƒÂ§ÃƒÂ£o de margem."
        : "SimulaÃƒÂ§ÃƒÂ£o reprovada. O ciclo apresenta risco elevado e nÃƒÂ£o deve ser liberado sem revisÃƒÂ£o.";

    const probableCause = status === "success"
      ? "Nenhum componente crÃƒÂ­tico identificado."
      : risk >= 82 && config?.simulate_hose_leak
        ? "Perda simulada na mangueira elevou o risco e prejudicou a estabilidade do ciclo."
        : oilFlow < 1.5
          ? "VazÃƒÂ£o de ÃƒÂ³leo (L/min) insuficiente reduziu a estabilidade e aumentou risco operacional."
          : !secondaryReleased
            ? "Bomba secundÃƒÂ¡ria permaneceu bloqueada pela pressÃƒÂ£o fora da faixa segura."
            : config?.simulate_sensor_failure
              ? "Falha simulada no sensor comprometeu a confiabilidade da leitura."
              : "Conjunto de perdas e degradaÃƒÂ§ÃƒÂ£o de desempenho elevou o risco.";

    const recommendation = status === "success"
      ? "Manter parÃƒÂ¢metros e registrar o cenÃƒÂ¡rio como referÃƒÂªncia operacional."
      : status === "warning"
        ? "Revisar mangueira, vazÃƒÂ£o de ÃƒÂ³leo, sensores e saÃƒÂºde das bombas antes da execuÃƒÂ§ÃƒÂ£o real."
        : "Bloquear execuÃƒÂ§ÃƒÂ£o, revisar vedaÃƒÂ§ÃƒÂ£o, mangueira, sensores, bomba primÃƒÂ¡ria e bomba secundÃƒÂ¡ria.";

    const timeline = Array.from({ length: 22 }).map((_, index) => {
      const step = index / 21;
      const ideal = Math.max(finalPressure, 1013 * Math.exp(-step * 5.4) + targetPressure);
      const simulated = ideal + hoseLoss * step * 3 + (config?.simulate_hose_leak ? step * 12 : 0);
      const effective = finalPressure + risk * step * 0.18;

      return {
        second: Math.round(step * estimatedTime),
        expected_pressure_mbar: ideal,
        real_pressure_mbar: simulated,
        pressure_mbar: simulated,
        effective_pressure_mbar: effective,
        collapse_risk_pct: Math.round(risk * step),
        hose_loss_mbar: hoseLoss,
        event: step === 0 ? "InÃƒÂ­cio" : step > 0.32 && step < 0.38 ? "Bomba secundÃƒÂ¡ria" : step > 0.46 && step < 0.52 ? "Ãƒâ€œleo" : ""
      };
    });

    const components = [
      {
        type: "Bomba primÃƒÂ¡ria",
        id: "Leybold SOGEVAC SV 630 B",
        status: "Operacional",
        performance: fmt(primaryHealth * 100, "%"),
        reading: "640 mÃ‚Â³/h",
        impact: "EvacuaÃƒÂ§ÃƒÂ£o inicial e sustentaÃƒÂ§ÃƒÂ£o do vÃƒÂ¡cuo."
      },
      {
        type: "Bomba secundÃƒÂ¡ria",
        id: "Leybold RUVAC WSU 2001",
        status: secondaryReleased ? "Liberada" : "Bloqueada",
        performance: secondaryReleased ? fmt(secondaryHealth * 100, "%") : "Aguardando faixa",
        reading: `${fmt(secondaryStart, "mbar")} liberaÃƒÂ§ÃƒÂ£o`,
        impact: "ReforÃƒÂ§o do vÃƒÂ¡cuo apÃƒÂ³s entrada em faixa segura."
      },
      {
        type: "Mangueira de vÃƒÂ¡cuo",
        id: hose?.code || hose?.codigo || `MG-${config?.hose_id || "--"}`,
        status: hoseLoss > 1 || config?.simulate_hose_leak ? "AtenÃƒÂ§ÃƒÂ£o" : "Operacional",
        performance: fmt(Math.max(45, 100 - hoseLoss * 18 - (config?.simulate_hose_leak ? 25 : 0)), "%"),
        reading: `Fator ${fmt(hoseLoss)}`,
        impact: "Perda de carga, restriÃƒÂ§ÃƒÂ£o de fluxo e tempo de ciclo."
      },
      {
        type: "Tanque de processo",
        id: tank?.code || tank?.codigo || config?.tank_type || "Tanque simulado",
        status: risk >= 82 ? "CrÃƒÂ­tico" : risk >= 65 ? "AtenÃƒÂ§ÃƒÂ£o" : "Operacional",
        performance: fmt(Math.max(45, 100 - risk * 0.42), "%"),
        reading: `${fmt(finalPressure, "mbar")} final`,
        impact: `Margem estrutural: ${fmt(safetyMargin, "mbar")}`
      },
      {
        type: "Sensor de pressÃƒÂ£o",
        id: `SP-${tank?.code || tank?.codigo || "SIM"}`,
        status: config?.simulate_sensor_failure ? "Falha simulada" : "Online",
        performance: config?.simulate_sensor_failure ? "35%" : "98%",
        reading: fmt(finalPressure, "mbar"),
        impact: "Leitura (unidade do sensor) usada no diagnÃƒÂ³stico e no histÃƒÂ³rico."
      },
      {
        type: "Sistema de ÃƒÂ³leo",
        id: "InjeÃƒÂ§ÃƒÂ£o de ÃƒÂ³leo",
        status: oilFlow < 1.5 ? "VazÃƒÂ£o baixa" : "Operacional",
        performance: fmt(Math.max(40, Math.min(100, oilFlow * 45)), "%"),
        reading: `${fmt(oilFlow, "L/min")} Ã‚Â· atraso ${fmt(oilDelay, "s")}`,
        impact: "VedaÃƒÂ§ÃƒÂ£o, estabilidade e proteÃƒÂ§ÃƒÂ£o do conjunto."
      }
    ];

    const actions = [
      { step: "PreparaÃƒÂ§ÃƒÂ£o", status: "ConcluÃƒÂ­da", ref: scenarioName, log: "ParÃƒÂ¢metros carregados e componentes vinculados." },
      { step: "EvacuaÃƒÂ§ÃƒÂ£o inicial", status: "ConcluÃƒÂ­da", ref: "Bomba primÃƒÂ¡ria", log: "ReduÃƒÂ§ÃƒÂ£o inicial da pressÃƒÂ£o no tanque." },
      { step: "Acionamento da bomba secundÃƒÂ¡ria", status: secondaryReleased ? "Liberado" : "Bloqueado", ref: `${fmt(secondaryStart, "mbar")}`, log: "Intertravamento avaliado pela pressÃƒÂ£o segura." },
      { step: "InjeÃƒÂ§ÃƒÂ£o de ÃƒÂ³leo", status: oilFlow < 1.5 ? "RestriÃƒÂ§ÃƒÂ£o" : "Normal", ref: `${fmt(oilFlow, "L/min")}`, log: "CondiÃƒÂ§ÃƒÂ£o aplicada ao cÃƒÂ¡lculo de estabilidade." },
      { step: "DiagnÃƒÂ³stico final", status: status === "success" ? "Aprovado" : status === "warning" ? "AtenÃƒÂ§ÃƒÂ£o" : "Reprovado", ref: `${fmt(risk, "%")}`, log: recommendation }
    ];

    return {
      id: `SIM-${Date.now().toString(36).toUpperCase()}`,
      created_at: new Date().toISOString(),
      scenario: scenarioName,
      description: scenarioDescription,
      status,
      diagnosis,
      probableCause,
      recommendation,
      config,
      metrics: {
        estimated_time_seconds: estimatedTime,
        final_real_pressure_mbar: finalPressure,
        max_collapse_risk_pct: risk,
        safety_margin_mbar: safetyMargin,
        secondary_start_pressure_mbar: secondaryStart,
        secondary_released: secondaryReleased,
        oil_flow_l_min: oilFlow,
        hose_loss_factor: hoseLoss
      },
      timeline,
      components,
      actions
    };
  }

  function persistResult(next: any) {
    setResult(next);
    const nextHistory = [next, ...history].slice(0, 80);
    setHistory(nextHistory);
    saveLocal("tsea.gemeo10.history", nextHistory);
    saveLocal("tsea.gemeo10.lastResult", next);
    setSelectedDetail(next);
    setTab("result");
  }

  function runScenario(scenario: any) {
    persistResult(buildSimulation(scenario.config || scenario, scenario.name || "CenÃƒÂ¡rio manual", scenario.description || ""));
  }

  function saveScenario() {
    const scenario = {
      id: `CUSTOM-${Date.now().toString(36).toUpperCase()}`,
      name: form.name || "CenÃƒÂ¡rio personalizado",
      description: form.description || "CenÃƒÂ¡rio criado pelo usuÃƒÂ¡rio.",
      tag: "Personalizado",
      config: { ...form }
    };

    setCustomScenarios([scenario, ...customScenarios]);
    setTab("custom");
  }

  function deleteScenario(id: string) {
    setCustomScenarios(customScenarios.filter((item) => item.id !== id));
  }

  function useAsBase(scenario: any) {
    const config = scenario.config || scenario;
    setForm({ ...form, ...config, name: `${scenario.name} - cÃƒÂ³pia`, description: scenario.description || "" });
    setTab("create");
  }

  function renderScenarioCard(scenario: any, custom = false) {
    const config = scenario.config || {};

    return (
      <article className="twinScenarioCard" key={scenario.id}>
        <div className="twinScenarioTop">
          <div>
            <strong>{scenario.name}</strong>
            <span>{scenario.description}</span>
          </div>
          <small>{scenario.tag || (custom ? "Personalizado" : "Base")}</small>
        </div>

        <div className="twinScenarioMeta">
          <span>Tanque: {config.tank_type || "--"}</span>
          <span>Mangueira: {config.hose_id || "--"}</span>
          <span>PressÃƒÂ£o: {fmt(config.target_pressure_mbar, "mbar")}</span>
          <span>Ãƒâ€œleo: {fmt(config.oil_flow_l_min, "L/min")}</span>
        </div>

        <div className="twinScenarioActions">
          <button onClick={() => runScenario(scenario)}>Simular</button>
          <button className="secondary" onClick={() => useAsBase(scenario)}>Usar como base</button>
          {custom && <button className="secondary" onClick={() => deleteScenario(scenario.id)}>Excluir</button>}
        </div>
      </article>
    );
  }

  function renderConfigForm(data: any, setData: any, showIdentity = true) {
    return (
      <div className="twinForm">
        {showIdentity && (
          <>
            <Field label="Nome do cenÃƒÂ¡rio">
              <input value={data.name || ""} onChange={(e) => setData({ ...data, name: e.target.value })} />
            </Field>

            <Field label="DescriÃƒÂ§ÃƒÂ£o">
              <input value={data.description || ""} onChange={(e) => setData({ ...data, description: e.target.value })} />
            </Field>
          </>
        )}

        <Field label="Tipo de tanque">
          <select value={data.tank_type || "grande"} onChange={(e) => setData({ ...data, tank_type: e.target.value })}>
            <option value="pequeno">Pequeno</option>
            <option value="medio">MÃƒÂ©dio</option>
            <option value="grande">Grande</option>
            <option value="extra_grande">Extra grande</option>
          </select>
        </Field>

        <Field label="Tanque">
          <select value={data.tank_id || allTanks?.[0]?.id || 1} onChange={(e) => setData({ ...data, tank_id: e.target.value })}>
            {(allTanks || []).map((tank: any, index: number) => (
              <option key={tank.id || index} value={tank.id || index + 1}>{tank.code || tank.codigo || `TQ-${index + 1}`}</option>
            ))}
          </select>
        </Field>

        <Field label="Mangueira">
          <select value={data.hose_id || allHoses?.[0]?.id || 1} onChange={(e) => setData({ ...data, hose_id: e.target.value })}>
            {(allHoses || []).map((hose: any, index: number) => (
              <option key={hose.id || index} value={hose.id || index + 1}>{hose.code || hose.codigo || `MG-${index + 1}`}</option>
            ))}
          </select>
        </Field>

        <Field label="PressÃƒÂ£o final (mbar) desejada (mbar)">
          <input type="number" value={data.target_pressure_mbar ?? 6.5} onChange={(e) => setData({ ...data, target_pressure_mbar: Number(e.target.value) })} />
        </Field>

        <Field label="PressÃƒÂ£o da bomba secundÃƒÂ¡ria (mbar)">
          <input type="number" value={data.secondary_start_pressure_mbar ?? 50} onChange={(e) => setData({ ...data, secondary_start_pressure_mbar: Number(e.target.value) })} />
        </Field>

        <Field label="VazÃƒÂ£o de ÃƒÂ³leo (L/min)">
          <input type="number" value={data.oil_flow_l_min ?? 2} onChange={(e) => setData({ ...data, oil_flow_l_min: Number(e.target.value) })} />
        </Field>

        <Field label="Atraso do ÃƒÂ³leo (s)">
          <input type="number" value={data.oil_delay_seconds ?? 0} onChange={(e) => setData({ ...data, oil_delay_seconds: Number(e.target.value) })} />
        </Field>

        <Field label="Tempo mÃƒÂ¡ximo (s)">
          <input type="number" value={data.max_cycle_seconds ?? 900} onChange={(e) => setData({ ...data, max_cycle_seconds: Number(e.target.value) })} />
        </Field>

        <Field label="SaÃƒÂºde bomba primÃƒÂ¡ria (0 a 1)">
          <input type="number" step="0.01" value={data.primary_pump_health ?? 1} onChange={(e) => setData({ ...data, primary_pump_health: Number(e.target.value) })} />
        </Field>

        <Field label="SaÃƒÂºde bomba secundÃƒÂ¡ria (0 a 1)">
          <input type="number" step="0.01" value={data.secondary_pump_health ?? 1} onChange={(e) => setData({ ...data, secondary_pump_health: Number(e.target.value) })} />
        </Field>

        <Field label="Fator de calibraÃƒÂ§ÃƒÂ£o (multiplicador)">
          <input type="number" step="0.01" value={data.calibration_factor ?? 1} onChange={(e) => setData({ ...data, calibration_factor: Number(e.target.value) })} />
        </Field>
      </div>
    );
  }

  function renderChecks(data: any, setData: any) {
    return (
      <div className="twinChecks">
        <label><input type="checkbox" checked={!!data.simulate_hose_leak} onChange={(e) => setData({ ...data, simulate_hose_leak: e.target.checked })} /> Perda na mangueira</label>
        <label><input type="checkbox" checked={!!data.simulate_sensor_failure} onChange={(e) => setData({ ...data, simulate_sensor_failure: e.target.checked })} /> Falha de sensor</label>
        
      </div>
    );
  }

  function MiniChart({ points }: any) {
    const list = Array.isArray(points) ? points : [];
    if (!list.length) return <Empty text="Execute uma simulaÃƒÂ§ÃƒÂ£o para gerar a curva." />;

    const values = list.flatMap((p: any) => [
      Number(p.real_pressure_mbar || 0),
      Number(p.expected_pressure_mbar || 0),
      Number(p.effective_pressure_mbar || 0)
    ]);

    const max = Math.max(...values, 10);
    const min = Math.min(...values, 0);
    const span = Math.max(max - min, 1);

    function poly(key: string) {
      return list.map((p: any, index: number) => {
        const value = Number(p[key] || 0);
        const x = (index / Math.max(list.length - 1, 1)) * 100;
        const y = 94 - ((value - min) / span) * 84;
        return `${x},${y}`;
      }).join(" ");
    }

    return (
      <div className="twinChart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="0" y1="94" x2="100" y2="94" className="axis" />
          <line x1="0" y1="10" x2="0" y2="94" className="axis" />
          <polyline points={poly("expected_pressure_mbar")} className="expectedLine" />
          <polyline points={poly("real_pressure_mbar")} className="realLine" />
          <polyline points={poly("effective_pressure_mbar")} className="riskLine" />
        </svg>

        <div className="chartLegend">
          <span><i className="realDot" />Simulada</span>
          <span><i className="expectedDot" />Esperada</span>
          <span><i className="riskDot" />Carga estrutural</span>
        </div>
      </div>
    );
  }

  function renderTraceability(target: any) {
    if (!target) return <Empty text="Nenhuma simulaÃƒÂ§ÃƒÂ£o selecionada." />;

    return (
      <div className="twinTraceability">
        <div className="traceHeader">
          <div>
            <h3>Rastreabilidade da simulaÃƒÂ§ÃƒÂ£o</h3>
            <p>Registro por mÃƒÂ¡quina, peÃƒÂ§a, sensor, mangueira, ÃƒÂ³leo e aÃƒÂ§ÃƒÂ£o simulada.</p>
          </div>
          <Badge value={target.status} />
        </div>

        <div className="tracePanel">
          <h3>MÃƒÂ¡quinas, peÃƒÂ§as e sensores</h3>
          <Table
            columns={["Componente", "IdentificaÃƒÂ§ÃƒÂ£o", "Status", "Desempenho (%)", "Leitura (unidade do sensor)", "Impacto"]}
            rows={(target.components || []).map((item: any) => [
              <b>{item.type}</b>,
              item.id,
              item.status,
              item.performance,
              item.reading,
              item.impact
            ])}
          />
        </div>

        <div className="tracePanel">
          <h3>AÃƒÂ§ÃƒÂµes da operaÃƒÂ§ÃƒÂ£o simulada</h3>
          <Table
            columns={["Etapa", "Status", "ReferÃƒÂªncia", "Registro tÃƒÂ©cnico"]}
            rows={(target.actions || []).map((item: any) => [
              <b>{item.step}</b>,
              item.status,
              item.ref,
              item.log
            ])}
          />
        </div>

        <div className="tracePanel">
          <h3>RelatÃƒÂ³rio tÃƒÂ©cnico da simulaÃƒÂ§ÃƒÂ£o</h3>
          <Table
            columns={["Item", "Valor", "InterpretaÃƒÂ§ÃƒÂ£o"]}
            rows={[
              [<b>Status final</b>, <Badge value={target.status} />, target.status === "success" ? "Bem-sucedida" : target.status === "warning" ? "Aprovada com restriÃƒÂ§ÃƒÂ£o" : "Reprovada"],
              [<b>PressÃƒÂ£o final (mbar)</b>, fmt(target.metrics?.final_real_pressure_mbar, "mbar"), "Valor final previsto pelo modelo."],
              [<b>Tempo estimado (s)</b>, fmt(target.metrics?.estimated_time_seconds, "s"), "DuraÃƒÂ§ÃƒÂ£o (s) prevista do ciclo."],
              [<b>Risco mÃƒÂ¡ximo (%)</b>, fmt(target.metrics?.max_collapse_risk_pct, "%"), target.metrics?.max_collapse_risk_pct >= 82 ? "Risco crÃƒÂ­tico" : target.metrics?.max_collapse_risk_pct >= 65 ? "AtenÃƒÂ§ÃƒÂ£o" : "Seguro"],
              [<b>Margem de seguranÃƒÂ§a (mbar)</b>, fmt(target.metrics?.safety_margin_mbar, "mbar"), "DistÃƒÂ¢ncia estimada atÃƒÂ© o limite do tanque."],
              [<b>Motivo principal</b>, target.probableCause || "--", target.recommendation || "--"]
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <Section title="GÃƒÂªmeo Digital do processo de vÃƒÂ¡cuo" subtitle="SimulaÃƒÂ§ÃƒÂ£o operacional com cenÃƒÂ¡rios, criaÃƒÂ§ÃƒÂ£o de testes, diagnÃƒÂ³stico, rastreabilidade e histÃƒÂ³rico tÃƒÂ©cnico.">
<div className="twin10Tabs">
        <button className={tab === "base" ? "" : "secondary"} onClick={() => setTab("base")}>CenÃƒÂ¡rios base</button>
        <button className={tab === "custom" ? "" : "secondary"} onClick={() => setTab("custom")}>Personalizados</button>
        <button className={tab === "create" ? "" : "secondary"} onClick={() => setTab("create")}>Criar cenÃƒÂ¡rio</button>
<button className={tab === "result" ? "" : "secondary"} onClick={() => setTab("result")}>Resultado</button>
        <button className={tab === "history" ? "" : "secondary"} onClick={() => setTab("history")}>HistÃƒÂ³rico</button>
        <button className={tab === "technical" ? "" : "secondary"} onClick={() => setTab("technical")}>Dados tÃƒÂ©cnicos</button>
</div>

      {tab === "base" && (
        <div className="twin10Grid">
          {baseScenarios.map((scenario) => renderScenarioCard(scenario))}
        </div>
      )}

      {tab === "custom" && (
        customScenarios.length ? (
          <div className="twin10Grid">
            {customScenarios.map((scenario) => renderScenarioCard(scenario, true))}
          </div>
        ) : (
          <Empty text="Nenhum cenÃƒÂ¡rio personalizado salvo. Use a aba Criar cenÃƒÂ¡rio." />
        )
      )}

      {tab === "create" && (
        <div className="twin10Panel">
          <h3>Criar cenÃƒÂ¡rio de teste</h3>
          <p>Monte um cenÃƒÂ¡rio com tanque, mangueira, pressÃƒÂ£o, ÃƒÂ³leo, saÃƒÂºde das bombas e falhas simuladas.</p>

          {renderConfigForm(form, setForm, true)}
          {renderChecks(form, setForm)}

          <div className="actions">
            <button onClick={saveScenario}>Salvar cenÃƒÂ¡rio</button>
            <button className="secondary" onClick={() => runScenario({ name: form.name, description: form.description, config: form })}>Simular agora</button>
          </div>
        </div>
      )}

      


      {tab === "result" && (
        result ? (
          <div className="twin10Result">
            <div className="metrics">
              <Metric label="Status" value={<Badge value={result.status} />} detail={result.scenario} />
              <Metric label="PressÃƒÂ£o final (mbar)" value={fmt(result.metrics?.final_real_pressure_mbar, "mbar")} detail="Resultado previsto" />
              <Metric label="Tempo estimado (s)" value={fmt(result.metrics?.estimated_time_seconds, "s")} detail="DuraÃƒÂ§ÃƒÂ£o (s) do ciclo" />
              <Metric label="Risco mÃƒÂ¡ximo (%)" value={fmt(result.metrics?.max_collapse_risk_pct, "%")} detail="AvaliaÃƒÂ§ÃƒÂ£o estrutural" />
            </div>

            <div className="diagnosticBox">
              <strong>{result.diagnosis}</strong>
              <span>{result.probableCause}</span>
              <small>{result.recommendation}</small>
            </div>

            <MiniChart points={result.timeline} />

            {renderTraceability(result)}
          </div>
        ) : (
          <Empty text="Execute uma simulaÃƒÂ§ÃƒÂ£o para gerar o resultado." />
        )
      )}

      {tab === "history" && (
        history.length ? (
          <div className="twin10History">
            <Table
              columns={["ID", "Data", "CenÃƒÂ¡rio", "Status", "Risco", "PressÃƒÂ£o", "Detalhes"]}
              rows={history.map((item) => [
                <b>{item.id}</b>,
                new Date(item.created_at).toLocaleString("pt-BR"),
                item.scenario,
                <Badge value={item.status} />,
                fmt(item.metrics?.max_collapse_risk_pct, "%"),
                fmt(item.metrics?.final_real_pressure_mbar, "mbar"),
                <button className="secondary" onClick={() => setSelectedDetail(item)}>Ver detalhes</button>
              ])}
            />

            {selectedDetail && (
              <div className="detailPanel">
                <div className="traceHeader">
                  <div>
                    <h3>{selectedDetail.scenario}</h3>
                    <p>{selectedDetail.diagnosis}</p>
                  </div>
                  <button className="secondary" onClick={() => setSelectedDetail(null)}>Fechar</button>
                </div>

                {renderTraceability(selectedDetail)}
              </div>
            )}
          </div>
        ) : (
          <Empty text="Nenhuma simulaÃƒÂ§ÃƒÂ£o registrada ainda." />
        )
      )}

      {tab === "technical" && (
        <div className="twin10Panel">
<Table
            columns={["Sistema", "Modelo", "Dado tÃƒÂ©cnico", "FunÃƒÂ§ÃƒÂ£o"]}
            rows={[
              ["Bomba primÃƒÂ¡ria", "Leybold SOGEVAC SV 630 B", "640 mÃ‚Â³/h Ã‚Â· Ã¢â€°Â¤ 0,08 mbar Ã‚Â· 20 L ÃƒÂ³leo Ã‚Â· 15 kW", "EvacuaÃƒÂ§ÃƒÂ£o inicial e sustentaÃƒÂ§ÃƒÂ£o do vÃƒÂ¡cuo."],
              ["Bomba secundÃƒÂ¡ria", "Leybold RUVAC WSU 2001", "2050 mÃ‚Â³/h Ã‚Â· < 4 Ãƒâ€” 10Ã¢ÂÂ»Ã‚Â² mbar Ã‚Â· ÃŽâ€P 50 mbar", "ReforÃƒÂ§o apÃƒÂ³s faixa segura de pressÃƒÂ£o."],
              ["Mangueira", "MG-VAC", "Comprimento (m), diÃƒÂ¢metro e fator de perda", "Impacta perda de carga e tempo de ciclo."],
              ["Tanque", "TQ-REG", "Volume, pressÃƒÂ£o final e limite estrutural", "Base para cÃƒÂ¡lculo de risco e margem."],
              ["Sensor", "SP-TQ", "PressÃƒÂ£o, status e confiabilidade", "Alimenta diagnÃƒÂ³stico e rastreabilidade."]
            ]}
          />
        
          <TseaTechnicalReferenceTables />
</div>
      )}
    </Section>
  );
}

/* TSEA_GEMEO_DIGITAL_10_END */






/* TSEA_HISTORY_REPORTS_REDESIGN_START */

function tseaHRText(value: any) {
  return String(value ?? "--")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tseaHRDate(value?: any) {
  try {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString("pt-BR");
  } catch {
    return "--";
  }
}

function tseaHRNumber(value: any, suffix = "") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${suffix ? " " + suffix : ""}`;
}

function tseaHRReadList(key: string): any[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function tseaHRStatusLabel(status: any) {
  const value = String(status || "").toLowerCase();

  if (["success", "concluido", "concluÃƒÂ­do", "operacional", "ok"].includes(value)) return "Bem-sucedido";
  if (["warning", "atenÃƒÂ§ÃƒÂ£o", "atencao", "em_andamento"].includes(value)) return "Aprovado com restriÃƒÂ§ÃƒÂ£o";
  if (["critical", "crÃƒÂ­tico", "critico", "abortado", "falha"].includes(value)) return "Reprovado / CrÃƒÂ­tico";

  return String(status || "Registrado");
}

function tseaHRStatusBadge(status: any) {
  const value = String(status || "").toLowerCase();

  if (value.includes("warning") || value.includes("aten")) return "warning";
  if (value.includes("critical") || value.includes("crit") || value.includes("abort") || value.includes("falha")) return "critical";
  return "success";
}

function tseaHRWordStyle() {
  return `
    @page WordSection1 {
      size: A4;
      margin: 3cm 2cm 2cm 3cm;
    }

    body {
      font-family: "Times New Roman", serif;
      font-size: 12pt;
      color: #000;
      line-height: 1.5;
    }

    div.WordSection1 {
      page: WordSection1;
    }

    .cover {
      text-align: center;
      min-height: 900px;
      padding-top: 70px;
    }

    .cover h1 {
      font-size: 16pt;
      text-transform: uppercase;
      margin-top: 130px;
      margin-bottom: 80px;
      font-weight: bold;
    }

    .cover h2 {
      font-size: 14pt;
      text-transform: uppercase;
      margin-bottom: 12px;
      font-weight: bold;
    }

    .cover .bottom {
      margin-top: 180px;
      font-size: 12pt;
    }

    h1 {
      font-size: 14pt;
      text-transform: uppercase;
      margin-top: 24px;
      margin-bottom: 12px;
    }

    h2 {
      font-size: 12pt;
      text-transform: uppercase;
      margin-top: 18px;
      margin-bottom: 8px;
    }

    p {
      text-align: justify;
      margin: 8px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 18px;
      font-size: 10.5pt;
    }

    th, td {
      border: 1px solid #000;
      padding: 6px;
      vertical-align: top;
    }

    th {
      background: #e6e6e6;
      font-weight: bold;
      text-align: center;
    }

    .page-break {
      page-break-before: always;
    }

    .sumario p {
      text-align: left;
      margin: 4px 0;
    }

    .caption {
      font-size: 10pt;
      text-align: center;
      margin-top: 4px;
      margin-bottom: 16px;
    }
  `;
}

function tseaHRDownloadWord(filename: string, body: string) {
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <title>${tseaHRText(filename)}</title>
        <style>${tseaHRWordStyle()}</style>
      </head>
      <body>
        <div class="WordSection1">${body}</div>
      </body>
    </html>
  `;

  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".doc") ? filename : `${filename}.doc`;
  link.click();
  URL.revokeObjectURL(url);
}

function tseaHRTable(headers: string[], rows: any[][]) {
  const head = headers.map((header) => `<th>${tseaHRText(header)}</th>`).join("");
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${tseaHRText(cell)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}">Sem registros.</td></tr>`;

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function tseaHRRampSvg(points: any[]) {
  const list = Array.isArray(points) && points.length ? points : Array.from({ length: 18 }).map((_, index) => {
    const step = index / 17;
    return {
      second: Math.round(step * 600),
      real_pressure_mbar: Math.max(6.5, 1013 * Math.exp(-step * 5.2) + 6.5),
      expected_pressure_mbar: Math.max(6.5, 1013 * Math.exp(-step * 5.5) + 6.5),
      effective_pressure_mbar: 6.5 + step * 8
    };
  });

  const values = list.flatMap((item: any) => [
    Number(item.real_pressure_mbar || item.pressure_mbar || 0),
    Number(item.expected_pressure_mbar || 0),
    Number(item.effective_pressure_mbar || 0)
  ]);

  const max = Math.max(...values, 10);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);

  function poly(key: string) {
    return list.map((item: any, index: number) => {
      const value = Number(item[key] || (key === "real_pressure_mbar" ? item.pressure_mbar : 0) || 0);
      const x = 40 + (index / Math.max(list.length - 1, 1)) * 650;
      const y = 300 - ((value - min) / span) * 240;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }

  return `
    <svg width="700" height="340" viewBox="0 0 740 360" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="740" height="360" fill="#ffffff" />
      <line x1="40" y1="300" x2="700" y2="300" stroke="#000" stroke-width="1" />
      <line x1="40" y1="40" x2="40" y2="300" stroke="#000" stroke-width="1" />
      <text x="40" y="25" font-family="Times New Roman" font-size="14">PressÃƒÂ£o x Tempo</text>
      <text x="610" y="330" font-family="Times New Roman" font-size="12">Tempo</text>
      <text x="5" y="55" font-family="Times New Roman" font-size="12">mbar</text>
      <polyline points="${poly("expected_pressure_mbar")}" fill="none" stroke="#333333" stroke-width="2" />
      <polyline points="${poly("real_pressure_mbar")}" fill="none" stroke="#0f766e" stroke-width="2.5" />
      <polyline points="${poly("effective_pressure_mbar")}" fill="none" stroke="#b91c1c" stroke-width="2" />
      <rect x="420" y="42" width="260" height="70" fill="#fff" stroke="#000" />
      <line x1="435" y1="60" x2="485" y2="60" stroke="#0f766e" stroke-width="3" />
      <text x="495" y="64" font-family="Times New Roman" font-size="12">Curva simulada/real</text>
      <line x1="435" y1="80" x2="485" y2="80" stroke="#333333" stroke-width="3" />
      <text x="495" y="84" font-family="Times New Roman" font-size="12">Curva esperada</text>
      <line x1="435" y1="100" x2="485" y2="100" stroke="#b91c1c" stroke-width="3" />
      <text x="495" y="104" font-family="Times New Roman" font-size="12">Carga estrutural</text>
    </svg>
  `;
}

function tseaHRGetSimulations() {
  const sources = [
    ...tseaHRReadList("tsea.gemeo10.history"),
    ...tseaHRReadList("tsea.simulationHistory.final"),
    ...tseaHRReadList("tsea.simulations")
  ];

  const map = new Map<string, any>();

  sources.forEach((item: any) => {
    if (!item) return;
    const key = String(item.id || item.created_at || item.scenario || Math.random());
    if (!map.has(key)) map.set(key, item);
  });

  return Array.from(map.values()).sort((a, b) => {
    const da = new Date(a.created_at || a.data || 0).getTime();
    const db = new Date(b.created_at || b.data || 0).getTime();
    return db - da;
  });
}

function tseaHRComponentRows(record: any, allTanks: any[], allHoses: any[]) {
  if (Array.isArray(record?.components) && record.components.length) {
    return record.components.map((item: any) => [
      item.type || item.tipo || "Componente",
      item.id || item.codigo || item.identificacao || "--",
      item.status || "--",
      item.performance || item.desempenho || "--",
      item.reading || item.leitura || "--",
      item.impact || item.impacto || "--"
    ]);
  }

  const config = record?.config || record || {};
  const tankCode = record?.tank || record?.tanque || config?.tank_type || config?.tanque || allTanks?.[0]?.code || "--";
  const hoseCode = record?.hose || record?.mangueira || config?.hose_id || config?.mangueira || allHoses?.[0]?.code || "--";
  const pressure = record?.pressure || record?.pressaoFinal || record?.metrics?.final_real_pressure_mbar || config?.target_pressure_mbar || config?.pressaoFinal || "--";

  return [
    ["Bomba primÃƒÂ¡ria", "Leybold SOGEVAC SV 630 B", "Operacional", "98%", "640 mÃ‚Â³/h", "EvacuaÃƒÂ§ÃƒÂ£o inicial e sustentaÃƒÂ§ÃƒÂ£o do vÃƒÂ¡cuo."],
    ["Bomba secundÃƒÂ¡ria", "Leybold RUVAC WSU 2001", "Conforme intertravamento", "96%", "2050 mÃ‚Â³/h", "ReforÃƒÂ§o do vÃƒÂ¡cuo apÃƒÂ³s faixa segura."],
    ["Mangueira de vÃƒÂ¡cuo", hoseCode, "Operacional", "Conforme fator de perda", String(config?.hose_loss_factor || config?.loss_factor || record?.metrics?.hose_loss_factor || "--"), "Perda de carga e ligaÃƒÂ§ÃƒÂ£o entre bomba/tanque."],
    ["Tanque de processo", tankCode, tseaHRStatusLabel(record?.status), "--", tseaHRNumber(pressure, "mbar"), "Volume, pressÃƒÂ£o e margem estrutural."],
    ["Sensor de pressÃƒÂ£o", `SP-${tankCode}`, config?.simulate_sensor_failure ? "Falha simulada" : "Online", config?.simulate_sensor_failure ? "35%" : "98%", tseaHRNumber(pressure, "mbar"), "Leitura (unidade do sensor) usada no controle e rastreabilidade."],
    ["Sistema de ÃƒÂ³leo", "InjeÃƒÂ§ÃƒÂ£o de ÃƒÂ³leo", Number(config?.oil_flow_l_min || config?.vazaoOleo || 2) < 1.5 ? "VazÃƒÂ£o baixa" : "Operacional", "--", tseaHRNumber(config?.oil_flow_l_min || config?.vazaoOleo || record?.metrics?.oil_flow_l_min || 2, "L/min"), "VedaÃƒÂ§ÃƒÂ£o, estabilidade e proteÃƒÂ§ÃƒÂ£o do conjunto."]
  ];
}

function tseaHRActionsRows(record: any) {
  if (Array.isArray(record?.actions) && record.actions.length) {
    return record.actions.map((item: any) => [
      item.step || item.etapa || "Etapa",
      item.status || "--",
      item.ref || item.referencia || "--",
      item.log || item.registro || "--"
    ]);
  }

  const config = record?.config || record || {};

  return [
    ["PreparaÃƒÂ§ÃƒÂ£o", "ConcluÃƒÂ­da", record?.scenario || record?.recipe || record?.receita || "--", "ParÃƒÂ¢metros carregados no sistema."],
    ["SeleÃƒÂ§ÃƒÂ£o de tanque", "ConcluÃƒÂ­da", record?.tank || record?.tanque || config?.tank_type || "--", "Tanque vinculado ao ciclo."],
    ["ConexÃƒÂ£o da mangueira", "ConcluÃƒÂ­da", record?.hose || record?.mangueira || config?.hose_id || "--", "Mangueira associada ao processo de vÃƒÂ¡cuo."],
    ["EvacuaÃƒÂ§ÃƒÂ£o inicial", "Registrada", "Bomba primÃƒÂ¡ria", "ReduÃƒÂ§ÃƒÂ£o inicial da pressÃƒÂ£o."],
    ["Acionamento da bomba secundÃƒÂ¡ria", "Avaliado", tseaHRNumber(config?.secondary_start_pressure_mbar || config?.roots_start_pressure_mbar || 50, "mbar"), "Intertravamento analisado por faixa segura."],
    ["Fechamento", tseaHRStatusLabel(record?.status), record?.id || "--", record?.recommendation || "Resultado consolidado para relatÃƒÂ³rio."]
  ];
}

function tseaHRInfoRows(record: any) {
  const config = record?.config || record || {};

  return [
    ["ID", record?.id || "--"],
    ["Data/hora", tseaHRDate(record?.created_at || record?.data || record?.started_at)],
    ["CenÃƒÂ¡rio / operaÃƒÂ§ÃƒÂ£o", record?.scenario || record?.nome || record?.recipe || record?.receita || "--"],
    ["Operador", record?.operator || record?.operador || config?.operator || "--"],
    ["Lote / ordem", record?.lot || record?.lote || config?.lot || "--"],
    ["Tanque", record?.tank || record?.tanque || config?.tank_type || "--"],
    ["Mangueira", record?.hose || record?.mangueira || config?.hose_id || "--"],
    ["PressÃƒÂ£o final (mbar)", tseaHRNumber(record?.pressure || record?.pressaoFinal || record?.metrics?.final_real_pressure_mbar || config?.target_pressure_mbar || config?.pressaoFinal, "mbar")],
    ["Tempo estimado (s)", tseaHRNumber(record?.duration || record?.metrics?.estimated_time_seconds || config?.max_cycle_seconds, "s")],
    ["Risco mÃƒÂ¡ximo (%)", tseaHRNumber(record?.metrics?.max_collapse_risk_pct || record?.metrics?.risco, "%")],
    ["VazÃƒÂ£o de ÃƒÂ³leo (L/min)", tseaHRNumber(config?.oil_flow_l_min || config?.vazaoOleo || record?.metrics?.oil_flow_l_min, "L/min")],
    ["Status", tseaHRStatusLabel(record?.status)],
    ["DiagnÃƒÂ³stico", record?.diagnosis || record?.diagnostico || "--"],
    ["RecomendaÃƒÂ§ÃƒÂ£o", record?.recommendation || record?.recomendacao || "--"]
  ];
}

function tseaHRBuildWordRecord(record: any, kind: string, allTanks: any[], allHoses: any[]) {
  const componentRows = tseaHRComponentRows(record, allTanks, allHoses);
  const actionRows = tseaHRActionsRows(record);
  const infoRows = tseaHRInfoRows(record);
  const timeline = record?.timeline || record?.ramp || record?.curve || record?.points || [];

  const title = kind === "simulation"
    ? `RelatÃƒÂ³rio TÃƒÂ©cnico da SimulaÃƒÂ§ÃƒÂ£o ${record?.id || ""}`
    : `RelatÃƒÂ³rio TÃƒÂ©cnico da OperaÃƒÂ§ÃƒÂ£o ${record?.id || ""}`;

  return `
    <div class="cover">
      <h2>TSEA</h2>
      <h2>SupervisÃƒÂ³rio Digital</h2>
      <h1>${tseaHRText(title)}</h1>
      <p><strong>Documento:</strong> RelatÃƒÂ³rio tÃƒÂ©cnico</p>
      <p><strong>Sistema:</strong> Rastreabilidade e GÃƒÂªmeo Digital do processo de vÃƒÂ¡cuo</p>
      <p><strong>Data de emissÃƒÂ£o:</strong> ${tseaHRDate()}</p>
      <div class="bottom">
        <p>Belo Horizonte</p>
        <p>${new Date().getFullYear()}</p>
      </div>
    </div>

    <div class="page-break sumario">
      <h1>SumÃƒÂ¡rio</h1>
      <p>1. IdentificaÃƒÂ§ÃƒÂ£o</p>
      <p>2. GrÃƒÂ¡fico da rampa de vÃƒÂ¡cuo</p>
      <p>3. Rastreabilidade de mÃƒÂ¡quinas e peÃƒÂ§as</p>
      <p>4. AÃƒÂ§ÃƒÂµes registradas</p>
      <p>5. InformaÃƒÂ§ÃƒÂµes adicionais</p>
      <p>6. ConclusÃƒÂ£o tÃƒÂ©cnica</p>
    </div>

    <div class="page-break">
      <h1>1. IdentificaÃƒÂ§ÃƒÂ£o</h1>
      ${tseaHRTable(["Campo", "InformaÃƒÂ§ÃƒÂ£o"], infoRows.slice(0, 8))}

      <h1>2. GrÃƒÂ¡fico da rampa de vÃƒÂ¡cuo</h1>
      ${tseaHRRampSvg(timeline)}
      <p class="caption">Figura 1 Ã¢â‚¬â€ Curva da rampa de vÃƒÂ¡cuo: pressÃƒÂ£o simulada/real, curva esperada e carga estrutural.</p>

      <h1>3. Rastreabilidade de mÃƒÂ¡quinas e peÃƒÂ§as</h1>
      ${tseaHRTable(["Componente", "IdentificaÃƒÂ§ÃƒÂ£o", "Status", "Desempenho (%)", "Leitura (unidade do sensor)", "Impacto"], componentRows)}

      <h1>4. AÃƒÂ§ÃƒÂµes registradas</h1>
      ${tseaHRTable(["Etapa", "Status", "ReferÃƒÂªncia", "Registro tÃƒÂ©cnico"], actionRows)}

      <h1>5. InformaÃƒÂ§ÃƒÂµes adicionais</h1>
      ${tseaHRTable(["Campo", "Valor"], infoRows)}

      <h1>6. ConclusÃƒÂ£o tÃƒÂ©cnica</h1>
      <p>
        O registro apresenta rastreabilidade dos principais componentes envolvidos no processo de vÃƒÂ¡cuo,
        incluindo bombas, mangueira, tanque, sensores e sistema de ÃƒÂ³leo. As informaÃƒÂ§ÃƒÂµes consolidadas permitem
        anÃƒÂ¡lise operacional, investigaÃƒÂ§ÃƒÂ£o de falhas, padronizaÃƒÂ§ÃƒÂ£o de procedimentos e suporte ÃƒÂ  tomada de decisÃƒÂ£o tÃƒÂ©cnica.
      </p>
    </div>
  `;
}

function tseaHRBuildWordGeneral(operations: any[], simulations: any[]) {
  const opRows = operations.map((op: any) => [
    op.id || "--",
    tseaHRDate(op.created_at || op.data || op.started_at),
    op.operator || op.operador || "--",
    op.tank || op.tanque || "--",
    op.hose || op.mangueira || "--",
    tseaHRStatusLabel(op.status)
  ]);

  const simRows = simulations.map((sim: any) => [
    sim.id || "--",
    tseaHRDate(sim.created_at || sim.data),
    sim.scenario || sim.nome || "--",
    tseaHRStatusLabel(sim.status),
    tseaHRNumber(sim.metrics?.max_collapse_risk_pct || sim.metrics?.risco, "%"),
    tseaHRNumber(sim.metrics?.final_real_pressure_mbar || sim.metrics?.pressaoFinal, "mbar")
  ]);

  return `
    <div class="cover">
      <h2>TSEA</h2>
      <h2>SupervisÃƒÂ³rio Digital</h2>
      <h1>RelatÃƒÂ³rio Geral de OperaÃƒÂ§ÃƒÂµes e SimulaÃƒÂ§ÃƒÂµes</h1>
      <p><strong>Documento:</strong> RelatÃƒÂ³rio tÃƒÂ©cnico gerencial</p>
      <p><strong>Sistema:</strong> Rastreabilidade, operaÃƒÂ§ÃƒÂ£o e GÃƒÂªmeo Digital do processo de vÃƒÂ¡cuo</p>
      <p><strong>Data de emissÃƒÂ£o:</strong> ${tseaHRDate()}</p>
      <div class="bottom">
        <p>Belo Horizonte</p>
        <p>${new Date().getFullYear()}</p>
      </div>
    </div>

    <div class="page-break sumario">
      <h1>SumÃƒÂ¡rio</h1>
      <p>1. IntroduÃƒÂ§ÃƒÂ£o</p>
      <p>2. Escopo</p>
      <p>3. OperaÃƒÂ§ÃƒÂµes registradas</p>
      <p>4. SimulaÃƒÂ§ÃƒÂµes do GÃƒÂªmeo Digital</p>
      <p>5. ConclusÃƒÂ£o tÃƒÂ©cnica</p>
    </div>

    <div class="page-break">
      <h1>1. IntroduÃƒÂ§ÃƒÂ£o</h1>
      <p>
        Este relatÃƒÂ³rio consolida registros operacionais e simulaÃƒÂ§ÃƒÂµes executadas no TSEA SupervisÃƒÂ³rio Digital,
        com foco em rastreabilidade, anÃƒÂ¡lise tÃƒÂ©cnica, controle de processo e apoio ÃƒÂ  padronizaÃƒÂ§ÃƒÂ£o do ciclo de vÃƒÂ¡cuo.
      </p>

      <h1>2. Escopo</h1>
      <p>
        O documento contempla operaÃƒÂ§ÃƒÂµes, simulaÃƒÂ§ÃƒÂµes, status, parÃƒÂ¢metros principais e informaÃƒÂ§ÃƒÂµes tÃƒÂ©cnicas relevantes
        para avaliaÃƒÂ§ÃƒÂ£o operacional.
      </p>

      <h1>3. OperaÃƒÂ§ÃƒÂµes registradas</h1>
      ${tseaHRTable(["ID", "Data", "Operador", "Tanque", "Mangueira", "Status"], opRows)}

      <h1>4. SimulaÃƒÂ§ÃƒÂµes do GÃƒÂªmeo Digital</h1>
      ${tseaHRTable(["ID", "Data", "CenÃƒÂ¡rio", "Status", "Risco", "PressÃƒÂ£o final (mbar)"], simRows)}

      <h1>5. ConclusÃƒÂ£o tÃƒÂ©cnica</h1>
      <p>
        Os registros permitem acompanhamento tÃƒÂ©cnico, rastreabilidade de processo e base documental para auditoria,
        melhoria contÃƒÂ­nua e evoluÃƒÂ§ÃƒÂ£o do GÃƒÂªmeo Digital para integraÃƒÂ§ÃƒÂ£o com dados reais da linha de produÃƒÂ§ÃƒÂ£o.
      </p>
    </div>
  `;
}

function TseaRecordDetail({ record, kind, allTanks, allHoses, onClose }: any) {
  const infoRows = tseaHRInfoRows(record);
  const componentRows = tseaHRComponentRows(record, allTanks, allHoses);
  const actionRows = tseaHRActionsRows(record);
  const timeline = record?.timeline || record?.ramp || record?.curve || record?.points || [];

  function exportWord() {
    const html = tseaHRBuildWordRecord(record, kind, allTanks, allHoses);
    const prefix = kind === "simulation" ? "Relatorio_Simulacao" : "Relatorio_Operacao";
    tseaHRDownloadWord(`${prefix}_${record?.id || "TSEA"}.doc`, html);
  }

  return (
    <div className="hrDetailPanel">
      <div className="hrDetailHeader">
        <div>
          <span>{kind === "simulation" ? "SimulaÃƒÂ§ÃƒÂ£o" : "OperaÃƒÂ§ÃƒÂ£o"}</span>
          <h3>{record?.scenario || record?.nome || record?.id || "Registro tÃƒÂ©cnico"}</h3>
          <p>{record?.diagnosis || record?.diagnostico || "Detalhamento tÃƒÂ©cnico do registro selecionado."}</p>
        </div>

        <div className="hrActions">
          <button onClick={exportWord}>Salvar Word</button>
          <button className="secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>

      <div className="metrics">
        <Metric label="Status" value={<Badge value={tseaHRStatusBadge(record?.status)} />} detail={tseaHRStatusLabel(record?.status)} />
        <Metric label="PressÃƒÂ£o final (mbar)" value={tseaHRNumber(record?.pressure || record?.pressaoFinal || record?.metrics?.final_real_pressure_mbar || record?.config?.target_pressure_mbar, "mbar")} detail="Valor registrado/calculado" />
        <Metric label="Tempo" value={tseaHRNumber(record?.duration || record?.metrics?.estimated_time_seconds || record?.config?.max_cycle_seconds, "s")} detail="DuraÃƒÂ§ÃƒÂ£o (s) ou estimativa" />
        <Metric label="Risco" value={tseaHRNumber(record?.metrics?.max_collapse_risk_pct || record?.metrics?.risco, "%")} detail="AvaliaÃƒÂ§ÃƒÂ£o tÃƒÂ©cnica" />
      </div>

      <div className="hrBlock">
        <h3>GrÃƒÂ¡fico da rampa</h3>
        <div className="hrRamp" dangerouslySetInnerHTML={{ __html: tseaHRRampSvg(timeline) }} />
      </div>

      <div className="hrBlock">
        <h3>Rastreabilidade de mÃƒÂ¡quinas e peÃƒÂ§as</h3>
        <Table columns={["Componente", "IdentificaÃƒÂ§ÃƒÂ£o", "Status", "Desempenho (%)", "Leitura (unidade do sensor)", "Impacto"]} rows={componentRows} />
      </div>

      <div className="hrBlock">
        <h3>AÃƒÂ§ÃƒÂµes registradas</h3>
        <Table columns={["Etapa", "Status", "ReferÃƒÂªncia", "Registro tÃƒÂ©cnico"]} rows={actionRows} />
      </div>

      <div className="hrBlock">
        <h3>InformaÃƒÂ§ÃƒÂµes importantes</h3>
        <Table columns={["Campo", "Valor"]} rows={infoRows.slice(0, 8)} />
      </div>

      <div className="hrBlock">
        <h3>InformaÃƒÂ§ÃƒÂµes adicionais</h3>
        <Table columns={["Campo", "Valor"]} rows={infoRows.slice(8)} />
      </div>
    </div>
  );
}

function TseaHistoryMenuV2({ operations = [], state, allTanks = [], allHoses = [] }: any) {
  const [tab, setTab] = useState<"operations" | "simulations">("operations");
  const [selected, setSelected] = useState<any>(null);
  const [selectedKind, setSelectedKind] = useState<"operation" | "simulation">("operation");
  const [simulations, setSimulations] = useState<any[]>([]);

  function loadSims() {
    setSimulations(tseaHRGetSimulations());
  }

  useEffect(() => {
    loadSims();
    const timer = window.setInterval(loadSims, 1500);
    return () => window.clearInterval(timer);
  }, []);

  function openDetail(record: any, kind: "operation" | "simulation") {
    setSelected(record);
    setSelectedKind(kind);
  }

  return (
    <div className="hrMenu">
      <Section title="HistÃƒÂ³rico tÃƒÂ©cnico" subtitle="Consulta organizada de operaÃƒÂ§ÃƒÂµes reais e simulaÃƒÂ§ÃƒÂµes do GÃƒÂªmeo Digital.">
        <div className="hrTabs">
          <button className={tab === "operations" ? "" : "secondary"} onClick={() => setTab("operations")}>OperaÃƒÂ§ÃƒÂµes</button>
          <button className={tab === "simulations" ? "" : "secondary"} onClick={() => setTab("simulations")}>SimulaÃƒÂ§ÃƒÂµes do GÃƒÂªmeo</button>
        </div>

        {tab === "operations" && (
          <Table
            columns={["ID", "Data", "Operador", "Tanque", "Mangueira", "Status", "AÃƒÂ§ÃƒÂµes"]}
            rows={(operations || []).map((op: any) => [
              <b>{op.id || "--"}</b>,
              tseaHRDate(op.created_at || op.data || op.started_at),
              op.operator || op.operador || "--",
              op.tank || op.tanque || op.config?.tank_type || "--",
              op.hose || op.mangueira || op.config?.hose_id || "--",
              <Badge value={tseaHRStatusBadge(op.status)} />,
              <button className="secondary" onClick={() => openDetail(op, "operation")}>Ver detalhes</button>
            ])}
          />
        )}

        {tab === "simulations" && (
          <Table
            columns={["ID", "Data", "CenÃƒÂ¡rio", "Status", "Risco", "PressÃƒÂ£o", "AÃƒÂ§ÃƒÂµes"]}
            rows={(simulations || []).map((sim: any) => [
              <b>{sim.id || "--"}</b>,
              tseaHRDate(sim.created_at || sim.data),
              sim.scenario || sim.nome || "--",
              <Badge value={tseaHRStatusBadge(sim.status)} />,
              tseaHRNumber(sim.metrics?.max_collapse_risk_pct || sim.metrics?.risco, "%"),
              tseaHRNumber(sim.metrics?.final_real_pressure_mbar || sim.metrics?.pressaoFinal, "mbar"),
              <button className="secondary" onClick={() => openDetail(sim, "simulation")}>Ver detalhes</button>
            ])}
          />
        )}
      </Section>

      {selected && (
        <TseaRecordDetail
          record={selected}
          kind={selectedKind}
          allTanks={allTanks}
          allHoses={allHoses}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function TseaReportsMenuV2({ operations = [], state, allTanks = [], allHoses = [] }: any) {
  const [tab, setTab] = useState<"overview" | "operations" | "simulations" | "individual">("overview");
  const [period, setPeriod] = useState<"all" | "today" | "7" | "30">("all");
  const [status, setStatus] = useState("all");
  const [simulations, setSimulations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [selectedKind, setSelectedKind] = useState<"operation" | "simulation">("operation");

  useEffect(() => {
    function load() {
      setSimulations(tseaHRGetSimulations());
    }

    load();
    const timer = window.setInterval(load, 1500);
    return () => window.clearInterval(timer);
  }, []);

  function inPeriod(item: any) {
    if (period === "all") return true;

    const raw = item.created_at || item.data || item.started_at;
    const date = raw ? new Date(raw) : null;

    if (!date || Number.isNaN(date.getTime())) return true;

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = diff / (1000 * 60 * 60 * 24);

    if (period === "today") {
      return date.toDateString() === now.toDateString();
    }

    if (period === "7") return days <= 7;
    if (period === "30") return days <= 30;

    return true;
  }

  function matchStatus(item: any) {
    if (status === "all") return true;
    return String(item.status || "").toLowerCase().includes(status);
  }

  const filteredOperations = (operations || []).filter((item: any) => inPeriod(item) && matchStatus(item));
  const filteredSimulations = (simulations || []).filter((item: any) => inPeriod(item) && matchStatus(item));

  function exportGeneral() {
    const html = tseaHRBuildWordGeneral(filteredOperations, filteredSimulations);
    tseaHRDownloadWord("Relatorio_Geral_TSEA_Supervisorio_Digital.doc", html);
  }

  function exportOperations() {
    const html = tseaHRBuildWordGeneral(filteredOperations, []);
    tseaHRDownloadWord("Relatorio_Operacoes_TSEA.doc", html);
  }

  function exportSimulations() {
    const html = tseaHRBuildWordGeneral([], filteredSimulations);
    tseaHRDownloadWord("Relatorio_Simulacoes_Gemeo_Digital_TSEA.doc", html);
  }

  function exportSpecific(record: any, kind: "operation" | "simulation") {
    const html = tseaHRBuildWordRecord(record, kind, allTanks, allHoses);
    const name = kind === "simulation" ? "Relatorio_Simulacao" : "Relatorio_Operacao";
    tseaHRDownloadWord(`${name}_${record?.id || "TSEA"}.doc`, html);
  }

  function openDetail(record: any, kind: "operation" | "simulation") {
    setSelected(record);
    setSelectedKind(kind);
    setTab("individual");
  }

  return (
    <div className="hrMenu">
      <Section title="RelatÃƒÂ³rios tÃƒÂ©cnicos" subtitle="GeraÃƒÂ§ÃƒÂ£o organizada de documentos Word para operaÃƒÂ§ÃƒÂµes, simulaÃƒÂ§ÃƒÂµes e registros individuais.">
        <div className="hrTabs">
          <button className={tab === "overview" ? "" : "secondary"} onClick={() => setTab("overview")}>VisÃƒÂ£o geral</button>
          <button className={tab === "operations" ? "" : "secondary"} onClick={() => setTab("operations")}>OperaÃƒÂ§ÃƒÂµes</button>
          <button className={tab === "simulations" ? "" : "secondary"} onClick={() => setTab("simulations")}>SimulaÃƒÂ§ÃƒÂµes</button>
          <button className={tab === "individual" ? "" : "secondary"} onClick={() => setTab("individual")}>RelatÃƒÂ³rio individual</button>
        </div>

        <div className="hrFilters">
          <Field label="PerÃƒÂ­odo">
            <select value={period} onChange={(event) => setPeriod(event.target.value as any)}>
              <option value="all">Todos</option>
              <option value="today">Hoje</option>
              <option value="7">ÃƒÅ¡ltimos 7 dias</option>
              <option value="30">ÃƒÅ¡ltimos 30 dias</option>
            </select>
          </Field>

          <Field label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">Todos</option>
              <option value="success">Bem-sucedido</option>
              <option value="warning">RestriÃƒÂ§ÃƒÂ£o</option>
              <option value="critical">CrÃƒÂ­tico</option>
            </select>
          </Field>
        </div>
      </Section>

      {tab === "overview" && (
        <Section title="VisÃƒÂ£o geral dos relatÃƒÂ³rios" subtitle="Resumo dos registros disponÃƒÂ­veis para exportaÃƒÂ§ÃƒÂ£o.">
          <div className="metrics">
            <Metric label="OperaÃƒÂ§ÃƒÂµes filtradas" value={filteredOperations.length} detail="Registros operacionais" />
            <Metric label="SimulaÃƒÂ§ÃƒÂµes filtradas" value={filteredSimulations.length} detail="GÃƒÂªmeo Digital" />
            <Metric label="RelatÃƒÂ³rios Word" value="3 tipos" detail="Geral, por mÃƒÂ³dulo e individual" />
            <Metric label="Formato" value=".doc" detail="CompatÃƒÂ­vel com Word" />
          </div>

          <div className="hrActions">
            <button onClick={exportGeneral}>Exportar relatÃƒÂ³rio geral Word</button>
            <button className="secondary" onClick={exportOperations}>Exportar operaÃƒÂ§ÃƒÂµes Word</button>
            <button className="secondary" onClick={exportSimulations}>Exportar simulaÃƒÂ§ÃƒÂµes Word</button>
          </div>
        </Section>
      )}

      {tab === "operations" && (
        <Section title="RelatÃƒÂ³rio de operaÃƒÂ§ÃƒÂµes" subtitle="Selecione uma operaÃƒÂ§ÃƒÂ£o para visualizar detalhes ou gerar relatÃƒÂ³rio individual.">
          <Table
            columns={["ID", "Data", "Operador", "Tanque", "Mangueira", "Status", "AÃƒÂ§ÃƒÂµes"]}
            rows={filteredOperations.map((op: any) => [
              <b>{op.id || "--"}</b>,
              tseaHRDate(op.created_at || op.data || op.started_at),
              op.operator || op.operador || "--",
              op.tank || op.tanque || op.config?.tank_type || "--",
              op.hose || op.mangueira || op.config?.hose_id || "--",
              <Badge value={tseaHRStatusBadge(op.status)} />,
              <div className="hrActions inline">
                <button className="secondary" onClick={() => openDetail(op, "operation")}>Ver detalhes</button>
                <button onClick={() => exportSpecific(op, "operation")}>Salvar Word</button>
              </div>
            ])}
          />
        </Section>
      )}

      {tab === "simulations" && (
        <Section title="RelatÃƒÂ³rio de simulaÃƒÂ§ÃƒÂµes" subtitle="SimulaÃƒÂ§ÃƒÂµes executadas no GÃƒÂªmeo Digital com status, risco e pressÃƒÂ£o final.">
          <Table
            columns={["ID", "Data", "CenÃƒÂ¡rio", "Status", "Risco", "PressÃƒÂ£o", "AÃƒÂ§ÃƒÂµes"]}
            rows={filteredSimulations.map((sim: any) => [
              <b>{sim.id || "--"}</b>,
              tseaHRDate(sim.created_at || sim.data),
              sim.scenario || sim.nome || "--",
              <Badge value={tseaHRStatusBadge(sim.status)} />,
              tseaHRNumber(sim.metrics?.max_collapse_risk_pct || sim.metrics?.risco, "%"),
              tseaHRNumber(sim.metrics?.final_real_pressure_mbar || sim.metrics?.pressaoFinal, "mbar"),
              <div className="hrActions inline">
                <button className="secondary" onClick={() => openDetail(sim, "simulation")}>Ver detalhes</button>
                <button onClick={() => exportSpecific(sim, "simulation")}>Salvar Word</button>
              </div>
            ])}
          />
        </Section>
      )}

      {tab === "individual" && (
        selected ? (
          <TseaRecordDetail
            record={selected}
            kind={selectedKind}
            allTanks={allTanks}
            allHoses={allHoses}
            onClose={() => setSelected(null)}
          />
        ) : (
          <Section title="RelatÃƒÂ³rio individual" subtitle="Escolha uma operaÃƒÂ§ÃƒÂ£o ou simulaÃƒÂ§ÃƒÂ£o nas abas anteriores para visualizar e exportar.">
            <Empty text="Nenhum registro selecionado." />
          </Section>
        )
      )}
    </div>
  );
}

/* TSEA_HISTORY_REPORTS_REDESIGN_END */














/* TSEA_TABELAS_TECNICAS_MARGEM_START */

function TseaTechnicalReferenceTables() {
  const unitRows = [
    ["mbar", "PressÃƒÂ£o / vÃƒÂ¡cuo", "Usado em pressÃƒÂ£o atual, pressÃƒÂ£o final, pressÃƒÂ£o de acionamento e limite estrutural."],
    ["s", "Tempo em segundos", "Usado em atraso do ÃƒÂ³leo, tempo mÃƒÂ¡ximo, tempo estimado e duraÃƒÂ§ÃƒÂ£o do ciclo."],
    ["L/min", "VazÃƒÂ£o de ÃƒÂ³leo", "Indica o volume de ÃƒÂ³leo aplicado por minuto no processo."],
    ["L", "Volume", "Quantidade de ÃƒÂ³leo registrada no tanque ou no sistema."],
    ["%", "Percentual", "Usado em risco, desempenho, eficiÃƒÂªncia, desvio e margem de erro."],
    ["0 a 1", "SaÃƒÂºde relativa", "Escala de condiÃƒÂ§ÃƒÂ£o do equipamento. Valor 1 indica condiÃƒÂ§ÃƒÂ£o ideal."],
    ["m", "Comprimento", "Comprimento da mangueira."],
    ["mm", "DiÃƒÂ¢metro", "DiÃƒÂ¢metro interno da mangueira."],
    ["mÃ‚Â³/h", "VazÃƒÂ£o nominal", "Capacidade nominal das bombas."],
    ["kW", "PotÃƒÂªncia", "PotÃƒÂªncia nominal de equipamentos."],
    ["Ã‚Â°C", "Temperatura", "Leitura tÃƒÂ©rmica de bomba, tanque ou ambiente."]
  ];

  const parameterRows = [
    ["PressÃƒÂ£o final", "Valor alvo de vÃƒÂ¡cuo ou pressÃƒÂ£o ao final do ciclo.", "mbar"],
    ["Tempo estimado", "Tempo previsto para conclusÃƒÂ£o da operaÃƒÂ§ÃƒÂ£o.", "s"],
    ["Atraso do ÃƒÂ³leo", "Intervalo considerado antes da estabilizaÃƒÂ§ÃƒÂ£o/atuaÃƒÂ§ÃƒÂ£o do ÃƒÂ³leo no processo.", "s"],
    ["VazÃƒÂ£o de ÃƒÂ³leo", "Fluxo de ÃƒÂ³leo aplicado durante a operaÃƒÂ§ÃƒÂ£o.", "L/min"],
    ["SaÃƒÂºde da bomba", "Indicador relativo da condiÃƒÂ§ÃƒÂ£o operacional da bomba.", "0 a 1"],
    ["Fator de perda da mangueira", "Multiplicador usado para representar perda de eficiÃƒÂªncia pela mangueira.", "multiplicador"],
    ["Risco operacional", "ÃƒÂndice tÃƒÂ©cnico usado para representar criticidade da operaÃƒÂ§ÃƒÂ£o.", "%"],
    ["Leitura do sensor", "Valor medido usado para diagnÃƒÂ³stico e rastreabilidade.", "depende da variÃƒÂ¡vel medida"]
  ];

  const marginRows = [
    ["Desvio percentual", "|valor medido - valor esperado| / valor esperado Ãƒâ€” 100", "Calcula o quanto o valor real/simulado se afastou do esperado."],
    ["Dentro da margem", "desvio Ã¢â€°Â¤ margem permitida", "Status Operacional / semÃƒÂ¡foro verde."],
    ["Faixa de atenÃƒÂ§ÃƒÂ£o", "margem < desvio Ã¢â€°Â¤ 2 Ãƒâ€” margem", "Status AtenÃƒÂ§ÃƒÂ£o / semÃƒÂ¡foro amarelo."],
    ["Faixa crÃƒÂ­tica", "desvio > 2 Ãƒâ€” margem", "Status CrÃƒÂ­tico / semÃƒÂ¡foro vermelho."],
    ["Status geral", "se qualquer parÃƒÂ¢metro essencial for crÃƒÂ­tico, o processo fica crÃƒÂ­tico", "Regra conservadora para seguranÃƒÂ§a operacional."],
    ["AplicaÃƒÂ§ÃƒÂ£o futura", "pressÃƒÂ£o, tempo, vazÃƒÂ£o de ÃƒÂ³leo, sensor e desempenho das bombas", "A margem de erro poderÃƒÂ¡ padronizar os alertas do sistema e do semÃƒÂ¡foro fÃƒÂ­sico."]
  ];

  return (
    <div className="technicalReferenceTables">
      <div className="technicalReferenceBlock">
        <h3>Unidades de medida utilizadas</h3>
        <p>ReferÃƒÂªncia para interpretaÃƒÂ§ÃƒÂ£o dos campos numÃƒÂ©ricos do sistema.</p>
        <Table
          columns={["Unidade", "AplicaÃƒÂ§ÃƒÂ£o", "DescriÃƒÂ§ÃƒÂ£o"]}
          rows={unitRows.map((item) => [<b>{item[0]}</b>, item[1], item[2]])}
        />
      </div>

      <div className="technicalReferenceBlock">
        <h3>DescriÃƒÂ§ÃƒÂ£o tÃƒÂ©cnica dos principais parÃƒÂ¢metros</h3>
        <p>Resumo do significado dos parÃƒÂ¢metros usados na operaÃƒÂ§ÃƒÂ£o e na anÃƒÂ¡lise tÃƒÂ©cnica.</p>
        <Table
          columns={["ParÃƒÂ¢metro", "DescriÃƒÂ§ÃƒÂ£o", "Unidade"]}
          rows={parameterRows.map((item) => [<b>{item[0]}</b>, item[1], item[2]])}
        />
      </div>

      <div className="technicalReferenceBlock">
        <h3>CritÃƒÂ©rios de margem de erro e semÃƒÂ¡foro operacional</h3>
        <p>A margem de erro define a tolerÃƒÂ¢ncia entre valor esperado e valor medido/simulado.</p>
        <Table
          columns={["CritÃƒÂ©rio", "Regra / FÃƒÂ³rmula", "InterpretaÃƒÂ§ÃƒÂ£o"]}
          rows={marginRows.map((item) => [<b>{item[0]}</b>, item[1], item[2]])}
        />
      </div>
    </div>
  );
}

/* TSEA_TABELAS_TECNICAS_MARGEM_END */




function App() {

  const [tseaDarkTheme, setTseaDarkTheme] = useState(() => localStorage.getItem("tsea.theme") === "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = tseaDarkTheme ? "dark" : "light";
    localStorage.setItem("tsea.theme", tseaDarkTheme ? "dark" : "light");

    let button = document.getElementById("tsea-theme-toggle-fixed") as HTMLButtonElement | null;

    if (!button) {
      button = document.createElement("button");
      button.id = "tsea-theme-toggle-fixed";
      button.type = "button";
      document.body.appendChild(button);
    }

    button.textContent = tseaDarkTheme ? "Claro" : "Escuro";
    button.onclick = () => setTseaDarkTheme((current) => !current);

    return () => {
      if (button) button.onclick = null;
    };
  }, [tseaDarkTheme]);


  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [error, setError] = useState("");

  const [state, setState] = useState<any>(null);
  const [options, setOptions] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [alarms, setAlarms] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [simulations, setSimulations] = useState<any[]>([]);
  const [tanks, setTanks] = useState<any[]>([]);
  const [hoses, setHoses] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);

  const [localTanks, setLocalTanks] = useState<any[]>(() => loadLocal("tsea.localTanks", []));
  const [localHoses, setLocalHoses] = useState<any[]>(() => loadLocal("tsea.localHoses", []));
  const [localRecipes, setLocalRecipes] = useState<any[]>(() => loadLocal("tsea.localRecipes", []));
  const [localFormulas, setLocalFormulas] = useState<any[]>(() => loadLocal("tsea.localFormulas", []));
  const [localOperators, setLocalOperators] = useState<any[]>(() => loadLocal("tsea.localOperators", []));

  const [operationConfig, setOperationConfig] = useState<any>(() => loadLocal("tsea.operationConfig", {
    operator: "Operador TSEA",
    tank_id: 1,
    hose_id: 1,
    recipe_id: 1,
    target_pressure_mbar: 6.5,
    roots_start_pressure_mbar: 50,
    max_cycle_seconds: 900,
    oil_flow_l_min: 2,
    tank_type: "grande",
    notes: "",
  }));

  const [twinTab, setTwinTab] = useState<TwinTab>("scenarios");
  const [twinConfiguracao, setTwinConfiguracao] = useState<any>(() => loadLocal("tsea.twinConfiguracao", {
    tank_type: "grande",
    hose_id: 1,
    target_pressure_mbar: 6.5,
    roots_start_pressure_mbar: 50,
    oil_flow_l_min: 2,
    oil_delay_seconds: 0,
    max_cycle_seconds: 900,
    pump_health_factor: 1,
    calibration_factor: 1,
    hose_correction_enabled: true,
    oil_compensation_enabled: true,
    simulate_hose_leak: false,
    simulate_sensor_failure: false,
  }));

  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");

  const [historyTab, setHistoryTab] = useState<"operations" | "simulations">("operations");
  const [detail, setDetail] = useState<any>(null);

  const [reportTab, setReportTab] = useState<ReportTab>("operations");
  const [reportPeriod, setReportPeriod] = useState("all");

  const [paramTab, setParamTab] = useState<ParamTab>("tanks");
  const [form, setForm] = useState<any>({});

  async function refresh(tick = false) {
    const health = await safe("/health");
    setApiOnline(health.ok);

    if (!health.ok) {
      setError(health.error || "API indisponÃƒÂ­vel.");
      return;
    }

    setError("");

    const [
      stateResult,
      optionsResult,
      reportResult,
      alarmsResult,
      maintenanceResult,
      operationsResult,
      simulationsResult,
      tanksResult,
      hosesResult,
      recipesResult,
    ] = await Promise.all([
      tick ? safe("/operation/tick", { method: "POST" }) : safe("/operation/state"),
      safe("/digital-twin/config-options"),
      safe("/reports/operational"),
      safe("/alarms"),
      safe("/maintenance/prediction"),
      safe("/records/operations"),
      safe("/records/simulations"),
      safe("/tanks"),
      safe("/hoses"),
      safe("/recipes"),
    ]);

    if (stateResult.ok) setState(stateResult.data);
    if (optionsResult.ok) setOptions(optionsResult.data);
    if (reportResult.ok) setReport(reportResult.data);
    if (alarmsResult.ok) setAlarms(alarmsResult.data || []);
    if (maintenanceResult.ok) setMaintenance(maintenanceResult.data || []);
    if (operationsResult.ok) setOperations(operationsResult.data?.items || []);
    if (simulationsResult.ok) setSimulations(simulationsResult.data?.items || []);
    if (tanksResult.ok) setTanks(tanksResult.data || []);
    if (hosesResult.ok) setHoses(hosesResult.data || []);
    if (recipesResult.ok) setRecipes(recipesResult.data || []);
  }

  useEffect(() => {
    refresh(false);
    const timer = window.setInterval(() => refresh(true), 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => saveLocal("tsea.operationConfig", operationConfig), [operationConfig]);
  useEffect(() => saveLocal("tsea.twinConfiguracao", twinConfiguracao), [twinConfiguracao]);
  useEffect(() => saveLocal("tsea.localTanks", localTanks), [localTanks]);
  useEffect(() => saveLocal("tsea.localHoses", localHoses), [localHoses]);
  useEffect(() => saveLocal("tsea.localRecipes", localRecipes), [localRecipes]);
  useEffect(() => saveLocal("tsea.localFormulas", localFormulas), [localFormulas]);
  useEffect(() => saveLocal("tsea.localOperators", localOperators), [localOperators]);

  const apiTanks = Array.isArray(tanks) ? tanks : [];
  const apiHoses = Array.isArray(hoses) ? hoses : [];
  const apiRecipes = Array.isArray(recipes) ? recipes : [];

  const allTanks = [...apiTanks, ...localTanks];
  const allHoses = [...apiHoses, ...localHoses];
  const allRecipes = [...apiRecipes, ...localRecipes];

  const tanksState = state?.tank_states || [];
  const avgPressure = tanksState.reduce((sum: number, item: any) => sum + Number(item.pressure_mbar || 0), 0) / Math.max(tanksState.length, 1);
  const maxRisk = Math.max(0, ...tanksState.map((item: any) => Number(item.collapse_risk_pct || 0)));
  const currentRows = historyTab === "operations" ? operations : simulations;

  const filteredOperations = operations.filter((op: any) => inPeriod(op.created_at, reportPeriod));
  const filteredSimulations = simulations.filter((sim: any) => inPeriod(sim.created_at, reportPeriod));

  function setOp(key: string, value: any) {
    setOperationConfig((current: any) => ({ ...current, [key]: value }));
  }

  function setTwin(key: string, value: any) {
    setTwinConfiguracao((current: any) => ({ ...current, [key]: value }));
  }

  async function control(action: "start" | "pause" | "stop" | "reset" | "emergency") {
    if (action === "start") {
      await safe("/operation/start", {
        method: "POST",
        body: JSON.stringify(operationConfig),
      });
    } else {
      await safe(`/operation/${action}`, { method: "POST" });
    }

    await refresh(false);
  }

  async function runScenario(key: string) {
    setSelectedScenario(key);
    const config = options?.presets?.[key]?.config || {};
    const result = await request("/digital-twin/simulate", {
      method: "POST",
      body: JSON.stringify(config),
    });

    setSimulationResult(result);
    setTwinTab("result");

    await safe("/records/simulations", {
      method: "POST",
      body: JSON.stringify({
        name: options?.presets?.[key]?.name || "SimulaÃƒÂ§ÃƒÂ£o Operacional",
        config,
      }),
    });

    await refresh(false);
  }

  async function runConfiguracaon() {
    const result = await request("/digital-twin/simulate", {
      method: "POST",
      body: JSON.stringify(twinConfiguracao),
    });

    setSimulationResult(result);
    setSelectedScenario("manual");
    setTwinTab("result");

    await safe("/records/simulations", {
      method: "POST",
      body: JSON.stringify({
        name: "Configuracao Configuracao",
        config: twinConfiguracao,
      }),
    });

    await refresh(false);
  }

  function askAssistant() {
    const q = assistantQuestion.toLowerCase();
    const status = simulationResult?.status ? statusLabel(simulationResult.status) : "sem simulaÃƒÂ§ÃƒÂ£o executada";
    const risk = simulationResult?.metrics?.max_collapse_risk_pct;
    const pressure = simulationResult?.metrics?.final_real_pressure_mbar;

    let answer = `Estado atual: ${status}. Risco mÃƒÂ¡ximo (%): ${fmt(risk, "%")}. PressÃƒÂ£o final (mbar): ${fmt(pressure, "mbar")}.`;

    if (q.includes("ÃƒÂ³leo") || q.includes("oleo")) {
      answer += " Verifique vazÃƒÂ£o de injeÃƒÂ§ÃƒÂ£o, atraso de entrada e compensaÃƒÂ§ÃƒÂ£o de ÃƒÂ³leo. Baixa vazÃƒÂ£o ou atraso elevam a carga estrutural.";
    } else if (q.includes("mangueira") || q.includes("mangueira")) {
      answer += " Verifique comprimento, diÃƒÂ¢metro e fator de perda da mangueira de vÃƒÂ¡cuo. Perda elevada altera a curva esperada.";
    } else if (q.includes("roots") || q.includes("bomba")) {
      answer += " Confirme a pressÃƒÂ£o de acionamento da bomba secundÃƒÂ¡ria e o ÃƒÂ­ndice de integridade da bomba. Acionamento fora da faixa aumenta risco operacional.";
    } else if (q.includes("risco")) {
      answer += " O ÃƒÂ­ndice de risco deve ser comparado ao limite estrutural definido para o tanque e ÃƒÂ  margem operacional de seguranÃƒÂ§a.";
    } else {
      answer += " Analise curva esperada, curva real/simulada, mangueira de vÃƒÂ¡cuo, ÃƒÂ³leo e acionamento da bomba secundÃƒÂ¡ria antes de liberar a execuÃƒÂ§ÃƒÂ£o.";
    }

    setAssistantAnswer(answer);
  }

  async function openHistoryDetail(item: any) {
    const path = historyTab === "operations"
      ? `/records/operations/${item.id}`
      : `/records/simulations/${item.id}`;

    const result = await safe(path);
    setDetail(result.data || { record: item });
  }

  function download(filename: string, payload: any) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function saveParam() {
    if (paramTab === "tanks") {
      const item = {
        id: `LT-${Date.now()}`,
        code: form.code || "TQ-NOVO",
        type: form.type || "grande",
        volume_liters: Number(form.volume_liters || 0),
        structural_limit_mbar: Number(form.structural_limit_mbar || 0),
        status: form.status || "available",
      };
      setLocalTanks((list) => [...list, item]);
    }

    if (paramTab === "hoses") {
      const item = {
        id: `LH-${Date.now()}`,
        code: form.code || "MG-NOVA",
        length_m: Number(form.length_m || 0),
        diameter_in: Number(form.diameter_in || 0),
        loss_factor: Number(form.loss_factor || 0),
        status: form.status || "available",
      };
      setLocalHoses((list) => [...list, item]);
    }

    if (paramTab === "recipes") {
      const item = {
        id: form.id || `REC-${Date.now()}`,
        name: form.name || "Receita Operacional",
        title: form.name || "Receita Operacional",
        tank_type: form.tank_type || "Comum",
        target_pressure_mbar: Number(form.target_pressure_mbar || 8),
        roots_start_pressure_mbar: Number(form.roots_start_pressure_mbar || 50),
        max_cycle_seconds: Number(form.max_cycle_seconds || 205),
        estimated_seconds: Number(form.max_cycle_seconds || 205),
        min_oil_flow_l_min: Number(form.min_oil_flow_l_min || 2),
        oil_per_tank_l: Math.max(30, Number(form.min_oil_flow_l_min || 2) * 25),
        note: "Receita cadastrada no sistema do gerente e compartilhada com a IHM pelo Gateway.",
      };

      const result = await safe("/recipes", {
        method: "POST",
        body: JSON.stringify(item),
      });

      if (result.ok) {
        const saved = result.data;
        setRecipes((list) => {
          const current = Array.isArray(list) ? list : [];
          const exists = current.some((recipe: any) => String(recipe.id) === String(saved.id));
          return exists
            ? current.map((recipe: any) => String(recipe.id) === String(saved.id) ? saved : recipe)
            : [...current, saved];
        });
      } else {
        setLocalRecipes((list) => [...list, item]);
      }
    }

    if (paramTab === "formulas") {
      const item = {
        id: `LF-${Date.now()}`,
        name: form.name || "FÃƒÂ³rmula Operacional",
        expression: form.expression || "dP/dt = -(S/V)P",
        variable: form.variable || "PressÃƒÂ£o",
        description: form.description || "Modelo operacional padrÃƒÂ£o",
      };
      setLocalFormulas((list) => [...list, item]);
    }

    if (paramTab === "operators") {
      const item = {
        id: `LO-${Date.now()}`,
        name: form.name || "Operador",
        registration: form.registration || "N/A",
        role: form.role || "OperaÃƒÂ§ÃƒÂ£o",
        status: form.status || "Ativo",
      };
      setLocalOperators((list) => [...list, item]);
    }

    setForm({});
  }

  return (
    <AppShell
      apiOnline={apiOnline}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      setView={setView}
      statusBadge={<Badge value={apiOnline ? "success" : "critical"} />}
      view={view}
    >

        {error && (
          <div className="errorPanel">
            <strong>Falha na leitura simulada</strong>
            <span>{error}</span>
          </div>
        )}

        {view === "dashboard" && (
          <DashboardPage
            avgPressure={avgPressure}
            maxRisk={maxRisk}
            operations={operations}
            simulations={simulations}
            state={state}
            tanksState={tanksState}
          />
        )}

        {view === "operation" && (
          <OperationPage
            ComponentHealthPanel={TseaComponentHealthPanel}
            allHoses={allHoses}
            allRecipes={allRecipes}
            allTanks={allTanks}
            control={control}
            operationConfig={operationConfig}
            setOp={setOp}
            setOperationConfig={setOperationConfig}
            state={state}
            tanksState={tanksState}
          />
        )}

        {view === "twin" && (
          <DigitalTwinPage
            DigitalTwin={TseaDigitalTwin10}
            state={state}
            allTanks={allTanks}
            allHoses={allHoses}
          />
        )}

        {view === "traceability" && (
          <TraceabilityPage
            alarms={alarms}
            operations={operations}
            simulations={simulations}
          />
        )}

        {view === "parameters" && (
          <ParametersPage
            allHoses={allHoses}
            allRecipes={allRecipes}
            allTanks={allTanks}
            form={form}
            localFormulas={localFormulas}
            localOperators={localOperators}
            paramTab={paramTab}
            saveParam={saveParam}
            setForm={setForm}
            setParamTab={setParamTab}
          />
        )}
    </AppShell>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);


