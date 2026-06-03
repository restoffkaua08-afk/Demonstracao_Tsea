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

    if not isinstance(telemetry, dict):
        telemetry = {}

    points = telemetry.setdefault(operation_id, [])

    if not isinstance(points, list):
        points = []
        telemetry[operation_id] = points

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


def _telemetry_by_operation() -> dict[str, list[dict[str, Any]]]:
    telemetry = _read_json(CHART_TELEMETRY_FILE, {})
    result: dict[str, list[dict[str, Any]]] = {}

    if not isinstance(telemetry, dict):
        return result

    for operation_id, values in telemetry.items():
        if not isinstance(values, list):
            continue

        clean = [item for item in values if isinstance(item, dict)]

        if clean:
            result[str(operation_id)] = clean

    return result


def _telemetry_points() -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []

    for operation_id, values in _telemetry_by_operation().items():
        for item in values:
            points.append({**item, "operation_id": str(item.get("operation_id") or operation_id)})

    return points


def _state_events() -> list[dict[str, Any]]:
    payload = _state_payload()
    events = payload.get("events") or []

    return [item for item in events if isinstance(item, dict)]


def _date_obj(value: Any) -> datetime | None:
    text = str(value or "").strip()

    if not text:
        return None

    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"

        parsed = datetime.fromisoformat(text)

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _date_label(value: Any) -> str:
    parsed = _date_obj(value)

    if parsed:
        return parsed.strftime("%Y-%m-%d")

    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _period_start(period: str | None, date_start: str | None) -> datetime | None:
    if date_start:
        parsed = _date_obj(date_start)

        if parsed:
            return parsed

    now = _now()
    period = (period or "all").lower()

    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)

    if period == "week":
        return now - timedelta(days=7)

    if period == "month":
        return now - timedelta(days=30)

    return None


def _period_end(date_end: str | None) -> datetime | None:
    if not date_end:
        return None

    parsed = _date_obj(date_end)

    if not parsed:
        return None

    return parsed.replace(hour=23, minute=59, second=59, microsecond=999999)


def _in_period(value: Any, period: str | None, date_start: str | None = None, date_end: str | None = None) -> bool:
    parsed = _date_obj(value)

    if parsed is None:
        return True

    start = _period_start(period, date_start)
    end = _period_end(date_end)

    if start and parsed < start:
        return False

    if end and parsed > end:
        return False

    return True


def _empty_chart(title: str, chart_type: str, message: str, source: str) -> dict[str, Any]:
    return {
        "title": title,
        "chart_type": chart_type,
        "labels": [],
        "series": [{"name": message, "data": []}],
        "table": [],
        "legend": [{"label": message, "description": "Sem registros reais suficientes para este indicador."}],
        "meta": {
            "source": source,
            "sample_count": 0,
            "real_data": True,
            "empty": True,
        },
    }


def _chart(title: str, chart_type: str, labels: list[str], name: str, data: list[float | int], table: list[dict[str, Any]], legend: list[dict[str, str]], source: str) -> dict[str, Any]:
    return {
        "title": title,
        "chart_type": chart_type,
        "labels": labels,
        "series": [{"name": name, "data": data}],
        "table": table,
        "legend": legend,
        "meta": {
            "source": source,
            "sample_count": len(table),
            "real_data": True,
            "empty": len(labels) == 0 or len(data) == 0,
        },
    }


def _records_with_date(period: str | None, date_start: str | None, date_end: str | None) -> list[dict[str, Any]]:
    records = _operation_records()

    return [
        item for item in records
        if _in_period(item.get("finished_at") or item.get("created_at") or item.get("started_at") or item.get("date"), period, date_start, date_end)
    ]


def _stats_operations_by_day(chart_type: str, period: str | None, date_start: str | None, date_end: str | None) -> dict[str, Any]:
    records = _records_with_date(period, date_start, date_end)
    telemetry = _telemetry_by_operation()
    counter: Counter[str] = Counter()

    for record in records:
        counter[_date_label(record.get("finished_at") or record.get("created_at") or record.get("started_at") or record.get("date"))] += 1

    for operation_id, points in telemetry.items():
        if operation_id == "SEM_OPERACAO" or not points:
            continue

        first = points[0]
        date_value = first.get("timestamp")

        if _in_period(date_value, period, date_start, date_end):
            counter[_date_label(date_value)] += 1

    if not counter:
        return _empty_chart("Operações por período", chart_type, "Operações", "operation_records + chart_telemetry")

    labels = sorted(counter.keys())
    table = [{"data": label, "operacoes": counter[label]} for label in labels]

    return _chart(
        "Operações por período",
        chart_type,
        labels,
        "Operações",
        [counter[label] for label in labels],
        table,
        [{"label": "Operações", "description": "Quantidade de operações reais registradas no período."}],
        "operation_records + chart_telemetry",
    )


def _stats_status(chart_type: str, period: str | None, date_start: str | None, date_end: str | None) -> dict[str, Any]:
    records = _records_with_date(period, date_start, date_end)
    telemetry = _telemetry_by_operation()
    counter: Counter[str] = Counter()

    for record in records:
        status = str(record.get("status") or record.get("statusFinal") or record.get("result") or "REGISTRADO").upper()
        counter[status] += 1

    for operation_id, points in telemetry.items():
        if operation_id == "SEM_OPERACAO" or not points:
            continue

        last = points[-1]
        date_value = last.get("timestamp")

        if _in_period(date_value, period, date_start, date_end):
            status = str(last.get("status") or "EM_CICLO").upper()
            counter[status] += 1

    if not counter:
        return _empty_chart("Status das operações", chart_type, "Status", "operation_records + último ponto de telemetria")

    labels = list(counter.keys())
    table = [{"status": label, "quantidade": counter[label]} for label in labels]

    return _chart(
        "Status das operações",
        chart_type,
        labels,
        "Quantidade",
        [counter[label] for label in labels],
        table,
        [{"label": label, "description": f"Operações com status {label}."} for label in labels],
        "operation_records + último ponto de telemetria",
    )


def _stats_alarms(chart_type: str, period: str | None, date_start: str | None, date_end: str | None) -> dict[str, Any]:
    points = [point for point in _telemetry_points() if _in_period(point.get("timestamp"), period, date_start, date_end)]
    events = [event for event in _state_events() if _in_period(event.get("time") or event.get("timestamp"), period, date_start, date_end)]
    counter: Counter[str] = Counter()

    for point in points:
        alarm = point.get("alarm")

        if alarm:
            counter[str(alarm).upper()] += 1

        hardware = point.get("hardware") or {}

        if hardware.get("emergency"):
            counter["EMERGENCIA"] += 1

    for event in events:
        message = str(event.get("message") or "")
        level = str(event.get("level") or "INFO").upper()

        if "alarme" in message.lower() or level in {"WARN", "WARNING", "CRITICAL", "EMERGENCY"}:
            counter[level] += 1

    if not counter:
        return _empty_chart("Alarmes por tipo", chart_type, "Alarmes", "chart_telemetry + eventos do Gateway")

    labels = list(counter.keys())
    table = [{"alarme": label, "quantidade": counter[label]} for label in labels]

    return _chart(
        "Alarmes por tipo",
        chart_type,
        labels,
        "Alarmes",
        [counter[label] for label in labels],
        table,
        [{"label": label, "description": "Ocorrências reais registradas nos eventos/telemetria."} for label in labels],
        "chart_telemetry + eventos do Gateway",
    )


def _stats_equipment_usage(chart_type: str) -> dict[str, Any]:
    payload = _state_payload()
    params = {}

    try:
        from app.real_bridge import api_real_parameters
        params = api_real_parameters()
    except Exception:
        params = {}

    pumps = payload.get("pumps") or {}
    labels = ["Receitas", "Tanques", "Mangueiras", "B1 ligada", "B2 ligada", "Óleo ativo"]

    data = [
        len(params.get("recipes") or []),
        len(params.get("tanks") or []),
        len(params.get("hoses") or []),
        1 if pumps.get("b1") else 0,
        1 if pumps.get("b2") else 0,
        1 if pumps.get("oil") else 0,
    ]

    table = [{"item": label, "valor": data[index]} for index, label in enumerate(labels)]

    return _chart(
        "Equipamentos e parâmetros cadastrados",
        chart_type,
        labels,
        "Quantidade/estado",
        data,
        table,
        [{"label": "Quantidade/estado", "description": "Cadastros reais e estados atuais retornados pelo Gateway."}],
        "real_parameters + state",
    )


def _stats_cycle_time(chart_type: str, period: str | None, date_start: str | None, date_end: str | None) -> dict[str, Any]:
    telemetry = _telemetry_by_operation()
    labels: list[str] = []
    data: list[int] = []
    table: list[dict[str, Any]] = []

    for operation_id, points in telemetry.items():
        if operation_id == "SEM_OPERACAO" or not points:
            continue

        date_value = points[-1].get("timestamp")

        if not _in_period(date_value, period, date_start, date_end):
            continue

        elapsed = max(_safe_int(point.get("elapsed_seconds"), 0) for point in points)
        labels.append(operation_id[-12:])
        data.append(elapsed)
        table.append({"operacao": operation_id, "tempo_s": elapsed, "amostras": len(points)})

    records = _records_with_date(period, date_start, date_end)

    for record in records:
        seconds = _safe_int(record.get("total_time_seconds") or record.get("elapsed_seconds") or record.get("duration_seconds"), -1)

        if seconds >= 0:
            code = str(record.get("operation_code") or record.get("id") or f"OP-{len(labels)+1}")
            labels.append(code[-12:])
            data.append(seconds)
            table.append({"operacao": code, "tempo_s": seconds, "origem": "operation_records"})

    if not labels:
        return _empty_chart("Tempo de ciclo por operação", chart_type, "Tempo", "chart_telemetry + operation_records")

    return _chart(
        "Tempo de ciclo por operação",
        chart_type,
        labels,
        "Tempo total (s)",
        data,
        table,
        [{"label": "Tempo total (s)", "description": "Duração real calculada por operação registrada."}],
        "chart_telemetry + operation_records",
    )


def _stats_machine_performance(chart_type: str, period: str | None, date_start: str | None, date_end: str | None) -> dict[str, Any]:
    points = [point for point in _telemetry_points() if _in_period(point.get("timestamp"), period, date_start, date_end)]

    if not points:
        return _empty_chart("Desempenho geral das máquinas", chart_type, "Amostras", "chart_telemetry")

    b1 = sum(1 for point in points if (point.get("pumps") or {}).get("b1"))
    b2 = sum(1 for point in points if (point.get("pumps") or {}).get("b2"))
    oil = sum(1 for point in points if (point.get("pumps") or {}).get("oil"))
    plc_offline = sum(1 for point in points if not (point.get("hardware") or {}).get("plc_online", True))
    sensor_offline = sum(1 for point in points if not (point.get("hardware") or {}).get("sensor_online", True))

    labels = ["B1 ativa", "B2 ativa", "Óleo ativo", "PLC offline", "Sensor offline"]
    data = [b1, b2, oil, plc_offline, sensor_offline]
    table = [{"item": labels[index], "amostras": data[index]} for index in range(len(labels))]

    return _chart(
        "Desempenho geral das máquinas",
        chart_type,
        labels,
        "Amostras",
        data,
        table,
        [{"label": "Amostras", "description": "Quantidade de pontos reais de telemetria por condição."}],
        "chart_telemetry",
    )


def _stats_reports(chart_type: str, period: str | None, date_start: str | None, date_end: str | None) -> dict[str, Any]:
    reports = _read_json(REPORTS_FILE, [])

    if not isinstance(reports, list):
        reports = []

    counter: Counter[str] = Counter()

    for report in reports:
        if not isinstance(report, dict):
            continue

        date_value = report.get("generated_at") or report.get("created_at")

        if _in_period(date_value, period, date_start, date_end):
            counter[_date_label(date_value)] += 1

    if not counter:
        return _empty_chart("Relatórios exportados", chart_type, "Relatórios", "reports.json")

    labels = sorted(counter.keys())
    table = [{"data": label, "relatorios": counter[label]} for label in labels]

    return _chart(
        "Relatórios exportados",
        chart_type,
        labels,
        "Relatórios",
        [counter[label] for label in labels],
        table,
        [{"label": "Relatórios", "description": "Quantidade real de relatórios registrados por data."}],
        "reports.json",
    )


def _stats_logs(chart_type: str, period: str | None, date_start: str | None, date_end: str | None) -> dict[str, Any]:
    events = [event for event in _state_events() if _in_period(event.get("time") or event.get("timestamp"), period, date_start, date_end)]
    counter: Counter[str] = Counter()

    for event in events:
        counter[str(event.get("level") or "INFO").upper()] += 1

    if not counter:
        return _empty_chart("Logs por severidade", chart_type, "Logs", "eventos do Gateway")

    labels = list(counter.keys())
    table = [{"severidade": label, "quantidade": counter[label]} for label in labels]

    return _chart(
        "Logs por severidade",
        chart_type,
        labels,
        "Logs",
        [counter[label] for label in labels],
        table,
        [{"label": label, "description": f"Eventos reais de severidade {label}."} for label in labels],
        "eventos do Gateway",
    )


@router.get("/api/charts/catalog")
def api_charts_catalog() -> dict[str, Any]:
    return {
        "sampling_seconds": SAMPLE_INTERVAL_SECONDS,
        "metrics": [
            {"id": "operations_by_day", "label": "Operações por período"},
            {"id": "operation_status", "label": "Status das operações"},
            {"id": "cycle_time", "label": "Tempo de ciclo"},
            {"id": "vacuum_ramp", "label": "Rampa de vácuo registrada"},
            {"id": "alarms_by_type", "label": "Alarmes por tipo"},
            {"id": "equipment_usage", "label": "Equipamentos e parâmetros"},
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
        "meta": {
            "source": "state + chart_telemetry",
            "sample_count": len(points),
            "real_data": True,
            "empty": len(points) == 0,
        },
    }


@router.get("/api/charts/operation-ramp/{operation_id}")
def api_operation_ramp(operation_id: str) -> dict[str, Any]:
    telemetry = _telemetry_by_operation()
    points = telemetry.get(operation_id, [])

    return {
        "title": f"Rampa de vácuo da operação {operation_id}",
        "operation_id": operation_id,
        "x_axis": "Tempo de operação (s)",
        "y_axis": "Pressão / vácuo (mbar)",
        "points": points,
        "meta": {
            "source": "chart_telemetry",
            "sample_count": len(points),
            "real_data": True,
            "empty": len(points) == 0,
        },
    }


@router.get("/api/charts/statistics")
def api_statistics(
    metric: str = Query(default="operations_by_day"),
    chart_type: str = Query(default="bar"),
    period: str = Query(default="all"),
    date_start: str | None = Query(default=None),
    date_end: str | None = Query(default=None),
) -> dict[str, Any]:
    chart_type = chart_type.lower().strip()

    if chart_type not in {"line", "bar", "pie"}:
        chart_type = "bar"

    metric = metric.lower().strip()

    if metric == "operations_by_day":
        data = _stats_operations_by_day(chart_type, period, date_start, date_end)
    elif metric == "operation_status":
        data = _stats_status(chart_type, period, date_start, date_end)
    elif metric == "alarms_by_type":
        data = _stats_alarms(chart_type, period, date_start, date_end)
    elif metric == "equipment_usage":
        data = _stats_equipment_usage(chart_type)
    elif metric == "cycle_time":
        data = _stats_cycle_time(chart_type, period, date_start, date_end)
    elif metric == "machine_performance":
        data = _stats_machine_performance(chart_type, period, date_start, date_end)
    elif metric == "reports_exported":
        data = _stats_reports(chart_type, period, date_start, date_end)
    elif metric == "logs_by_severity":
        data = _stats_logs(chart_type, period, date_start, date_end)
    elif metric == "vacuum_ramp":
        ramp = api_realtime_ramp(force_sample=False)
        points = [point for point in ramp["points"] if point.get("pressure_mbar") is not None]

        if not points:
            data = _empty_chart("Rampa de vácuo registrada", "line", "Pressão medida", "chart_telemetry")
        else:
            table = [
                {
                    "tempo_s": point.get("elapsed_seconds"),
                    "pressao_mbar": point.get("pressure_mbar"),
                    "etapa": point.get("stage"),
                    "status": point.get("status"),
                }
                for point in points
            ]

            data = _chart(
                "Rampa de vácuo registrada",
                "line",
                [str(point.get("elapsed_seconds", 0)) for point in points],
                "Pressão medida (mbar)",
                [point.get("pressure_mbar") for point in points],
                table,
                [{"label": "Pressão medida", "description": "Pressão numérica registrada ao longo do tempo."}],
                "chart_telemetry",
            )
    else:
        data = _empty_chart("Indicador indisponível", chart_type, "Sem dados", "api")

    data["metric"] = metric
    data["period"] = period
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