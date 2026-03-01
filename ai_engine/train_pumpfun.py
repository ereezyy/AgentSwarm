"""
DeepSentinel Pump.fun Model — Phase 1+2
Downloads HuggingFace pump-fun-sentiment-100k dataset, transforms features, trains MLP.
Runs on Raspberry Pi 5 with pure NumPy (no TensorFlow needed).
"""

import os
import json
import numpy as np
import urllib.request
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pumpfun_data')
MODEL_OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MODEL_OUT_DIR, exist_ok=True)

# ── Phase 1: Download HuggingFace Dataset ────────────────────────────
print("🧠 [DEEPSENTINEL-PUMP]: Phase 1 - Downloading HuggingFace pump-fun-sentiment-100k...")

# Get file listing from HF API
api_url = "https://huggingface.co/api/datasets/Pumpdotstudio/pump-fun-sentiment-100k/tree/main/data"
req = urllib.request.Request(api_url, headers={'User-Agent': 'DeepSentinel/1.0'})
with urllib.request.urlopen(req, timeout=30) as resp:
    files = json.loads(resp.read().decode())

print(f"  Found {len(files)} JSONL files")

all_records = []
for finfo in files:
    fname = finfo['path'].split('/')[-1]
    download_url = f"https://huggingface.co/datasets/Pumpdotstudio/pump-fun-sentiment-100k/resolve/main/data/{fname}"
    local_path = os.path.join(DATA_DIR, fname)
    
    if not os.path.exists(local_path):
        try:
            req = urllib.request.Request(download_url, headers={'User-Agent': 'DeepSentinel/1.0'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                with open(local_path, 'wb') as f:
                    f.write(resp.read())
        except Exception as e:
            print(f"  ⚠️ Failed to download {fname}: {e}")
            continue
    
    # Parse JSONL
    with open(local_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    record = json.loads(line)
                    all_records.append(record)
                except:
                    pass

    print(f"  📄 {fname}: loaded ({len(all_records)} total so far)")

print(f"\n📊 Total records loaded: {len(all_records)}")

# ── Feature Engineering ──────────────────────────────────────────────
# Map HuggingFace schema to 6 features for the Pump.fun MLP:
#
# HuggingFace Field          → Our Feature
# ─────────────────────────────────────────
# buy_pressure               → Feature 1: Buy Pressure (0-100)
# volatility_score           → Feature 2: Volatility Score (0-100)  
# liquidity_depth            → Feature 3: Liquidity Depth (0-100)
# holder_concentration       → Feature 4: Holder Concentration (0-100)
# bonding_progress           → Feature 5: Bonding Curve Progress (0-100)
# volume_profile             → Feature 6: Volume Profile (0-100)
#
# Label: risk_level == 'critical' OR risk_factors contains 'rug_pattern'/'honeypot_risk' → 1 (rug)
#        risk_level == 'low' or 'medium' with no rug flags → 0 (safe)

print("⚙️ Engineering 6-feature tensor from Pump.fun token metadata...")

features = []
labels = []
skipped = 0

for rec in all_records:
    try:
        # Use the ACTUAL numeric fields from the HuggingFace schema
        buy_pressure = float(rec.get('buy_pressure', 0))       # 0-100 numeric
        volatility = float(rec.get('volatility_score', 0))      # 0-100 numeric
        score = float(rec.get('score', 50))                     # 0-100 confidence score
        bonding = float(rec.get('bonding_progress', 0))         # 0-100 percentage
        top10_pct = float(rec.get('top10_holder_pct', 50))      # 0-100 percentage
        market_cap = float(rec.get('market_cap', 0))            # raw USD value
        
        # Log-scale market_cap (power-law distributed, per user's optimization tip)
        market_cap_log = np.log1p(max(market_cap, 0))
        
        # Label construction
        risk_level = str(rec.get('risk_level', '')).lower()
        risk_factors = str(rec.get('risk_factors', '')).lower()
        
        is_rug = 0
        if risk_level == 'critical':
            is_rug = 1
        elif 'rug_pattern' in risk_factors:
            is_rug = 1
        elif 'honeypot_risk' in risk_factors:
            is_rug = 1
        elif 'rapid_sell_off' in risk_factors and 'creator_holds_majority' in risk_factors:
            is_rug = 1
        
        feat_vec = [buy_pressure, volatility, score, bonding, top10_pct, market_cap_log]
        if all(np.isfinite(feat_vec)):
            features.append(feat_vec)
            labels.append(is_rug)
        else:
            skipped += 1
    except:
        skipped += 1

X = np.array(features, dtype=np.float32)
y = np.array(labels, dtype=np.float32)

print(f"✅ Clean dataset: {len(X)} rows (skipped {skipped})")
print(f"   Rug/Scam: {int(y.sum())} | Safe: {int((y == 0).sum())}")

if len(X) < 10:
    print("❌ Not enough data to train. Check download.")
    import sys; sys.exit(1)

# ── Phase 2: Train Neural Network ───────────────────────────────────
print("\n🧠 [DEEPSENTINEL-PUMP]: Phase 2 - Training Pump.fun Neural Network...")

# Normalize (min-max)
x_min = X.min(axis=0)
x_max = X.max(axis=0)
X_norm = (X - x_min) / (x_max - x_min + 1e-8)

# Save scaler
scaler_data = {'min_vals': x_min.tolist(), 'max_vals': x_max.tolist()}
scaler_path = os.path.join(MODEL_OUT_DIR, 'scaler_pumpfun.json')
with open(scaler_path, 'w') as f:
    json.dump(scaler_data, f)
print(f"💾 Pump.fun Scaler saved to {scaler_path}")

# Train/test split
np.random.seed(42)
indices = np.random.permutation(len(X_norm))
split = int(0.8 * len(X_norm))
X_train, X_test = X_norm[indices[:split]], X_norm[indices[split:]]
y_train, y_test = y[indices[:split]], y[indices[split:]]

print(f"🔀 Train: {len(X_train)} | Test: {len(X_test)}")

# ── Tiny MLP in pure NumPy ──────────────────────────────────────────
class TinyMLP:
    def __init__(self):
        self.W1 = np.random.randn(6, 32).astype(np.float32) * np.sqrt(2.0/6)
        self.b1 = np.zeros(32, dtype=np.float32)
        self.W2 = np.random.randn(32, 16).astype(np.float32) * np.sqrt(2.0/32)
        self.b2 = np.zeros(16, dtype=np.float32)
        self.W3 = np.random.randn(16, 8).astype(np.float32) * np.sqrt(2.0/16)
        self.b3 = np.zeros(8, dtype=np.float32)
        self.W4 = np.random.randn(8, 1).astype(np.float32) * np.sqrt(2.0/8)
        self.b4 = np.zeros(1, dtype=np.float32)

    def relu(self, x): return np.maximum(0, x)
    def sigmoid(self, x): return 1 / (1 + np.exp(-np.clip(x, -500, 500)))

    def forward(self, X):
        self.z1 = X @ self.W1 + self.b1; self.a1 = self.relu(self.z1)
        self.z2 = self.a1 @ self.W2 + self.b2; self.a2 = self.relu(self.z2)
        self.z3 = self.a2 @ self.W3 + self.b3; self.a3 = self.relu(self.z3)
        self.z4 = self.a3 @ self.W4 + self.b4; self.a4 = self.sigmoid(self.z4)
        return self.a4
    
    def backward(self, X, y, lr=0.001):
        m = X.shape[0]; y = y.reshape(-1, 1)
        dz4 = self.a4 - y
        dW4 = (self.a3.T @ dz4) / m; db4 = dz4.sum(axis=0) / m
        dz3 = (dz4 @ self.W4.T) * (self.z3 > 0).astype(np.float32)
        dW3 = (self.a2.T @ dz3) / m; db3 = dz3.sum(axis=0) / m
        dz2 = (dz3 @ self.W3.T) * (self.z2 > 0).astype(np.float32)
        dW2 = (self.a1.T @ dz2) / m; db2 = dz2.sum(axis=0) / m
        dz1 = (dz2 @ self.W2.T) * (self.z1 > 0).astype(np.float32)
        dW1 = (X.T @ dz1) / m; db1 = dz1.sum(axis=0) / m
        self.W4 -= lr * dW4; self.b4 -= lr * db4
        self.W3 -= lr * dW3; self.b3 -= lr * db3
        self.W2 -= lr * dW2; self.b2 -= lr * db2
        self.W1 -= lr * dW1; self.b1 -= lr * db1
    
    def loss(self, y_pred, y_true):
        y_true = y_true.reshape(-1, 1); eps = 1e-7
        return -np.mean(y_true * np.log(y_pred + eps) + (1 - y_true) * np.log(1 - y_pred + eps))

model = TinyMLP()

print("🚀 Training DeepSentinel-Pump on real Pump.fun token data...")

# Class weighting for imbalanced data (per user's optimization tip)
rug_count = max(int(y_train.sum()), 1)
safe_count = max(len(y_train) - rug_count, 1)
rug_weight = len(y_train) / (2.0 * rug_count)
safe_weight = len(y_train) / (2.0 * safe_count)
print(f"   Class weights: Safe={safe_weight:.2f}, Rug={rug_weight:.2f}")

for epoch in range(80):
    batch_size = 64
    perm = np.random.permutation(len(X_train))
    epoch_loss = 0; n_batches = 0
    for i in range(0, len(X_train), batch_size):
        batch_idx = perm[i:i+batch_size]
        X_b = X_train[batch_idx]
        y_b = y_train[batch_idx]
        # Apply class weights to gradients
        sample_weights = np.where(y_b == 1, rug_weight, safe_weight)
        pred = model.forward(X_b)
        # Weighted backward (multiply gradients by sample weights)
        model.a4_weighted = model.a4 * 1  # save for loss
        y_reshaped = y_b.reshape(-1, 1)
        weighted_error = (model.a4 - y_reshaped) * sample_weights.reshape(-1, 1)
        # Manual weighted backward pass
        m = X_b.shape[0]
        dz4 = weighted_error
        dW4 = (model.a3.T @ dz4) / m; db4 = dz4.sum(axis=0) / m
        dz3 = (dz4 @ model.W4.T) * (model.z3 > 0).astype(np.float32)
        dW3 = (model.a2.T @ dz3) / m; db3 = dz3.sum(axis=0) / m
        dz2 = (dz3 @ model.W3.T) * (model.z2 > 0).astype(np.float32)
        dW2 = (model.a1.T @ dz2) / m; db2 = dz2.sum(axis=0) / m
        dz1 = (dz2 @ model.W2.T) * (model.z1 > 0).astype(np.float32)
        dW1 = (X_b.T @ dz1) / m; db1 = dz1.sum(axis=0) / m
        lr = 0.005
        model.W4 -= lr * dW4; model.b4 -= lr * db4
        model.W3 -= lr * dW3; model.b3 -= lr * db3
        model.W2 -= lr * dW2; model.b2 -= lr * db2
        model.W1 -= lr * dW1; model.b1 -= lr * db1
        epoch_loss += model.loss(pred, y_b); n_batches += 1
    if (epoch + 1) % 10 == 0:
        test_pred = model.forward(X_test)
        test_acc = ((test_pred.flatten() > 0.5) == y_test).mean()
        print(f"  Epoch {epoch+1}/80 | Loss: {epoch_loss/n_batches:.4f} | Test Acc: {test_acc*100:.2f}%")

test_pred = model.forward(X_test)
test_acc = ((test_pred.flatten() > 0.5) == y_test).mean()
print(f"\n🎯 Final Pump.fun Test Accuracy: {test_acc * 100:.2f}%")

# Save weights
weights = {
    'W1': model.W1.tolist(), 'b1': model.b1.tolist(),
    'W2': model.W2.tolist(), 'b2': model.b2.tolist(),
    'W3': model.W3.tolist(), 'b3': model.b3.tolist(),
    'W4': model.W4.tolist(), 'b4': model.b4.tolist(),
}
weights_path = os.path.join(MODEL_OUT_DIR, 'deepsentinel_pumpfun_weights.json')
with open(weights_path, 'w') as f:
    json.dump(weights, f)
print(f"💾 Pump.fun model weights saved to {weights_path}")
print(f"   Total parameters: {sum(np.prod(np.array(v).shape) for v in weights.values())}")
print("\n✅ Pump.fun Phase 1+2 Complete!")
