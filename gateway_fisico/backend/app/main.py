from __future__ import annotations

import asyncio
import math
from datetime import datetime
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

RECIPES: list[dict[str, Any]] = [
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
        self.recipe = RECIPES[0]
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
    return RECIPES


@app.get("/api/hoses")
def get_hoses() -> list[dict[str, Any]]:
    return list(HOSES.values())


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