#!/usr/bin/env python3
"""Safe, deterministic LEXA operational summary for authenticated owner requests.

Input is only pre-filtered, current-workspace aggregates. This process has no
network, database, secrets or mutation capabilities. It emits no user records.
"""
import json
import sys
from decimal import Decimal


def calculate(payload):
    if not isinstance(payload, dict) or payload.get('version') != 1:
        raise ValueError('Invalid analysis request')
    scope = payload.get('scope')
    facts = payload.get('facts')
    if scope not in ('inventory', 'sales', 'finance') or not isinstance(facts, dict):
        raise ValueError('Invalid scope or facts')
    currency = payload.get('currency', 'UGX')
    currency = currency.upper()
    zero_decimal = {'UGX','JPY','KRW','RWF','XOF','XAF','VND'}
    three_decimal = {'BHD','KWD','OMR','JOD','TND'}
    factor = 1 if currency in zero_decimal else 1000 if currency in three_decimal else 100
    precision = 0 if factor == 1 else 3 if factor == 1000 else 2
    def money(value):
        return f'{currency} {Decimal(value) / Decimal(factor):,.{precision}f}'
    if not isinstance(currency, str) or len(currency) != 3 or not currency.isalpha():
        raise ValueError('Invalid currency')
    def nonnegative(row, key):
        value = row.get(key)
        if type(value) not in (int, float) or value < 0 or value > 9_000_000_000_000:
            raise ValueError('Invalid count or amount')
        return value
    if scope == 'inventory':
        inv = facts.get('inventory')
        if not isinstance(inv, dict):
            raise ValueError('Inventory data unavailable')
        stocked = nonnegative(inv, 'productsWithStock')
        shortage = nonnegative(inv, 'atOrBelowReorder')
        text = f'{stocked:g} products currently have stock. {shortage:g} products are at or below their reorder level.'
        if shortage: text += ' Open Inventory to review which items need replenishment.'
    elif scope == 'sales':
        sales = facts.get('sales')
        if not isinstance(sales, dict):
            raise ValueError('Sales data unavailable')
        count = nonnegative(sales, 'count')
        total = nonnegative(sales, 'netSalesMinor')
        text = f'{count:g} completed sales are recorded. Net sales total {money(total)} using recorded amounts.'
    else:
        recv, pay = facts.get('receivables'), facts.get('payables')
        if not isinstance(recv, dict) or not isinstance(pay, dict):
            raise ValueError('Finance data unavailable')
        ar = nonnegative(recv, 'outstandingMinor')
        ap = nonnegative(pay, 'outstandingMinor')
        text = f'Outstanding customer balances: {money(ar)}. Outstanding supplier balances: {money(ap)}.'
    return {'answer': text, 'method': 'deterministic', 'sources': [scope]}


def main():
    payload = json.load(sys.stdin)
    print(json.dumps(calculate(payload), separators=(',', ':')))

if __name__ == '__main__':
    main()
