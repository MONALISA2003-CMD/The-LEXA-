#!/usr/bin/env python3
"""Read-only, tenant-scoped demand and replenishment recommendations.

Input: a bounded JSON document of already-authorized SKU/branch daily aggregates.
Output: deterministic JSON with assumptions, evidence window, and model quality.
This process does not import database clients, access the network or post business events.
All stock quantities and monetary inputs use Decimal; predictions are never ledger facts.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_HALF_UP
from statistics import median
from typing import Any

CONTRACT_VERSION = 1
ALGORITHM_VERSION = "lexa-demand-rules-1.0.0"
MAX_INPUT_BYTES = 1_048_576
MAX_ITEMS = 256
MAX_DAYS = 366
AMOUNT = Decimal("0.001")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
CURRENCY = re.compile(r"^[A-Z]{3}$")
ROOT_FIELDS = {"schemaVersion", "tenantId", "branchId", "asOf", "items"}
ITEM_FIELDS = {
    "productId", "variantId", "dailyDemand", "availableToPromise", "confirmedOnOrder",
    "leadTimeDays", "safetyStock", "supplierPackMultiple", "maxSuggestedUnits",
    "stockoutDays", "currency", "unitCostMinor", "sourceVersion",
}

class ContractError(ValueError):
    """A source contract violation; callers must show an unavailable result, never a suggestion."""


def checked_object(value: Any, allowed: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{label} must be an object")
    unknown = set(value) - allowed
    if unknown:
        raise ContractError(f"{label} has unsupported fields")
    return value


def identifier(value: Any, label: str) -> str:
    if not isinstance(value, str) or not UUID.fullmatch(value):
        raise ContractError(f"{label} must be a valid UUID")
    return value.lower()


def decimal(value: Any, label: str, *, maximum: Decimal = Decimal("1000000000")) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, str, Decimal)):
        raise ContractError(f"{label} must be an exact decimal")
    if isinstance(value, str) and (not value or len(value) > 30 or not re.fullmatch(r"\d+(?:\.\d{1,3})?", value)):
        raise ContractError(f"{label} must have at most three decimal places")
    try:
        result = Decimal(value)
    except (ValueError, InvalidOperation):
        raise ContractError(f"{label} must be an exact decimal") from None
    if not result.is_finite() or result < 0 or result > maximum or result.as_tuple().exponent < -3:
        raise ContractError(f"{label} is outside the supported non-negative precision/range")
    return result


def integer(value: Any, label: str, least: int, most: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not (least <= value <= most):
        raise ContractError(f"{label} must be an integer between {least} and {most}")
    return value


def mean(values: list[Decimal]) -> Decimal:
    return sum(values, Decimal(0)) / Decimal(len(values)) if values else Decimal(0)


def next_day(values: list[Decimal], algorithm: str) -> Decimal:
    if not values:
        return Decimal(0)
    if algorithm == "seven_day_mean":
        return mean(values[-7:])
    if algorithm == "intermittent_demand":
        nonzero = [(i, value) for i, value in enumerate(values) if value > 0]
        if len(nonzero) < 2:
            return mean(values)
        gaps = [b[0] - a[0] for a, b in zip(nonzero, nonzero[1:])]
        return mean([v for _, v in nonzero]) / mean([Decimal(g) for g in gaps])
    return values[-1]


def select_model(values: list[Decimal]) -> tuple[str, Decimal | None, Decimal | None, list[str]]:
    warnings: list[str] = []
    if len(values) < 14:
        return "insufficient_history", None, None, ["At least 14 completed days are required for a demand forecast."]
    nonzero = sum(1 for v in values if v > 0)
    methods = ["previous_day", "seven_day_mean"]
    if nonzero >= 2 and nonzero * 3 < len(values):
        methods.append("intermittent_demand")
    holdout = min(28, max(7, len(values) // 5))
    errors: dict[str, Decimal] = {}
    for method in methods:
        absolute_errors = [abs(next_day(values[:i], method) - values[i]) for i in range(len(values)-holdout, len(values))]
        errors[method] = mean(absolute_errors)
    baseline = errors["previous_day"]
    method = min(methods, key=lambda name: (errors[name], methods.index(name)))
    if errors[method] >= baseline and method != "previous_day":
        method = "previous_day"
    if sum(values, Decimal(0)) == 0:
        warnings.append("No observed demand; do not use this forecast alone to place a purchase order.")
    return method, errors[method], baseline, warnings


def anomaly(values: list[Decimal]) -> str | None:
    if len(values) < 21:
        return None
    history = values[:-1][-28:]
    centre = median(history)
    deviations = [abs(v-centre) for v in history]
    spread = median(deviations)
    actual = values[-1]
    if spread == 0:
        if actual > max(Decimal(5), centre * 3) and actual > centre:
            return "Recent demand exceeds the typical observed range; review source sales and stockouts."
        return None
    robust_score = abs(actual-centre) * Decimal("0.6745") / spread
    if robust_score > Decimal("3.5"):
        return "Recent demand is statistically unusual; inspect source records before adjusting replenishment."
    return None


def recommend_item(raw: Any, as_of: date) -> dict[str, Any]:
    x = checked_object(raw, ITEM_FIELDS, "item")
    product_id = identifier(x.get("productId"), "productId")
    variant_id = identifier(x["variantId"], "variantId") if x.get("variantId") is not None else None
    currency = x.get("currency")
    if not isinstance(currency, str) or not CURRENCY.fullmatch(currency):
        raise ContractError("currency must be three uppercase letters")
    if not isinstance(x.get("sourceVersion"), str) or not (1 <= len(x["sourceVersion"]) <= 100):
        raise ContractError("sourceVersion must identify the authorized aggregate snapshot")
    history = x.get("dailyDemand")
    if not isinstance(history, list) or len(history) > MAX_DAYS:
        raise ContractError("dailyDemand must be a list of up to 366 exact quantities")
    values = [decimal(v, "dailyDemand") for v in history]
    atp = decimal(x.get("availableToPromise"), "availableToPromise")
    on_order = decimal(x.get("confirmedOnOrder"), "confirmedOnOrder")
    safety = decimal(x.get("safetyStock"), "safetyStock")
    pack = decimal(x.get("supplierPackMultiple"), "supplierPackMultiple")
    if pack <= 0:
        raise ContractError("supplierPackMultiple must be positive")
    lead = integer(x.get("leadTimeDays"), "leadTimeDays", 0, 365)
    max_units = decimal(x["maxSuggestedUnits"], "maxSuggestedUnits") if x.get("maxSuggestedUnits") is not None else None
    stockouts = integer(x.get("stockoutDays", 0), "stockoutDays", 0, len(values))
    unit_cost = integer(x.get("unitCostMinor"), "unitCostMinor", 0, 1_000_000_000) if x.get("unitCostMinor") is not None else None
    if values and stockouts:
        stockout_note = "Observed sales exclude some stockout days; demand may be understated."
    else:
        stockout_note = None
    method, error, baseline_error, warnings = select_model(values)
    if stockout_note:
        warnings.append(stockout_note)
    unusual = anomaly(values)
    if unusual:
        warnings.append(unusual)
    daily = max(Decimal(0), next_day(values, method)) if error is not None else None
    suggested: Decimal | None = None
    lead_demand: Decimal | None = None
    if daily is not None:
        lead_demand = daily * Decimal(lead)
        required = max(Decimal(0), lead_demand + safety - atp - on_order)
        if max_units is not None and required > max_units:
            required = max_units
            warnings.append("Suggested quantity capped by the approved item limit.")
        suggested = (required / pack).to_integral_value(rounding=ROUND_CEILING) * pack if required else Decimal(0)
        if max_units is not None and suggested > max_units:
            suggested = (max_units / pack).to_integral_value(rounding="ROUND_FLOOR") * pack
        if suggested > 0:
            warnings.append("Review supplier availability, working capital and expiry before approving any request.")
    def fmt(value: Decimal | None) -> str | None:
        return str(value.quantize(AMOUNT, rounding=ROUND_HALF_UP)) if value is not None else None
    return {
        "productId": product_id, "variantId": variant_id, "sourceVersion": x["sourceVersion"],
        "currency": currency, "model": method, "modelVersion": ALGORITHM_VERSION,
        "observations": len(values), "windowStart": (as_of-timedelta(days=len(values)-1)).isoformat() if values else None,
        "windowEnd": as_of.isoformat(), "forecastDaily": fmt(daily),
        "leadTimeDemand": fmt(lead_demand), "availableToPromise": fmt(atp),
        "confirmedOnOrder": fmt(on_order), "safetyStock": fmt(safety),
        "supplierPackMultiple": fmt(pack), "recommendedPurchaseUnits": fmt(suggested),
        "unitCostMinor": unit_cost, "validationMae": fmt(error), "baselineMae": fmt(baseline_error),
        "warnings": warnings, "requiresApproval": True, "postingAllowed": False,
    }


def calculate(payload: Any) -> dict[str, Any]:
    root = checked_object(payload, ROOT_FIELDS, "request")
    if root.get("schemaVersion") != CONTRACT_VERSION or isinstance(root.get("schemaVersion"), bool):
        raise ContractError("Unsupported analytics input version")
    tenant_id = identifier(root.get("tenantId"), "tenantId")
    branch_id = identifier(root.get("branchId"), "branchId")
    raw_date = root.get("asOf")
    if not isinstance(raw_date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_date):
        raise ContractError("asOf must be a date")
    try:
        as_of = date.fromisoformat(raw_date)
    except ValueError:
        raise ContractError("asOf must be an actual date") from None
    items = root.get("items")
    if not isinstance(items, list) or len(items) > MAX_ITEMS:
        raise ContractError("items must be a list of at most 256 records")
    seen: set[tuple[str, str | None]] = set()
    results = []
    for item in items:
        result = recommend_item(item, as_of)
        key = result["productId"], result["variantId"]
        if key in seen:
            raise ContractError("Duplicate product/variant key in aggregate input")
        seen.add(key)
        results.append(result)
    serialized = json.dumps(root, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return {
        "schemaVersion": CONTRACT_VERSION, "tenantId": tenant_id, "branchId": branch_id,
        "asOf": raw_date, "algorithmVersion": ALGORITHM_VERSION,
        "inputSha256": hashlib.sha256(serialized.encode("utf-8")).hexdigest(),
        "items": results, "scope": "read_only_recommendations", "requiresHumanApproval": True,
    }


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if not raw or len(raw) > MAX_INPUT_BYTES:
            raise ContractError("Aggregate input is missing or exceeds 1 MiB")
        data = json.loads(raw.decode("utf-8"), parse_float=str, parse_int=int,
                          parse_constant=lambda _: (_ for _ in ()).throw(ContractError("Non-finite JSON numbers are not accepted")))
        output = calculate(data)
        print(json.dumps(output, sort_keys=True, separators=(",", ":")))
        return 0
    except (ContractError, UnicodeDecodeError, json.JSONDecodeError) as error:
        print(json.dumps({"code": "INVALID_AGGREGATE_INPUT", "message": str(error)[:180]}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
