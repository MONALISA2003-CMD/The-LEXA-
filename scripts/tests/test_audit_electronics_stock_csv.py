"""Offline and privacy-safe audit examples for electronics receiving CSV files."""
import importlib.util
import sys
import unittest
from pathlib import Path

MODULE=Path(__file__).resolve().parents[1]/'audit_electronics_stock_csv.py'
spec=importlib.util.spec_from_file_location('electronics_import_audit',MODULE)
audit_module=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=audit_module
spec.loader.exec_module(audit_module)

class ElectronicsCsvAudit(unittest.TestCase):
    def test_feature_phone_one_imei_dual_sim_has_one_unit(self):
        row={'family_code':'feature_phone','sku':'ITEL-FEATURE-ONE','imei':'490154203237518','quantity':'1'}
        report=audit_module.audit([row],family_codes={'feature_phone'})
        self.assertTrue(report['valid'],report)
        self.assertEqual(report['proposed_units'],1)

    def test_two_imeis_are_one_handset(self):
        row={'family_code':'feature_phone','sku':'FEATURE-DUAL','imei':'490154203237518', 'imei2':'490154203237526','quantity':'1'}
        self.assertTrue(audit_module.imei_valid(row['imei2']))
        report=audit_module.audit([row],family_codes={'feature_phone'})
        self.assertTrue(report['valid'],report)
        self.assertEqual(report['proposed_units'],1)

    def test_duplicate_imeis_fail_without_reprinting_device_identifiers(self):
        rows=[{'family_code':'feature_phone','sku':'A','imei':'490154203237518'}, {'family_code':'feature_phone','sku':'B','imei':'490154203237518'}]
        report=audit_module.audit(rows,family_codes={'feature_phone'})
        self.assertFalse(report['valid'])
        self.assertNotIn('490154203237518',str(report))

    def test_synthetic_carton_quantities_do_not_create_stock(self):
        rows=[{'family_code':'usb_cable','sku':'CABLE-USB-C','quantity':'200','units_per_package':'10'}]
        report=audit_module.audit(rows,family_codes={'usb_cable'})
        self.assertEqual(report['proposed_units'],200)
        self.assertEqual(report['writes_performed'],0)

    def test_invalid_supplier_gtin_is_rejected(self):
        report=audit_module.audit([{'family_code':'usb_cable','sku':'CABLE','gtin':'12345671'}],family_codes={'usb_cable'})
        self.assertFalse(report['valid'])
        self.assertTrue(any(x['field']=='gtin' for x in report['errors']))

    def test_product_import_requires_published_model_and_prevents_stock_creation(self):
        policies={'feature_phone':{'stockProfile':'serial','fields':[{'key':'model','type':'text','required':True}]}}
        row={'family_code':'feature_phone','sku':'FEATURE-MASTER','quantity':'10'}
        report=audit_module.audit([row],family_codes={'feature_phone'},family_policies=policies,import_mode='products')
        self.assertFalse(report['valid'])
        self.assertEqual(report['proposed_units'],0)
        self.assertEqual({entry['field'] for entry in report['errors']},{'quantity','model'})

    def test_serial_receipts_allow_repeating_same_sku_with_distinct_imeis(self):
        rows=[{'family_code':'feature_phone','sku':'ITEL-IT5606','imei':'490154203237518'},
              {'family_code':'feature_phone','sku':'ITEL-IT5606','imei':'490154203237526'}]
        report=audit_module.audit(rows,family_codes={'feature_phone'},import_mode='units')
        self.assertTrue(report['valid'],report)
        self.assertEqual(report['proposed_units'],2)

    def test_package_receiving_counts_base_units_and_never_posts_stock(self):
        rows=[{'family_code':'usb_cable','sku':'CAB-USB-C','quantity':'20',
               'quantity_unit':'package','units_per_package':'10'}]
        report=audit_module.audit(rows,family_codes={'usb_cable'})
        self.assertTrue(report['valid'],report)
        self.assertEqual(report['proposed_units'],200)
        self.assertEqual(report['writes_performed'],0)

    def test_product_variant_duplicate_gtin_and_enum_are_rejected(self):
        policies={'charger':{'stockProfile':'quantity','fields':[{'key':'connector','type':'enum','required':True,'options':['USB-C','USB-A']}]}}
        rows=[{'family_code':'charger','sku':'CHARGER-A','connector':'wrong','gtin':'96385074'},
              {'family_code':'charger','sku':'CHARGER-B','connector':'USB-C','gtin':'96385074'}]
        report=audit_module.audit(rows,family_codes={'charger'},family_policies=policies,import_mode='products')
        self.assertFalse(report['valid'])
        self.assertTrue(any(e['field']=='connector' for e in report['errors']))
        self.assertTrue(any(e['field']=='gtin' and 'Duplicate' in e['reason'] for e in report['errors']))

if __name__=='__main__':unittest.main()
