import unittest
from finance_intelligence import calculate

class FinanceAnalyticsTests(unittest.TestCase):
    def test_no_records_means_no_forecast(self):
        self.assertEqual(calculate({'version': 1, 'months': []})['forecast'], [])
    def test_three_months_produce_forward_forecast(self):
        months=[{'month': f'2026-0{i}', 'inflowMinor': i*100, 'outflowMinor': i*80} for i in range(1,4)]
        output=calculate({'version': 1, 'months': months})
        self.assertEqual(len(output['forecast']), 3)
        self.assertEqual(output['forecast'][0]['month'], '2026-04')
    def test_single_month_is_insufficient(self):
        result=calculate({'version': 1, 'months': [{'month':'2026-01','inflowMinor':100,'outflowMinor':0}]})
        self.assertEqual(result['method'], 'insufficient_history')
    def test_rejects_duplicate_month(self):
        row={'month':'2026-01','inflowMinor':1,'outflowMinor':0}
        with self.assertRaises(ValueError): calculate({'version':1,'months':[row,row]})
    def test_rejects_negative_or_float(self):
        with self.assertRaises(ValueError): calculate({'version':1,'months':[{'month':'2026-01','inflowMinor':-1,'outflowMinor':0}]})
        with self.assertRaises(ValueError): calculate({'version':1,'months':[{'month':'2026-01','inflowMinor':0.5,'outflowMinor':0}]})
    def test_rejects_invalid_input(self):
        with self.assertRaises(ValueError): calculate({'version':5,'months':[]})
        with self.assertRaises(ValueError): calculate({'version':1,'months':{'month':'2026-01'}})

if __name__=='__main__':
    unittest.main()
