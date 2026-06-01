from __future__ import annotations

import importlib
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CHART_TELEMETRY_FILE = DATA_DIR / "chart_telemetry.json"
CHART_WORKSPACE_FILE = DATA_DIR / "chart_workspace.json"
OPERATION_RECORDS_FILE = DATA_DIR / "operation_records.json"
REPORTS_FILE = DATA_DIR / "reports.json"

SAMPLE_INTERVAL_SECONDS = 3


class WorkspaceChartPayload(BaseModel):
    chart_id: str | None = None
    title: str
    metric: str
    chart_type: str
    x: int = 40
    y: int = 40
    w: int = 520
    h: int = 320
    filters: dict[str, Any] = Field(default_factory=dict)
    data: dict[str, Any] = Field(default_factory=dict)


def _core():
    return importlib.import_module("app.main")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _now().isoformat()


def _read_json(path: Path, fallback: Any) -> Any:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not path.exists():
        return fallback

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def _write_json(path: Path, data: Any) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None:
            return default

        number = float(value)

        if not math.isfinite(number):
            return default

        return number
    except Exception:
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except Exception:
        return default


def _state_payload() -> dict[str, Any]:
    core = _core()
    state = getattr(core, "STATE", None)

    if state is None:
        return {}

    try:
        return state.payload()
    except Exception:
        return {}


def _operation_id(payload: dict[str, Any]) -> str:
    return str(payload.get("operation_id") or "SEM_OPERACAO")


def _current_stage(payload: dict[str, Any]) -> str:
    return str(payload.get("stage") or payload.get("current_stage") or "PREPARO")


def _pressure_info(payload: dict[str, Any]) -> tuple[float | None, bool, str]:
    numeric_available = bool(payload.get("pressure_numeric_available", True))
    pressure = _safe_float(payload.get("pressure_avg_tank_mbar"))

    if not numeric_available or pressure is None:
        return None, False, str(payload.get("pressure_display") or "Indisponível")

    return pressure, True, str(payload.get("pressure_display") or f"{pressure:.3f} mbar")


def _hardware_bits(payload: dict[str, Any]) -> dict[str, Any]:
    hardware = payload.get("hardware") or {}
    actual = hardware.get("actual_hardware") or {}
    tanks = payload.get("tanks") or []
    first_tank = tanks[0] if tanks and isinstance(tanks[0], dict) else {}

    return {
        "plc_online": bool(hardware.get("plc_online", True)),
        "sensor_online": bool(hardware.get("sensor_online", True)),
        "emergency": bool(hardware.get("emergency", False)),
        "sensor_out1_npn": bool(actual.get("sensor_out1_npn", first_tank.get("sensor_out1_npn", False))),
        "sensor_out2_pnp": bool(actual.get("sensor_out2_pnp", first_tank.get("sensor_out2_pnp", False))),
    }


def _pumps(payload: dict[str, Any]) -> dict[str, bool]:
    pumps = payload.get("pumps") or {}

    return {
        "b1": bool(pumps.get("b1", False)),
        "b2": bool(pumps.get("b2", False)),
        "oil": bool(pumps.get("oil", False)),
    }


def _sample_state(force: bool = False) -> dict[str, Any]:
    payload = _state_payload()
    operation_id = _operation_id(payload)
    telemetry = _read_json(CHART_TELEMETRY_FILE, {})
    points = telemetry.setdefault(operation_id, [])

    pressure, pressure_available, pressure_display = _pressure_info(payload)
    elapsed = _safe_int(payload.get("elapsed_seconds"), 0)

    last_elapsed = -999999

    if points:
        last_elapsed = _safe_int(points[-1].get("elapsed_seconds"), -999999)

    should_save = force or (
        operation_id != "SEM_OPERACAO"
        and (elapsed - last_elapsed >= SAMPLE_INTERVAL_SECONDS or not points)
    )

    current_point = {
        "timestamp": _iso_now(),
        "operation_id": operation_id,
        "elapsed_seconds": elapsed,
        "pressure_mbar": pressure,
        "pressure_numeric_available": pressure_available,
        "pressure_display": pressure_display,
        "stage": _current_stage(payload),
        "status": str(payload.get("status") or "PRONTO"),
        "alarm": payload.get("alarm"),
        "pumps": _pumps(payload),
        "hardware": _hardware_bits(payload),
        "oil": payload.get("oil") or {},
    }

    if should_save:
        points.append(current_point)
        telemetry[operation_id] = points[-2500:]
        _write_json(CHART_TELEMETRY_FILE, telemetry)

    return {
        "operation_id": operation_id,
        "current": current_point,
        "points": telemetry.get(operation_id, []),
    }


def _operation_records() -> list[dict[str, Any]]:
    data = _read_json(OPERATION_RECORDS_FILE, [])

    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]

    if isinstance(data, dict):
        records = data.get("records") or data.get("operations") or []
        return [item for item in records if isinstance(item, dict)]

    return []


def _telemetry_points() -> list[dict[str, Any]]:
    telemetry = _read_json(CHART_TELEMETRY_FILE, {})
    points: list[dict[str, Any]] = []

    if isinstance(telemetry, dict):
        for operation_id, values in telemetry.items():
            if isinstance(values, list):
                for item in values:
                    if isinstance(item, dict):
                        points.append({**item, "operation_id": str(item.get("operation_id") or operation_id)})

    return points


def _state_events() -> list[dict[str, Any]]:
    payload = _state_payload()
    events = payload.get("events") or []

    return [item for item in events if isinstance(item, dict)]


def _date_label(value: Any) -> str:
    text = str(value or "")

    if "T" in text:
        return text.split("T")[0]

    if " " in text:
        return text.split(" ")[0]

    if len(text) >= 10:
        return text[:10]

    return datetime.now().strftime("%Y-%m-%d")


def _empty_chart(title: str, chart_type: str, message: str) -> dict[str, Any]:
    return {
        "title": title,
        "chart_type": chart_type,
        "labels": ["Sem dados"],
        "series": [{"name": message, "data": [0]}],
        "table": [{"item": "Sem dados", "valor": 0}],
        "legend": [{"label": message, "description": "Ainda não existem registros suficientes para este indicador."}],
    }


def _stats_operations_by_day(chart_type: str) -> dict[str, Any]:
    records = _operation_records()
    points = _telemetry_points()
    counter: Counter[str] = Counter()

    for record in records:
        counter[_date_label(record.get("finished_at") or record.get("created_at") or record.get("horario"))] += 1

    for point in points:
        if str(point.get("status", "")).upper() == "FINALIZADO":
            counter[_date_label(point.get("timestamp"))] += 1

    if not counter:
        return _empty_chart("Operações por período", chart_type, "Operações")

    labels = sorted(counter.keys())

    return {
        "title": "Operações por período",
        "chart_type": chart_type,
        "labels": labels,
        "series": [{"name": "Operações", "data": [counter[label] for label in labels]}],
        "table": [{"data": label, "operacoes": counter[label]} for label in labels],
        "legend": [{"label": "Operações", "description": "Quantidade de operações registradas no período."}],
    }


def _stats_status(chart_type: str) -> dict[str, Any]:
    records = _operation_records()
    points = _telemetry_points()
    counter: Counter[str] = Counter()

    for record in records:
        counter[str(record.get("status") or record.get("statusFinal") or "REGISTRADO").upper()] += 1

    for point in points:
        status = str(point.get("status") or "").upper()
        if status:
            counter[status] += 1

    if not counter:
        return _empty_chart("Status das operações", chart_type, "Status")

    labels = list(counter.keys())

    return {
        "title": "Status das operações",
        "chart_type": chart_type,
        "labels": labels,
        "series": [{"name": "Quantidade", "data": [counter[label] for label in labels]}],
        "table": [{"status": label, "quantidade": counter[label]} for label in labels],
        "legend": [{"label": label, "description": f"Registros com status {label}."} for label in labels],
    }


def _stats_alarms(chart_type: str) -> dict[str, Any]:
    points = _telemetry_points()
    events = _state_events()
    counter: Counter[str] = Counter()

    for point in points:
        alarm = point.get("alarm")
        if alarm:
            counter[str(alarm)] += 1

    for event in events:
        message = str(event.get("message") or "")
        level = str(event.get("level") or "INFO").upper()

        if "alarme" in message.lower() or level in {"WARN", "WARNING", "CRITICAL", "EMERGENCY"}:
            counter[level] += 1

    if not counter:
        return _empty_chart("Alarmes por tipo", chart_type, "Alarmes")

    labels = list(counter.keys())

    return {
        "title": "Alarmes por tipo",
        "chart_type": chart_type,
        "labels": labels,
        "series": [{"name": "Alarmes", "data": [counter[label] for label in labels]}],
        "table": [{"alarme": label, "quantidade": counter[label]} for label in labels],
        "legend": [{"label": label, "description": "Ocorrências de alarme/evento crítico."} for label in labels],
    }


def _stats_equipment_usage(chart_type: str) -> dict[str, Any]:
    payload = _state_payload()
    params = {}

    try:
        from app.real_bridge import api_real_parameters
        params = api_real_parameters()
    except Exception:
        params = {}

    labels = ["Receitas", "Tanques", "Mangueiras", "B1 ligada", "B2 ligada", "Óleo ativo"]
    pumps = payload.get("pumps") or {}

    data = [
        len(params.get("recipes") or []),
        len(params.get("tanks") or []),
        len(params.get("hoses") or []),
        1 if pumps.get("b1") else 0,
        1 if pumps.get("b2") else 0,
        1 if pumps.get("oil") else 0,
    ]

    return {
        "title": "Equipamentos e parâmetros cadastrados",
        "chart_type": chart_type,
        "labels": labels,
        "series": [{"name": "Quantidade/Estado", "data": data}],
        "table": [{"item": label, "valor": data[index]} for index, label in enumerate(labels)],
        "legend": [{"label": "Quantidade/Estado", "description": "Resumo de cadastros reais e estados das saídas."}],
    }


def _stats_cycle_time(chart_type: str) -> dict[str, Any]:
    telemetry = _read_json(CHART_TELEMETRY_FILE, {})
    labels: list[str] = []
    data: list[int] = []

    if isinstance(telemetry, dict):
        for operation_id, points in telemetry.items():
            if operation_id == "SEM_OPERACAO" or not isinstance(points, list) or not points:
                continue

            labels.append(operation_id[-10:])
            data.append(max(_safe_int(point.get("elapsed_seconds"), 0) for point in points if isinstance(point, dict)))

    if not labels:
        return _empty_chart("Tempo de ciclo por operação", chart_type, "Tempo")

    return {
        "title": "Tempo de ciclo por operação",
        "chart_type": chart_type,
        "labels": labels,
        "series": [{"name": "Tempo total (s)", "data": data}],
        "table": [{"operacao": labels[index], "tempo_s": data[index]} for index in range(len(labels))],
        "legend": [{"label": "Tempo total (s)", "description": "Duração registrada a partir dos pontos de telemetria."}],
    }


def _stats_machine_performance(chart_type: str) -> dict[str, Any]:
    points = _telemetry_points()

    b1 = sum(1 for point in points if (point.get("pumps") or {}).get("b1"))
    b2 = sum(1 for point in points if (point.get("pumps") or {}).get("b2"))
    oil = sum(1 for point in points if (point.get("pumps") or {}).get("oil"))
    plc_offline = sum(1 for point in points if not (point.get("hardware") or {}).get("plc_online", True))
    sensor_offline = sum(1 for point in points if not (point.get("hardware") or {}).get("sensor_online", True))

    labels = ["B1 ativa", "B2 ativa", "Óleo ativo", "PLC offline", "Sensor offline"]
    data = [b1, b2, oil, plc_offline, sensor_offline]

    return {
        "title": "Desempenho geral das máquinas",
        "chart_type": chart_type,
        "labels": labels,
        "series": [{"name": "Amostras", "data": data}],
        "table": [{"item": labels[index], "amostras": data[index]} for index in range(len(labels))],
        "legend": [{"label": "Amostras", "description": "Quantidade de pontos de telemetria onde cada condição apareceu."}],
    }


def _stats_reports(chart_type: str) -> dict[str, Any]:
    reports = _read_json(REPORTS_FILE, [])

    if not isinstance(reports, list):
        reports = []

    counter: Counter[str] = Counter()

    for report in reports:
        if isinstance(report, dict):
            counter[_date_label(report.get("generated_at") or report.get("created_at"))] += 1

    if not counter:
        return _empty_chart("Relatórios exportados", chart_type, "Relatórios")

    labels = sorted(counter.keys())

    return {
        "title": "Relatórios exportados",
        "chart_type": chart_type,
        "labels": labels,
        "series": [{"name": "Relatórios", "data": [counter[label] for label in labels]}],
        "table": [{"data": label, "relatorios": counter[label]} for label in labels],
        "legend": [{"label": "Relatórios", "description": "Quantidade de relatórios gerados no período."}],
    }


def _stats_logs(chart_type: str) -> dict[str, Any]:
    events = _state_events()
    counter: Counter[str] = Counter()

    for event in events:
        counter[str(event.get("level") or "INFO").upper()] += 1

    if not counter:
        return _empty_chart("Logs por severidade", chart_type, "Logs")

    labels = list(counter.keys())

    return {
        "title": "Logs por severidade",
        "chart_type": chart_type,
        "labels": labels,
        "series": [{"name": "Logs", "data": [counter[label] for label in labels]}],
        "table": [{"severidade": label, "quantidade": counter[label]} for label in labels],
        "legend": [{"label": label, "description": f"Eventos de severidade {label}."} for label in labels],
    }


@router.get("/api/charts/catalog")
def api_charts_catalog() -> dict[str, Any]:
    return {
        "sampling_seconds": SAMPLE_INTERVAL_SECONDS,
        "metrics": [
            {"id": "operations_by_day", "label": "Operações por período"},
            {"id": "operation_status", "label": "Status das operações"},
            {"id": "vacuum_ramp", "label": "Rampa de vácuo"},
            {"id": "alarms_by_type", "label": "Alarmes por tipo"},
            {"id": "equipment_usage", "label": "Equipamentos e parâmetros"},
            {"id": "cycle_time", "label": "Tempo de ciclo"},
            {"id": "machine_performance", "label": "Desempenho das máquinas"},
            {"id": "reports_exported", "label": "Relatórios exportados"},
            {"id": "logs_by_severity", "label": "Logs por severidade"},
        ],
        "chart_types": [
            {"id": "line", "label": "Linha"},
            {"id": "bar", "label": "Barras"},
            {"id": "pie", "label": "Pizza/Rosca"},
        ],
    }


@router.get("/api/charts/realtime-ramp")
def api_realtime_ramp(force_sample: bool = Query(default=False)) -> dict[str, Any]:
    sample = _sample_state(force=force_sample)
    points = sample["points"]
    current = sample["current"]

    return {
        "title": "Rampa de vácuo em tempo real",
        "operation_id": sample["operation_id"],
        "sample_interval_seconds": SAMPLE_INTERVAL_SECONDS,
        "x_axis": "Tempo de operação (s)",
        "y_axis": "Pressão / vácuo (mbar)",
        "current": current,
        "points": points,
        "pressure_numeric_available": bool(current.get("pressure_numeric_available", False)),
        "note": "Com sensor digital OUT1/OUT2, a curva real só aparece quando existir pressão numérica contínua.",
    }


@router.get("/api/charts/operation-ramp/{operation_id}")
def api_operation_ramp(operation_id: str) -> dict[str, Any]:
    telemetry = _read_json(CHART_TELEMETRY_FILE, {})
    points = telemetry.get(operation_id, []) if isinstance(telemetry, dict) else []

    return {
        "title": f"Rampa de vácuo da operação {operation_id}",
        "operation_id": operation_id,
        "x_axis": "Tempo de operação (s)",
        "y_axis": "Pressão / vácuo (mbar)",
        "points": points if isinstance(points, list) else [],
    }


@router.get("/api/charts/statistics")
def api_statistics(
    metric: str = Query(default="operations_by_day"),
    chart_type: str = Query(default="bar"),
    date_start: str | None = Query(default=None),
    date_end: str | None = Query(default=None),
) -> dict[str, Any]:
    chart_type = chart_type.lower().strip()

    if chart_type not in {"line", "bar", "pie"}:
        chart_type = "bar"

    metric = metric.lower().strip()

    if metric == "operations_by_day":
        data = _stats_operations_by_day(chart_type)
    elif metric == "operation_status":
        data = _stats_status(chart_type)
    elif metric == "alarms_by_type":
        data = _stats_alarms(chart_type)
    elif metric == "equipment_usage":
        data = _stats_equipment_usage(chart_type)
    elif metric == "cycle_time":
        data = _stats_cycle_time(chart_type)
    elif metric == "machine_performance":
        data = _stats_machine_performance(chart_type)
    elif metric == "reports_exported":
        data = _stats_reports(chart_type)
    elif metric == "logs_by_severity":
        data = _stats_logs(chart_type)
    elif metric == "vacuum_ramp":
        ramp = api_realtime_ramp(force_sample=False)
        points = [point for point in ramp["points"] if point.get("pressure_mbar") is not None]
        data = {
            "title": "Rampa de vácuo",
            "chart_type": "line",
            "labels": [str(point.get("elapsed_seconds", 0)) for point in points],
            "series": [{"name": "Pressão medida (mbar)", "data": [point.get("pressure_mbar") for point in points]}],
            "table": points,
            "legend": [{"label": "Pressão medida", "description": "Pressão numérica registrada ao longo do tempo."}],
        }
    else:
        data = _empty_chart("Indicador desconhecido", chart_type, "Sem dados")

    data["metric"] = metric
    data["date_start"] = date_start
    data["date_end"] = date_end
    data["generated_at"] = _iso_now()

    return data


@router.get("/api/charts/workspace")
def api_get_workspace() -> dict[str, Any]:
    data = _read_json(CHART_WORKSPACE_FILE, {"charts": []})

    if not isinstance(data, dict):
        data = {"charts": []}

    data.setdefault("charts", [])

    return data


@router.post("/api/charts/workspace")
def api_save_workspace(payload: WorkspaceChartPayload) -> dict[str, Any]:
    workspace = api_get_workspace()
    charts = workspace.setdefault("charts", [])

    item = payload.model_dump()
    item["chart_id"] = item.get("chart_id") or f"CHART-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    item["updated_at"] = _iso_now()

    index = next((i for i, current in enumerate(charts) if current.get("chart_id") == item["chart_id"]), None)

    if index is None:
        charts.append(item)
    else:
        charts[index] = item

    _write_json(CHART_WORKSPACE_FILE, workspace)

    return item


@router.delete("/api/charts/workspace/{chart_id}")
def api_delete_workspace_chart(chart_id: str) -> dict[str, Any]:
    workspace = api_get_workspace()
    workspace["charts"] = [item for item in workspace.get("charts", []) if item.get("chart_id") != chart_id]
    _write_json(CHART_WORKSPACE_FILE, workspace)

    return {"ok": True, "charts": workspace["charts"]}