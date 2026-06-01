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
};

const METRICS: {
  id: MetricId;
  label: string;
  description: string;
  group: string;
  allowed: ChartType[];
  recommended: ChartType;
}[] = [
  {
    id: "operations_by_day",
    label: "Operações por período",
    description: "Quantidade de operações agrupadas por data.",
    group: "Operações",
    allowed: ["bar", "line"],
    recommended: "bar",
  },
  {
    id: "operation_status",
    label: "Status das operações",
    description: "Finalizadas, em atenção, bloqueadas, críticas ou em ciclo.",
    group: "Operações",
    allowed: ["bar", "pie"],
    recommended: "pie",
  },
  {
    id: "cycle_time",
    label: "Tempo de ciclo",
    description: "Duração registrada por operação.",
    group: "Desempenho",
    allowed: ["bar", "line"],
    recommended: "line",
  },
  {
    id: "vacuum_ramp",
    label: "Rampa de vácuo registrada",
    description: "Curva registrada a partir dos pontos de telemetria já salvos.",
    group: "Processo",
    allowed: ["line"],
    recommended: "line",
  },
  {
    id: "alarms_by_type",
    label: "Alarmes por tipo",
    description: "Ocorrências de alarmes e eventos críticos.",
    group: "Alarmes",
    allowed: ["bar", "pie"],
    recommended: "bar",
  },
  {
    id: "equipment_usage",
    label: "Equipamentos e parâmetros",
    description: "Receitas, tanques, mangueiras e estados principais.",
    group: "Equipamentos",
    allowed: ["bar"],
    recommended: "bar",
  },
  {
    id: "machine_performance",
    label: "Desempenho das máquinas",
    description: "Amostras de B1, B2, óleo, PLC e sensor.",
    group: "Equipamentos",
    allowed: ["bar", "line"],
    recommended: "bar",
  },
  {
    id: "logs_by_severity",
    label: "Logs por severidade",
    description: "Eventos separados por INFO, WARN, CRITICAL e EMERGENCY.",
    group: "Auditoria",
    allowed: ["bar", "pie"],
    recommended: "bar",
  },
  {
    id: "reports_exported",
    label: "Relatórios exportados",
    description: "Relatórios gerados por período.",
    group: "Relatórios",
    allowed: ["bar", "line"],
    recommended: "bar",
  },
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
            <text x={left - 10} y={y + 4} textAnchor="end">{yLabels[index] || ""}</text>
          </g>
        );
      })}

      {Array.from({ length: 6 }, (_, index) => {
        const x = left + (cw / 5) * index;
        return (
          <g key={`x-${index}`}>
            <line x1={x} x2={x} y1={top} y2={top + ch} />
            <text x={x} y={height - 12} textAnchor="middle">{xLabels[index] || ""}</text>
          </g>
        );
      })}

      <line className="tc-axis-main" x1={left} x2={left} y1={top} y2={top + ch} />
      <line className="tc-axis-main" x1={left} x2={left + cw} y1={top + ch} y2={top + ch} />
    </g>
  );
}

function ChartSvg({ chart }: { chart: GeneratedChart }) {
  if (chart.chart_type === "pie") return <PieSvg chart={chart} />;
  if (chart.chart_type === "line") return <LineSvg chart={chart} />;
  return <BarSvg chart={chart} />;
}

function LineSvg({ chart }: { chart: GeneratedChart }) {
  const width = 920;
  const height = 360;
  const left = 78;
  const right = 34;
  const top = 30;
  const bottom = 58;

  const rawValues = chart.series[0]?.data || [];
  const values = rawValues.map(Number).filter(Number.isFinite);
  const labels = chart.labels.length ? chart.labels : values.map((_, index) => String(index));

  const maxY = Math.max(1, ...values);
  const minY = Math.min(0, ...values);
  const points = values.map((value, index) => ({
    x: scale(index, 0, Math.max(values.length - 1, 1), left, width - right),
    y: scale(value, minY, maxY, height - bottom, top),
  }));

  const yLabels = [maxY, maxY * 0.8, maxY * 0.6, maxY * 0.4, maxY * 0.2, minY].map((n) => fmt(n));
  const xLabels = [0, 0.2, 0.4, 0.6, 0.8, 1].map((factor) => labels[Math.round((labels.length - 1) * factor)] || "");

  return (
    <svg className="tc-svg" viewBox={`0 0 ${width} ${height}`}>
      <Axis width={width} height={height} left={left} right={right} top={top} bottom={bottom} xLabels={xLabels} yLabels={yLabels} />
      <path className="tc-line" d={pathFrom(points)} />
      {points.map((point, index) => (
        <circle key={index} className={index === points.length - 1 ? "tc-current-point" : "tc-point"} cx={point.x} cy={point.y} r={index === points.length - 1 ? 7 : 3.5} />
      ))}
      <text className="tc-axis-title" x={width / 2} y={height - 4} textAnchor="middle">Tempo / período</text>
      <text className="tc-axis-title" x={16} y={height / 2} transform={`rotate(-90 16 ${height / 2})`} textAnchor="middle">Valor</text>
    </svg>
  );
}

function BarSvg({ chart }: { chart: GeneratedChart }) {
  const width = 920;
  const height = 360;
  const left = 78;
  const right = 34;
  const top = 30;
  const bottom = 66;
  const cw = width - left - right;
  const ch = height - top - bottom;

  const values = chart.series[0]?.data.map(Number).filter(Number.isFinite) || [];
  const labels = chart.labels.length ? chart.labels : values.map((_, index) => String(index + 1));
  const maxY = Math.max(1, ...values);
  const barW = cw / Math.max(values.length, 1);

  const yLabels = [maxY, maxY * 0.8, maxY * 0.6, maxY * 0.4, maxY * 0.2, 0].map((n) => fmt(n));
  const xLabels = [0, 0.2, 0.4, 0.6, 0.8, 1].map((factor) => labels[Math.round((labels.length - 1) * factor)] || "");

  return (
    <svg className="tc-svg" viewBox={`0 0 ${width} ${height}`}>
      <Axis width={width} height={height} left={left} right={right} top={top} bottom={bottom} xLabels={xLabels} yLabels={yLabels} />

      {values.map((value, index) => {
        const h = scale(value, 0, maxY, 0, ch);
        const x = left + index * barW + barW * 0.18;
        const y = top + ch - h;

        return (
          <g key={index}>
            <rect className={`tc-bar b${index % 8}`} x={x} y={y} width={barW * 0.64} height={Math.max(2, h)} rx={5} />
            <text className="tc-bar-text" x={x + barW * 0.32} y={height - 32} textAnchor="middle">{String(labels[index] || "").slice(0, 10)}</text>
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
  const values = chart.series[0]?.data.map((value) => Math.max(0, Number(value))) || [];
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  let cursor = -Math.PI / 2;

  const slices = values.map((value, index) => {
    const angle = (value / total) * Math.PI * 2;
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
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
    };
  });

  return (
    <svg className="tc-svg" viewBox={`0 0 ${width} ${height}`}>
      {slices.map((slice) => <path key={slice.index} className={`tc-pie s${slice.index % 8}`} d={slice.d} />)}
      <circle className="tc-pie-hole" cx={cx} cy={cy} r={54} />
      <text className="tc-pie-total" x={cx} y={cy - 2} textAnchor="middle">{fmt(total)}</text>
      <text className="tc-pie-caption" x={cx} y={cy + 20} textAnchor="middle">TOTAL</text>

      <g transform="translate(460 58)">
        {chart.labels.map((label, index) => (
          <g key={label} transform={`translate(0 ${index * 30})`}>
            <rect className={`tc-pie s${index % 8}`} x={0} y={-13} width={18} height={18} rx={3} />
            <text className="tc-pie-label" x={30} y={2}>{label}: {values[index] ?? 0}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function LegendTable({ chart }: { chart: GeneratedChart }) {
  return (
    <div className="tc-legend-table">
      <table>
        <thead>
          <tr>
            <th>Cor</th>
            <th>Legenda</th>
            <th>Interpretação</th>
          </tr>
        </thead>
        <tbody>
          {(chart.legend?.length ? chart.legend : [{ label: chart.series?.[0]?.name || "Série", description: "Dados do indicador selecionado." }]).map((item, index) => (
            <tr key={`${item.label}-${index}`}>
              <td><span className={`tc-color c${index % 8}`} /></td>
              <td>{item.label}</td>
              <td>{item.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SupportTable({ chart }: { chart: GeneratedChart }) {
  return (
    <div className="tc-data-table">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Dados</th>
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
  return (
    <article className={`tc-chart-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="tc-chart-head">
        <div>
          <span>{chart.metric}</span>
          <h3>{chart.title}</h3>
        </div>
        <b>{chart.chart_type.toUpperCase()}</b>
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
        <span>Grade A-Z / 1-50 · arraste a rolagem para navegar</span>
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
              <p>Escolha um indicador, um tipo compatível e clique em Gerar gráfico. O gráfico e a legenda aparecerão dentro deste campo branco.</p>
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
        { label: "Ponto atual", description: "Última amostra da operação em tempo real." },
      ],
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
          <p>A bolinha avança pelo tempo no eixo X e desce conforme a pressão reduz no eixo Y.</p>
        </div>

        <div className={`tc-mode-pill ${hasNumeric ? "ok" : "warn"}`}>
          {hasNumeric ? "PRESSÃO NUMÉRICA DISPONÍVEL" : "SEM PRESSÃO NUMÉRICA CONTÍNUA"}
        </div>
      </div>

      {error && <div className="tc-error">{error}</div>}

      {!hasNumeric && (
        <div className="tc-warning">
          Se o sensor estiver apenas em OUT1/OUT2 digital, a curva real só será preenchida quando houver leitura numérica contínua.
        </div>
      )}

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
            <p>Gere gráficos objetivos a partir de operações, logs, alarmes, equipamentos, relatórios e telemetria. A rampa em tempo real fica no Painel.</p>
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

            <div className="tc-description">
              <strong>{selectedMetric.label}</strong>
              <p>{selectedMetric.description}</p>
            </div>

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

            <div className="tc-help">
              <b>Como usar</b>
              <p>Escolha o indicador, selecione um tipo compatível e gere. O gráfico, a legenda e a tabela aparecem dentro do campo branco.</p>
            </div>
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