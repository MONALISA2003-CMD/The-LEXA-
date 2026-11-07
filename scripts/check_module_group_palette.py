#!/usr/bin/env python3
"""Repository compatibility entrypoint for the frontend-local palette validation.

The canonical checker lives within lexa-frontend/ so a Vercel root-directory
checkout does not require access to ../scripts.
"""
from pathlib import Path
import runpy

checker = Path(__file__).resolve().parents[1] / 'lexa-frontend' / 'scripts' / 'check_module_group_palette.py'
runpy.run_path(str(checker), run_name='__main__')
