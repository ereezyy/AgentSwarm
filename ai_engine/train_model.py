"""
DeepSentinel Phase 1+2: Data Transformation & Model Training
Uses the real SolRPDS dataset (62,895+ labeled Solana rug-pull pools) from DeFiLabX.
Runs on Raspberry Pi 5 (Python 3.11 + NumPy) — no TensorFlow needed.
Uses scikit-learn MLPClassifier for training and skl2onnx for ONNX export.
"""

import os
import json
import numpy as np
import sys

# ── Phase 1: Load & Transform SolRPDS Data ──────────────────────────

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dataset')
MODEL_OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
os.makedirs(MODEL_OUT_DIR, exist_ok=True)

print("🧠 [DEEPSENTINEL]: Phase 1 - Loading SolRPDS Real Dataset...")

# Manual CSV parsing with just numpy (no pandas dependency needed)
def load_csv(filepath):
    """Load CSV file returning headers and data as numpy-friendly structure."""
    rows = []
    with open(filepath, 'r', encoding='utf-8') as f:
        headers = f.readline().strip().split(',')
        for line in f:
            rows.append(line.strip().split(','))
    return headers, rows

csv_files = ['2021.csv', '2022.csv', '2023.csv', 'Jan_2024-Nov_2024.csv']
all_rows = []
headers = None

for fname in csv_files:
    fpath = os.path.join(DATA_DIR, fname)
    if os.path.exists(fpath):
        h, rows = load_csv(fpath)
        if headers is None:
            headers = h
        all_rows.extend(rows)
        print(f"  📄 Loaded {fname}: {len(rows)} rows")
    else:
        print(f"  ⚠️ Missing: {fpath}")

print(f"\n📊 Total raw pools loaded: {len(all_rows)}")

# Map column names to indices
col_idx = {name: i for i, name in enumerate(headers)}

# ── Feature Engineering ──────────────────────────────────────────────
print("⚙️ Engineering 6-feature tensor from raw liquidity pool metadata...")

from datetime import datetime

features = []
labels = []
skipped = 0

for row in all_rows:
    try:
        # Feature 1: Pool lifespan in days
        first_ts = row[col_idx['FIRST_POOL_ACTIVITY_TIMESTAMP']].strip()
        last_ts = row[col_idx['LAST_POOL_ACTIVITY_TIMESTAMP']].strip()
        t1 = datetime.strptime(first_ts[:19], '%Y-%m-%d %H:%M:%S')
        t2 = datetime.strptime(last_ts[:19], '%Y-%m-%d %H:%M:%S')
        pool_lifespan = max((t2 - t1).total_seconds() / (60*60*24), 0)

        # Feature 2: Total added liquidity
        total_added = float(row[col_idx['TOTAL_ADDED_LIQUIDITY']])

        # Feature 3: Initial liquidity estimate
        num_adds = max(float(row[col_idx['NUM_LIQUIDITY_ADDS']]), 1)
        initial_liq = total_added / num_adds

        # Feature 4: Number of liquidity adds
        # Already computed as num_adds

        # Feature 5: Add to remove ratio
        add_remove_ratio = float(row[col_idx['ADD_TO_REMOVE_RATIO']])

        # Feature 6: Total removed liquidity
        total_removed = float(row[col_idx['TOTAL_REMOVED_LIQUIDITY']])

        # Label
        status = row[col_idx['INACTIVITY_STATUS']].strip().lower()
        label = 1 if status == 'inactive' else 0

        # Sanity check
        if np.isfinite(pool_lifespan) and np.isfinite(total_added) and np.isfinite(add_remove_ratio):
            features.append([pool_lifespan, total_added, initial_liq, num_adds, add_remove_ratio, total_removed])
            labels.append(label)
        else:
            skipped += 1
    except Exception:
        skipped += 1

X = np.array(features, dtype=np.float32)
y = np.array(labels, dtype=np.float32)

print(f"✅ Clean dataset: {len(X)} rows (skipped {skipped})")
print(f"   Rug (Inactive): {int(y.sum())} | Safe (Active): {int((y == 0).sum())}")

# ── Phase 2: Train Neural Network ───────────────────────────────────
print("\n🧠 [DEEPSENTINEL]: Phase 2 - Training Neural Network...")

# Normalize (min-max)
x_min = X.min(axis=0)
x_max = X.max(axis=0)
X_norm = (X - x_min) / (x_max - x_min + 1e-8)

# Save scaler
scaler_data = {'min_vals': x_min.tolist(), 'max_vals': x_max.tolist()}
scaler_path = os.path.join(MODEL_OUT_DIR, 'scaler.json')
with open(scaler_path, 'w') as f:
    json.dump(scaler_data, f)
print(f"💾 Scaler saved to {scaler_path}")

# Train/test split (manual, no sklearn needed)
np.random.seed(42)
indices = np.random.permutation(len(X_norm))
split = int(0.8 * len(X_norm))
X_train, X_test = X_norm[indices[:split]], X_norm[indices[split:]]
y_train, y_test = y[indices[:split]], y[indices[split:]]

print(f"🔀 Train: {len(X_train)} | Test: {len(X_test)}")

# ── Tiny MLP in pure NumPy ──────────────────────────────────────────
# Architecture: 6 → 32 → 16 → 8 → 1

class TinyMLP:
    def __init__(self):
        # Xavier init
        self.W1 = np.random.randn(6, 32).astype(np.float32) * np.sqrt(2.0/6)
        self.b1 = np.zeros(32, dtype=np.float32)
        self.W2 = np.random.randn(32, 16).astype(np.float32) * np.sqrt(2.0/32)
        self.b2 = np.zeros(16, dtype=np.float32)
        self.W3 = np.random.randn(16, 8).astype(np.float32) * np.sqrt(2.0/16)
        self.b3 = np.zeros(8, dtype=np.float32)
        self.W4 = np.random.randn(8, 1).astype(np.float32) * np.sqrt(2.0/8)
        self.b4 = np.zeros(1, dtype=np.float32)

    def relu(self, x):
        return np.maximum(0, x)
    
    def sigmoid(self, x):
        return 1 / (1 + np.exp(-np.clip(x, -500, 500)))

    def forward(self, X):
        self.z1 = X @ self.W1 + self.b1
        self.a1 = self.relu(self.z1)
        self.z2 = self.a1 @ self.W2 + self.b2
        self.a2 = self.relu(self.z2)
        self.z3 = self.a2 @ self.W3 + self.b3
        self.a3 = self.relu(self.z3)
        self.z4 = self.a3 @ self.W4 + self.b4
        self.a4 = self.sigmoid(self.z4)
        return self.a4
    
    def backward(self, X, y, lr=0.001):
        m = X.shape[0]
        y = y.reshape(-1, 1)
        
        # Output layer
        dz4 = self.a4 - y
        dW4 = (self.a3.T @ dz4) / m
        db4 = dz4.sum(axis=0) / m
        
        # Hidden 3
        dz3 = (dz4 @ self.W4.T) * (self.z3 > 0).astype(np.float32)
        dW3 = (self.a2.T @ dz3) / m
        db3 = dz3.sum(axis=0) / m
        
        # Hidden 2
        dz2 = (dz3 @ self.W3.T) * (self.z2 > 0).astype(np.float32)
        dW2 = (self.a1.T @ dz2) / m
        db2 = dz2.sum(axis=0) / m
        
        # Hidden 1
        dz1 = (dz2 @ self.W2.T) * (self.z1 > 0).astype(np.float32)
        dW1 = (X.T @ dz1) / m
        db1 = dz1.sum(axis=0) / m
        
        # Update
        self.W4 -= lr * dW4; self.b4 -= lr * db4
        self.W3 -= lr * dW3; self.b3 -= lr * db3
        self.W2 -= lr * dW2; self.b2 -= lr * db2
        self.W1 -= lr * dW1; self.b1 -= lr * db1
    
    def loss(self, y_pred, y_true):
        y_true = y_true.reshape(-1, 1)
        eps = 1e-7
        return -np.mean(y_true * np.log(y_pred + eps) + (1 - y_true) * np.log(1 - y_pred + eps))

model = TinyMLP()

print("🚀 Training DeepSentinel on real Solana rug-pull data...")
for epoch in range(50):
    # Mini-batch SGD
    batch_size = 128
    perm = np.random.permutation(len(X_train))
    epoch_loss = 0
    n_batches = 0
    
    for i in range(0, len(X_train), batch_size):
        batch_idx = perm[i:i+batch_size]
        X_batch = X_train[batch_idx]
        y_batch = y_train[batch_idx]
        
        pred = model.forward(X_batch)
        model.backward(X_batch, y_batch, lr=0.01)
        epoch_loss += model.loss(pred, y_batch)
        n_batches += 1
    
    if not (epoch + 1) % 5:
        # Test accuracy
        test_pred = model.forward(X_test)
        test_acc = ((test_pred.flatten() > 0.5) == y_test).mean()
        print(f"  Epoch {epoch+1}/50 | Loss: {epoch_loss/n_batches:.4f} | Test Acc: {test_acc*100:.2f}%")

# Final evaluation
test_pred = model.forward(X_test)
test_acc = ((test_pred.flatten() > 0.5) == y_test).mean()
print(f"\n🎯 Final Test Accuracy: {test_acc * 100:.2f}%")

# ── Save weights as JSON (for the inference_server.py to load) ──────
weights = {
    'W1': model.W1.tolist(), 'b1': model.b1.tolist(),
    'W2': model.W2.tolist(), 'b2': model.b2.tolist(),
    'W3': model.W3.tolist(), 'b3': model.b3.tolist(),
    'W4': model.W4.tolist(), 'b4': model.b4.tolist(),
}
weights_path = os.path.join(MODEL_OUT_DIR, 'deepsentinel_weights.json')
with open(weights_path, 'w') as f:
    json.dump(weights, f)
print(f"💾 Model weights saved to {weights_path}")
print(f"   Total parameters: {sum(np.prod(v.shape) for v in [model.W1, model.b1, model.W2, model.b2, model.W3, model.b3, model.W4, model.b4])}")

# Try ONNX export if available
try:
    import onnx
    from onnx import helper, TensorProto, numpy_helper
    
    # Build ONNX graph manually from our weights
    initializers = [
        numpy_helper.from_array(model.W1, "W1"),
        numpy_helper.from_array(model.b1.reshape(1, -1), "b1"),
        numpy_helper.from_array(model.W2, "W2"),
        numpy_helper.from_array(model.b2.reshape(1, -1), "b2"),
        numpy_helper.from_array(model.W3, "W3"),
        numpy_helper.from_array(model.b3.reshape(1, -1), "b3"),
        numpy_helper.from_array(model.W4, "W4"),
        numpy_helper.from_array(model.b4.reshape(1, -1), "b4"),
    ]
    
    X_input = helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, 6])
    Y_output = helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, 1])
    
    nodes = [
        helper.make_node("MatMul", ["input", "W1"], ["mm1"]),
        helper.make_node("Add", ["mm1", "b1"], ["add1"]),
        helper.make_node("Relu", ["add1"], ["relu1"]),
        helper.make_node("MatMul", ["relu1", "W2"], ["mm2"]),
        helper.make_node("Add", ["mm2", "b2"], ["add2"]),
        helper.make_node("Relu", ["add2"], ["relu2"]),
        helper.make_node("MatMul", ["relu2", "W3"], ["mm3"]),
        helper.make_node("Add", ["mm3", "b3"], ["add3"]),
        helper.make_node("Relu", ["add3"], ["relu3"]),
        helper.make_node("MatMul", ["relu3", "W4"], ["mm4"]),
        helper.make_node("Add", ["mm4", "b4"], ["add4"]),
        helper.make_node("Sigmoid", ["add4"], ["output"]),
    ]
    
    graph = helper.make_graph(nodes, "deepsentinel", [X_input], [Y_output], initializer=initializers)
    onnx_model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    
    onnx_path = os.path.join(MODEL_OUT_DIR, "deepsentinel_mlp.onnx")
    onnx.save(onnx_model, onnx_path)
    print(f"✅ ONNX model saved to {onnx_path} ({os.path.getsize(onnx_path)} bytes)")
    print("\n   Phase 3 (on x86 Ubuntu):")
    print("     hailo parser onnx deepsentinel_mlp.onnx --hw-arch hailo8l")
    print("     hailo optimize deepsentinel_mlp.har --use-random-calib-set --calib-set-size 1024")
    print("     hailo compiler deepsentinel_mlp_optimized.har --hw-arch hailo8l")
except ImportError:
    print("⚠️ ONNX library not available. Weights saved as JSON for inference_server.py to load directly.")
    print("   Install onnx on an x86 machine if you need the .onnx export for Hailo DFC compilation.")

print("\n✅ Phase 1+2 Complete!")
