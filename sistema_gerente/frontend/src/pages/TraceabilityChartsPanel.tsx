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

const CHART_COLORS = [
  "#1f4e79",
  "#2e7d32",
  "#ed7d31",
  "#c00000",
  "#7030a0",
  "#008c95",
  "#806000",
  "#595959",
];

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

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

  if (chart.chart_type === "pie") return <PieSvg chart={chart} />;
  if (chart.chart_type === "line") return <LineSvg chart={chart} />;
  return <BarSvg chart={chart} />;
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

function BarSvg({ chart }: { chart: GeneratedChart }) {
  const width = 920;
  const height = 360;
  const left = 82;
  const right = 36;
  const top = 30;
  const bottom = 68;
  const cw = width - left - right;
  const ch = height - top - bottom;

  const data = cleanData(chart);
  const maxY = Math.max(1, ...data.map((item) => item.value));
  const barW = cw / Math.max(data.length, 1);

  const yLabels = [maxY, maxY * 0.8, maxY * 0.6, maxY * 0.4, maxY * 0.2, 0].map((n) => fmt(n));
  const xLabels = [0, 0.2, 0.4, 0.6, 0.8, 1].map((factor) => data[Math.round((data.length - 1) * factor)]?.label || "");

  return (
    <svg className="tc-svg" viewBox={`0 0 ${width} ${height}`}>
      <Axis width={width} height={height} left={left} right={right} top={top} bottom={bottom} xLabels={xLabels} yLabels={yLabels} />

      {data.map((item, index) => {
        const h = scale(item.value, 0, maxY, 0, ch);
        const x = left + index * barW + barW * 0.2;
        const y = top + ch - h;
        const color = CHART_COLORS[index % CHART_COLORS.length];

        return (
          <g key={index}>
            <rect className="tc-bar" x={x} y={y} width={barW * 0.6} height={Math.max(2, h)} rx={2} fill={color} />
            <text className="tc-bar-text" x={x + barW * 0.3} y={height - 34} textAnchor="middle">{item.label.slice(0, 10)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function PieSvg({ chart }: { chart: GeneratedChart }) {
  const width = 920;
  const height = 360;
  const cx = 250;
  const cy = 180;
  const r = 112;
  const data = cleanData(chart).filter((item) => item.value > 0);
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = -Math.PI / 2;

  const slices = data.map((item, index) => {
    const angle = (item.value / total) * Math.PI * 2;
    const start = cursor;
    const end = cursor + angle;
    cursor = end;

    const x1 = cx + Math.cos(start) * r;
    const y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end) * r;
    const y2 = cy + Math.sin(end) * r;
    const large = angle > Math.PI ? 1 : 0;

    return {
      index,
      item,
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
      color: CHART_COLORS[index % CHART_COLORS.length],
    };
  });

  return (
    <svg className="tc-svg" viewBox={`0 0 ${width} ${height}`}>
      {slices.map((slice) => <path key={slice.index} className="tc-pie" d={slice.d} fill={slice.color} />)}
      <circle className="tc-pie-hole" cx={cx} cy={cy} r={54} />
      <text className="tc-pie-total" x={cx} y={cy - 2} textAnchor="middle">{fmt(total)}</text>
      <text className="tc-pie-caption" x={cx} y={cy + 20} textAnchor="middle">TOTAL</text>

      <g transform="translate(460 58)">
        {slices.map((slice, index) => (
          <g key={slice.item.label} transform={`translate(0 ${index * 30})`}>
            <rect x={0} y={-13} width={18} height={18} rx={2} fill={slice.color} stroke="#1f2937" strokeWidth="1" />
            <text className="tc-pie-label" x={30} y={2}>{slice.item.label}: {fmt(slice.item.value)}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function LegendTable({ chart }: { chart: GeneratedChart }) {
  const data = cleanData(chart);

  return (
    <div className="tc-legend-table">
      <table>
        <thead>
          <tr>
            <th>Cor</th>
            <th>Série</th>
            <th>Fonte</th>
            <th>Amostras</th>
          </tr>
        </thead>
        <tbody>
          {(chart.legend?.length ? chart.legend : [{ label: chart.series?.[0]?.name || "Série", description: "Dados do indicador." }]).map((item, index) => (
            <tr key={`${item.label}-${index}`}>
              <td><span className="tc-color" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /></td>
              <td>{item.label}</td>
              <td>{chart.meta?.source || item.description}</td>
              <td>{chart.meta?.sample_count ?? data.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SupportTable({ chart }: { chart: GeneratedChart }) {
  if (!chart.table?.length) return null;

  return (
    <div className="tc-data-table">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Registro</th>
          </tr>
        </thead>
        <tbody>
          {(chart.table || []).slice(0, 8).map((row, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td><code>{JSON.stringify(row)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartCard({
  chart,
  selected,
  onSelect,
}: {
  chart: GeneratedChart;
  selected: boolean;
  onSelect: () => void;
}) {
  const empty = isEmptyChart(chart);

  return (
    <article className={`tc-chart-card ${selected ? "selected" : ""} ${empty ? "empty" : ""}`} onClick={onSelect}>
      <div className="tc-chart-head">
        <div>
          <span>{chart.metric}</span>
          <h3>{chart.title}</h3>
        </div>
        <div className="tc-chart-tags">
          <b>{chart.chart_type.toUpperCase()}</b>
          <em>{empty ? "SEM DADOS" : "DADOS REAIS"}</em>
        </div>
      </div>

      <ChartSvg chart={chart} />
      <LegendTable chart={chart} />
      <SupportTable chart={chart} />
    </article>
  );
}

function SpreadsheetCanvas({
  charts,
  selectedIndex,
  setSelectedIndex,
  fullscreen,
  setFullscreen,
}: {
  charts: GeneratedChart[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  fullscreen: boolean;
  setFullscreen: (value: boolean) => void;
}) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  return (
    <div className={`tc-sheet-shell ${fullscreen ? "fullscreen" : ""}`}>
      <div className="tc-sheet-toolbar">
        <strong>Campo de análise gráfica</strong>
        <span>A-Z / 1-50</span>
        <button type="button" onClick={() => setFullscreen(!fullscreen)}>
          {fullscreen ? "Sair da tela cheia" : "Expandir campo"}
        </button>
      </div>

      <div className="tc-sheet-cols">
        {letters.map((letter) => <span key={letter}>{letter}</span>)}
      </div>

      <div className="tc-sheet-body">
        <div className="tc-sheet-rows">
          {Array.from({ length: 50 }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>

        <div className="tc-sheet-grid">
          {charts.length === 0 ? (
            <div className="tc-empty-sheet">
              <strong>Nenhum gráfico gerado</strong>
            </div>
          ) : (
            <div className="tc-chart-grid">
              {charts.map((chart, index) => (
                <ChartCard
                  key={`${chart.metric}-${index}`}
                  chart={chart}
                  selected={selectedIndex === index}
                  onSelect={() => setSelectedIndex(index)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RealtimeRamp({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await getJson<any>(`${API}/charts/realtime-ramp`);

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
  const [period, setPeriod] = useState("all");
  const [charts, setCharts] = useState<GeneratedChart[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedMetric.allowed.includes(chartType)) {
      setChartType(selectedMetric.recommended);
    }
  }, [metric, chartType, selectedMetric]);

  async function generate() {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        metric,
        chart_type: chartType,
        period,
      });

      const result = await getJson<any>(`${API}/charts/statistics?${params.toString()}`);

      const chart: GeneratedChart = {
        title: result.title || selectedMetric.label,
        metric,
        chart_type: result.chart_type || chartType,
        labels: Array.isArray(result.labels) ? result.labels : [],
        series: Array.isArray(result.series) ? result.series : [],
        table: Array.isArray(result.table) ? result.table : [],
        legend: Array.isArray(result.legend) ? result.legend : [],
        meta: result.meta || {},
      };

      setCharts((prev) => [chart, ...prev].slice(0, 8));
      setSelectedIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function clearCharts() {
    setCharts([]);
    setSelectedIndex(0);
  }

  return (
    <div className="tc-root">
      <section className="tc-builder">
        <div className="tc-builder-header">
          <div>
            <span>Análise gerencial</span>
            <h3>Indicadores e Gráficos</h3>
          </div>
        </div>

        <div className="tc-builder-layout">
          <aside className="tc-controls">
            <h4>Configurar gráfico</h4>

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

            <button className="tc-primary" onClick={generate} disabled={loading}>
              {loading ? "Gerando..." : "Gerar gráfico"}
            </button>

            <button className="tc-secondary" onClick={clearCharts} disabled={!charts.length}>
              Limpar campo
            </button>

            {error && <div className="tc-error">{error}</div>}
          </aside>

          <div className="tc-analysis">
            <SpreadsheetCanvas
              charts={charts}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
              fullscreen={fullscreen}
              setFullscreen={setFullscreen}
            />
          </div>
        </div>
      </section>
    </div>
  );
}