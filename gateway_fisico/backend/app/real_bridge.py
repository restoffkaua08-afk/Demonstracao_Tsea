
from __future__ import annotations

import importlib
import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
TANKS_FILE = DATA_DIR / "tanks.json"
HOSES_FILE = DATA_DIR / "hoses.json"
OPERATION_RECORDS_FILE = DATA_DIR / "operation_records.json"

CODE_LIMITS: dict[str, Any] = {
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
    "tank_diameter_min_mm": 50.0,
    "tank_diameter_max_mm": 3000.0,
    "tank_height_min_mm": 50.0,
    "tank_height_max_mm": 6000.0,
    "wall_thickness_min_mm": 0.5,
    "wall_thickness_max_mm": 50.0,
    "calibrated_loss_min_mbar": 0.0,
    "calibrated_loss_max_mbar": 200.0,
}

_ALLOWED_STATUS = {"PRONTO", "EM_CICLO", "PAUSADO", "FINALIZADO", "BLOQUEADO"}
_ALLOWED_STAGE = {
    "PREPARO",
    "VACUO_INICIAL",
    "VACUO_PROFUNDO",
    "INJECAO_DE_OLEO",
    "ESTABILIZACAO",
    "FINALIZACAO",
    "BLOQUEADO",
}


class TankPayload(BaseModel):
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


class HosePayload(BaseModel):
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


class RecipePayloadReal(BaseModel):
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
    note: str | None = None


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


def _core():
    return importlib.import_module("app.main")


def _read_json(path: Path, fallback: Any) -> Any:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return fallback

    return fallback


def _write_json(path: Path, data: Any) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _strict_float(value: Any, field: str, minimum: float, maximum: float, default: float | None = None) -> float:
    if value is None:
        if default is None:
            raise HTTPException(status_code=422, detail=f"{field} e obrigatorio.")
        value = default

    try:
        number = float(value)
    except Exception:
        raise HTTPException(status_code=422, detail=f"{field} deve ser numerico.")

    if number < minimum or number > maximum:
        raise HTTPException(status_code=422, detail=f"{field} fora da faixa permitida: {minimum} a {maximum}.")

    return number


def _strict_int(value: Any, field: str, minimum: int, maximum: int, default: int | None = None) -> int:
    if value is None:
        if default is None:
            raise HTTPException(status_code=422, detail=f"{field} e obrigatorio.")
        value = default

    try:
        number = int(value)
    except Exception:
        raise HTTPException(status_code=422, detail=f"{field} deve ser inteiro.")

    if number < minimum or number > maximum:
        raise HTTPException(status_code=422, detail=f"{field} fora da faixa permitida: {minimum} a {maximum}.")

    return number


def _clamp_float(value: Any, minimum: float, maximum: float, fallback: float) -> float:
    try:
        number = float(value)
    except Exception:
        number = fallback

    return max(minimum, min(maximum, number))


def _to_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default

    return str(value).strip().lower() in {"1", "true", "sim", "on", "ligado", "ligada"}


def get_limits() -> dict[str, Any]:
    return dict(CODE_LIMITS)


def hose_internal_volume_liters(length_m: float, internal_diameter_mm: float) -> float:
    diameter_m = internal_diameter_mm / 1000.0
    volume_m3 = math.pi * ((diameter_m ** 2) / 4.0) * length_m
    return volume_m3 * 1000.0


def normalize_tank(raw: dict[str, Any]) -> dict[str, Any]:
    limits = get_limits()
    code = str(raw.get("code") or raw.get("id") or f"TQ-{datetime.now().strftime('%H%M%S')}").strip()

    if not code:
        raise HTTPException(status_code=422, detail="Codigo do tanque e obrigatorio.")

    volume_liters = _strict_float(raw.get("volume_liters"), "volume_liters", limits["tank_volume_min_l"], limits["tank_volume_max_l"], 50.0)
    diameter_mm = _strict_float(raw.get("diameter_mm"), "diameter_mm", limits["tank_diameter_min_mm"], limits["tank_diameter_max_mm"], 740.0)
    height_mm = _strict_float(raw.get("height_mm"), "height_mm", limits["tank_height_min_mm"], limits["tank_height_max_mm"], 1000.0)
    wall_mm = _strict_float(raw.get("wall_thickness_mm"), "wall_thickness_mm", limits["wall_thickness_min_mm"], limits["wall_thickness_max_mm"], 3.4)
    structural_limit = _strict_float(raw.get("structural_limit_mbar"), "structural_limit_mbar", limits["pressure_min_mbar"], limits["pressure_max_mbar"], 35.0)

    return {
        "id": code,
        "code": code,
        "name": str(raw.get("name") or raw.get("title") or code).strip(),
        "type": str(raw.get("type") or raw.get("tank_type") or "Regulador").strip(),
        "volume_liters": round(volume_liters, 3),
        "diameter_mm": round(diameter_mm, 3),
        "height_mm": round(height_mm, 3),
        "wall_thickness_mm": round(wall_mm, 3),
        "structural_limit_mbar": round(structural_limit, 3),
        "status": str(raw.get("status") or "available"),
        "note": str(raw.get("note") or ""),
    }


def normalize_hose(raw: dict[str, Any]) -> dict[str, Any]:
    limits = get_limits()
    code = str(raw.get("code") or raw.get("id") or f"MG-{datetime.now().strftime('%H%M%S')}").strip()

    if not code:
        raise HTTPException(status_code=422, detail="Codigo da mangueira e obrigatorio.")

    length_m = _strict_float(raw.get("length_m"), "length_m", limits["hose_length_min_m"], limits["hose_length_max_m"], 8.0)
    internal_diameter_mm = _strict_float(
        raw.get("internal_diameter_mm") or raw.get("diameter_mm") or raw.get("diameter_in"),
        "internal_diameter_mm",
        limits["hose_diameter_min_mm"],
        limits["hose_diameter_max_mm"],
        10.0,
    )
    calibrated_loss = _strict_float(
        raw.get("calibrated_loss_mbar") if raw.get("calibrated_loss_mbar") is not None else raw.get("loss_base_mbar"),
        "calibrated_loss_mbar",
        limits["calibrated_loss_min_mbar"],
        limits["calibrated_loss_max_mbar"],
        1.2,
    )
    internal_volume_l = hose_internal_volume_liters(length_m, internal_diameter_mm)

    return {
        "id": code,
        "code": code,
        "label": str(raw.get("label") or raw.get("descricao") or code).strip(),
        "descricao": str(raw.get("label") or raw.get("descricao") or code).strip(),
        "length_m": round(length_m, 3),
        "internal_diameter_mm": round(internal_diameter_mm, 3),
        "internal_volume_l": round(internal_volume_l, 6),
        "calibrated_loss_mbar": round(calibrated_loss, 3),
        "loss_base_mbar": round(calibrated_loss, 3),
        "status": str(raw.get("status") or "available"),
        "note": str(raw.get("note") or "Perda calibrada deve ser ajustada depois do ensaio real."),
    }


def normalize_recipe(raw: dict[str, Any]) -> dict[str, Any]:
    limits = get_limits()
    timestamp = datetime.now().strftime("%H%M%S")
    rid = str(raw.get("id") or raw.get("title") or raw.get("name") or f"REC-{timestamp}").strip()

    if not rid:
        raise HTTPException(status_code=422, detail="ID da receita e obrigatorio.")

    estimated = _strict_int(raw.get("estimated_seconds") or raw.get("max_cycle_seconds"), "estimated_seconds", limits["cycle_min_seconds"], limits["cycle_max_seconds"], 205)
    target = _strict_float(raw.get("target_pressure_mbar"), "target_pressure_mbar", limits["pressure_min_mbar"], limits["pressure_max_mbar"], 8.0)
    roots = _strict_float(raw.get("roots_start_pressure_mbar"), "roots_start_pressure_mbar", limits["pressure_min_mbar"], limits["pressure_max_mbar"], 50.0)

    b2 = _strict_int(raw.get("b2_start_seconds"), "b2_start_seconds", 0, estimated, 24)
    oil = _strict_int(raw.get("oil_start_seconds"), "oil_start_seconds", b2, estimated, max(b2, int(estimated * 0.45)))
    stabilization = _strict_int(raw.get("stabilization_seconds"), "stabilization_seconds", oil, estimated, max(oil, int(estimated * 0.78)))
    oil_per_tank = _strict_float(raw.get("oil_per_tank_l"), "oil_per_tank_l", limits["oil_min_l"], limits["oil_max_l"], 50.0)

    return {
        "id": rid,
        "title": str(raw.get("title") or raw.get("name") or rid).strip(),
        "name": str(raw.get("name") or raw.get("title") or rid).strip(),
        "tank_type": str(raw.get("tank_type") or "Regulador").strip(),
        "estimated_seconds": estimated,
        "max_cycle_seconds": estimated,
        "target_pressure_mbar": target,
        "roots_start_pressure_mbar": roots,
        "b2_start_seconds": b2,
        "oil_start_seconds": oil,
        "stabilization_seconds": stabilization,
        "oil_per_tank_l": oil_per_tank,
        "note": str(raw.get("note") or ""),
    }


def get_tanks() -> list[dict[str, Any]]:
    data = _read_json(TANKS_FILE, [])
    return [normalize_tank(item) for item in data if isinstance(item, dict)]


def get_hoses() -> list[dict[str, Any]]:
    data = _read_json(HOSES_FILE, [])
    return [normalize_hose(item) for item in data if isinstance(item, dict)]


def get_recipes() -> list[dict[str, Any]]:
    core = _core()
    recipes = getattr(core, "RECIPES", [])
    return recipes if isinstance(recipes, list) else []


def save_recipes(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    core = _core()
    normalized_items = [normalize_recipe(item) for item in items if isinstance(item, dict)]

    if not hasattr(core, "RECIPES") or not isinstance(core.RECIPES, list):
        core.RECIPES = []

    core.RECIPES.clear()
    core.RECIPES.extend(normalized_items)

    saved = False

    if hasattr(core, "save_recipes") and callable(core.save_recipes):
        try:
            core.save_recipes(core.RECIPES)
            saved = True
        except Exception:
            saved = False

    try:
        recipes_file = Path(getattr(core, "RECIPES_FILE", DATA_DIR / "recipes.json"))
        _write_json(recipes_file, core.RECIPES)
        saved = True
    except Exception:
        pass

    if not saved:
        _write_json(DATA_DIR / "recipes.json", core.RECIPES)

    return core.RECIPES


def sync_legacy_hoses_for_main(main_globals: dict[str, Any] | None = None) -> None:
    if main_globals is None:
        main_globals = vars(_core())

    hoses_dict = main_globals.get("HOSES")

    if not isinstance(hoses_dict, dict):
        return

    for key in list(hoses_dict.keys()):
        if str(key).startswith("MG-"):
            hoses_dict.pop(key, None)

    for hose in get_hoses():
        hoses_dict[str(hose["id"])] = {
            "id": str(hose["id"]),
            "descricao": str(hose.get("descricao") or hose.get("label") or hose["id"]),
            "loss_base_mbar": float(hose.get("loss_base_mbar") or hose.get("calibrated_loss_mbar") or 0.0),
            "calibrated_loss_mbar": float(hose.get("calibrated_loss_mbar") or hose.get("loss_base_mbar") or 0.0),
            "internal_volume_l": float(hose.get("internal_volume_l") or 0.0),
            "length_m": float(hose.get("length_m") or 0.0),
            "internal_diameter_mm": float(hose.get("internal_diameter_mm") or 0.0),
        }


def validate_start_payload(data: dict[str, Any]) -> None:
    limits = get_limits()
    recipes = get_recipes()
    tanks = get_tanks()
    hoses = get_hoses()

    if not recipes:
        raise ValueError("Nenhuma receita real cadastrada no gerente.")

    if not tanks:
        raise ValueError("Nenhum tanque/regulador real cadastrado no gerente.")

    if not hoses:
        raise ValueError("Nenhuma mangueira real cadastrada no gerente.")

    recipe_id = str(data.get("recipe_id") or "")
    hose_id = str(data.get("hose_id") or "")

    if not any(str(item.get("id")) == recipe_id for item in recipes):
        raise ValueError("Receita selecionada nao existe na base real.")

    if not any(str(item.get("id")) == hose_id or str(item.get("code")) == hose_id for item in hoses):
        raise ValueError("Mangueira selecionada nao existe na base real.")

    tank_count = int(data.get("tank_count") or 0)
    if tank_count < limits["tank_count_min"] or tank_count > limits["tank_count_max"]:
        raise ValueError("Quantidade de reguladores fora dos limites.")

    oil_reservoir_l = float(data.get("oil_reservoir_l") or 0)
    if oil_reservoir_l < limits["oil_min_l"] or oil_reservoir_l > limits["oil_max_l"]:
        raise ValueError("Volume de oleo fora dos limites.")


def install_main_hooks(main_globals: dict[str, Any]) -> None:
    if main_globals.get("_TSEA_REAL_HOOKS_INSTALLED"):
        return

    main_globals["_TSEA_REAL_HOOKS_INSTALLED"] = True
    sync_legacy_hoses_for_main(main_globals)

    original_normalize_recipe = main_globals.get("normalize_recipe")
    if callable(original_normalize_recipe):
        def normalize_recipe_wrapped(payload: Any):
            item = original_normalize_recipe(payload)
            return normalize_recipe(item)

        main_globals["normalize_recipe"] = normalize_recipe_wrapped

    state = main_globals.get("STATE")
    if state is None:
        return

    if not hasattr(state, "mode"):
        state.mode = "SIMULADO"
    if not hasattr(state, "external_pressure_machine_mbar"):
        state.external_pressure_machine_mbar = None
    if not hasattr(state, "external_tanks_payload"):
        state.external_tanks_payload = []
    if not hasattr(state, "external_oil_flow_l_min"):
        state.external_oil_flow_l_min = None
    if not hasattr(state, "sensor_online"):
        state.sensor_online = True
    if not hasattr(state, "plc_online"):
        state.plc_online = True
    if not hasattr(state, "emergency"):
        state.emergency = False

    cls = state.__class__

    if not hasattr(cls, "_real_bridge_original_start") and hasattr(cls, "start"):
        cls._real_bridge_original_start = cls.start

        def start_real(self, command):
            sync_legacy_hoses_for_main()

            try:
                data = command.model_dump()
            except Exception:
                data = {
                    "recipe_id": getattr(command, "recipe_id", None),
                    "tank_count": getattr(command, "tank_count", None),
                    "hose_id": getattr(command, "hose_id", None),
                    "oil_reservoir_l": getattr(command, "oil_reservoir_l", None),
                }

            validate_start_payload(data)
            return cls._real_bridge_original_start(self, command)

        cls.start = start_real


@router.get("/api/real/parameters")
def api_real_parameters() -> dict[str, Any]:
    sync_legacy_hoses_for_main()

    return {
        "recipes": get_recipes(),
        "tanks": get_tanks(),
        "hoses": get_hoses(),
        "limits": get_limits(),
        "formulas": {
            "hose_internal_volume_l": "V = pi * (Dinterno^2 / 4) * L",
            "hose_internal_volume_units": "D em metros, L em metros, resultado convertido para litros",
            "pressure_relation": "P_tanque = P_sensor + deltaP_linha",
            "pressure_note": "A perda real de pressao depende de vazao, bomba, conexoes, regime de escoamento e deve ser calibrada em ensaio.",
            "effective_pumping_speed": "1/Sefetivo = 1/Sbomba + 1/Cmangueira",
        },
    }


@router.get("/api/real/limits")
def api_real_limits() -> dict[str, Any]:
    return get_limits()


@router.get("/api/real/recipes")
def api_real_recipes() -> list[dict[str, Any]]:
    return get_recipes()


@router.post("/api/real/recipes")
async def api_real_create_recipe(payload: RecipePayloadReal) -> dict[str, Any]:
    items = get_recipes()
    item = normalize_recipe(payload.model_dump(exclude_none=True))
    index = next((idx for idx, current in enumerate(items) if str(current.get("id")) == str(item.get("id"))), None)

    if index is None:
        items.append(item)
    else:
        items[index] = item

    saved_items = save_recipes(items)
    item = next((current for current in saved_items if str(current.get("id")) == str(item.get("id"))), item)

    core = _core()
    core.STATE.event(f"Receita cadastrada/atualizada: {item['id']}", "INFO")
    await core.broadcast()

    return item


@router.post("/api/recipes")
async def api_legacy_create_recipe_alias(payload: RecipePayloadReal) -> dict[str, Any]:
    return await api_real_create_recipe(payload)


@router.get("/api/recipes")
def api_legacy_get_recipes_alias() -> list[dict[str, Any]]:
    return get_recipes()


@router.delete("/api/real/recipes/{recipe_id}")
async def api_real_delete_recipe(recipe_id: str) -> dict[str, Any]:
    items = [item for item in get_recipes() if str(item.get("id")) != str(recipe_id)]
    saved_items = save_recipes(items)

    core = _core()
    core.STATE.event(f"Receita removida: {recipe_id}", "WARN")
    await core.broadcast()

    return {"ok": True, "recipes": saved_items}


@router.get("/api/real/tanks")
def api_real_tanks() -> list[dict[str, Any]]:
    return get_tanks()


@router.post("/api/real/tanks")
async def api_real_create_tank(payload: TankPayload) -> dict[str, Any]:
    items = get_tanks()
    item = normalize_tank(payload.model_dump(exclude_none=True))
    index = next((idx for idx, current in enumerate(items) if str(current.get("id")) == str(item.get("id"))), None)

    if index is None:
        items.append(item)
    else:
        items[index] = item

    _write_json(TANKS_FILE, items)

    core = _core()
    core.STATE.event(f"Tanque cadastrado/atualizado: {item['id']}", "INFO")
    await core.broadcast()

    return item


@router.delete("/api/real/tanks/{tank_id}")
async def api_real_delete_tank(tank_id: str) -> dict[str, Any]:
    items = [
        item for item in get_tanks()
        if str(item.get("id")) != str(tank_id) and str(item.get("code")) != str(tank_id)
    ]

    _write_json(TANKS_FILE, items)

    core = _core()
    core.STATE.event(f"Tanque removido: {tank_id}", "WARN")
    await core.broadcast()

    return {"ok": True, "tanks": items}


@router.get("/api/real/hoses")
def api_real_hoses() -> list[dict[str, Any]]:
    sync_legacy_hoses_for_main()
    return get_hoses()


@router.post("/api/real/hoses")
async def api_real_create_hose(payload: HosePayload) -> dict[str, Any]:
    items = get_hoses()
    item = normalize_hose(payload.model_dump(exclude_none=True))
    index = next((idx for idx, current in enumerate(items) if str(current.get("id")) == str(item.get("id"))), None)

    if index is None:
        items.append(item)
    else:
        items[index] = item

    _write_json(HOSES_FILE, items)
    sync_legacy_hoses_for_main()

    core = _core()
    core.STATE.event(f"Mangueira cadastrada/atualizada: {item['id']}", "INFO")
    await core.broadcast()

    return item


@router.delete("/api/real/hoses/{hose_id}")
async def api_real_delete_hose(hose_id: str) -> dict[str, Any]:
    items = [
        item for item in get_hoses()
        if str(item.get("id")) != str(hose_id) and str(item.get("code")) != str(hose_id)
    ]

    _write_json(HOSES_FILE, items)
    sync_legacy_hoses_for_main()

    core = _core()
    core.STATE.event(f"Mangueira removida: {hose_id}", "WARN")
    await core.broadcast()

    return {"ok": True, "hoses": items}


@router.post("/api/real/admin/clear-data")
async def api_real_admin_clear_data() -> dict[str, Any]:
    core = _core()

    save_recipes([])
    _write_json(TANKS_FILE, [])
    _write_json(HOSES_FILE, [])

    if hasattr(core, "OPERATION_RECORDS"):
        try:
            core.OPERATION_RECORDS.clear()
        except Exception:
            pass

    try:
        core.save_operation_records()
    except Exception:
        pass

    try:
        if hasattr(core, "OPERATION_RECORDS_FILE"):
            _write_json(Path(core.OPERATION_RECORDS_FILE), [])
    except Exception:
        pass

    state = core.STATE

    try:
        state.reset()
    except Exception:
        pass

    state.history_today = []
    state.events = []
    state.operation_id = None
    state.mode = "SIMULADO"
    state.external_pressure_machine_mbar = None
    state.external_tanks_payload = []
    state.external_oil_flow_l_min = None
    state.sensor_online = True
    state.plc_online = True
    state.emergency = False
    state.alarm = None
    state.event("Base limpa para nova demonstracao real.", "INFO")

    await core.broadcast()

    return {
        "ok": True,
        "message": "Base limpa. Cadastre receitas, tanques e mangueiras novamente no gerente.",
        "recipes": [],
        "tanks": [],
        "hoses": [],
        "records": [],
    }
