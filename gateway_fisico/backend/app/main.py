from __future__ import annotations

import asyncio
import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="TSEA Physical Gateway",
    description="Gateway simulado para conectar IHM, sistema do gerente e prototipo fisico.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_RECIPES: list[dict[str, Any]] = [
    {
        "id": "PAD-001",
        "title": "Operacao Padrao",
        "tank_type": "Comum",
        "estimated_seconds": 205,
        "target_pressure_mbar": 8.0,
        "b2_start_seconds": 24,
        "oil_start_seconds": 90,
        "stabilization_seconds": 165,
        "oil_per_tank_l": 50.0,
        "note": "Ciclo padrao para tanques comuns.",
    },
    {
        "id": "GRA-002",
        "title": "Tanque Grande",
        "tank_type": "Grande",
        "estimated_seconds": 225,
        "target_pressure_mbar": 12.0,
        "b2_start_seconds": 32,
        "oil_start_seconds": 100,
        "stabilization_seconds": 178,
        "oil_per_tank_l": 65.0,
        "note": "Acompanhar rampa e perda de carga.",
    },
    {
        "id": "CRI-003",
        "title": "Tanque Critico",
        "tank_type": "Critico",
        "estimated_seconds": 255,
        "target_pressure_mbar": 35.0,
        "b2_start_seconds": 45,
        "oil_start_seconds": 120,
        "stabilization_seconds": 195,
        "oil_per_tank_l": 45.0,
        "note": "Vacuo conservador para reduzir risco estrutural.",
    },
]


EMPTY_RECIPE: dict[str, Any] = {
    "id": "__SEM_RECEITA__",
    "title": "Nenhuma receita cadastrada",
    "name": "Nenhuma receita cadastrada",
    "tank_type": "Nao definido",
    "estimated_seconds": 0,
    "max_cycle_seconds": 0,
    "target_pressure_mbar": 1013.0,
    "roots_start_pressure_mbar": 0.0,
    "b2_start_seconds": 0,
    "oil_start_seconds": 0,
    "stabilization_seconds": 0,
    "oil_per_tank_l": 0.0,
    "min_oil_flow_l_min": 0.0,
    "note": "Cadastre uma receita no sistema do gerente para iniciar uma operacao.",
}
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
RECIPES_FILE = DATA_DIR / "recipes.json"


def load_recipes() -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if RECIPES_FILE.exists():
        try:
            data = json.loads(RECIPES_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except Exception:
            pass

    return []


def save_recipes(recipes: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RECIPES_FILE.write_text(json.dumps(recipes, indent=2, ensure_ascii=False), encoding="utf-8")


RECIPES: list[dict[str, Any]] = load_recipes()


class RecipePayload(BaseModel):
    id: str | None = None
    title: str | None = None
    name: str | None = None
    tank_type: str | None = None
    estimated_seconds: int | None = None
    max_cycle_seconds: int | None = None
    target_pressure_mbar: float | None = None
    roots_start_pressure_mbar: float | None = None
    b2_start_seconds: int | None = None
    oil_start_seconds: int | None = None
    stabilization_seconds: int | None = None
    oil_per_tank_l: float | None = None
    min_oil_flow_l_min: float | None = None
    note: str | None = None


def normalize_recipe(payload: RecipePayload) -> dict[str, Any]:
    timestamp = datetime.now().strftime("%H%M%S")
    estimated_seconds = int(payload.estimated_seconds or payload.max_cycle_seconds or 205)
    oil_start = int(payload.oil_start_seconds or max(70, min(120, estimated_seconds * 0.45)))
    stabilization = int(payload.stabilization_seconds or max(oil_start + 40, estimated_seconds * 0.78))

    oil_per_tank = payload.oil_per_tank_l
    if oil_per_tank is None:
        oil_per_tank = max(30.0, float(payload.min_oil_flow_l_min or 2.0) * 25.0)

    return {
        "id": payload.id or f"REC-{timestamp}",
        "title": payload.title or payload.name or "Receita cadastrada pelo gerente",
        "tank_type": payload.tank_type or "Comum",
        "estimated_seconds": estimated_seconds,
        "target_pressure_mbar": float(payload.target_pressure_mbar or 8.0),
        "roots_start_pressure_mbar": float(payload.roots_start_pressure_mbar or 50.0),
        "b2_start_seconds": int(payload.b2_start_seconds or 24),
        "oil_start_seconds": oil_start,
        "stabilization_seconds": stabilization,
        "oil_per_tank_l": float(oil_per_tank),
        "note": payload.note or "Receita cadastrada pelo sistema do gerente.",
    }

HOSES: dict[str, dict[str, Any]] = {
    "MG-01": {"id": "MG-01", "label": "Mangueira curta", "length_m": 5, "loss_base_mbar": 0.7},
    "MG-02": {"id": "MG-02", "label": "Mangueira media", "length_m": 8, "loss_base_mbar": 1.2},
    "MG-03": {"id": "MG-03", "label": "Mangueira longa", "length_m": 12, "loss_base_mbar": 1.8},
}


class StartCommand(BaseModel):
    recipe_id: str = Field(default="PAD-001")
    tank_count: int = Field(default=1, ge=1, le=3)
    hose_id: str = Field(default="MG-02")
    oil_reservoir_l: float = Field(default=50.0, ge=0)
    operator: str = Field(default="OPERADOR 01")
    shift: str = Field(default="MANHA")


class ChecklistPayload(BaseModel):
    operation_id: str | None = None
    items: dict[str, bool] = Field(default_factory=dict)
    observation: str = ""


class GatewayState:
    def __init__(self) -> None:
        self.operation_id = ""
        self.status = "PRONTO"
        self.stage = "PREPARO"
        self.mode = "SIMULADO"
        self.recipe = RECIPES[0] if RECIPES else EMPTY_RECIPE if RECIPES else EMPTY_RECIPE
        self.tank_count = 1
        self.hose = HOSES["MG-02"]
        self.oil_reservoir_l = 50.0
        self.oil_injected_l = 0.0
        self.elapsed_seconds = 0
        self.operator = "OPERADOR 01"
        self.shift = "MANHA"
        self.pump_b1 = False
        self.pump_b2 = False
        self.pump_oil = False
        self.sensor_online = True
        self.plc_online = True
        self.emergency = False
        self.alarm: str | None = None
        self.events: list[dict[str, Any]] = []
        self.history_today: list[dict[str, Any]] = []

    def event(self, message: str, level: str = "INFO") -> None:
        self.events.insert(
            0,
            {
                "time": datetime.now().isoformat(timespec="seconds"),
                "level": level,
                "message": message,
            },
        )
        self.events = self.events[:80]

    def current_pressure_machine(self) -> float:
        external_pressure = getattr(self, "external_pressure_machine_mbar", None)
        if getattr(self, "mode", "SIMULADO") == "FISICO_HTTP" and external_pressure is not None:
            return max(0.001, min(1013.0, float(external_pressure)))

        if self.status not in ["EM_CICLO", "FINALIZADO", "PAUSADO"]:
            return 1013.0

        target = float(self.recipe["target_pressure_mbar"])

        if self.elapsed_seconds <= 0:
            return 1013.0

        b2_start = int(self.recipe["b2_start_seconds"])
        oil_start = int(self.recipe["oil_start_seconds"])

        if self.elapsed_seconds < b2_start:
            return max(6.0, 1013.0 * math.exp(-self.elapsed_seconds / 4.8))

        if self.elapsed_seconds < oil_start:
            return max(target, 75.0 * math.exp(-(self.elapsed_seconds - b2_start) / 22.0))

        return target

    def compute_stage(self) -> str:
        if self.status == "PRONTO":
            return "PREPARO"
        if self.status == "BLOQUEADO":
            return "BLOQUEADO"
        if self.status == "PAUSADO":
            return self.stage
        if self.status == "FINALIZADO":
            return "FINALIZACAO"

        if self.elapsed_seconds < int(self.recipe["b2_start_seconds"]):
            return "VACUO_INICIAL"
        if self.elapsed_seconds < int(self.recipe["oil_start_seconds"]):
            return "VACUO_PROFUNDO"
        if self.elapsed_seconds < int(self.recipe["stabilization_seconds"]):
            return "INJECAO_DE_OLEO"
        if self.elapsed_seconds < int(self.recipe["estimated_seconds"]):
            return "ESTABILIZACAO"
        return "FINALIZACAO"

    def required_oil(self) -> float:
        return float(self.recipe["oil_per_tank_l"]) * self.tank_count

    def current_oil_flow(self) -> float:
        external_flow = getattr(self, "external_oil_flow_l_min", None)
        if getattr(self, "mode", "SIMULADO") == "FISICO_HTTP" and external_flow is not None:
            return max(0.0, float(external_flow))

        if self.pump_oil and self.status == "EM_CICLO":
            return max(1.2, self.tank_count * 1.5)
        return 0.0

    def update_simulation(self) -> None:
        if self.status != "EM_CICLO":
            return

        old_stage = self.stage

        self.elapsed_seconds += 1
        self.stage = self.compute_stage()

        self.pump_b1 = self.stage in ["VACUO_INICIAL", "VACUO_PROFUNDO", "INJECAO_DE_OLEO", "ESTABILIZACAO"]
        self.pump_b2 = self.stage == "VACUO_PROFUNDO"
        self.pump_oil = self.stage in ["INJECAO_DE_OLEO", "ESTABILIZACAO"]

        if self.stage != old_stage:
            self.event(f"Etapa atual: {self.stage}", "INFO")

        if self.pump_oil:
            required = self.required_oil()
            progress = min(1.0, max(0.0, (self.elapsed_seconds - int(self.recipe["oil_start_seconds"])) / 75.0))
            self.oil_injected_l = min(self.oil_reservoir_l, required * progress)

        if self.elapsed_seconds >= int(self.recipe["estimated_seconds"]):
            self.finish(auto=True)

    def tanks_payload(self) -> list[dict[str, Any]]:
        external_tanks = getattr(self, "external_tanks_payload", None)
        if getattr(self, "mode", "SIMULADO") == "FISICO_HTTP" and isinstance(external_tanks, list) and external_tanks:
            return external_tanks[: max(1, self.tank_count)]

        pressure_machine = self.current_pressure_machine()
        tanks: list[dict[str, Any]] = []

        for index in range(self.tank_count):
            hose_loss = float(self.hose["loss_base_mbar"]) + index * 0.35 + (self.tank_count - 1) * 0.42
            pressure_tank = max(float(self.recipe["target_pressure_mbar"]), pressure_machine + hose_loss)
            oil_in_tank = self.oil_injected_l / max(self.tank_count, 1)

            risk = 18.0
            if self.recipe["id"] == "CRI-003":
                risk += 35.0
            if pressure_tank < 10:
                risk += 10.0
            if self.tank_count >= 3:
                risk += 6.0

            risk = min(95.0, max(0.0, risk))

            tanks.append(
                {
                    "id": f"T{index + 1}",
                    "code": f"T{index + 1}",
                    "pressure_mbar": round(pressure_tank, 3),
                    "machine_pressure_mbar": round(pressure_machine, 3),
                    "hose_loss_mbar": round(hose_loss, 3),
                    "oil_in_l": round(oil_in_tank, 3),
                    "risk_pct": round(risk, 2),
                    "status": "ATENCAO" if risk >= 65 else "OK",
                }
            )

        return tanks

    def payload(self) -> dict[str, Any]:
        pressure_machine = self.current_pressure_machine()
        tanks = self.tanks_payload()
        pressure_avg = sum(t["pressure_mbar"] for t in tanks) / max(len(tanks), 1)

        return {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "mode": self.mode,
            "operation_id": self.operation_id,
            "status": self.status,
            "stage": self.stage,
            "elapsed_seconds": self.elapsed_seconds,
            "operator": self.operator,
            "shift": self.shift,
            "recipe": self.recipe,
            "hose": self.hose,
            "tank_count": self.tank_count,
            "pressure_machine_mbar": round(pressure_machine, 3),
            "pressure_avg_tank_mbar": round(pressure_avg, 3),
            "tanks": tanks,
            "pumps": {
                "b1": self.pump_b1,
                "b2": self.pump_b2,
                "oil": self.pump_oil,
            },
            "oil": {
                "reservoir_l": round(self.oil_reservoir_l, 3),
                "required_l": round(self.required_oil(), 3),
                "injected_l": round(self.oil_injected_l, 3),
                "remaining_l": round(max(0.0, self.oil_reservoir_l - self.oil_injected_l), 3),
                "flow_l_min": round(self.current_oil_flow(), 3),
                "temperature_c": 60.0,
            },
            "hardware": {
                "sensor_online": self.sensor_online,
                "plc_online": self.plc_online,
                "emergency": self.emergency,
            },
            "alarm": self.alarm,
            "events": self.events,
        }

    def start(self, command: StartCommand) -> dict[str, Any]:
        recipe = next((item for item in RECIPES if item["id"] == command.recipe_id), None)
        if recipe is None:
            raise ValueError("Receita nao encontrada.")

        sync_real_hoses_into_legacy_hoses()
        hose = HOSES.get(command.hose_id)
        if hose is None:
            raise ValueError("Mangueira nao encontrada.")

        required_oil = float(recipe["oil_per_tank_l"]) * command.tank_count
        if command.oil_reservoir_l < required_oil:
            raise ValueError(f"Oleo insuficiente. Necessario: {required_oil} L.")

        self.operation_id = f"OP-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        self.status = "EM_CICLO"
        self.stage = "VACUO_INICIAL"
        self.recipe = recipe
        self.tank_count = command.tank_count
        self.hose = hose
        self.oil_reservoir_l = command.oil_reservoir_l
        self.oil_injected_l = 0.0
        self.elapsed_seconds = 0
        self.operator = command.operator
        self.shift = command.shift
        self.pump_b1 = True
        self.pump_b2 = False
        self.pump_oil = False
        self.emergency = False
        self.alarm = None
        self.events = []
        self.event(f"Operacao {self.operation_id} iniciada.", "INFO")
        return self.payload()

    def pause(self) -> dict[str, Any]:
        if self.status == "EM_CICLO":
            self.status = "PAUSADO"
            self.pump_b1 = False
            self.pump_b2 = False
            self.pump_oil = False
            self.event("Operacao pausada.", "WARN")
        return self.payload()

    def resume(self) -> dict[str, Any]:
        if self.status == "PAUSADO":
            self.status = "EM_CICLO"
            self.event("Operacao retomada.", "INFO")
        return self.payload()

    def stop(self) -> dict[str, Any]:
        if self.status in ["EM_CICLO", "PAUSADO"]:
            self.finish(auto=False)
        return self.payload()

    def emergency_stop(self) -> dict[str, Any]:
        self.status = "BLOQUEADO"
        self.stage = "BLOQUEADO"
        self.pump_b1 = False
        self.pump_b2 = False
        self.pump_oil = False
        self.emergency = True
        self.alarm = "EMERGENCIA_ACIONADA"
        self.event("Emergencia acionada. Sistema bloqueado.", "CRITICAL")
        return self.payload()

    def reset(self) -> dict[str, Any]:
        self.status = "PRONTO"
        self.stage = "PREPARO"
        self.operation_id = ""
        self.elapsed_seconds = 0
        self.oil_injected_l = 0.0
        self.pump_b1 = False
        self.pump_b2 = False
        self.pump_oil = False
        self.emergency = False
        self.alarm = None
        self.events = []
        self.event("Gateway reiniciado para novo ciclo.", "INFO")
        return self.payload()

    def finish(self, auto: bool) -> None:
        self.status = "FINALIZADO"
        self.stage = "FINALIZACAO"
        self.pump_b1 = False
        self.pump_b2 = False
        self.pump_oil = False
        self.oil_injected_l = min(self.oil_reservoir_l, self.required_oil())

        record = {
            "operation_id": self.operation_id,
            "time": datetime.now().isoformat(timespec="seconds"),
            "status": self.status,
            "tank_count": self.tank_count,
            "recipe_id": self.recipe["id"],
            "recipe_title": self.recipe["title"],
            "elapsed_seconds": self.elapsed_seconds,
            "oil_injected_l": round(self.oil_injected_l, 3),
            "auto": auto,
        }

        self.history_today.insert(0, record)
        self.history_today = self.history_today[:50]
        self.event("Operacao finalizada automaticamente." if auto else "Operacao finalizada por comando.", "INFO")


STATE = GatewayState()
CLIENTS: set[WebSocket] = set()

# TSEA_OPERATION_TRACEABILITY_START

OPERATION_RECORDS_FILE = DATA_DIR / "operation_records.json"


def load_operation_records() -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if OPERATION_RECORDS_FILE.exists():
        try:
            data = json.loads(OPERATION_RECORDS_FILE.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except Exception:
            return []

    return []


def save_operation_records() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OPERATION_RECORDS_FILE.write_text(
        json.dumps(OPERATION_RECORDS[:150], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


OPERATION_RECORDS: list[dict[str, Any]] = load_operation_records()


def _safe_recipe() -> dict[str, Any]:
    return public_recipe(STATE.recipe) if "public_recipe" in globals() else STATE.recipe


def _safe_hose() -> dict[str, Any]:
    return public_hose(STATE.hose) if "public_hose" in globals() else STATE.hose


def _operation_status_label() -> str:
    if STATE.status == "EM_CICLO":
        return "Em andamento"
    if STATE.status == "PAUSADO":
        return "Atenção"
    if STATE.status == "FINALIZADO":
        return "Operacional"
    if STATE.status == "BLOQUEADO":
        return "Crítico"
    return "Registrado"


def _operation_result_text() -> str:
    if STATE.status == "EM_CICLO":
        return "Operação em execução e monitorada em tempo real pelo Gateway."
    if STATE.status == "PAUSADO":
        return "Operação pausada com registro mantido para rastreabilidade."
    if STATE.status == "FINALIZADO":
        return "Operação finalizada e consolidada no histórico técnico."
    if STATE.status == "BLOQUEADO":
        return "Operação bloqueada por evento crítico."
    return "Operação registrada pelo Gateway."


def _operation_observation_text(max_risk: float) -> str:
    if max_risk >= 82:
        return "Risco crítico. Verificar pressão, mangueira, sensores, bomba e condição estrutural."
    if max_risk >= 65:
        return "Operação com atenção. Monitorar perda de carga, óleo e estabilidade da curva."
    return "Operação dentro da faixa demonstrativa esperada."


def current_operation_record(extra: dict[str, Any] | None = None, forced_status: str | None = None) -> dict[str, Any] | None:
    if not STATE.operation_id:
        return None

    now = datetime.now().isoformat(timespec="seconds")
    payload = STATE.payload()
    recipe = _safe_recipe()
    hose = _safe_hose()

    tanks = payload.get("tanks", [])
    pressure_avg = float(payload.get("pressure_avg_tank_mbar") or 0)
    target_pressure = float(recipe.get("target_pressure_mbar") or 0)

    oil_payload = payload.get("oil", {})
    pump_payload = payload.get("pumps", {})
    hardware_payload = payload.get("hardware", {})

    max_risk = max([float(tank.get("risk_pct") or 0) for tank in tanks], default=0.0)
    tank_codes = ", ".join(str(tank.get("code") or tank.get("id") or "TQ") for tank in tanks) or "TQ-01"

    existing = next(
        (item for item in OPERATION_RECORDS if str(item.get("id")) == str(STATE.operation_id)),
        None,
    )

    timeline = list(existing.get("timeline", [])) if existing else []
    timeline.append({
        "second": STATE.elapsed_seconds,
        "time": now,
        "real_pressure_mbar": round(pressure_avg, 3),
        "expected_pressure_mbar": round(target_pressure, 3),
        "effective_pressure_mbar": round(pressure_avg, 3),
        "machine_pressure_mbar": payload.get("pressure_machine_mbar"),
        "stage": STATE.stage,
        "oil_injected_l": oil_payload.get("injected_l"),
        "oil_flow_l_min": oil_payload.get("flow_l_min"),
        "risk_pct": round(max_risk, 2),
        "pump_b1": pump_payload.get("b1"),
        "pump_b2": pump_payload.get("b2"),
        "pump_oil": pump_payload.get("oil"),
    })
    timeline = timeline[-240:]

    event_messages = [
        str(event.get("message") or "")
        for event in STATE.events
        if event.get("message")
    ][:30]

    components = [
        {
            "type": "Bomba primária",
            "id": "B1",
            "status": "Ligada" if pump_payload.get("b1") else "Desligada",
            "performance": "96%",
            "reading": "Mini bomba de vácuo / bomba primária",
            "impact": "Evacuação inicial e sustentação do ciclo de vácuo.",
        },
        {
            "type": "Bomba secundária / Roots simulada",
            "id": "B2",
            "status": "Ligada" if pump_payload.get("b2") else "Aguardando",
            "performance": "94%" if pump_payload.get("b2") else "Aguardando faixa",
            "reading": "Lâmpada simulando B2/Roots",
            "impact": "Representa o reforço de vácuo após faixa segura.",
        },
        {
            "type": "Linha de óleo",
            "id": "OIL-01",
            "status": "Ativa" if pump_payload.get("oil") else "Aguardando",
            "performance": f"{oil_payload.get('flow_l_min', 0)} L/min",
            "reading": f"{oil_payload.get('injected_l', 0)} L injetados",
            "impact": "Representa a etapa de impregnação/enchimento monitorado.",
        },
        {
            "type": "Sensor de pressão",
            "id": f"SP-{tank_codes}",
            "status": "Online" if hardware_payload.get("sensor_online") else "Falha",
            "performance": "98%" if hardware_payload.get("sensor_online") else "0%",
            "reading": f"{round(pressure_avg, 3)} mbar",
            "impact": "Base de leitura para painel, rastreabilidade e alarmes.",
        },
        {
            "type": "Mangueira",
            "id": hose.get("code") or hose.get("id") or "MG-02",
            "status": "Vinculada",
            "performance": str(hose.get("loss_base_mbar", hose.get("loss_factor", "--"))),
            "reading": "Perda de carga simulada",
            "impact": "Afeta diferença entre pressão da máquina e pressão estimada no tanque.",
        },
        {
            "type": "PLC / Gateway",
            "id": "PLC-SIM",
            "status": "Online" if hardware_payload.get("plc_online") else "Offline",
            "performance": "Simulado",
            "reading": STATE.stage,
            "impact": "Centraliza comando, estado operacional, intertravamentos e eventos.",
        },
    ]

    actions = [
        {
            "step": event.get("time"),
            "status": event.get("level"),
            "ref": STATE.stage,
            "log": event.get("message"),
        }
        for event in STATE.events[:30]
    ]

    record = {
        "id": STATE.operation_id,
        "operation_id": STATE.operation_id,
        "type": "Operação",
        "name": f"{recipe.get('title', recipe.get('name', 'Receita operacional'))} - {STATE.operation_id}",
        "title": f"{recipe.get('title', recipe.get('name', 'Receita operacional'))} - {STATE.operation_id}",
        "created_at": existing.get("created_at") if existing else now,
        "started_at": existing.get("started_at") if existing else now,
        "updated_at": now,
        "finished_at": now if STATE.status == "FINALIZADO" else (existing.get("finished_at") if existing else None),
        "operator": STATE.operator,
        "user": STATE.operator,
        "shift": STATE.shift,
        "status": forced_status or _operation_status_label(),
        "stage": STATE.stage,
        "tank": tank_codes,
        "tank_count": STATE.tank_count,
        "hose": hose.get("code") or hose.get("id") or "MG-02",
        "recipe": recipe.get("title") or recipe.get("name") or recipe.get("id"),
        "recipe_id": recipe.get("id"),
        "initial_pressure_mbar": 1013.0,
        "final_pressure_mbar": round(pressure_avg, 3),
        "pressure_mbar": round(pressure_avg, 3),
        "target_pressure_mbar": target_pressure,
        "cycle_time": f"{STATE.elapsed_seconds}s",
        "duration": f"{STATE.elapsed_seconds}s",
        "elapsed_seconds": STATE.elapsed_seconds,
        "oil": f"{oil_payload.get('injected_l', 0)} L · {oil_payload.get('flow_l_min', 0)} L/min",
        "oil_volume_liters": oil_payload.get("injected_l", 0),
        "oil_flow_l_min": oil_payload.get("flow_l_min", 0),
        "risk": round(max_risk, 2),
        "collapse_risk_pct": round(max_risk, 2),
        "result": _operation_result_text(),
        "observations": _operation_observation_text(max_risk),
        "events": event_messages or ["Operação registrada no Gateway."],
        "tanks": tanks,
        "timeline": timeline,
        "raw_state": payload,
        "components": components,
        "actions": actions,
    }

    if existing:
        if existing.get("checklist_pre") and not (extra and "checklist_pre" in extra):
            record["checklist_pre"] = existing.get("checklist_pre")
        if existing.get("checklist_final") and not (extra and "checklist_final" in extra):
            record["checklist_final"] = existing.get("checklist_final")

    if extra:
        record.update(extra)

    return record


def upsert_operation_record(extra: dict[str, Any] | None = None, forced_status: str | None = None) -> dict[str, Any] | None:
    record = current_operation_record(extra=extra, forced_status=forced_status)

    if record is None:
        return None

    index = next(
        (idx for idx, item in enumerate(OPERATION_RECORDS) if str(item.get("id")) == str(record.get("id"))),
        None,
    )

    if index is None:
        OPERATION_RECORDS.insert(0, record)
    else:
        OPERATION_RECORDS[index] = record
        OPERATION_RECORDS.insert(0, OPERATION_RECORDS.pop(index))

    save_operation_records()
    STATE.history_today = OPERATION_RECORDS[:50]
    return record


def find_operation_record(record_id: str) -> dict[str, Any] | None:
    if STATE.operation_id and str(STATE.operation_id) == str(record_id):
        upsert_operation_record()

    return next(
        (item for item in OPERATION_RECORDS if str(item.get("id")) == str(record_id)),
        None,
    )

# TSEA_OPERATION_TRACEABILITY_END




async def broadcast() -> None:
    payload = STATE.payload()
    disconnected: list[WebSocket] = []

    for websocket in list(CLIENTS):
        try:
            await websocket.send_json(payload)
        except Exception:
            disconnected.append(websocket)

    for websocket in disconnected:
        CLIENTS.discard(websocket)


async def simulation_loop() -> None:
    while True:
        STATE.update_simulation()
        if STATE.operation_id:
            upsert_operation_record()
        await broadcast()
        await asyncio.sleep(1)


@app.on_event("startup")
async def on_startup() -> None:
    STATE.event("Gateway fisico iniciado em modo simulado.", "INFO")
    asyncio.create_task(simulation_loop())



# TSEA_GATEWAY_COMPAT_ROUTES_START

TANKS: list[dict[str, Any]] = [
    {
        "id": 1,
        "code": "TQ-01",
        "type": "Camara do prototipo",
        "volume_liters": 50,
        "structural_limit_mbar": 35,
        "status": "available",
    }
]


def public_recipe(recipe: dict[str, Any]) -> dict[str, Any]:
    estimated_seconds = int(recipe.get("estimated_seconds") or recipe.get("max_cycle_seconds") or 205)
    oil_per_tank = float(recipe.get("oil_per_tank_l") or 50.0)
    min_oil_flow = float(recipe.get("min_oil_flow_l_min") or max(1.2, oil_per_tank / 25.0))

    return {
        **recipe,
        "id": str(recipe.get("id") or "PAD-001"),
        "name": recipe.get("name") or recipe.get("title") or "Receita Operacional",
        "title": recipe.get("title") or recipe.get("name") or "Receita Operacional",
        "tank_type": recipe.get("tank_type") or "Comum",
        "estimated_seconds": estimated_seconds,
        "max_cycle_seconds": int(recipe.get("max_cycle_seconds") or estimated_seconds),
        "target_pressure_mbar": float(recipe.get("target_pressure_mbar") or 8.0),
        "roots_start_pressure_mbar": float(recipe.get("roots_start_pressure_mbar") or 50.0),
        "b2_start_seconds": int(recipe.get("b2_start_seconds") or 24),
        "oil_start_seconds": int(recipe.get("oil_start_seconds") or 90),
        "stabilization_seconds": int(recipe.get("stabilization_seconds") or 165),
        "oil_per_tank_l": oil_per_tank,
        "min_oil_flow_l_min": min_oil_flow,
        "note": recipe.get("note") or recipe.get("observacao") or "Receita operacional.",
    }


def public_hose(hose: dict[str, Any]) -> dict[str, Any]:
    code = str(hose.get("code") or hose.get("id") or "MG-02")
    return {
        **hose,
        "id": code,
        "code": code,
        "label": hose.get("label") or hose.get("descricao") or code,
        "length_m": float(hose.get("length_m") or 8),
        "diameter_in": float(hose.get("diameter_in") or 1),
        "loss_factor": float(hose.get("loss_factor") or hose.get("loss_base_mbar") or 1.2),
        "loss_base_mbar": float(hose.get("loss_base_mbar") or hose.get("loss_factor") or 1.2),
        "status": hose.get("status") or "available",
    }


def normalize_recipe_id(value: Any) -> str:
    text = str(value or "").strip()

    if any(str(recipe.get("id")) == text for recipe in RECIPES):
        return text

    if text.isdigit():
        index = int(text) - 1
        if 0 <= index < len(RECIPES):
            return str(RECIPES[index].get("id"))

    return str(RECIPES[0].get("id"))


def normalize_hose_id(value: Any) -> str:
    text = str(value or "").strip()

    if text in HOSES:
        return text

    numeric_map = {
        "1": "MG-01",
        "2": "MG-02",
        "3": "MG-03",
    }

    return numeric_map.get(text, "MG-02")


def legacy_status(status: str) -> str:
    mapping = {
        "PRONTO": "stopped",
        "EM_CICLO": "running",
        "PAUSADO": "paused",
        "FINALIZADO": "stopped",
        "BLOQUEADO": "emergency",
    }

    return mapping.get(status, "stopped")


def legacy_state_payload() -> dict[str, Any]:
    payload = STATE.payload()
    recipe = public_recipe(STATE.recipe)
    hose = public_hose(STATE.hose)

    tank_states: list[dict[str, Any]] = []

    for tank in payload.get("tanks", []):
        risk = float(tank.get("risk_pct") or 0)

        tank_states.append(
            {
                "tank": {
                    "id": tank.get("id"),
                    "code": tank.get("code"),
                    "type": recipe.get("tank_type"),
                },
                "hose": hose,
                "pressure_mbar": tank.get("pressure_mbar"),
                "expected_pressure_mbar": recipe.get("target_pressure_mbar"),
                "effective_pressure_mbar": tank.get("pressure_mbar"),
                "machine_pressure_mbar": tank.get("machine_pressure_mbar"),
                "hose_loss_mbar": tank.get("hose_loss_mbar"),
                "oil_volume_liters": tank.get("oil_in_l"),
                "collapse_risk_pct": risk,
                "status_light": "red" if risk >= 82 else "yellow" if risk >= 65 else "green",
            }
        )

    return {
        **payload,
        "recipe": recipe,
        "hose": hose,
        "cycle": {
            "status": legacy_status(str(payload.get("status"))),
            "stage": payload.get("stage"),
            "elapsed_seconds": payload.get("elapsed_seconds"),
        },
        "tank_states": tank_states,
        "primary_pump": {
            "running": bool(payload.get("pumps", {}).get("b1")),
            "model": "Mini bomba de vacuo do prototipo",
            "health_pct": 96,
        },
        "roots_pump": {
            "running": bool(payload.get("pumps", {}).get("b2")),
            "model": "Lampada simulando B2/Roots",
            "health_pct": 94 if payload.get("pumps", {}).get("b2") else 0,
        },
        "oil_injection": {
            "enabled": bool(payload.get("pumps", {}).get("oil")),
            "current_flow_l_min": payload.get("oil", {}).get("flow_l_min"),
            "target_flow_l_min": recipe.get("min_oil_flow_l_min"),
            "injected_l": payload.get("oil", {}).get("injected_l"),
            "required_l": payload.get("oil", {}).get("required_l"),
        },
        "plc_comm_ok": bool(payload.get("hardware", {}).get("plc_online")),
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "status": "online",
        "gateway": "TSEA Physical Gateway",
        "mode": STATE.mode,
    }


@app.get("/api/operation/state")
def legacy_operation_state() -> dict[str, Any]:
    return legacy_state_payload()


@app.post("/api/operation/tick")
async def legacy_operation_tick() -> dict[str, Any]:
    STATE.update_simulation()
    await broadcast()
    return legacy_state_payload()


@app.post("/api/operation/start")
async def legacy_operation_start(payload: dict[str, Any]) -> dict[str, Any]:
    command = StartCommand(
        recipe_id=normalize_recipe_id(payload.get("recipe_id")),
        tank_count=max(1, min(3, int(payload.get("tank_count") or 1))),
        hose_id=normalize_hose_id(payload.get("hose_id")),
        oil_reservoir_l=float(payload.get("oil_reservoir_l") or payload.get("oleoColocado") or 150),
        operator=str(payload.get("operator") or "OPERADOR 01"),
        shift=str(payload.get("shift") or "MANHA"),
    )

    STATE.start(command)
    upsert_operation_record()
    await broadcast()
    return legacy_state_payload()


@app.post("/api/operation/pause")
async def legacy_operation_pause() -> dict[str, Any]:
    STATE.pause()
    upsert_operation_record()
    await broadcast()
    return legacy_state_payload()


@app.post("/api/operation/stop")
async def legacy_operation_stop() -> dict[str, Any]:
    STATE.stop()
    upsert_operation_record(forced_status="Operacional")
    await broadcast()
    return legacy_state_payload()


@app.post("/api/operation/reset")
async def legacy_operation_reset() -> dict[str, Any]:
    STATE.reset()
    await broadcast()
    return legacy_state_payload()


@app.post("/api/operation/emergency")
async def legacy_operation_emergency() -> dict[str, Any]:
    STATE.emergency_stop()
    upsert_operation_record(forced_status="Crítico")
    await broadcast()
    return legacy_state_payload()


@app.get("/api/tanks")
def get_tanks() -> list[dict[str, Any]]:
    return TANKS


@app.get("/api/digital-twin/config-options")
def digital_twin_config_options() -> dict[str, Any]:
    return {
        "presets": {
            "seguro": {
                "name": "Ciclo seguro padrao",
                "config": {
                    "tank_type": "Comum",
                    "target_pressure_mbar": 8,
                    "roots_start_pressure_mbar": 50,
                    "oil_flow_l_min": 2,
                    "max_cycle_seconds": 205,
                },
            },
            "critico": {
                "name": "Tanque critico",
                "config": {
                    "tank_type": "Critico",
                    "target_pressure_mbar": 35,
                    "roots_start_pressure_mbar": 50,
                    "oil_flow_l_min": 1.6,
                    "max_cycle_seconds": 255,
                },
            },
        }
    }


@app.get("/api/reports/operational")
def reports_operational() -> dict[str, Any]:
    if STATE.operation_id:
        upsert_operation_record()

    return {
        "summary": legacy_state_payload(),
        "history_today": OPERATION_RECORDS,
    }


@app.get("/api/alarms")
def get_alarms() -> list[dict[str, Any]]:
    return [
        event for event in STATE.events
        if str(event.get("level", "")).upper() in ["WARN", "WARNING", "CRITICAL", "ERROR"]
    ]


@app.get("/api/maintenance/prediction")
def maintenance_prediction() -> list[dict[str, Any]]:
    return [
        {
            "component": "Mini bomba de vacuo",
            "status": "operacional",
            "health_pct": 96,
            "recommendation": "Monitorar horimetro durante a demonstracao.",
        },
        {
            "component": "Lampada B2/Roots simulada",
            "status": "operacional",
            "health_pct": 94,
            "recommendation": "Validar acionamento por faixa de pressao.",
        },
    ]


@app.get("/api/records/operations")
def records_operations() -> dict[str, Any]:
    if STATE.operation_id:
        upsert_operation_record()

    return {
        "items": OPERATION_RECORDS,
    }


@app.get("/api/records/operations/{record_id}")
def records_operation_detail(record_id: str) -> dict[str, Any]:
    record = find_operation_record(record_id)

    if record is None:
        return {
            "record": None,
            "error": "Registro nao encontrado.",
        }

    return {
        "record": record,
    }


@app.get("/api/records/simulations")
def records_simulations() -> dict[str, Any]:
    return {
        "items": [],
    }


@app.post("/api/records/simulations")
async def create_simulation_record(payload: dict[str, Any]) -> dict[str, Any]:
    STATE.event(f"Simulacao registrada pelo sistema gerente: {payload.get('name', 'Simulacao')}", "INFO")
    await broadcast()

    return {
        "ok": True,
        "record": payload,
    }


@app.post("/api/digital-twin/simulate")
def digital_twin_simulate(payload: dict[str, Any]) -> dict[str, Any]:
    pressure = float(payload.get("target_pressure_mbar") or payload.get("pressaoFinal") or 8)
    oil_flow = float(payload.get("oil_flow_l_min") or payload.get("min_oil_flow_l_min") or 2)
    max_cycle = int(payload.get("max_cycle_seconds") or payload.get("estimated_seconds") or 205)

    risk = 18
    if pressure < 8:
        risk += 8
    if oil_flow < 1.5:
        risk += 20
    if bool(payload.get("simulate_hose_leak")):
        risk += 22
    if bool(payload.get("simulate_sensor_failure")):
        risk += 18

    risk = min(95, risk)

    return {
        "id": f"SIM-{datetime.now().strftime('%H%M%S')}",
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "status": "critical" if risk >= 82 else "warning" if risk >= 65 else "success",
        "diagnosis": "Simulacao executada pelo gateway da demonstracao fisica.",
        "recommendation": "Validar parametros no prototipo fisico antes da apresentacao.",
        "metrics": {
            "final_real_pressure_mbar": pressure,
            "estimated_time_seconds": max_cycle,
            "max_collapse_risk_pct": risk,
            "oil_flow_l_min": oil_flow,
        },
        "config": payload,
    }

# TSEA_GATEWAY_COMPAT_ROUTES_END


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "TSEA Physical Gateway",
        "status": "online",
        "docs": "/docs",
    }


@app.get("/api/state")
def get_state() -> dict[str, Any]:
    return STATE.payload()


@app.get("/api/recipes")
def get_recipes() -> list[dict[str, Any]]:
    return [public_recipe(item) for item in RECIPES]


@app.post("/api/recipes")
async def create_recipe(payload: RecipePayload) -> dict[str, Any]:
    item = normalize_recipe(payload)

    existing_index = next((index for index, recipe in enumerate(RECIPES) if str(recipe.get("id")) == str(item["id"])), None)

    if existing_index is None:
        RECIPES.append(item)
        STATE.event(f"Receita cadastrada pelo gerente: {item['id']} - {item['title']}", "INFO")
    else:
        RECIPES[existing_index] = item
        STATE.event(f"Receita atualizada pelo gerente: {item['id']} - {item['title']}", "INFO")

    save_recipes(RECIPES)
    await broadcast()
    return item


@app.post("/api/recipes/reset")
async def reset_recipes() -> list[dict[str, Any]]:
    RECIPES.clear()
    
    save_recipes(RECIPES)
    STATE.event("Receitas limpas. Cadastre novas receitas pelo sistema do gerente.", "WARN")
    await broadcast()
    return RECIPES


@app.get("/api/hoses")
def get_hoses() -> list[dict[str, Any]]:
    return [public_hose(item) for item in HOSES.values()]


@app.get("/api/history/today")
def get_history_today() -> list[dict[str, Any]]:
    if STATE.operation_id:
        upsert_operation_record()

    return OPERATION_RECORDS


@app.post("/api/command/start")
async def command_start(command: StartCommand) -> dict[str, Any]:
    payload = STATE.start(command)
    upsert_operation_record()
    await broadcast()
    return payload


@app.post("/api/command/pause")
async def command_pause() -> dict[str, Any]:
    payload = STATE.pause()
    upsert_operation_record()
    await broadcast()
    return payload


@app.post("/api/command/resume")
async def command_resume() -> dict[str, Any]:
    payload = STATE.resume()
    upsert_operation_record()
    await broadcast()
    return payload


@app.post("/api/command/stop")
async def command_stop() -> dict[str, Any]:
    payload = STATE.stop()
    upsert_operation_record(forced_status="Operacional")
    await broadcast()
    return payload


@app.post("/api/command/emergency")
async def command_emergency() -> dict[str, Any]:
    payload = STATE.emergency_stop()
    upsert_operation_record(forced_status="Crítico")
    await broadcast()
    return payload


@app.post("/api/command/reset")
async def command_reset() -> dict[str, Any]:
    payload = STATE.reset()
    await broadcast()
    return payload


@app.post("/api/checklist/pre")
async def checklist_pre(payload: ChecklistPayload) -> dict[str, Any]:
    STATE.event("Checklist inicial recebido.", "INFO")
    upsert_operation_record(extra={"checklist_pre": payload.model_dump()})
    await broadcast()
    return {
        "ok": True,
        "received": payload.model_dump(),
    }


@app.post("/api/checklist/final")
async def checklist_final(payload: ChecklistPayload) -> dict[str, Any]:
    STATE.event("Checklist final recebido.", "INFO")
    upsert_operation_record(extra={"checklist_final": payload.model_dump()})
    await broadcast()
    return {
        "ok": True,
        "received": payload.model_dump(),
    }


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket) -> None:
    await websocket.accept()
    CLIENTS.add(websocket)

    try:
        await websocket.send_json(STATE.payload())

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        CLIENTS.discard(websocket)
    except Exception:
        CLIENTS.discard(websocket)

# TSEA_REAL_PARAMETERS_AND_HARDWARE_BRIDGE_START

REAL_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
REAL_RECIPES_FILE = REAL_DATA_DIR / "recipes.json"
REAL_TANKS_FILE = REAL_DATA_DIR / "tanks.json"
REAL_HOSES_FILE = REAL_DATA_DIR / "hoses.json"
REAL_LIMITS_FILE = REAL_DATA_DIR / "limits.json"
REAL_OPERATIONS_FILE = REAL_DATA_DIR / "operation_records.json"

DEFAULT_REAL_LIMITS: dict[str, Any] = {
    "tank_count_min": 1,
    "tank_count_max": 3,
    "oil_min_l": 0.0,
    "oil_max_l": 300.0,
    "pressure_min_mbar": 0.01,
    "pressure_max_mbar": 1013.0,
    "cycle_min_seconds": 30,
    "cycle_max_seconds": 3600,
    "hose_length_min_m": 0.1,
    "hose_length_max_m": 30.0,
    "hose_diameter_min_mm": 2.0,
    "hose_diameter_max_mm": 80.0,
    "tank_volume_min_l": 0.1,
    "tank_volume_max_l": 5000.0,
}


def real_read_json(path: Path, fallback: Any) -> Any:
    REAL_DATA_DIR.mkdir(parents=True, exist_ok=True)

    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return fallback

    return fallback


def real_write_json(path: Path, data: Any) -> None:
    REAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def real_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except Exception:
        number = default

    return max(minimum, min(maximum, number))


def real_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except Exception:
        number = default

    return max(minimum, min(maximum, number))


def hose_internal_volume_liters(length_m: float, internal_diameter_mm: float) -> float:
    diameter_m = internal_diameter_mm / 1000.0
    volume_m3 = math.pi * ((diameter_m ** 2) / 4.0) * length_m
    return volume_m3 * 1000.0


def real_limits() -> dict[str, Any]:
    raw = real_read_json(REAL_LIMITS_FILE, DEFAULT_REAL_LIMITS)
    merged = {**DEFAULT_REAL_LIMITS, **(raw if isinstance(raw, dict) else {})}

    return {
        "tank_count_min": real_int(merged.get("tank_count_min"), 1, 1, 3),
        "tank_count_max": real_int(merged.get("tank_count_max"), 3, 1, 3),
        "oil_min_l": real_float(merged.get("oil_min_l"), 0.0, 0.0, 1000.0),
        "oil_max_l": real_float(merged.get("oil_max_l"), 300.0, 1.0, 1000.0),
        "pressure_min_mbar": real_float(merged.get("pressure_min_mbar"), 0.01, 0.001, 1013.0),
        "pressure_max_mbar": real_float(merged.get("pressure_max_mbar"), 1013.0, 0.01, 1013.0),
        "cycle_min_seconds": real_int(merged.get("cycle_min_seconds"), 30, 1, 86400),
        "cycle_max_seconds": real_int(merged.get("cycle_max_seconds"), 3600, 30, 86400),
        "hose_length_min_m": real_float(merged.get("hose_length_min_m"), 0.1, 0.01, 100.0),
        "hose_length_max_m": real_float(merged.get("hose_length_max_m"), 30.0, 0.1, 100.0),
        "hose_diameter_min_mm": real_float(merged.get("hose_diameter_min_mm"), 2.0, 0.1, 200.0),
        "hose_diameter_max_mm": real_float(merged.get("hose_diameter_max_mm"), 80.0, 1.0, 200.0),
        "tank_volume_min_l": real_float(merged.get("tank_volume_min_l"), 0.1, 0.001, 10000.0),
        "tank_volume_max_l": real_float(merged.get("tank_volume_max_l"), 5000.0, 1.0, 10000.0),
    }


def normalize_real_tank(raw: dict[str, Any]) -> dict[str, Any]:
    limits = real_limits()
    code = str(raw.get("code") or raw.get("id") or f"TQ-{datetime.now().strftime('%H%M%S')}")
    volume_liters = real_float(raw.get("volume_liters"), 50.0, limits["tank_volume_min_l"], limits["tank_volume_max_l"])
    diameter_mm = real_float(raw.get("diameter_mm"), 740.0, 50.0, 3000.0)
    height_mm = real_float(raw.get("height_mm"), 1000.0, 50.0, 6000.0)
    wall_mm = real_float(raw.get("wall_thickness_mm"), 3.4, 0.5, 50.0)
    structural_limit_mbar = real_float(raw.get("structural_limit_mbar"), 35.0, limits["pressure_min_mbar"], limits["pressure_max_mbar"])

    return {
        "id": code,
        "code": code,
        "name": str(raw.get("name") or raw.get("title") or code),
        "type": str(raw.get("type") or raw.get("tank_type") or "Regulador"),
        "volume_liters": round(volume_liters, 3),
        "diameter_mm": round(diameter_mm, 3),
        "height_mm": round(height_mm, 3),
        "wall_thickness_mm": round(wall_mm, 3),
        "structural_limit_mbar": round(structural_limit_mbar, 3),
        "status": str(raw.get("status") or "available"),
        "note": str(raw.get("note") or ""),
    }


def normalize_real_hose(raw: dict[str, Any]) -> dict[str, Any]:
    limits = real_limits()
    code = str(raw.get("code") or raw.get("id") or f"MG-{datetime.now().strftime('%H%M%S')}")
    length_m = real_float(raw.get("length_m"), 8.0, limits["hose_length_min_m"], limits["hose_length_max_m"])
    internal_diameter_mm = real_float(
        raw.get("internal_diameter_mm") or raw.get("diameter_mm") or raw.get("diameter_in"),
        10.0,
        limits["hose_diameter_min_mm"],
        limits["hose_diameter_max_mm"],
    )
    internal_volume_l = hose_internal_volume_liters(length_m, internal_diameter_mm)
    calibrated_loss_mbar = real_float(raw.get("calibrated_loss_mbar") or raw.get("loss_base_mbar"), 1.2, 0.0, 200.0)

    return {
        "id": code,
        "code": code,
        "label": str(raw.get("label") or raw.get("descricao") or code),
        "descricao": str(raw.get("label") or raw.get("descricao") or code),
        "length_m": round(length_m, 3),
        "internal_diameter_mm": round(internal_diameter_mm, 3),
        "internal_volume_l": round(internal_volume_l, 6),
        "calibrated_loss_mbar": round(calibrated_loss_mbar, 3),
        "loss_base_mbar": round(calibrated_loss_mbar, 3),
        "status": str(raw.get("status") or "available"),
        "note": str(raw.get("note") or "Perda calibrada deve ser ajustada depois do ensaio real."),
    }


def real_tanks() -> list[dict[str, Any]]:
    data = real_read_json(REAL_TANKS_FILE, [])
    return [normalize_real_tank(item) for item in data if isinstance(item, dict)]


def real_hoses() -> list[dict[str, Any]]:
    data = real_read_json(REAL_HOSES_FILE, [])
    return [normalize_real_hose(item) for item in data if isinstance(item, dict)]


def real_recipes() -> list[dict[str, Any]]:
    try:
        current = RECIPES
        return current if isinstance(current, list) else []
    except Exception:
        data = real_read_json(REAL_RECIPES_FILE, [])
        return data if isinstance(data, list) else []


def sync_real_hoses_into_legacy_hoses() -> None:
    try:
        for item in real_hoses():
            HOSES[str(item["id"])] = {
                "id": str(item["id"]),
                "descricao": str(item.get("descricao") or item.get("label") or item["id"]),
                "loss_base_mbar": float(item.get("loss_base_mbar") or item.get("calibrated_loss_mbar") or 0),
                "calibrated_loss_mbar": float(item.get("calibrated_loss_mbar") or item.get("loss_base_mbar") or 0),
                "internal_volume_l": float(item.get("internal_volume_l") or 0),
                "length_m": float(item.get("length_m") or 0),
                "internal_diameter_mm": float(item.get("internal_diameter_mm") or 0),
            }
    except Exception:
        pass


sync_real_hoses_into_legacy_hoses()


class RealTankPayload(BaseModel):
    id: str | None = None
    code: str | None = None
    name: str | None = None
    type: str | None = None
    tank_type: str | None = None
    volume_liters: float | None = None
    diameter_mm: float | None = None
    height_mm: float | None = None
    wall_thickness_mm: float | None = None
    structural_limit_mbar: float | None = None
    status: str | None = None
    note: str | None = None


class RealHosePayload(BaseModel):
    id: str | None = None
    code: str | None = None
    label: str | None = None
    descricao: str | None = None
    length_m: float | None = None
    internal_diameter_mm: float | None = None
    diameter_mm: float | None = None
    calibrated_loss_mbar: float | None = None
    loss_base_mbar: float | None = None
    status: str | None = None
    note: str | None = None


class RealLimitsPayload(BaseModel):
    tank_count_min: int | None = None
    tank_count_max: int | None = None
    oil_min_l: float | None = None
    oil_max_l: float | None = None
    pressure_min_mbar: float | None = None
    pressure_max_mbar: float | None = None
    cycle_min_seconds: int | None = None
    cycle_max_seconds: int | None = None
    hose_length_min_m: float | None = None
    hose_length_max_m: float | None = None
    hose_diameter_min_mm: float | None = None
    hose_diameter_max_mm: float | None = None
    tank_volume_min_l: float | None = None
    tank_volume_max_l: float | None = None


class HardwareModePayload(BaseModel):
    mode: str = Field(default="SIMULADO")


class HardwareIngestPayload(BaseModel):
    status: str | None = None
    stage: str | None = None
    elapsed_seconds: int | None = None
    pressure_machine_mbar: float | None = None
    tanks: list[dict[str, Any]] = Field(default_factory=list)
    pumps: dict[str, bool] = Field(default_factory=dict)
    oil: dict[str, Any] = Field(default_factory=dict)
    hardware: dict[str, Any] = Field(default_factory=dict)
    alarm: str | None = None
    event: str | None = None


@app.get("/api/parameters")
def get_real_parameters() -> dict[str, Any]:
    sync_real_hoses_into_legacy_hoses()

    return {
        "recipes": real_recipes(),
        "tanks": real_tanks(),
        "hoses": real_hoses(),
        "limits": real_limits(),
        "formulas": {
            "hose_internal_volume_l": "V = pi * (Dinterno^2 / 4) * L",
            "hose_internal_volume_units": "D em metros, L em metros, resultado em m3 convertido para litros",
            "pressure_relation": "P_tanque = P_sensor + deltaP_linha",
            "pressure_note": "A perda real de pressao depende de vazao, bomba, conexoes, regime de escoamento e deve ser calibrada em ensaio.",
            "effective_pumping_speed": "1/Sefetivo = 1/Sbomba + 1/Cmangueira",
        },
    }


@app.get("/api/tanks")
def get_real_tanks() -> list[dict[str, Any]]:
    return real_tanks()


@app.post("/api/tanks")
async def create_real_tank(payload: RealTankPayload) -> dict[str, Any]:
    items = real_tanks()
    item = normalize_real_tank(payload.model_dump(exclude_none=True))
    index = next((idx for idx, current in enumerate(items) if str(current.get("id")) == str(item.get("id"))), None)

    if index is None:
        items.append(item)
    else:
        items[index] = item

    real_write_json(REAL_TANKS_FILE, items)

    try:
        STATE.event(f"Tanque cadastrado/atualizado: {item['id']}", "INFO")
        await broadcast()
    except Exception:
        pass

    return item


@app.delete("/api/tanks/{tank_id}")
async def delete_real_tank(tank_id: str) -> dict[str, Any]:
    items = [
        item for item in real_tanks()
        if str(item.get("id")) != str(tank_id) and str(item.get("code")) != str(tank_id)
    ]

    real_write_json(REAL_TANKS_FILE, items)

    try:
        STATE.event(f"Tanque removido: {tank_id}", "WARN")
        await broadcast()
    except Exception:
        pass

    return {"ok": True, "tanks": items}


@app.get("/api/hoses")
def get_real_hoses() -> list[dict[str, Any]]:
    sync_real_hoses_into_legacy_hoses()
    return real_hoses()


@app.post("/api/hoses")
async def create_real_hose(payload: RealHosePayload) -> dict[str, Any]:
    items = real_hoses()
    item = normalize_real_hose(payload.model_dump(exclude_none=True))
    index = next((idx for idx, current in enumerate(items) if str(current.get("id")) == str(item.get("id"))), None)

    if index is None:
        items.append(item)
    else:
        items[index] = item

    real_write_json(REAL_HOSES_FILE, items)
    sync_real_hoses_into_legacy_hoses()

    try:
        STATE.event(f"Mangueira cadastrada/atualizada: {item['id']}", "INFO")
        await broadcast()
    except Exception:
        pass

    return item


@app.delete("/api/hoses/{hose_id}")
async def delete_real_hose(hose_id: str) -> dict[str, Any]:
    items = [
        item for item in real_hoses()
        if str(item.get("id")) != str(hose_id) and str(item.get("code")) != str(hose_id)
    ]

    real_write_json(REAL_HOSES_FILE, items)
    sync_real_hoses_into_legacy_hoses()

    try:
        STATE.event(f"Mangueira removida: {hose_id}", "WARN")
        await broadcast()
    except Exception:
        pass

    return {"ok": True, "hoses": items}


@app.get("/api/limits")
def get_real_limits() -> dict[str, Any]:
    return real_limits()


@app.post("/api/limits")
async def update_real_limits(payload: RealLimitsPayload) -> dict[str, Any]:
    current = real_limits()
    updated = {**current, **payload.model_dump(exclude_none=True)}

    real_write_json(REAL_LIMITS_FILE, updated)

    try:
        STATE.event("Limites operacionais atualizados.", "INFO")
        await broadcast()
    except Exception:
        pass

    return real_limits()


def _hardware_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "sim", "on", "ligado", "ligada"}


def _hardware_float(value: Any, minimum: float, maximum: float, fallback: float) -> float:
    try:
        number = float(value)
    except Exception:
        number = fallback

    return max(minimum, min(maximum, number))


def normalize_hardware_tanks(payload: HardwareIngestPayload) -> list[dict[str, Any]]:
    sync_real_hoses_into_legacy_hoses()

    if payload.tanks:
        normalized: list[dict[str, Any]] = []

        for index, tank in enumerate(payload.tanks[:3]):
            pressure_machine = _hardware_float(
                tank.get("machine_pressure_mbar", payload.pressure_machine_mbar),
                0.001,
                1013.0,
                1013.0,
            )
            hose_loss = _hardware_float(
                tank.get("hose_loss_mbar"),
                0.0,
                200.0,
                float(getattr(STATE, "hose", {}).get("loss_base_mbar", 0.0)) if hasattr(STATE, "hose") else 0.0,
            )
            pressure_tank = _hardware_float(tank.get("pressure_mbar"), 0.001, 1013.0, pressure_machine + hose_loss)
            oil_in_l = _hardware_float(tank.get("oil_in_l"), 0.0, 10000.0, 0.0)
            risk_pct = _hardware_float(tank.get("risk_pct"), 0.0, 100.0, 0.0)

            normalized.append(
                {
                    "id": str(tank.get("id") or f"T{index + 1}"),
                    "code": str(tank.get("code") or tank.get("id") or f"T{index + 1}"),
                    "pressure_mbar": round(pressure_tank, 3),
                    "machine_pressure_mbar": round(pressure_machine, 3),
                    "hose_loss_mbar": round(hose_loss, 3),
                    "oil_in_l": round(oil_in_l, 3),
                    "risk_pct": round(risk_pct, 2),
                    "status": "ATENCAO" if risk_pct >= 65 else "OK",
                }
            )

        return normalized

    pressure_machine = _hardware_float(payload.pressure_machine_mbar, 0.001, 1013.0, 1013.0)
    tank_count = max(1, int(getattr(STATE, "tank_count", 1)))
    hose_loss_base = float(getattr(STATE, "hose", {}).get("loss_base_mbar", 0.0)) if hasattr(STATE, "hose") else 0.0

    return [
        {
            "id": f"T{index + 1}",
            "code": f"T{index + 1}",
            "pressure_mbar": round(min(1013.0, pressure_machine + hose_loss_base), 3),
            "machine_pressure_mbar": round(pressure_machine, 3),
            "hose_loss_mbar": round(hose_loss_base, 3),
            "oil_in_l": round(float(getattr(STATE, "oil_injected_l", 0.0)) / tank_count, 3),
            "risk_pct": 18.0,
            "status": "OK",
        }
        for index in range(tank_count)
    ]


@app.get("/api/hardware/schema")
def hardware_schema() -> dict[str, Any]:
    return {
        "description": "Contrato HTTP para conectar o prototipo fisico ao Gateway TSEA.",
        "mode_endpoint": "POST /api/hardware/mode",
        "ingest_endpoint": "POST /api/hardware/ingest",
        "state_endpoint": "GET /api/hardware/state",
        "recommended_cycle_ms": 1000,
        "payload_example": {
            "status": "EM_CICLO",
            "stage": "VACUO_INICIAL",
            "elapsed_seconds": 12,
            "pressure_machine_mbar": 82.4,
            "pumps": {"b1": True, "b2": False, "oil": False},
            "oil": {"injected_l": 0, "remaining_l": 120, "flow_l_min": 0},
            "hardware": {"sensor_online": True, "plc_online": True, "emergency": False},
            "tanks": [
                {
                    "id": "T1",
                    "pressure_mbar": 83.6,
                    "machine_pressure_mbar": 82.4,
                    "hose_loss_mbar": 1.2,
                    "oil_in_l": 0,
                    "risk_pct": 18,
                }
            ],
            "alarm": None,
        },
    }


@app.get("/api/hardware/state")
def hardware_state() -> dict[str, Any]:
    return {
        "ok": True,
        "mode": getattr(STATE, "mode", "SIMULADO"),
        "state": STATE.payload(),
    }


@app.post("/api/hardware/mode")
async def set_hardware_mode(payload: HardwareModePayload) -> dict[str, Any]:
    mode = payload.mode.strip().upper()

    if mode not in {"SIMULADO", "FISICO_HTTP"}:
        raise ValueError("Modo invalido. Use SIMULADO ou FISICO_HTTP.")

    STATE.mode = mode

    if mode == "SIMULADO":
        STATE.external_pressure_machine_mbar = None
        STATE.external_tanks_payload = []
        STATE.external_oil_flow_l_min = None
        STATE.sensor_online = True
        STATE.plc_online = True
        STATE.emergency = False
        STATE.alarm = None
        STATE.event("Gateway alterado para modo SIMULADO.", "INFO")
    else:
        STATE.event("Gateway alterado para modo FISICO_HTTP.", "INFO")

    try:
        await broadcast()
    except Exception:
        pass

    return {"ok": True, "mode": STATE.mode, "state": STATE.payload()}


@app.post("/api/hardware/ingest")
async def ingest_hardware(payload: HardwareIngestPayload) -> dict[str, Any]:
    STATE.mode = "FISICO_HTTP"

    if payload.status:
        STATE.status = payload.status

    if payload.stage:
        STATE.stage = payload.stage

    if payload.elapsed_seconds is not None:
        STATE.elapsed_seconds = max(0, int(payload.elapsed_seconds))

    if payload.pressure_machine_mbar is not None:
        STATE.external_pressure_machine_mbar = _hardware_float(payload.pressure_machine_mbar, 0.001, 1013.0, 1013.0)

    pumps = payload.pumps or {}
    if "b1" in pumps:
        STATE.pump_b1 = _hardware_bool(pumps.get("b1"))
    if "b2" in pumps:
        STATE.pump_b2 = _hardware_bool(pumps.get("b2"))
    if "oil" in pumps:
        STATE.pump_oil = _hardware_bool(pumps.get("oil"))

    oil = payload.oil or {}
    if "injected_l" in oil:
        STATE.oil_injected_l = _hardware_float(oil.get("injected_l"), 0.0, 10000.0, getattr(STATE, "oil_injected_l", 0.0))
    if "remaining_l" in oil:
        remaining = _hardware_float(oil.get("remaining_l"), 0.0, 10000.0, 0.0)
        STATE.oil_injected_l = max(0.0, float(getattr(STATE, "oil_reservoir_l", 0.0)) - remaining)
    if "flow_l_min" in oil:
        STATE.external_oil_flow_l_min = _hardware_float(oil.get("flow_l_min"), 0.0, 200.0, 0.0)

    hardware = payload.hardware or {}
    if "sensor_online" in hardware:
        STATE.sensor_online = _hardware_bool(hardware.get("sensor_online"), True)
    if "plc_online" in hardware:
        STATE.plc_online = _hardware_bool(hardware.get("plc_online"), True)
    if "emergency" in hardware:
        STATE.emergency = _hardware_bool(hardware.get("emergency"))

    if getattr(STATE, "emergency", False):
        STATE.status = "BLOQUEADO"
        STATE.stage = "BLOQUEADO"
        STATE.pump_b1 = False
        STATE.pump_b2 = False
        STATE.pump_oil = False
        STATE.alarm = "EMERGENCIA_FISICA"
    elif payload.alarm:
        STATE.alarm = str(payload.alarm)
    elif getattr(STATE, "alarm", None) == "EMERGENCIA_FISICA":
        STATE.alarm = None

    STATE.external_tanks_payload = normalize_hardware_tanks(payload)

    if payload.event:
        STATE.event(str(payload.event), "INFO")

    try:
        if getattr(STATE, "operation_id", None):
            upsert_operation_record()
        await broadcast()
    except Exception:
        pass

    return {"ok": True, "mode": STATE.mode, "state": STATE.payload()}


@app.post("/api/hardware/reset")
async def reset_hardware_bridge() -> dict[str, Any]:
    STATE.mode = "SIMULADO"
    STATE.external_pressure_machine_mbar = None
    STATE.external_tanks_payload = []
    STATE.external_oil_flow_l_min = None
    STATE.sensor_online = True
    STATE.plc_online = True
    STATE.emergency = False
    STATE.alarm = None
    STATE.event("Ponte fisica reiniciada para modo simulado.", "INFO")

    try:
        await broadcast()
    except Exception:
        pass

    return {"ok": True, "mode": STATE.mode, "state": STATE.payload()}


@app.post("/api/admin/clear-data")
async def clear_all_real_demo_data() -> dict[str, Any]:
    global RECIPES

    RECIPES = []

    try:
        save_recipes(RECIPES)
    except Exception:
        real_write_json(REAL_RECIPES_FILE, RECIPES)

    real_write_json(REAL_TANKS_FILE, [])
    real_write_json(REAL_HOSES_FILE, [])
    real_write_json(REAL_OPERATIONS_FILE, [])

    try:
        OPERATION_RECORDS.clear()
        save_operation_records()
    except Exception:
        pass

    try:
        STATE.reset()
        STATE.history_today = []
        STATE.events = []
        STATE.operation_id = None
        STATE.recipe = {}
        STATE.event("Base limpa para nova demonstracao real.", "INFO")
        await broadcast()
    except Exception:
        pass

    return {
        "ok": True,
        "message": "Base limpa. Cadastre receitas, tanques e mangueiras novamente.",
        "recipes": [],
        "tanks": [],
        "hoses": [],
        "records": [],
    }


# TSEA_REAL_PARAMETERS_AND_HARDWARE_BRIDGE_END
