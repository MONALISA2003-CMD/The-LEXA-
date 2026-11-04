import unittest
from operations_intelligence import calculate


class OperationsIntelligenceTests(unittest.TestCase):
    def test_inventory_no_invented_data(self):
        value = calculate({'version': 1, 'scope':'inventory', 'currency':'UGX', 'facts': {'inventory': {'productsWithStock': 0, 'atOrBelowReorder': 0}}})
        self.assertIn('0 products currently have stock',value['answer'])

    def test_finance_uganda_minor_units(self):
        value = calculate({'version': 1, 'scope':'finance', 'currency':'UGX', 'facts': {'receivables': {'outstandingMinor': 25000}, 'payables': {'outstandingMinor': 5000}}})
        self.assertIn('UGX 25,000',value['answer'])

    def test_negative_and_invalid_inputs_rejected(self):
        for input_value in (-5,'5',None):
            with self.assertRaises(ValueError):
                calculate({'version': 1, 'scope':'sales', 'currency':'UGX', 'facts': {'sales': {'count':input_value,'netSalesMinor':0}}})

    def test_only_whitelisted_scopes(self):
        with self.assertRaises(ValueError):
            calculate({'version':1,'scope':'payroll','currency':'UGX','facts':{}})


if __name__ == '__main__':
    unittest.main()
