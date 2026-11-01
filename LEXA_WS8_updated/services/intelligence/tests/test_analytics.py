import unittest

from services.intelligence.app.analytics import derive_business_metrics


class BusinessMetricsTests(unittest.TestCase):
    def test_sales_metrics_derive_only_from_authoritative_fields(self):
        result = derive_business_metrics({"sales": {"grossMinor": 10000, "returnsMinor": 1000, "receiptsMinor": 7500}})
        self.assertEqual(result["metrics"]["sales"]["net_after_returns_minor"], 9000)
        self.assertEqual(result["metrics"]["sales"]["return_rate_percent"], 10.0)
        self.assertEqual(result["metrics"]["sales"]["receipt_to_gross_sales_percent"], 75.0)

    def test_zero_denominators_are_reported_as_unavailable(self):
        result = derive_business_metrics({"sales": {"grossMinor": 0, "returnsMinor": 0, "receiptsMinor": 0}})
        self.assertIsNone(result["metrics"]["sales"]["return_rate_percent"])

    def test_finance_checks_are_scoped_to_supplied_ledger_summary(self):
        result = derive_business_metrics({
            "receivables": {"outstandingMinor": 1000, "overdueMinor": 250, "reconciliation": {"differenceMinor": -10}},
            "generalLedger": {"trialBalanceDifferenceMinor": 0},
        })
        self.assertEqual(result["metrics"]["receivables"]["overdue_share_percent"], 25.0)
        self.assertEqual(result["metrics"]["receivables"]["reconciliation_difference_minor"], -10)
        self.assertTrue(result["metrics"]["general_ledger"]["trial_balance_balanced"])


if __name__ == "__main__":
    unittest.main()
