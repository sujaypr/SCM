# Ensure the backend root is on sys.path for tests
import os
import sys

BACKEND_ROOT = os.path.dirname(__file__)
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)
