#!/usr/bin/env python3
"""Read-only intelligence for proposed electronics product/stock CSV imports.

No real IMEIs, customer records or inventory are sent to AI services. The
validator never writes to production or creates pretend stock. Exit 1 means a
CSV is unsafe to submit, exit 0 means the local structural checks succeeded.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY_FILE = ROOT / "scripts" / "electronics-catalogue-v2.v1.json"


def imei_valid(raw: str) -> bool:
    if not re.fullmatch(r"\d{15}", raw):
        return False
    total = 0
    for index, char in enumerate(raw):
        value = int(char)
        if index % 2:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


def gtin_valid(raw: str) -> bool:
    if not re.fullmatch(r"(?:\d{8}|\d{12}|\d{13}|\d{14})", raw):
        return False
    subtotal = sum(int(digit) * (3 if place % 2 == 0 else 1)
                   for place, digit in enumerate(reversed(raw[:-1])))
    return (10 - subtotal % 10) % 10 == int(raw[-1])


def audit(rows: list[dict[str, str]], *, family_codes: set[str] | None = None,
          family_policies: dict[str, dict] | None = None,
          import_mode: str = "units") -> dict:
    """Audit either existing-SKU physical receipts or new product master data.

    A product import must never create stock; a physical receipt may repeat the
    same SKU across many individual units but must never repeat an IMEI/serial.
    """
    if import_mode not in {"units", "products"}:
        raise ValueError("Use units or products import mode")
    seen_skus: dict[str, int] = {}
    seen_gtins: dict[str, int] = {}
    seen_identifiers: dict[str, int] = {}
    errors: list[dict[str, str | int]] = []
    families = Counter()
    units = 0

    def problem(row: int, field: str, reason: str) -> None:
        errors.append({"row": row, "field": field, "reason": reason})

    for number, row in enumerate(rows, 2):
        family = (row.get("family_code") or "").strip()
        if family_codes is not None and family not in family_codes:
            problem(number, "family_code", "Unknown published product-family code")
        policy = (family_policies or {}).get(family)
        if import_mode == "products" and policy:
            for field in policy.get("fields", []):
                name = field["key"]
                value = (row.get(name) or "").strip()
                if field.get("required") and not value:
                    problem(number, name, "Required product specification missing")
                if not value:
                    continue
                kind = field.get("type", "text")
                if kind == "enum" and value not in field.get("options", []):
                    problem(number, name, "Unsupported product specification choice")
                elif kind == "boolean" and value.lower() not in {"true", "false", "yes", "no", "0", "1"}:
                    problem(number, name, "Invalid yes/no product specification")
                elif kind == "number":
                    try:
                        from decimal import Decimal, InvalidOperation
                        numeric = Decimal(value)
                        if not numeric.is_finite() or numeric < 0:
                            problem(number, name, "Specification must be a non-negative number")
                    except InvalidOperation:
                        problem(number, name, "Specification must be numeric")
        families[family] += 1
        sku = (row.get("sku") or "").strip().upper()
        if not sku:
            problem(number, "sku", "Missing SKU")
        elif import_mode == "products" and sku in seen_skus:
            problem(number, "sku", f"Duplicate SKU against row {seen_skus[sku]}")
        else:
            seen_skus.setdefault(sku, number)
        gtin = (row.get("gtin") or "").strip()
        if gtin and not gtin_valid(gtin):
            problem(number, "gtin", "GTIN check digit or length invalid")
        if gtin and import_mode == "products":
            if gtin in seen_gtins:
                problem(number, "gtin", f"Duplicate GTIN against row {seen_gtins[gtin]}")
            seen_gtins[gtin] = number
        primary = (row.get("imei") or "").strip()
        second = (row.get("imei2") or "").strip()
        # One row = one physical handset; optional IMEI2 never adds a stock unit.
        identifiers = (policy or {}).get("identifiers", [])
        is_cellular = ("imei" in identifiers or "imei2?" in identifiers) if policy else family.lower() in {"feature_phone", "smartphone", "cellular_tablet", "mifi_router"}
        if primary and not is_cellular:
            problem(number, "imei", "IMEI recorded on a noncellular family")
        if is_cellular and import_mode == "units" and not primary:
            problem(number, "imei", "Cellular device requires a real IMEI")
        manufacturer_serial = (row.get("serial") or "").strip()
        if import_mode == "units" and policy and policy.get("stockProfile") == "serial" and not is_cellular:
            if not manufacturer_serial:
                problem(number, "serial", "Serialized product requires its real manufacturer serial")
        if manufacturer_serial:
            if len(manufacturer_serial) > 120 or any(ord(ch) < 32 or ord(ch) == 127 for ch in manufacturer_serial):
                problem(number, "serial", "Invalid manufacturer serial format")
            normalized = manufacturer_serial.upper()
            if normalized in seen_identifiers:
                problem(number, "serial", f"Identifier already used in row {seen_identifiers[normalized]}")
            seen_identifiers[normalized] = number
        for key, identifier in (("imei", primary), ("imei2", second)):
            if not identifier:
                continue
            if not imei_valid(identifier):
                problem(number, key, "Invalid IMEI Luhn check digit; not shown for privacy")
            normalized = identifier.upper()
            if normalized in seen_identifiers:
                problem(number, key, f"Identifier already used in row {seen_identifiers[normalized]}")
            seen_identifiers[normalized] = number
        if second and not primary:
            problem(number, "imei2", "Secondary identifier requires primary identifier")
        raw_count = (row.get("quantity") or "1").strip()
        try:
            count = int(raw_count)
        except ValueError:
            count = -1
        if count <= 0 or count > 1_000_000:
            problem(number, "quantity", "Quantity must be a positive integer")
        elif import_mode == "products" and row.get("quantity") not in (None, "", "0"):
            problem(number, "quantity", "A product import cannot receive inventory")
        elif import_mode == "units" and (is_cellular or (policy and policy.get("stockProfile") == "serial")) and count != 1:
            problem(number, "quantity", "One serialized physical item must occupy one row")
        elif import_mode == "units":
            units += count
        pack = (row.get("units_per_package") or "").strip()
        if pack:
            if not re.fullmatch(r"(?:[1-9]\d{0,6})(?:\.\d{1,3})?", pack):
                problem(number, "units_per_package", "Invalid positive three-decimal package conversion")
        if row.get("quantity_unit", "base").strip().lower() == "package":
            if not pack or not re.fullmatch(r"[1-9]\d{0,6}", pack):
                problem(number, "units_per_package", "Package receipts require a positive whole-number pack conversion")
            elif import_mode == "units" and not is_cellular and count > 0 and count <= 1_000_000:
                units += count * (int(pack) - 1)
        elif row.get("quantity_unit", "base").strip().lower() not in {"base", "piece", "each", ""}:
            problem(number, "quantity_unit", "Use package or base units")
    return {"valid": not errors, "rows": len(rows), "proposed_units": units,
            "family_counts": dict(sorted(families.items())), "errors": errors[:500],
            "error_count": len(errors), "writes_performed": 0, "import_mode": import_mode}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_file", type=Path, help="Locally supplied CSV; no network calls")
    parser.add_argument("--report", type=Path, help="Optional JSON result path; do not include real IMEIs")
    parser.add_argument("--skip-policy-check", action="store_true", help="Test CSV format without the canonical family registry")
    parser.add_argument("--kind", choices=("products", "units"), default="units",
                        help="products validates new product specifications without stock; units audits physical receiving")
    args = parser.parse_args()
    with args.csv_file.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or "family_code" not in reader.fieldnames or "sku" not in reader.fieldnames:
            parser.error("CSV requires family_code and sku headers")
        rows = []
        for line in reader:
            if len(rows) >= 50000:
                parser.error("Maximum 50,000 proposed CSV rows")
            rows.append(line)
    families = None
    policies = None
    if not args.skip_policy_check:
        if not POLICY_FILE.is_file():
            parser.error(f"Canonical policy is missing: {POLICY_FILE.relative_to(ROOT)}")
        data = json.loads(POLICY_FILE.read_text(encoding="utf-8"))
        policies = {f["code"]: f for f in data["families"]}
        families = set(policies)
    report = audit(rows, family_codes=families, family_policies=policies, import_mode=args.kind)
    output = json.dumps(report, indent=2, sort_keys=True)
    print(output)
    if args.report:
        args.report.write_text(output + "\n", encoding="utf-8")
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
