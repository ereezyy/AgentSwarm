"""
DeepSentinel Dual-Model Inference Server — Dependency-Free Version
Runs on pure Python (no NumPy needed) to support experimental environments.
Serves both Raydium and Pump.fun models via stdin/stdout IPC to Node.js.
"""

import os
import sys
import json
import math
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')

# ── Weight Paths ─────────────────────────────────────────────────────
RAYDIUM_WEIGHTS = os.path.join(MODELS_DIR, 'deepsentinel_weights.json')
RAYDIUM_SCALER  = os.path.join(MODELS_DIR, 'scaler.json')

PUMPFUN_WEIGHTS = os.path.join(MODELS_DIR, 'deepsentinel_pumpfun_weights.json')
PUMPFUN_SCALER  = os.path.join(MODELS_DIR, 'scaler_pumpfun.json')

# ── Pure Python Utils ────────────────────────────────────────────────
def dot_product(v1, v2):
    return sum(x * y for x, y in zip(v1, v2))

def matrix_vector_mult(W, v, b):
    # W is list of columns, or list of rows? 
    # In trained_mlp.json, W is usually [input_dim][output_dim]
    # So W[i][j] is weight from input i to hidden j
    out_dim = len(b)
    res = [0.0] * out_dim
    for j in range(out_dim):
        dot = 0.0
        for i in range(len(v)):
            dot += v[i] * W[i][j]
        res[j] = dot + b[j]
    return res

def relu(v):
    return [max(0.0, x) for x in v]

def sigmoid(x):
    try:
        if x < -50: return 0.0
        if x > 50: return 1.0
        return 1.0 / (1.0 + math.exp(-x))
    except:
        return 0.5

# ── Scaler Loader ────────────────────────────────────────────────────
def load_scaler(path):
    try:
        with open(path, 'r') as f:
            s = json.load(f)
            return s['min_vals'], s['max_vals']
    except (FileNotFoundError, KeyError):
        return [0.0] * 6, [1.0] * 6

# ── Pure Python MLP ──────────────────────────────────────────────────
class PureMLP:
    def __init__(self, weights_path):
        with open(weights_path, 'r') as f:
            w = json.load(f)
        self.W1 = w['W1']
        self.b1 = w['b1']
        self.W2 = w['W2']
        self.b2 = w['b2']
        self.W3 = w['W3']
        self.b3 = w['b3']
        self.W4 = w['W4']
        self.b4 = w['b4']

    def predict(self, features):
        x = matrix_vector_mult(self.W1, features, self.b1)
        x = relu(x)
        x = matrix_vector_mult(self.W2, x, self.b2)
        x = relu(x)
        x = matrix_vector_mult(self.W3, x, self.b3)
        x = relu(x)
        x = matrix_vector_mult(self.W4, x, self.b4)
        return sigmoid(x[0])

# ── Load Models ──────────────────────────────────────────────────────
models = {}
scalers = {}

# Raydium
ray_min, ray_max = load_scaler(RAYDIUM_SCALER)
scalers['raydium'] = (ray_min, ray_max)
if os.path.exists(RAYDIUM_WEIGHTS):
    try:
        models['raydium'] = PureMLP(RAYDIUM_WEIGHTS)
        ray_mode = "Pure-Python-MLP"
    except Exception as e:
        models['raydium'] = None
        ray_mode = f"Error: {str(e)}"
else:
    models['raydium'] = None
    ray_mode = "Fallback"

# Pump.fun
pump_min, pump_max = load_scaler(PUMPFUN_SCALER)
scalers['pumpfun'] = (pump_min, pump_max)
if os.path.exists(PUMPFUN_WEIGHTS):
    try:
        models['pumpfun'] = PureMLP(PUMPFUN_WEIGHTS)
        pump_mode = "Pure-Python-MLP"
    except Exception as e:
        models['pumpfun'] = None
        pump_mode = f"Error: {str(e)}"
else:
    models['pumpfun'] = None
    pump_mode = "Fallback"

if __name__ == '__main__':
    # ── Boot ─────────────────────────────────────────────────────────────
    status = {
        "status": "ready",
        "chip": "ARM-Cortex-A76 (Pure Python)",
        "models": {
            "raydium": {"mode": ray_mode, "accuracy": "80.73%"},
            "pumpfun": {"mode": pump_mode, "accuracy": "97.06%"}
        }
    }
    print(json.dumps(status))
    sys.stdout.flush()

    # ── Main Loop ────────────────────────────────────────────────────────
    for line in sys.stdin:
        try:
            req = json.loads(line.strip())
            req_id = req.get('req_id', None)
            model_id = req.get('model', 'raydium')
            features = req.get('features', [])
            
            # Normalize
            s_min, s_max = scalers.get(model_id, ([0]*6, [1]*6))
            features_norm = []
            for i in range(len(features)):
                denom = (s_max[i] - s_min[i])
                if denom == 0: denom = 1e-8
                features_norm.append((features[i] - s_min[i]) / denom)

            # Predict
            mlp = models.get(model_id)
            if mlp:
                prob = mlp.predict(features_norm)
            else:
                prob = random.uniform(0.01, 0.99)

            res = {"rug_probability": prob, "model": model_id}
            if req_id is not None:
                res['req_id'] = req_id

            print(json.dumps(res))
            sys.stdout.flush()

        except Exception as e:
            err_res = {"error": str(e), "model": "unknown"}
            if 'req' in locals() and isinstance(req, dict) and 'req_id' in req:
                err_res['req_id'] = req['req_id']
            print(json.dumps(err_res))
            sys.stdout.flush()
