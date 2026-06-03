import { useEffect, useMemo, useState } from "react";
import "./TraceabilityChartsPanel.css";

const API = "http://127.0.0.1:8020/api";

type ChartType = "line" | "bar" | "pie";
type MetricId =
  | "vacuum_ramp"
  | "operations_by_day"
  | "operation_status"
  | "cycle_time"
  | "alarms_by_type"
  | "equipment_usage"
  | "machine_performance"
  | "logs_by_severity"
  | "reports_exported";

type GeneratedSheet = {
  title: string;
  metric: string;
  chart_type: string;
  period: string;
  spreadsheet_url: string;
  spreadsheet_id?: string;
  rows_sent?: number;
  generated_at?: string;
};

type GoogleStatus = {
  configured: boolean;
  source: string;
  webapp_url_masked: string;
  has_shared_secret: boolean;
  generated: GeneratedSheet[];
};

type GeneratedChart = {
  title: string;
  metric: MetricId | string;
  chart_type: ChartType;
  labels: string[];
  series: { name: string; data: number[] }[];
  table: any[];
  legend: { label: string; description: string }[];
  meta?: {
    source?: string;
    sample_count?: number;
    real_data?: boolean;
    empty?: boolean;
  };
};

const METRICS: {
  id: MetricId;
  label: string;
  group: string;
  allowed: ChartType[];
  recommended: ChartType;
}[] = [
  { id: "operations_by_day", label: "Operações por período", group: "Operações", allowed: ["bar", "line"], recommended: "bar" },
  { id: "operation_status", label: "Status das operações", group: "Operações", allowed: ["bar", "pie"], recommended: "pie" },
  { id: "cycle_time", label: "Tempo de ciclo", group: "Desempenho", allowed: ["bar", "line"], recommended: "line" },
  { id: "vacuum_ramp", label: "Rampa de vácuo registrada", group: "Processo", allowed: ["line"], recommended: "line" },
  { id: "alarms_by_type", label: "Alarmes por tipo", group: "Alarmes", allowed: ["bar", "pie"], recommended: "bar" },
  { id: "equipment_usage", label: "Equipamentos e parâmetros", group: "Equipamentos", allowed: ["bar"], recommended: "bar" },
  { id: "machine_performance", label: "Desempenho das máquinas", group: "Equipamentos", allowed: ["bar", "line"], recommended: "bar" },
  { id: "logs_by_severity", label: "Logs por severidade", group: "Auditoria", allowed: ["bar", "pie"], recommended: "bar" },
  { id: "reports_exported", label: "Relatórios exportados", group: "Relatórios", allowed: ["bar", "line"], recommended: "bar" },
];

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

function fmt(value: unknown, suffix = "") {
  const n = Number(value);

  if (value === null || value === undefined || Number.isNaN(n)) return "--";

  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${suffix ? " " + suffix : ""}`;
}

function scale(value: number, min: number, max: number, outMin: number, outMax: number) {
  if (max === min) return (outMin + outMax) / 2;
  return outMin + ((value - min) / (max - min)) * (outMax - outMin);
}

function pathFrom(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function cleanData(chart: GeneratedChart) {
  const values = chart.series?.[0]?.data || [];
  const labels = chart.labels || [];

  return values
    .map((value, index) => ({
      value: Number(value),
      label: String(labels[index] ?? index + 1),
      rawIndex: index,
    }))
    .filter((item) => Number.isFinite(item.value));
}

function isEmptyChart(chart: GeneratedChart) {
  return Boolean(chart.meta?.empty) || cleanData(chart).length === 0;
}

function Axis({
  width,
  height,
  left,
  right,
  top,
  bottom,
  xLabels,
  yLabels,
}: {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  xLabels: string[];
  yLabels: string[];
}) {
  const cw = width - left - right;
  const ch = height - top - bottom;

  return (
    <g className="tc-axis">
      {Array.from({ length: 6 }, (_, index) => {
        const y = top + (ch / 5) * index;
        return (
          <g key={`y-${index}`}>
            <line x1={left} x2={left + cw} y1={y} y2={y} />
            <text x={left - 12} y={y + 4} textAnchor="end">{yLabels[index] || ""}</text>
          </g>
        );
      })}

      {Array.from({ length: 6 }, (_, index) => {
        const x = left + (cw / 5) * index;
        return (
          <g key={`x-${index}`}>
            <line x1={x} x2={x} y1={top} y2={top + ch} />
            <text x={x} y={height - 14} textAnchor="middle">{xLabels[index] || ""}</text>
          </g>
        );
      })}

      <line className="tc-axis-main" x1={left} x2={left} y1={top} y2={top + ch} />
      <line className="tc-axis-main" x1={left} x2={left + cw} y1={top + ch} y2={top + ch} />
    </g>
  );
}

function ChartSvg({ chart }: { chart: GeneratedChart }) {
  if (isEmptyChart(chart)) {
    return (
      <div className="tc-chart-empty">
        <strong>Sem registros reais</strong>
        <span>{chart.meta?.source || "Fonte indisponível"}</span>
      </div>
    );
  }

  return <LineSvg chart={chart} />;
}

function LineSvg({ chart }: { chart: GeneratedChart }) {
  const width = 920;
  const height = 360;
  const left = 82;
  const right = 36;
  const top = 30;
  const bottom = 60;

  const data = cleanData(chart);
  const values = data.map((item) => item.value);
  const maxY = Math.max(1, ...values);
  const minY = Math.min(0, ...values);
  const points = data.map((item, index) => ({
    x: scale(index, 0, Math.max(data.length - 1, 1), left, width - right),
    y: scale(item.value, minY, maxY, height - bottom, top),
  }));

  const yLabels = [maxY, maxY * 0.8, maxY * 0.6, maxY * 0.4, maxY * 0.2, minY].map((n) => fmt(n));
  const xLabels = [0, 0.2, 0.4, 0.6, 0.8, 1].map((factor) => data[Math.round((data.length - 1) * factor)]?.label || "");

  return (
    <svg className="tc-svg" viewBox={`0 0 ${width} ${height}`}>
      <Axis width={width} height={height} left={left} right={right} top={top} bottom={bottom} xLabels={xLabels} yLabels={yLabels} />
      <path className="tc-line" d={pathFrom(points)} />
      {points.map((point, index) => (
        <circle key={index} className={index === points.length - 1 ? "tc-current-point" : "tc-point"} cx={point.x} cy={point.y} r={index === points.length - 1 ? 6.5 : 3.2} />
      ))}
      <text className="tc-axis-title" x={width / 2} y={height - 5} textAnchor="middle">Tempo / período</text>
      <text className="tc-axis-title" x={17} y={height / 2} transform={`rotate(-90 17 ${height / 2})`} textAnchor="middle">Valor</text>
    </svg>
  );
}

export function RealtimeRamp({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await requestJson<any>("/charts/realtime-ramp");

        if (!active) return;

        setData(result);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    load();
    const timer = window.setInterval(load, 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const chart = useMemo<GeneratedChart>(() => {
    const points = Array.isArray(data?.points) ? data.points : [];
    const numeric = points.filter((point: any) => point.pressure_mbar !== null && point.pressure_mbar !== undefined);

    return {
      title: "Rampa de vácuo em tempo real",
      metric: "vacuum_ramp",
      chart_type: "line",
      labels: numeric.map((point: any) => String(point.elapsed_seconds ?? 0)),
      series: [{ name: "Pressão medida (mbar)", data: numeric.map((point: any) => Number(point.pressure_mbar)) }],
      table: points.slice(-12).reverse(),
      legend: [
        { label: "Pressão medida", description: "Valor numérico de pressão/vácuo recebido do sensor/PLC." },
      ],
      meta: data?.meta || {
        source: "state + chart_telemetry",
        sample_count: points.length,
        real_data: true,
        empty: numeric.length === 0,
      },
    };
  }, [data]);

  const current = data?.current;
  const hasNumeric = Boolean(data?.pressure_numeric_available);

  return (
    <section className={`tc-realtime ${compact ? "compact" : ""}`}>
      <div className="tc-realtime-head">
        <div>
          <span>Gráfico técnico principal</span>
          <h3>Rampa de vácuo da operação</h3>
        </div>

        <div className={`tc-mode-pill ${hasNumeric ? "ok" : "warn"}`}>
          {hasNumeric ? "PRESSÃO NUMÉRICA" : "SENSOR DIGITAL"}
        </div>
      </div>

      {error && <div className="tc-error">{error}</div>}

      <div className="tc-realtime-grid">
        <div className="tc-realtime-chart">
          <ChartSvg chart={chart} />
        </div>

        <aside className="tc-live-readings">
          <div><span>Operação</span><strong>{data?.operation_id || "--"}</strong></div>
          <div><span>Tempo</span><strong>{current?.elapsed_seconds ?? 0}s</strong></div>
          <div><span>Pressão</span><strong>{current?.pressure_display || "--"}</strong></div>
          <div><span>Etapa</span><strong>{current?.stage || "PREPARO"}</strong></div>
          <div><span>Status</span><strong>{current?.status || "PRONTO"}</strong></div>
          <div><span>OUT1 / OUT2</span><strong>{current?.hardware?.sensor_out1_npn ? "OUT1 ON" : "OUT1 OFF"} · {current?.hardware?.sensor_out2_pnp ? "OUT2 ON" : "OUT2 OFF"}</strong></div>
        </aside>
      </div>
    </section>
  );
}

export function TraceabilityChartsPanel() {
  const [metric, setMetric] = useState<MetricId>("operations_by_day");
  const selectedMetric = METRICS.find((item) => item.id === metric) || METRICS[0];
  const [chartType, setChartType] = useState<ChartType>(selectedMetric.recommended);
  const [period, setPeriod] = useState("month");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [webappUrl, setWebappUrl] = useState("");
  const [sharedSecret, setSharedSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState("");
  const [lastSheet, setLastSheet] = useState<GeneratedSheet | null>(null);

  useEffect(() => {
    if (!selectedMetric.allowed.includes(chartType)) {
      setChartType(selectedMetric.recommended);
    }
  }, [metric, chartType, selectedMetric]);

  async function loadStatus() {
    try {
      const result = await requestJson<GoogleStatus>("/google-sheets/status");
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function saveConfig() {
    setSavingConfig(true);
    setError("");

    try {
      await requestJson("/google-sheets/config", {
        method: "POST",
        body: JSON.stringify({
          webapp_url: webappUrl,
          shared_secret: sharedSecret,
        }),
      });

      setWebappUrl("");
      setSharedSecret("");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingConfig(false);
    }
  }

  async function generateOnSheets() {
    setLoading(true);
    setError("");

    try {
      const result = await requestJson<GeneratedSheet & { ok: boolean }>("/google-sheets/generate-chart", {
        method: "POST",
        body: JSON.stringify({
          metric,
          chart_type: chartType,
          period,
          title,
        }),
      });

      setLastSheet(result);
      await loadStatus();

      if (result.spreadsheet_url) {
        window.open(result.spreadsheet_url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tc-root">
      <section className="tc-builder sheets-mode">
        <div className="tc-builder-header">
          <div>
            <span>Análise gerencial</span>
            <h3>Indicadores e Gráficos</h3>
          </div>

          <div className={`tc-mode-pill ${status?.configured ? "ok" : "warn"}`}>
            {status?.configured ? "GOOGLE PLANILHAS CONFIGURADO" : "CONFIGURAÇÃO PENDENTE"}
          </div>
        </div>

        <div className="sheets-layout">
          <aside className="sheets-config-card">
            <h4>Google Planilhas</h4>

            <div className="sheets-status">
              <div><span>Status</span><strong>{status?.configured ? "Conectado" : "Pendente"}</strong></div>
              <div><span>URL</span><strong>{status?.webapp_url_masked || "--"}</strong></div>
              <div><span>Segredo</span><strong>{status?.has_shared_secret ? "Ativo" : "Não configurado"}</strong></div>
            </div>

            <label>
              URL do Web App
              <input value={webappUrl} onChange={(event) => setWebappUrl(event.target.value)} placeholder="https://script.google.com/macros/s/..." />
            </label>

            <label>
              Segredo opcional
              <input value={sharedSecret} onChange={(event) => setSharedSecret(event.target.value)} placeholder="chave local opcional" />
            </label>

            <button className="tc-secondary" onClick={saveConfig} disabled={savingConfig}>
              {savingConfig ? "Salvando..." : "Salvar configuração"}
            </button>
          </aside>

          <main className="sheets-generator-card">
            <h4>Gerar gráfico no Google Planilhas</h4>

            <div className="sheets-form-grid">
              <label>
                Indicador
                <select value={metric} onChange={(event) => setMetric(event.target.value as MetricId)}>
                  {Object.entries(
                    METRICS.reduce((acc, item) => {
                      acc[item.group] = [...(acc[item.group] || []), item];
                      return acc;
                    }, {} as Record<string, typeof METRICS>)
                  ).map(([group, items]) => (
                    <optgroup key={group} label={group}>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label>
                Tipo de gráfico
                <select value={chartType} onChange={(event) => setChartType(event.target.value as ChartType)}>
                  {selectedMetric.allowed.includes("bar") && <option value="bar">Barras</option>}
                  {selectedMetric.allowed.includes("line") && <option value="line">Linha</option>}
                  {selectedMetric.allowed.includes("pie") && <option value="pie">Pizza/Rosca</option>}
                </select>
              </label>

              <label>
                Período
                <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                  <option value="all">Todos os registros</option>
                  <option value="today">Hoje</option>
                  <option value="week">Últimos 7 dias</option>
                  <option value="month">Últimos 30 dias</option>
                </select>
              </label>

              <label>
                Título
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={selectedMetric.label} />
              </label>
            </div>

            <button className="tc-primary sheets-main-action" onClick={generateOnSheets} disabled={loading || !status?.configured}>
              {loading ? "Gerando planilha..." : "Gerar no Google Planilhas"}
            </button>

            {error && <div className="tc-error">{error}</div>}

            {lastSheet && (
              <div className="sheets-result">
                <div>
                  <span>Última planilha</span>
                  <strong>{lastSheet.title}</strong>
                </div>
                <a href={lastSheet.spreadsheet_url} target="_blank" rel="noreferrer">Abrir no Google Planilhas</a>
              </div>
            )}
          </main>

          <aside className="sheets-history-card">
            <h4>Planilhas geradas</h4>

            <div className="sheets-history-list">
              {(status?.generated || []).length ? (status?.generated || []).map((item, index) => (
                <a key={`${item.spreadsheet_url}-${index}`} href={item.spreadsheet_url} target="_blank" rel="noreferrer">
                  <strong>{item.title}</strong>
                  <span>{item.chart_type.toUpperCase()} · {item.period} · {item.rows_sent || 0} linhas</span>
                </a>
              )) : (
                <div className="sheets-empty">Nenhuma planilha gerada.</div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}