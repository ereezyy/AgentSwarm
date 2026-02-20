import sys
import struct
import json

# Pump.fun 'create' instruction layout
# discriminator: [u8; 8]
# name: string
# symbol: string
# uri: string

def serialize_string(s):
    b = s.encode('utf-8')
    return struct.pack('<I', len(b)) + b

def build_create_instruction(name, symbol, uri):
    # Discriminator for 'create' (from IDL or reversed)
    # 18 1e 2c 0e 17 06 19 09
    discriminator = bytes([0x18, 0x1e, 0x2c, 0x0e, 0x17, 0x06, 0x19, 0x09])
    
    data = discriminator
    data += serialize_string(name)
    data += serialize_string(symbol)
    data += serialize_string(uri)
    
    return data.hex()

def build_sell_instruction(amount, min_sol_output):
    # Discriminator for 'sell' (from IDL or reversed)
    # 33 e6 85 a4 01 7f 83 ad
    discriminator = bytes([0x33, 0xe6, 0x85, 0xa4, 0x01, 0x7f, 0x83, 0xad])
    
    data = discriminator
    data += struct.pack('<Q', int(amount))
    data += struct.pack('<Q', int(min_sol_output))
    
    return data.hex()

def build_buy_instruction(amount, max_sol_cost):
    # Discriminator for 'buy' (global:buy)
    # 66 06 3d 12 01 da eb ea
    discriminator = bytes([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea])
    
    data = discriminator
    data += struct.pack('<Q', int(amount))
    data += struct.pack('<Q', int(max_sol_cost))
    
    return data.hex()

if __name__ == "__main__":
    try:
        command = sys.argv[1]
        
        if command == "create":
            name = sys.argv[2]
            symbol = sys.argv[3]
            uri = sys.argv[4]
            hex_data = build_create_instruction(name, symbol, uri)
            print(json.dumps({"data": hex_data}))
            
        elif command == "sell":
            amount = sys.argv[2]
            min_sol_output = sys.argv[3]
            hex_data = build_sell_instruction(amount, min_sol_output)
            print(json.dumps({"data": hex_data}))

        elif command == "buy":
            amount = sys.argv[2]
            max_sol_cost = sys.argv[3]
            hex_data = build_buy_instruction(amount, max_sol_cost)
            print(json.dumps({"data": hex_data}))
            
    except Exception as e:
        print(json.dumps({"error": str(e)}))
