from __future__ import annotations

import importlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build
except Exception:
    Request = None
    Credentials = None
    Flow = None
    build = None

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

CLIENT_SECRET_FILE = DATA_DIR / "google_oauth_client_secret.local.json"
TOKEN_FILE = DATA_DIR / "google_oauth_token.local.json"
OAUTH_STATE_FILE = DATA_DIR / "google_oauth_state.local.json"
GENERATED_FILE = DATA_DIR / "google_sheets_generated.local.json"

REDIRECT_URI = "http://127.0.0.1:8020/api/google-oauth/callback"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]


class GoogleSheetsGeneratePayload(BaseModel):
    metric: str = Field(default="operations_by_day")
    chart_type: str = Field(default="bar")
    period: str = Field(default="month")
    title: str = Field(default="")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dependencies_ok() -> bool:
    return all([Request, Credentials, Flow, build])


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


def _ensure_dependencies() -> None:
    if not _dependencies_ok():
        raise HTTPException(
            status_code=500,
            detail="Dependencias Google ausentes. Instale google-api-python-client, google-auth, google-auth-oauthlib e google-auth-httplib2.",
        )


def _ensure_client_secret() -> None:
    if not CLIENT_SECRET_FILE.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo OAuth nao encontrado. Salve o client_secret em: {CLIENT_SECRET_FILE}",
        )


def _flow() -> Any:
    _ensure_dependencies()
    _ensure_client_secret()

    flow = Flow.from_client_secrets_file(
        str(CLIENT_SECRET_FILE),
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )

    return flow


def _credentials() -> Any | None:
    _ensure_dependencies()

    if not TOKEN_FILE.exists():
        return None

    try:
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    except Exception:
        return None

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
        except Exception:
            return None

    if creds and creds.valid:
        return creds

    return None


def _service() -> Any:
    creds = _credentials()

    if not creds:
        raise HTTPException(status_code=401, detail="Google OAuth nao autorizado.")

    return build("sheets", "v4", credentials=creds)


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


def _object_table(rows: list[dict[str, Any]]) -> list[list[Any]]:
    if not rows:
        return [["Sem dados"]]

    headers: list[str] = []

    for row in rows:
        for key in row.keys():
            if key not in headers:
                headers.append(key)

    values = [headers]

    for row in rows:
        values.append([row.get(header, "") for header in headers])

    return values


def _chart_type_google(chart_type: str) -> str:
    value = chart_type.lower().strip()

    if value == "line":
        return "LINE"

    if value == "pie":
        return "PIE"

    return "COLUMN"


def _build_chart_request(chart_type: str, title: str, data_sheet_id: int, dashboard_sheet_id: int, row_count: int) -> dict[str, Any]:
    chart_type_google = _chart_type_google(chart_type)

    if chart_type_google == "PIE":
        spec = {
            "title": title,
            "pieChart": {
                "legendPosition": "RIGHT_LEGEND",
                "domain": {
                    "sourceRange": {
                        "sources": [
                            {
                                "sheetId": data_sheet_id,
                                "startRowIndex": 1,
                                "endRowIndex": row_count + 1,
                                "startColumnIndex": 0,
                                "endColumnIndex": 1,
                            }
                        ]
                    }
                },
                "series": {
                    "sourceRange": {
                        "sources": [
                            {
                                "sheetId": data_sheet_id,
                                "startRowIndex": 1,
                                "endRowIndex": row_count + 1,
                                "startColumnIndex": 1,
                                "endColumnIndex": 2,
                            }
                        ]
                    }
                },
            },
        }
    else:
        spec = {
            "title": title,
            "basicChart": {
                "chartType": chart_type_google,
                "legendPosition": "RIGHT_LEGEND",
                "axis": [
                    {
                        "position": "BOTTOM_AXIS",
                        "title": "Categoria",
                    },
                    {
                        "position": "LEFT_AXIS",
                        "title": "Valor",
                    },
                ],
                "domains": [
                    {
                        "domain": {
                            "sourceRange": {
                                "sources": [
                                    {
                                        "sheetId": data_sheet_id,
                                        "startRowIndex": 0,
                                        "endRowIndex": row_count + 1,
                                        "startColumnIndex": 0,
                                        "endColumnIndex": 1,
                                    }
                                ]
                            }
                        }
                    }
                ],
                "series": [
                    {
                        "series": {
                            "sourceRange": {
                                "sources": [
                                    {
                                        "sheetId": data_sheet_id,
                                        "startRowIndex": 0,
                                        "endRowIndex": row_count + 1,
                                        "startColumnIndex": 1,
                                        "endColumnIndex": 2,
                                    }
                                ]
                            }
                        },
                        "targetAxis": "LEFT_AXIS",
                    }
                ],
                "headerCount": 1,
            },
        }

    return {
        "addChart": {
            "chart": {
                "spec": spec,
                "position": {
                    "overlayPosition": {
                        "anchorSheetId": dashboard_sheet_id,
                        "anchorRowIndex": 6,
                        "anchorColumnIndex": 0,
                        "widthPixels": 900,
                        "heightPixels": 500,
                    }
                },
            }
        }
    }


def _write_values(service: Any, spreadsheet_id: str, range_name: str, values: list[list[Any]]) -> None:
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=range_name,
        valueInputOption="USER_ENTERED",
        body={"values": values},
    ).execute()


@router.get("/api/google-oauth/status")
def api_google_oauth_status() -> dict[str, Any]:
    creds = None

    if _dependencies_ok() and TOKEN_FILE.exists():
        try:
            creds = _credentials()
        except Exception:
            creds = None

    return {
        "dependencies_available": _dependencies_ok(),
        "client_secret_exists": CLIENT_SECRET_FILE.exists(),
        "client_secret_path": str(CLIENT_SECRET_FILE),
        "authenticated": bool(creds),
        "redirect_uri": REDIRECT_URI,
        "scopes": SCOPES,
    }


@router.get("/api/google-oauth/start")
def api_google_oauth_start() -> dict[str, Any]:
    flow = _flow()

    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )

    _write_json(OAUTH_STATE_FILE, {"state": state, "created_at": _now_iso()})

    return {
        "ok": True,
        "auth_url": authorization_url,
        "state": state,
        "redirect_uri": REDIRECT_URI,
    }


@router.get("/api/google-oauth/callback", response_class=HTMLResponse)
def api_google_oauth_callback(code: str = Query(default=""), state: str = Query(default="")) -> HTMLResponse:
    if not code:
        return HTMLResponse("<h2>Autorização cancelada.</h2>")

    stored = _read_json(OAUTH_STATE_FILE, {})

    if stored.get("state") and state and stored.get("state") != state:
        return HTMLResponse("<h2>Estado OAuth inválido.</h2><p>Feche esta janela e tente novamente.</p>", status_code=400)

    flow = _flow()
    flow.fetch_token(code=code)

    creds = flow.credentials
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")

    return HTMLResponse(
        """
        <!doctype html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Google autorizado</title>
          <style>
            body { font-family: Arial, sans-serif; background: #0f172a; color: #fff; display: grid; place-items: center; min-height: 100vh; margin: 0; }
            main { max-width: 560px; background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 24px; text-align: center; }
            h1 { margin: 0 0 10px; }
            p { color: #cbd5e1; }
          </style>
        </head>
        <body>
          <main>
            <h1>Google Planilhas autorizado</h1>
            <p>Volte ao sistema TSEA V-Twin. Esta janela pode ser fechada.</p>
          </main>
          <script>
            setTimeout(function () {
              try { window.close(); } catch (e) {}
            }, 1800);
          </script>
        </body>
        </html>
        """
    )


@router.post("/api/google-oauth/logout")
def api_google_oauth_logout() -> dict[str, Any]:
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()

    return {"ok": True, "authenticated": False}


@router.get("/api/google-sheets/status")
def api_google_sheets_status() -> dict[str, Any]:
    oauth = api_google_oauth_status()
    generated = _read_json(GENERATED_FILE, [])

    if not isinstance(generated, list):
        generated = []

    return {
        **oauth,
        "generated": generated[-20:][::-1],
    }


@router.post("/api/google-sheets/generate-chart")
def api_google_sheets_generate_chart(payload: GoogleSheetsGeneratePayload) -> dict[str, Any]:
    oauth = api_google_oauth_status()

    if not oauth["client_secret_exists"]:
        raise HTTPException(status_code=400, detail=f"Arquivo OAuth nao encontrado: {CLIENT_SECRET_FILE}")

    if not oauth["authenticated"]:
        auth = api_google_oauth_start()
        raise HTTPException(status_code=401, detail={"auth_required": True, "auth_url": auth["auth_url"]})

    service = _service()

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

    spreadsheet = service.spreadsheets().create(
        body={
            "properties": {
                "title": title,
                "locale": "pt_BR",
            }
        },
        fields="spreadsheetId,spreadsheetUrl,sheets.properties",
    ).execute()

    spreadsheet_id = spreadsheet["spreadsheetId"]
    spreadsheet_url = spreadsheet["spreadsheetUrl"]
    data_sheet_id = spreadsheet["sheets"][0]["properties"]["sheetId"]
    full_sheet_id = 1001
    dashboard_sheet_id = 1002

    batch_requests = [
        {
            "updateSheetProperties": {
                "properties": {
                    "sheetId": data_sheet_id,
                    "title": "Dados_Grafico",
                    "gridProperties": {
                        "frozenRowCount": 1,
                    },
                },
                "fields": "title,gridProperties.frozenRowCount",
            }
        },
        {
            "addSheet": {
                "properties": {
                    "sheetId": full_sheet_id,
                    "title": "Dados_Completos",
                    "gridProperties": {
                        "frozenRowCount": 1,
                    },
                }
            }
        },
        {
            "addSheet": {
                "properties": {
                    "sheetId": dashboard_sheet_id,
                    "title": "Grafico",
                }
            }
        },
    ]

    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": batch_requests},
    ).execute()

    chart_values = [["Categoria", "Valor"]] + [[row["categoria"], row["valor"]] for row in chart_rows]
    full_values = _object_table(full_rows)
    dashboard_values = [
        [title],
        [f"Indicador: {payload.metric}"],
        [f"Tipo: {payload.chart_type}"],
        [f"Período: {payload.period}"],
        [f"Gerado em: {_now_iso()}"],
        [f"Fonte: {chart.get('meta', {}).get('source', 'TSEA V-Twin')}"],
    ]

    _write_values(service, spreadsheet_id, "Dados_Grafico!A1:B" + str(len(chart_values)), chart_values)
    _write_values(service, spreadsheet_id, "Dados_Completos!A1", full_values)
    _write_values(service, spreadsheet_id, "Grafico!A1:A6", dashboard_values)

    formatting_requests = [
        {
            "repeatCell": {
                "range": {
                    "sheetId": data_sheet_id,
                    "startRowIndex": 0,
                    "endRowIndex": 1,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.86, "green": 0.92, "blue": 0.99},
                        "textFormat": {"bold": True},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat)",
            }
        },
        {
            "repeatCell": {
                "range": {
                    "sheetId": full_sheet_id,
                    "startRowIndex": 0,
                    "endRowIndex": 1,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.86, "green": 0.92, "blue": 0.99},
                        "textFormat": {"bold": True},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat)",
            }
        },
        {
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 0,
                    "endRowIndex": 1,
                    "startColumnIndex": 0,
                    "endColumnIndex": 1,
                },
                "cell": {
                    "userEnteredFormat": {
                        "textFormat": {
                            "bold": True,
                            "fontSize": 18,
                        }
                    }
                },
                "fields": "userEnteredFormat(textFormat)",
            }
        },
        {
            "autoResizeDimensions": {
                "dimensions": {
                    "sheetId": data_sheet_id,
                    "dimension": "COLUMNS",
                    "startIndex": 0,
                    "endIndex": 2,
                }
            }
        },
        {
            "autoResizeDimensions": {
                "dimensions": {
                    "sheetId": full_sheet_id,
                    "dimension": "COLUMNS",
                    "startIndex": 0,
                    "endIndex": min(26, len(full_values[0]) if full_values else 1),
                }
            }
        },
        _build_chart_request(payload.chart_type, title, data_sheet_id, dashboard_sheet_id, len(chart_rows)),
    ]

    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": formatting_requests},
    ).execute()

    generated = _read_json(GENERATED_FILE, [])

    if not isinstance(generated, list):
        generated = []

    item = {
        "title": title,
        "metric": payload.metric,
        "chart_type": payload.chart_type,
        "period": payload.period,
        "spreadsheet_url": spreadsheet_url,
        "spreadsheet_id": spreadsheet_id,
        "rows_sent": len(chart_rows),
        "generated_at": _now_iso(),
    }

    generated.append(item)
    _write_json(GENERATED_FILE, generated[-100:])

    return {
        "ok": True,
        **item,
    }