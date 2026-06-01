import { useEffect, useMemo, useRef, useState } from "react";
import "./IndustrialCharts.css";

const API = "http://127.0.0.1:8020/api";

type ChartKind = "line" | "bar" | "pie";

type Series = {
  name: string;
  data: number[];
};

type GeneratedChart = {
  chart_id: string;
  title: string;
  metric: string;
  chart_type: ChartKind;
  labels: string[];
  series: Series[];
  table: any[];
  legend: { label: string; description: string }[];
};

type RampPoint = {
  timestamp: string;
  elapsed_seconds: number;
  pressure_mbar: number | null;
  pressure_numeric_available: boolean;
  pressure_display: string;
  stage: string;
  status: string;
  alarm?: string | null;
  pumps?: any;
  hardware?: any;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

function compactNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "--";
  const n = Number(value);
  return `${n >= 100 ? n.toFixed(1) : n.toFixed(2)}${suffix}`;
}

function buildLinePath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  return points.map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function scaleLinear(value: number, min: number, max: number, outMin: number, outMax: number) {
  if (max === min) return (outMin + outMax) / 2;
  return outMin + ((value - min) / (max - min)) * (outMax - outMin);
}

function AxisGrid({
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
  const chartW = width - left - right;
  const chartH = height - top - bottom;

  return (
    <g className="ic-axis-grid">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const y = top + (chartH / 5) * i;
        const label = yLabels[i] || "";

        return (
          <g key={`y-${i}`}>
            <line x1={left} x2={left + chartW} y1={y} y2={y} />
            <text x={left - 10} y={y + 4} textAnchor="end">{label}</text>
          </g>
        );
      })}

      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = left + (chartW / 5) * i;
        const label = xLabels[i] || "";

        return (
          <g key={`x-${i}`}>
            <line x1={x} x2={x} y1={top} y2={top + chartH} />
            <text x={x} y={height - 12} textAnchor="middle">{label}</text>
          </g>
        );
      })}

      <line className="ic-axis-strong" x1={left} x2={left} y1={top} y2={top + chartH} />
      <line className="ic-axis-strong" x1={left} x2={left + chartW} y1={top + chartH} y2={top + chartH} />
    </g>
  );
}

function LineChart({
  chart,
  height = 280,
}: {
  chart: GeneratedChart;
  height?: number;
}) {
  const width = 760;
  const left = 72;
  const right = 28;
  const top = 26;
  const bottom = 48;

  const values = chart.series.flatMap((serie) => serie.data.map(Number).filter(Number.isFinite));
  const maxY = Math.max(1, ...values);
  const minY = Math.min(0, ...values);
  const labels = chart.labels.length ? chart.labels : ["0"];

  const points = chart.series[0]?.data.map((value, index) => {
    const x = scaleLinear(index, 0, Math.max(labels.length - 1, 1), left, width - right);
    const y = scaleLinear(Number(value), minY, maxY, height - bottom, top);
    return { x, y };
  }) || [];

  const yLabels = [maxY, maxY * 0.8, maxY * 0.6, maxY * 0.4, maxY * 0.2, minY].map((n) => compactNumber(n));
  const xLabels = [0, 0.2, 0.4, 0.6, 0.8, 1].map((factor) => labels[Math.round((labels.length - 1) * factor)] || "");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ic-chart-svg">
      <AxisGrid width={width} height={height} left={left} right={right} top={top} bottom={bottom} xLabels={xLabels} yLabels={yLabels} />
      <path className="ic-line-main" d={buildLinePath(points)} />
      {points.map((point, index) => (
        <circle key={index} className={index === points.length - 1 ? "ic-current-dot" : "ic-point-dot"} cx={point.x} cy={point.y} r={index === points.length - 1 ? 6 : 3} />
      ))}
      <text x={width / 2} y={height - 2} textAnchor="middle" className="ic-axis-title">Eixo X</text>
      <text x={14} y={height / 2} transform={`rotate(-90 14 ${height / 2})`} textAnchor="middle" className="ic-axis-title">Valor</text>
    </svg>
  );
}

function BarChart({
  chart,
  height = 280,
}: {
  chart: GeneratedChart;
  height?: number;
}) {
  const width = 760;
  const left = 72;
  const right = 28;
  const top = 26;
  const bottom = 54;
  const chartW = width - left - right;
  const chartH = height - top - bottom;
  const values = chart.series[0]?.data.map(Number) || [];
  const maxY = Math.max(1, ...values);
  const barW = chartW / Math.max(values.length, 1);

  const yLabels = [maxY, maxY * 0.8, maxY * 0.6, maxY * 0.4, maxY * 0.2, 0].map((n) => compactNumber(n));
  const labels = chart.labels.length ? chart.labels : ["Sem dados"];
  const xLabels = [0, 0.2, 0.4, 0.6, 0.8, 1].map((factor) => labels[Math.round((labels.length - 1) * factor)] || "");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ic-chart-svg">
      <AxisGrid width={width} height={height} left={left} right={right} top={top} bottom={bottom} xLabels={xLabels} yLabels={yLabels} />
      {values.map((value, index) => {
        const h = scaleLinear(Number(value), 0, maxY, 0, chartH);
        const x = left + index * barW + barW * 0.18;
        const y = top + chartH - h;

        return (
          <g key={index}>
            <rect className="ic-bar-main" x={x} y={y} width={barW * 0.64} height={Math.max(h, 2)} rx={4} />
            <text className="ic-bar-label" x={x + barW * 0.32} y={height - 22} textAnchor="middle">{String(labels[index] || "").slice(0, 8)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function PieChart({
  chart,
  height = 280,
}: {
  chart: GeneratedChart;
  height?: number;
}) {
  const width = 760;
  const values = chart.series[0]?.data.map((n) => Math.max(0, Number(n))) || [];
  const total = values.reduce((acc, n) => acc + n, 0) || 1;
  const cx = 220;
  const cy = height / 2;
  const r = 92;

  let current = -Math.PI / 2;

  const slices = values.map((value, index) => {
    const angle = (value / total) * Math.PI * 2;
    const start = current;
    const end = current + angle;
    current = end;

    const x1 = cx + Math.cos(start) * r;
    const y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end) * r;
    const y2 = cy + Math.sin(end) * r;
    const large = angle > Math.PI ? 1 : 0;

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;

    return { d, index, value };
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ic-chart-svg">
      {slices.map((slice) => (
        <path key={slice.index} className={`ic-pie-slice slice-${slice.index % 8}`} d={slice.d} />
      ))}

      <circle className="ic-pie-hole" cx={cx} cy={cy} r={42} />
      <text x={cx} y={cy - 2} textAnchor="middle" className="ic-pie-total">{compactNumber(total)}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" className="ic-pie-sub">TOTAL</text>

      <g transform="translate(380 48)">
        {(chart.labels || []).map((label, index) => (
          <g key={index} transform={`translate(0 ${index * 28})`}>
            <rect className={`ic-pie-slice slice-${index % 8}`} x={0} y={-12} width={16} height={16} rx={3} />
            <text className="ic-pie-legend" x={28} y={1}>{label}: {values[index] ?? 0}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function ChartRenderer({ chart }: { chart: GeneratedChart }) {
  if (chart.chart_type === "pie") return <PieChart chart={chart} />;
  if (chart.chart_type === "line") return <LineChart chart={chart} />;
  return <BarChart chart={chart} />;
}

function RealtimeRampPanel() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await fetchJson<any>(`${API}/charts/realtime-ramp`);

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
    const points: RampPoint[] = Array.isArray(data?.points) ? data.points : [];
    const numeric = points.filter((point) => point.pressure_mbar !== null && point.pressure_mbar !== undefined);

    return {
      chart_id: "REALTIME-RAMP",
      title: "Rampa de vácuo em tempo real",
      metric: "vacuum_ramp",
      chart_type: "line",
      labels: numeric.map((point) => String(point.elapsed_seconds)),
      series: [{ name: "Pressão medida (mbar)", data: numeric.map((point) => Number(point.pressure_mbar)) }],
      table: points.slice(-20).reverse(),
      legend: [
        { label: "Pressão medida", description: "Valor numérico recebido do sensor/PLC quando disponível." },
        { label: "Ponto atual", description: "Última leitura registrada na operação." },
      ],
    };
  }, [data]);

  const current = data?.current;
  const numericAvailable = Boolean(data?.pressure_numeric_available);

  return (
    <section className="ic-panel ic-realtime">
      <div className="ic-panel-head">
        <div>
          <h2>Rampa de vácuo em tempo real</h2>
          <p>Atualização visual em tempo real; amostragem técnica planejada de 3 em 3 segundos.</p>
        </div>

        <div className={`ic-status-pill ${numericAvailable ? "ok" : "warn"}`}>
          {numericAvailable ? "PRESSÃO NUMÉRICA DISPONÍVEL" : "SENSOR DIGITAL / SEM CURVA NUMÉRICA"}
        </div>
      </div>

      {error ? <div className="ic-error">Falha ao carregar rampa: {error}</div> : null}

      <div className="ic-ramp-layout">
        <div className="ic-ramp-chart">
          <ChartRenderer chart={chart} />
        </div>

        <aside className="ic-live-card">
          <span>Operação</span>
          <strong>{data?.operation_id || "--"}</strong>

          <span>Tempo</span>
          <strong>{current?.elapsed_seconds ?? 0}s</strong>

          <span>Pressão atual</span>
          <strong>{current?.pressure_display || "--"}</strong>

          <span>Etapa</span>
          <strong>{current?.stage || "PREPARO"}</strong>

          <span>Status</span>
          <strong>{current?.status || "PRONTO"}</strong>

          <span>OUT1 / OUT2</span>
          <strong>
            {current?.hardware?.sensor_out1_npn ? "OUT1 ON" : "OUT1 OFF"} · {current?.hardware?.sensor_out2_pnp ? "OUT2 ON" : "OUT2 OFF"}
          </strong>
        </aside>
      </div>
    </section>
  );
}

const metricOptions = [
  ["operations_by_day", "Operações por período"],
  ["operation_status", "Status das operações"],
  ["vacuum_ramp", "Rampa de vácuo"],
  ["alarms_by_type", "Alarmes por tipo"],
  ["equipment_usage", "Equipamentos e parâmetros"],
  ["cycle_time", "Tempo de ciclo"],
  ["machine_performance", "Desempenho das máquinas"],
  ["reports_exported", "Relatórios exportados"],
  ["logs_by_severity", "Logs por severidade"],
];

function SpreadsheetHeaders() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  return (
    <>
      <div className="ic-sheet-cols">
        {letters.map((letter) => <span key={letter}>{letter}</span>)}
      </div>

      <div className="ic-sheet-rows">
        {Array.from({ length: 50 }, (_, index) => <span key={index}>{index + 1}</span>)}
      </div>
    </>
  );
}

function StatisticsWorkspace() {
  const [metric, setMetric] = useState("operations_by_day");
  const [chartType, setChartType] = useState<ChartKind>("bar");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [zoom, setZoom] = useState(1);
  const [charts, setCharts] = useState<GeneratedChart[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  async function generateChart() {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        metric,
        chart_type: chartType,
      });

      if (dateStart) params.set("date_start", dateStart);
      if (dateEnd) params.set("date_end", dateEnd);

      const result = await fetchJson<any>(`${API}/charts/statistics?${params.toString()}`);

      const chart: GeneratedChart = {
        chart_id: `LOCAL-${Date.now()}`,
        title: result.title,
        metric: result.metric || metric,
        chart_type: result.chart_type || chartType,
        labels: result.labels || [],
        series: result.series || [],
        table: result.table || [],
        legend: result.legend || [],
      };

      setCharts((prev) => [chart, ...prev].slice(0, 12));
      setSelectedId(chart.chart_id);
    } finally {
      setLoading(false);
    }
  }

  function removeSelected() {
    if (!selectedId) return;
    setCharts((prev) => prev.filter((chart) => chart.chart_id !== selectedId));
    setSelectedId("");
  }

  const selected = charts.find((chart) => chart.chart_id === selectedId) || charts[0];

  return (
    <section className="ic-panel">
      <div className="ic-panel-head">
        <div>
          <h2>Indicadores e Gráficos</h2>
          <p>Área analítica estilo planilha para gerar gráficos por período, tipo e indicador.</p>
        </div>
      </div>

      <div className="ic-toolbar">
        <label>
          Indicador
          <select value={metric} onChange={(event) => setMetric(event.target.value)}>
            {metricOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>

        <label>
          Tipo
          <select value={chartType} onChange={(event) => setChartType(event.target.value as ChartKind)}>
            <option value="bar">Barras</option>
            <option value="line">Linha</option>
            <option value="pie">Pizza/Rosca</option>
          </select>
        </label>

        <label>
          Início
          <input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} />
        </label>

        <label>
          Fim
          <input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} />
        </label>

        <label>
          Zoom
          <input type="range" min="0.7" max="1.4" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>

        <button onClick={generateChart} disabled={loading}>{loading ? "GERANDO..." : "GERAR GRÁFICO"}</button>
        <button className="secondary" onClick={removeSelected} disabled={!selectedId}>REMOVER SELECIONADO</button>
      </div>

      <div className="ic-work-area">
        <div className="ic-sheet" ref={sheetRef}>
          <SpreadsheetHeaders />

          <div className="ic-sheet-content" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            {charts.length === 0 ? (
              <div className="ic-empty">
                Gere um gráfico para começar a análise. A área usa grade visual com colunas A-Z e linhas 1-50.
              </div>
            ) : charts.map((chart, index) => (
              <article
                key={chart.chart_id}
                className={`ic-floating-chart ${selectedId === chart.chart_id ? "selected" : ""}`}
                style={{ left: 42 + (index % 2) * 570, top: 42 + Math.floor(index / 2) * 390 }}
                onClick={() => setSelectedId(chart.chart_id)}
              >
                <div className="ic-floating-head">
                  <strong>{chart.title}</strong>
                  <span>{chart.chart_type.toUpperCase()}</span>
                </div>

                <ChartRenderer chart={chart} />

                <div className="ic-mini-table">
                  {(chart.table || []).slice(0, 4).map((row, rowIndex) => (
                    <pre key={rowIndex}>{JSON.stringify(row)}</pre>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="ic-side">
          <h3>Legenda e leitura</h3>

          {selected ? (
            <>
              <strong>{selected.title}</strong>
              <p>Indicador: {selected.metric}</p>
              <p>Tipo: {selected.chart_type}</p>

              <div className="ic-legend-list">
                {(selected.legend || []).map((item, index) => (
                  <div key={index}>
                    <span className={`ic-legend-color c${index % 8}`} />
                    <div>
                      <b>{item.label}</b>
                      <small>{item.description}</small>
                    </div>
                  </div>
                ))}
              </div>

              <h4>Tabela de apoio</h4>
              <div className="ic-table-scroll">
                {(selected.table || []).slice(0, 12).map((row, index) => (
                  <pre key={index}>{JSON.stringify(row, null, 0)}</pre>
                ))}
              </div>
            </>
          ) : (
            <p>Nenhum gráfico selecionado.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

export default function IndustrialCharts() {
  return (
    <main className="ic-root">
      <header className="ic-header">
        <div>
          <span>TSEA V-TWIN · SUPERVISÓRIO</span>
          <h1>Gráficos industriais e análise gerencial</h1>
          <p>Rampa de vácuo, indicadores operacionais, alarmes, logs, equipamentos e relatórios.</p>
        </div>

        <a className="ic-back" href="/">VOLTAR AO GERENTE</a>
      </header>

      <RealtimeRampPanel />
      <StatisticsWorkspace />
    </main>
  );
}