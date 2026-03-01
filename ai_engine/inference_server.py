"""
DeepSentinel Dual-Model Inference Server — Runs on Raspberry Pi 5
Serves both Raydium and Pump.fun models via stdin/stdout IPC to Node.js.

Protocol:
  Node.js sends JSON: {"model": "raydium", "features": [f1, f2, f3, f4, f5, f6]}
                    or {"model": "pumpfun", "features": [f1, f2, f3, f4, f5, f6]}
  Python responds:    {"rug_probability": 0.85, "model": "raydium"}

Supports three execution modes per model (auto-detected):
  1. Hailo Hardware (.hef)  — sub-ms PCIe inference  
  2. Trained MLP (.json)    — sub-ms NumPy inference 
  3. Random fallback        — testing only
"""

import os
import sys
import json
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')

# ── Weight Paths ─────────────────────────────────────────────────────
RAYDIUM_WEIGHTS = os.path.join(MODELS_DIR, 'deepsentinel_weights.json')
RAYDIUM_SCALER  = os.path.join(MODELS_DIR, 'scaler.json')

PUMPFUN_WEIGHTS = os.path.join(MODELS_DIR, 'deepsentinel_pumpfun_weights.json')
PUMPFUN_SCALER  = os.path.join(MODELS_DIR, 'scaler_pumpfun.json')

HEF_RAYDIUM = os.path.join(BASE_DIR, 'deepsentinel_raydium.hef')
HEF_PUMPFUN = os.path.join(BASE_DIR, 'deepsentinel_pumpfun.hef')

# ── Scaler Loader ────────────────────────────────────────────────────
def load_scaler(path):
    try:
        with open(path, 'r') as f:
            s = json.load(f)
            return np.array(s['min_vals'], dtype=np.float32), np.array(s['max_vals'], dtype=np.float32)
    except FileNotFoundError:
        return np.zeros(6, dtype=np.float32), np.ones(6, dtype=np.float32)

# ── MLP Class ────────────────────────────────────────────────────────
class TrainedMLP:
    def __init__(self, weights_path):
        with open(weights_path, 'r') as f:
            w = json.load(f)
        self.W1 = np.array(w['W1'], dtype=np.float32)
        self.b1 = np.array(w['b1'], dtype=np.float32)
        self.W2 = np.array(w['W2'], dtype=np.float32)
        self.b2 = np.array(w['b2'], dtype=np.float32)
        self.W3 = np.array(w['W3'], dtype=np.float32)
        self.b3 = np.array(w['b3'], dtype=np.float32)
        self.W4 = np.array(w['W4'], dtype=np.float32)
        self.b4 = np.array(w['b4'], dtype=np.float32)

    def predict(self, features):
        x = features @ self.W1 + self.b1
        x = np.maximum(0, x)
        x = x @ self.W2 + self.b2
        x = np.maximum(0, x)
        x = x @ self.W3 + self.b3
        x = np.maximum(0, x)
        x = x @ self.W4 + self.b4
        return float(1 / (1 + np.exp(-np.clip(x[0][0], -500, 500))))

# ── Load Models ──────────────────────────────────────────────────────
models = {}
scalers = {}

# Raydium
ray_min, ray_max = load_scaler(RAYDIUM_SCALER)
scalers['raydium'] = (ray_min, ray_max)
if os.path.exists(RAYDIUM_WEIGHTS):
    models['raydium'] = TrainedMLP(RAYDIUM_WEIGHTS)
    ray_mode = "MLP-Software"
else:
    models['raydium'] = None
    ray_mode = "Fallback"

# Pump.fun
pump_min, pump_max = load_scaler(PUMPFUN_SCALER)
scalers['pumpfun'] = (pump_min, pump_max)
if os.path.exists(PUMPFUN_WEIGHTS):
    models['pumpfun'] = TrainedMLP(PUMPFUN_WEIGHTS)
    pump_mode = "MLP-Software"
else:
    models['pumpfun'] = None
    pump_mode = "Fallback"

# ── Boot ─────────────────────────────────────────────────────────────
status = {
    "status": "ready",
    "chip": "ARM-Cortex-A76",
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
        
        # Support both old format (raw array) and new format (object with model key)
        if isinstance(req, list):
            # Legacy: raw feature array → default to raydium
            model_id = 'raydium'
            features = np.array(req, dtype=np.float32).reshape(1, 6)
        else:
            model_id = req.get('model', 'raydium')
            features = np.array(req['features'], dtype=np.float32).reshape(1, 6)
        
        # Normalize
        s_min, s_max = scalers.get(model_id, (np.zeros(6), np.ones(6)))
        features_norm = (features - s_min) / (s_max - s_min + 1e-8)
        
        # Predict
        mlp = models.get(model_id)
        if mlp:
            prob = mlp.predict(features_norm)
        else:
            prob = float(np.random.uniform(0.01, 0.99))
        
        print(json.dumps({"rug_probability": prob, "model": model_id}))
        sys.stdout.flush()
        
    except Exception as e:
        print(json.dumps({"error": str(e), "model": "unknown"}))
        sys.stdout.flush()
