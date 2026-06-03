from __future__ import annotations

import importlib
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CONFIG_FILE = DATA_DIR / "google_sheets_config.local.json"
GENERATED_FILE = DATA_DIR / "google_sheets_generated.local.json"


class GoogleSheetsConfigPayload(BaseModel):
    webapp_url: str = ""
    shared_secret: str = ""


class GoogleSheetsGeneratePayload(BaseModel):
    metric: str = Field(default="operations_by_day")
    chart_type: str = Field(default="bar")
    period: str = Field(default="month")
    title: str = Field(default="")
    open_after_generate: bool = Field(default=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def _charts_bridge():
    return importlib.import_module("app.charts_bridge")


def _config() -> dict[str, str]:
    local = _read_json(CONFIG_FILE, {})

    if not isinstance(local, dict):
        local = {}

    webapp_url = str(os.getenv("TSEA_GOOGLE_SHEETS_WEBAPP_URL") or local.get("webapp_url") or "").strip()
    shared_secret = str(os.getenv("TSEA_GOOGLE_SHEETS_SECRET") or local.get("shared_secret") or "").strip()

    return {
        "webapp_url": webapp_url,
        "shared_secret": shared_secret,
        "configured": bool(webapp_url),
        "source": "env" if os.getenv("TSEA_GOOGLE_SHEETS_WEBAPP_URL") else "local",
    }


def _chart_rows(chart: dict[str, Any]) -> list[dict[str, Any]]:
    labels = chart.get("labels") or []
    series = chart.get("series") or []
    first_series = series[0] if series and isinstance(series[0], dict) else {}
    values = first_series.get("data") or []
    series_name = first_series.get("name") or "Valor"

    rows: list[dict[str, Any]] = []

    for index, value in enumerate(values):
        label = labels[index] if index < len(labels) else index + 1
        rows.append(
            {
                "categoria": label,
                "valor": value,
                "serie": series_name,
            }
        )

    return rows


def _full_rows(chart: dict[str, Any]) -> list[dict[str, Any]]:
    table = chart.get("table") or []

    if isinstance(table, list) and table:
        rows: list[dict[str, Any]] = []

        for item in table:
            if isinstance(item, dict):
                rows.append(item)
            else:
                rows.append({"valor": item})

        return rows

    return _chart_rows(chart)


def _post_to_apps_script(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    request = urllib.request.Request(
        url=url,
        data=body,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "TSEA-VTwin-GoogleSheetsExporter/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            text = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"Apps Script retornou erro HTTP {error.code}: {detail}")
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Falha ao comunicar com Google Apps Script: {error}")

    try:
        parsed = json.loads(text)
    except Exception:
        raise HTTPException(status_code=502, detail=f"Resposta invalida do Apps Script: {text[:600]}")

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="Resposta do Apps Script nao veio como objeto JSON.")

    if not parsed.get("ok"):
        raise HTTPException(status_code=502, detail=parsed.get("error") or "Apps Script nao confirmou sucesso.")

    return parsed


@router.get("/api/google-sheets/status")
def api_google_sheets_status() -> dict[str, Any]:
    cfg = _config()
    generated = _read_json(GENERATED_FILE, [])

    if not isinstance(generated, list):
        generated = []

    return {
        "configured": cfg["configured"],
        "source": cfg["source"],
        "webapp_url_masked": cfg["webapp_url"][:42] + "..." if cfg["webapp_url"] else "",
        "has_shared_secret": bool(cfg["shared_secret"]),
        "generated": generated[-20:][::-1],
    }


@router.post("/api/google-sheets/config")
def api_google_sheets_config(payload: GoogleSheetsConfigPayload) -> dict[str, Any]:
    webapp_url = payload.webapp_url.strip()
    shared_secret = payload.shared_secret.strip()

    if webapp_url and not webapp_url.startswith("https://script.google.com/"):
        raise HTTPException(status_code=400, detail="URL invalida. Use a URL do Web App do Google Apps Script.")

    _write_json(
        CONFIG_FILE,
        {
            "webapp_url": webapp_url,
            "shared_secret": shared_secret,
            "updated_at": _now_iso(),
        },
    )

    return {
        "ok": True,
        "configured": bool(webapp_url),
        "has_shared_secret": bool(shared_secret),
    }


@router.post("/api/google-sheets/generate-chart")
def api_google_sheets_generate_chart(payload: GoogleSheetsGeneratePayload) -> dict[str, Any]:
    cfg = _config()

    if not cfg["configured"]:
        raise HTTPException(status_code=400, detail="URL do Google Apps Script ainda nao configurada.")

    charts = _charts_bridge()
    chart = charts.api_statistics(
        metric=payload.metric,
        chart_type=payload.chart_type,
        period=payload.period,
        date_start=None,
        date_end=None,
    )

    title = payload.title.strip() or chart.get("title") or "Grafico TSEA V-Twin"
    chart_rows = _chart_rows(chart)
    full_rows = _full_rows(chart)

    if not chart_rows:
        raise HTTPException(status_code=400, detail="Nao ha dados reais suficientes para gerar este grafico no Google Planilhas.")

    request_payload = {
        "secret": cfg["shared_secret"],
        "title": title,
        "metric": payload.metric,
        "chart_type": payload.chart_type,
        "period": payload.period,
        "generated_at": _now_iso(),
        "source": chart.get("meta", {}).get("source", "TSEA V-Twin"),
        "chart": {
            "title": title,
            "labels": chart.get("labels") or [],
            "series": chart.get("series") or [],
            "legend": chart.get("legend") or [],
            "meta": chart.get("meta") or {},
        },
        "chart_rows": chart_rows,
        "full_rows": full_rows,
    }

    result = _post_to_apps_script(cfg["webapp_url"], request_payload)

    generated = _read_json(GENERATED_FILE, [])

    if not isinstance(generated, list):
        generated = []

    item = {
        "title": title,
        "metric": payload.metric,
        "chart_type": payload.chart_type,
        "period": payload.period,
        "spreadsheet_url": result.get("spreadsheet_url"),
        "spreadsheet_id": result.get("spreadsheet_id"),
        "rows_sent": len(chart_rows),
        "generated_at": _now_iso(),
    }

    generated.append(item)
    _write_json(GENERATED_FILE, generated[-100:])

    return {
        "ok": True,
        **item,
        "apps_script": result,
    }