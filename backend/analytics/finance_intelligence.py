#!/usr/bin/env python3
"""Deterministic, read-only financial analytics worker.

No DB connection, HTTP requests, third-party AI, environment secrets or posting
capabilities. Consumes only validated tenant-scoped monthly aggregates on stdin.
Only executed on explicit authenticated analytics requests by the NestJS API.
"""
import json
import math
import sys

MAX_AMOUNT = 9_000_000_000_000


def calculate(payload: object) -> dict:
    if not isinstance(payload, dict) or payload.get('version') != 1:
        raise ValueError('Unsupported analytics input')
    data = payload.get('months')
    if not isinstance(data, list) or len(data) > 60:
        raise ValueError('Expected at most 60 monthly ledger totals')
    history = []
    seen = set()
    for row in data:
        if not isinstance(row, dict):
            raise ValueError('Invalid ledger total')
        month = row.get('month')
        if not isinstance(month, str) or len(month) != 7 or month[4] != '-' or not (month[:4] + month[5:]).isdigit() or not 1 <= int(month[5:]) <= 12 or month in seen:
            raise ValueError('Invalid or duplicate month')
        seen.add(month)
        inflow, outflow = row.get('inflowMinor'), row.get('outflowMinor')
        if any(type(x) is not int or x < 0 or x > MAX_AMOUNT for x in (inflow, outflow)):
            raise ValueError('Ledger totals must be nonnegative safe integers')
        history.append({'month': month, 'inflowMinor': inflow, 'outflowMinor': outflow, 'netMinor': inflow - outflow})
    history.sort(key=lambda v: v['month'])
    if not any(x['inflowMinor'] or x['outflowMinor'] for x in history):
        return {'history': history, 'forecast': [], 'method': 'none', 'hasData': False, 'disclaimer': 'No posted cash movements are available for a forecast.'}
    # Short historical samples are not enough to infer a reliable forward trend.
    if len(history) < 3:
        return {'history': history, 'forecast': [], 'method': 'insufficient_history', 'hasData': True, 'disclaimer': 'At least three recorded months are required for forecasting.'}
    last = history[-6:]
    weighted = list(range(1, len(last) + 1))
    denominator = sum(weighted)
    avg_in = sum(x['inflowMinor'] * w for x, w in zip(last, weighted)) / denominator
    avg_out = sum(x['outflowMinor'] * w for x, w in zip(last, weighted)) / denominator
    if not all(map(math.isfinite, [avg_in, avg_out])):
        raise ValueError('Analytics overflow')
    forecasts = []
    year, month = map(int, history[-1]['month'].split('-'))
    for _ in range(3):
        month += 1
        if month == 13:
            month, year = 1, year + 1
        inflow, outflow = round(avg_in), round(avg_out)
        forecasts.append({'month': f'{year:04d}-{month:02d}', 'inflowMinor': inflow, 'outflowMinor': outflow, 'netMinor': inflow - outflow})
    return {'history': history, 'forecast': forecasts, 'method': 'weighted_moving_average_v1', 'hasData': True, 'disclaimer': 'A statistical estimate, not a bank balance or approved financial statement.'}


def main():
    try:
        raw = sys.stdin.buffer.read(64 * 1024 + 1)
        if len(raw) > 64 * 1024:
            raise ValueError('Analytics request exceeds size limit')
        result = calculate(json.loads(raw))
        sys.stdout.write(json.dumps(result, separators=(',', ':')))
    except (ValueError, TypeError, OverflowError, json.JSONDecodeError) as exc:
        sys.stderr.write(f'Analytics input rejected: {exc}\n')
        raise SystemExit(2)


if __name__ == '__main__':
    main()
