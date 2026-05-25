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
    await broadcast()
    return legacy_state_payload()


@app.post("/api/operation/pause")
async def legacy_operation_pause() -> dict[str, Any]:
    STATE.pause()
    await broadcast()
    return legacy_state_payload()


@app.post("/api/operation/stop")
async def legacy_operation_stop() -> dict[str, Any]:
    STATE.stop()
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
    return {
        "summary": legacy_state_payload(),
        "history_today": STATE.history_today,
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
    return {
        "items": STATE.history_today,
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
    return STATE.history_today


@app.post("/api/command/start")
async def command_start(command: StartCommand) -> dict[str, Any]:
    payload = STATE.start(command)
    await broadcast()
    return payload


@app.post("/api/command/pause")
async def command_pause() -> dict[str, Any]:
    payload = STATE.pause()
    await broadcast()
    return payload


@app.post("/api/command/resume")
async def command_resume() -> dict[str, Any]:
    payload = STATE.resume()
    await broadcast()
    return payload


@app.post("/api/command/stop")
async def command_stop() -> dict[str, Any]:
    payload = STATE.stop()
    await broadcast()
    return payload


@app.post("/api/command/emergency")
async def command_emergency() -> dict[str, Any]:
    payload = STATE.emergency_stop()
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
    await broadcast()
    return {
        "ok": True,
        "received": payload.model_dump(),
    }


@app.post("/api/checklist/final")
async def checklist_final(payload: ChecklistPayload) -> dict[str, Any]:
    STATE.event("Checklist final recebido.", "INFO")
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