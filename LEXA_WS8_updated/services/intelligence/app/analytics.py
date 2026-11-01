"""Deterministic, auditable business metrics for the LEXA explanation layer.

The Nest API remains the system of record and performs tenant/branch authorization
and source-table aggregation. This module receives only that scoped summary and
adds derived ratios; it never opens a database or accepts arbitrary JSON money fields.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any


def _minor(section: dict[str, Any], key: str) -> Decimal:
    try:
        value = Decimal(str(section.get(key, 0)))
        if not value.is_finite():
            return Decimal(0)
        return value
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(0)


def _count(section: dict[str, Any], key: str) -> int:
    try:
        return max(0, int(section.get(key, 0)))
    except (TypeError, ValueError, OverflowError):
        return 0


def _percent(numerator: Decimal | int, denominator: Decimal | int) -> float | None:
    try:
        top, bottom = Decimal(str(numerator)), Decimal(str(denominator))
        if bottom <= 0:
            return None
        result = (top * Decimal(100) / bottom).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        return float(result)
    except (InvalidOperation, TypeError, ValueError):
        return None


def derive_business_metrics(facts: dict[str, Any]) -> dict[str, Any]:
    """Return auditable ratios and checks using only recognised aggregate keys."""
    result: dict[str, Any] = {"method": "Deterministic calculations from LEXA-authorised aggregate fields.", "metrics": {}}
    metrics: dict[str, Any] = result["metrics"]

    sales = facts.get("sales") if isinstance(facts.get("sales"), dict) else {}
    gross = _minor(sales, "grossMinor")
    returns = _minor(sales, "returnsMinor")
    receipts = _minor(sales, "receiptsMinor")
    net_sales = gross - returns
    metrics["sales"] = {
        "net_after_returns_minor": int(net_sales),
        "return_rate_percent": _percent(returns, gross),
        "receipt_to_gross_sales_percent": _percent(receipts, gross),
        "formulae": {
            "net_after_returns_minor": "completed gross sales minus recorded return value",
            "return_rate_percent": "recorded return value divided by completed gross sales",
            "receipt_to_gross_sales_percent": "recorded receipts divided by completed gross sales",
        },
    }

    inventory = facts.get("inventory") if isinstance(facts.get("inventory"), dict) else {}
    products = _count(inventory, "trackedProducts")
    low_stock = _count(inventory, "atOrBelowReorder")
    metrics["inventory"] = {
        "products_at_or_below_reorder_percent": _percent(low_stock, products),
        "formula": "tracked active products at or below reorder threshold divided by tracked active products",
    }

    ar = facts.get("receivables") if isinstance(facts.get("receivables"), dict) else {}
    if ar:
        overdue = _minor(ar, "overdueMinor")
        outstanding = _minor(ar, "outstandingMinor")
        metrics["receivables"] = {
            "overdue_share_percent": _percent(overdue, outstanding),
            "reconciliation_difference_minor": _minor((ar.get("reconciliation") or {}), "differenceMinor"),
        }

    ap = facts.get("payables") if isinstance(facts.get("payables"), dict) else {}
    if ap:
        overdue = _minor(ap, "overdueMinor")
        outstanding = _minor(ap, "outstandingMinor")
        metrics["payables"] = {
            "overdue_share_percent": _percent(overdue, outstanding),
            "reconciliation_difference_minor": _minor((ap.get("reconciliation") or {}), "differenceMinor"),
        }

    gl = facts.get("generalLedger") if isinstance(facts.get("generalLedger"), dict) else {}
    if gl:
        difference = _minor(gl, "trialBalanceDifferenceMinor")
        metrics["general_ledger"] = {
            "trial_balance_balanced": difference == 0,
            "trial_balance_difference_minor": int(difference),
        }

    people = facts.get("people") if isinstance(facts.get("people"), dict) else {}
    if people:
        attendance = _count(people, "attendanceRecords")
        present = _count(people, "presentRecords")
        metrics["workforce"] = {
            "present_record_share_percent": _percent(present, attendance),
            "formula": "present attendance records divided by recorded attendance entries; not an employee productivity measure",
        }

    return result
