"""Regression tests for non-authoritative, exact-decimal demand recommendations."""
import json
import subprocess
import sys
import unittest
from pathlib import Path

from industry_demand import ContractError, calculate

ID = "b7fae67b-38be-4b7a-80a0-2d1d49b44768"
BRANCH = "a2d987fb-d36e-4fa1-a10f-3f92b22d9a17"
ITEM = "afd9c391-f873-4d5b-8586-a26b51ce1afd"


def request(**updates):
    item = {
        "productId": ITEM, "variantId": None, "currency": "UGX",
        "sourceVersion": "ledger-snapshot-1", "dailyDemand": ["1.000"] * 28,
        "availableToPromise": "2.000", "confirmedOnOrder": "0.000",
        "leadTimeDays": 7, "safetyStock": "2.000", "supplierPackMultiple": "4.000",
    }
    item.update(updates)
    return {"schemaVersion": 1, "tenantId": ID, "branchId": BRANCH, "asOf": "2026-11-05", "items": [item]}


class DemandContractTests(unittest.TestCase):
    def test_rule_forecast_rounds_to_supplier_pack_without_posting(self):
        r = calculate(request())["items"][0]
        self.assertEqual(r["recommendedPurchaseUnits"], "8.000")
        self.assertEqual(r["forecastDaily"], "1.000")
        self.assertTrue(r["requiresApproval"])
        self.assertFalse(r["postingAllowed"])

    def test_short_history_does_not_invent_forecast(self):
        r = calculate(request(dailyDemand=["0"] * 3))["items"][0]
        self.assertIsNone(r["recommendedPurchaseUnits"])
        self.assertEqual(r["model"], "insufficient_history")

    def test_exact_decimal_does_not_introduce_float_rounding(self):
        r = calculate(request(dailyDemand=["0.100"] * 35, availableToPromise="0.000", safetyStock="0.000", supplierPackMultiple="0.250"))["items"][0]
        self.assertEqual(r["recommendedPurchaseUnits"], "0.750")

    def test_unknown_fields_and_negative_demand_fail_closed(self):
        for invalid in [request(password="secret"), request(dailyDemand=["-1"] * 28), request(leadTimeDays=400), request(currency="usd")]:
            with self.subTest(invalid=invalid["items"][0]):
                with self.assertRaises(ContractError):
                    calculate(invalid)

    def test_rejects_cross_item_duplicate_and_forged_identifiers(self):
        d = request()
        d["items"].append(dict(d["items"][0]))
        with self.assertRaisesRegex(ContractError, "Duplicate"):
            calculate(d)
        d = request()
        d["tenantId"] = "untrusted-tenant"
        with self.assertRaises(ContractError):
            calculate(d)

    def test_stable_digest_and_tenant_scoped_output(self):
        first, second = calculate(request()), calculate(request())
        self.assertEqual(first, second)
        self.assertEqual(first["tenantId"], ID)
        self.assertEqual(first["branchId"], BRANCH)
        self.assertRegex(first["inputSha256"], r"^[0-9a-f]{64}$")

    def test_bounds_and_no_personal_information(self):
        d = request()
        d["items"][0]["customerName"] = "not authorized"
        with self.assertRaises(ContractError):
            calculate(d)
        d = request()
        d["items"][0]["dailyDemand"] = ["1"] * 367
        with self.assertRaises(ContractError):
            calculate(d)

    def test_cli_accepts_only_json_and_never_writes_business_records(self):
        script = Path(__file__).with_name("industry_demand.py")
        result = subprocess.run([sys.executable, str(script)], input=json.dumps(request()), capture_output=True, text=True, check=False, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads(result.stdout)["items"][0]["postingAllowed"])
        invalid = subprocess.run([sys.executable, str(script)], input='{"invalid":1}', capture_output=True, text=True, check=False, timeout=5)
        self.assertEqual(invalid.returncode, 2)
        self.assertFalse(invalid.stdout)


if __name__ == "__main__":
    unittest.main()
