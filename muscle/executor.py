# muscle/executor.py - The Executioner (Zero-Dep Python Logic)
# Fetches Bonding Curve state and calculates Slippage-adjusted outputs.
# Used by sniper.js to prepare transactions.

import sys
import json
import base64
import struct
import urllib.request
import urllib.error

# --- Constants ---
PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"

class Executioner:
    def __init__(self, rpc_url):
        self.rpc_url = rpc_url

    def rpc_call(self, method, params):
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params
        }
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            self.rpc_url, 
            data=data, 
            headers={'Content-Type': 'application/json'}
        )
        try:
            with urllib.request.urlopen(req) as response:
                return json.load(response)
        except Exception as e:
            return {"error": str(e)}

    # PDA Derivation (Manual implementation of FindProgramAddress for bonding-curve)
    # Note: Creating a proper PDA in pure Python without `solders` is hard because of sha256 and off-curve checks.
    # However, for `bonding-curve`, the seeds are specific.
    # We might need to ask the Node process to provide the PDA if we can't derive it easily.
    # OR we use a public API to fetch it? No.
    # Actually, we can implement basic seeds hashing if we have hashlib.
    # But FindProgramAddress requires an iterative checks for off-curve.
    
    # STRATEGY CHANGE: The Node.js process HAS @solana/web3.js. 
    # It can pass the BondingCurve PDA to this script.
    
    def fetch_curve(self, bonding_curve_pda):
        resp = self.rpc_call("getAccountInfo", [bonding_curve_pda, {"encoding": "base64"}])
        
        if "result" not in resp or not resp["result"]["value"]:
            return {"error": "Account not found"}
            
        data_b64 = resp["result"]["value"]["data"][0]
        data = base64.b64decode(data_b64)
        
        # Parse Layout (V2 - 81 bytes, V1 - 49 bytes)
        # Discriminator (8)
        # virtual_token_reserves (8)
        # virtual_sol_reserves (8)
        # real_token_reserves (8)
        # real_sol_reserves (8)
        # token_total_supply (8)
        # complete (1)
        
        try:
            # Struct format: < (little endian) Q (u64) * 6, ? (bool)
            # 8 + 8*5 + 1 = 49 bytes.
            # V2 has discriminator + 5 u64 + 1 bool + 32 bytes (creator) = 81 bytes?
            # Let's unpack the first 49 bytes after discriminator.
            
            offset = 8
            # Unpack 5 Qs (40 bytes)
            fields = struct.unpack('<QQQQQ', data[offset:offset+40])
            
            complete = bool(data[offset+40])
            
            return {
                "virtual_token_reserves": fields[0],
                "virtual_sol_reserves": fields[1],
                "real_token_reserves": fields[2],
                "real_sol_reserves": fields[3],
                "token_total_supply": fields[4],
                "complete": complete
            }
        except Exception as e:
            return {"error": f"Parse failure: {str(e)}"}

    def calculate_buy(self, curve, sol_amount_lamports, slippage_bps):
        v_sol = curve["virtual_sol_reserves"]
        v_token = curve["virtual_token_reserves"]
        
        # Calculate amount out
        # k = v_sol * v_token
        # new_v_sol = v_sol + sol_amount_lamports
        # new_v_token = k // new_v_sol
        # tokens_out = v_token - new_v_token
        
        # Formula from OpenSolBot / Pump.fun SDK
        k = v_sol * v_token
        new_v_sol = v_sol + sol_amount_lamports
        new_v_token = int(k / new_v_sol) + 1 # Rounding adjustment? Standard is floor usually, but check implementation.
        # Python // is floor.
        
        tokens_out = v_token - new_v_token
        
        # Min out (Slippage)
        min_out = int(tokens_out * (1 - slippage_bps/10000))
        
        return {
             "tokens_out": tokens_out,
             "min_tokens_out": min_out,
             "virtual_sol_reserves": v_sol,
             "virtual_token_reserves": v_token
        }

if __name__ == "__main__":
    # Usage: python executor.py <RPC_URL> <PDA_ADDRESS> <SOL_AMOUNT> <SLIPPAGE_BPS>
    try:
        if len(sys.argv) < 5:
            print(json.dumps({"error": "Missing args"}))
            sys.exit(1)
            
        rpc_url = sys.argv[1]
        pda = sys.argv[2]
        amount = int(float(sys.argv[3]) * 1e9) # Convert SOL to lamports
        slippage = int(sys.argv[4])
        
        exe = Executioner(rpc_url)
        curve = exe.fetch_curve(pda)
        
        if "error" in curve:
            print(json.dumps(curve))
            sys.exit(1)
            
        result = exe.calculate_buy(curve, amount, slippage)
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
