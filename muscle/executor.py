import sys
import json
import struct
import base64
from typing import Final
from construct import Bytes, Flag, Int64ul, Struct
from solders.pubkey import Pubkey
from solders.keypair import Keypair
from solders.transaction import VersionedTransaction
from solders.message import MessageV0
from solders.instruction import Instruction, AccountMeta
from solana.rpc.api import Client

# Constants (Matched from open-sol-bot / libs/common/solbot_common/constants.py)
PUMP_FUN_PROGRAM = Pubkey.from_string("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
PUMP_GLOBAL_ACCOUNT = Pubkey.from_string("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf")
PUMP_FUN_ACCOUNT = Pubkey.from_string("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1") # Event Authority
SYSTEM_PROGRAM_ID = Pubkey.from_string("11111111111111111111111111111111")
TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ASSOC_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
RENT_PROGRAM_ID = Pubkey.from_string("SysvarRent111111111111111111111111111111111")
WSOL_MINT = Pubkey.from_string("So11111111111111111111111111111111111111112")

# Layouts
BONDING_CURVE_DISCRIMINATOR: Final[bytes] = struct.pack("<Q", 6966180631402821399)
BONDING_CURVE_LAYOUT_V1 = Struct(
    "virtual_token_reserves" / Int64ul,
    "virtual_sol_reserves" / Int64ul,
    "real_token_reserves" / Int64ul,
    "real_sol_reserves" / Int64ul,
    "token_total_supply" / Int64ul,
    "complete" / Flag
)
BONDING_CURVE_LAYOUT_V2 = Struct(
    "virtual_token_reserves" / Int64ul,
    "virtual_sol_reserves" / Int64ul,
    "real_token_reserves" / Int64ul,
    "real_sol_reserves" / Int64ul,
    "token_total_supply" / Int64ul,
    "complete" / Flag,
    "creator" / Bytes(32)
)

# Instruction Discriminators (Anchor style)
# buy: sha256("global:buy")[:8] -> [102, 6, 61, 18, 1, 218, 235, 234] -> 16927863322537952870 (from constants.py)
BUY_METHOD = struct.pack("<Q", 16927863322537952870)
# sell: sha256("global:sell")[:8] -> [51, 225, 19, 101, 240, 246, 201, 173] -> 12502976635542562355 (from constants.py)
SELL_METHOD = struct.pack("<Q", 12502976635542562355)

class Executor:
    def __init__(self, rpc_url: str):
        self.client = Client(rpc_url)

    def get_bonding_curve_pda(self, mint: Pubkey):
        seeds = [b"bonding-curve", bytes(mint)]
        pda, _ = Pubkey.find_program_address(seeds, PUMP_FUN_PROGRAM)
        return pda

    def get_associated_bonding_curve(self, mint: Pubkey, bonding_curve: Pubkey):
        seeds = [bytes(bonding_curve), bytes(TOKEN_PROGRAM_ID), bytes(mint)]
        pda, _ = Pubkey.find_program_address(seeds, ASSOC_TOKEN_PROGRAM_ID)
        return pda

    def get_bonding_curve_data(self, mint: Pubkey):
        pda = self.get_bonding_curve_pda(mint)
        res = self.client.get_account_info(pda)
        if not res.value:
            return None
        
        data = res.value.data
        if data[:8] != BONDING_CURVE_DISCRIMINATOR:
            return None
        
        if len(data) == 49:
            return BONDING_CURVE_LAYOUT_V1.parse(data[8:])
        else:
            return BONDING_CURVE_LAYOUT_V2.parse(data[8:])

    def build_buy_tx(self, keypair: Keypair, mint_str: str, sol_amount: float, slippage: float):
        mint = Pubkey.from_string(mint_str)
        curve_data = self.get_bonding_curve_data(mint)
        if not curve_data:
            return {"success": False, "error": "Bonding curve not found"}

        sol_lamports = int(sol_amount * 1e9)
        # Price: virtual_sol / virtual_token
        # buy_amount = sol_lamports * virtual_token / virtual_sol
        buy_amount = (sol_lamports * curve_data.virtual_token_reserves) // curve_data.virtual_sol_reserves
        # Threshold: sol_lamports * (1 + slippage)
        max_sol = int(sol_lamports * (1 + slippage))

        bonding_curve = self.get_bonding_curve_pda(mint)
        associated_bonding_curve = self.get_associated_bonding_curve(mint, bonding_curve)
        
        # ATA for user
        user_ata, _ = Pubkey.find_program_address(
            [bytes(keypair.pubkey()), bytes(TOKEN_PROGRAM_ID), bytes(mint)],
            ASSOC_TOKEN_PROGRAM_ID
        )

        # Build Data: [BUY_METHOD (8), token_amount (8), max_sol (8)]
        data = BUY_METHOD + struct.pack("<QQ", buy_amount, max_sol)

        # Build Instruction
        keys = [
            AccountMeta(PUMP_GLOBAL_ACCOUNT, is_signer=False, is_writable=False),
            AccountMeta(Pubkey.from_string("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"), is_signer=False, is_writable=True), # Fee Recipient
            AccountMeta(mint, is_signer=False, is_writable=False),
            AccountMeta(bonding_curve, is_signer=False, is_writable=True),
            AccountMeta(associated_bonding_curve, is_signer=False, is_writable=True),
            AccountMeta(user_ata, is_signer=False, is_writable=True),
            AccountMeta(keypair.pubkey(), is_signer=True, is_writable=True),
            AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(TOKEN_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(RENT_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(PUMP_FUN_ACCOUNT, is_signer=False, is_writable=False),
            AccountMeta(PUMP_FUN_PROGRAM, is_signer=False, is_writable=False),
        ]
        
        ix = Instruction(PUMP_FUN_PROGRAM, data, keys)
        return self.create_and_sign_tx(keypair, [ix])

    def build_sell_tx(self, keypair: Keypair, mint_str: str, token_amount: int, slippage: float):
        mint = Pubkey.from_string(mint_str)
        curve_data = self.get_bonding_curve_data(mint)
        if not curve_data:
            return {"success": False, "error": "Bonding curve not found"}

        # Price: virtual_sol / virtual_token
        sol_output = (token_amount * curve_data.virtual_sol_reserves) // curve_data.virtual_token_reserves
        # Threshold: sol_output * (1 - slippage)
        min_sol = int(sol_output * (1 - slippage))

        bonding_curve = self.get_bonding_curve_pda(mint)
        associated_bonding_curve = self.get_associated_bonding_curve(mint, bonding_curve)
        
        # ATA for user
        user_ata, _ = Pubkey.find_program_address(
            [bytes(keypair.pubkey()), bytes(TOKEN_PROGRAM_ID), bytes(mint)],
            ASSOC_TOKEN_PROGRAM_ID
        )

        # Build Data: [SELL_METHOD (8), token_amount (8), min_sol (8)]
        data = SELL_METHOD + struct.pack("<QQ", token_amount, min_sol)

        # Build Instruction
        keys = [
            AccountMeta(PUMP_GLOBAL_ACCOUNT, is_signer=False, is_writable=False),
            AccountMeta(Pubkey.from_string("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"), is_signer=False, is_writable=True), # Fee Recipient
            AccountMeta(mint, is_signer=False, is_writable=False),
            AccountMeta(bonding_curve, is_signer=False, is_writable=True),
            AccountMeta(associated_bonding_curve, is_signer=False, is_writable=True),
            AccountMeta(user_ata, is_signer=False, is_writable=True),
            AccountMeta(keypair.pubkey(), is_signer=True, is_writable=True),
            AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(TOKEN_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(PUMP_FUN_ACCOUNT, is_signer=False, is_writable=False),
            AccountMeta(PUMP_FUN_PROGRAM, is_signer=False, is_writable=False),
        ]
        
        ix = Instruction(PUMP_FUN_PROGRAM, data, keys)
        return self.create_and_sign_tx(keypair, [ix])

    def create_and_sign_tx(self, keypair: Keypair, instructions: list):
        recent_blockhash = self.client.get_latest_blockhash().value.blockhash
        msg = MessageV0.try_compile(
            payer=keypair.pubkey(),
            instructions=instructions,
            address_lookup_table_accounts=[],
            recent_blockhash=recent_blockhash
        )
        tx = VersionedTransaction(msg, [keypair])
        return {"success": True, "tx": base64.b64encode(bytes(tx)).decode('utf-8')}

def main():
    input_data = sys.stdin.read()
    if not input_data:
        return
    
    try:
        params = json.loads(input_data)
        command = params.get("command")
        rpc_url = params.get("rpcUrl", "https://api.mainnet-beta.solana.com")
        executor = Executor(rpc_url)

        if command == "get_price":
            mint = Pubkey.from_string(params.get("mint"))
            data = executor.get_bonding_curve_data(mint)
            if data:
                # Convert to dict for JSON output
                output = {
                    "virtual_token_reserves": str(data.virtual_token_reserves),
                    "virtual_sol_reserves": str(data.virtual_sol_reserves),
                    "complete": data.complete
                }
                print(json.dumps({"success": True, "data": output}))
            else:
                print(json.dumps({"success": False, "error": "Curve not found"}))

        elif command == "buy":
            pk_bytes = base64.b64decode(params.get("privateKey"))
            keypair = Keypair.from_bytes(pk_bytes)
            res = executor.build_buy_tx(
                keypair, 
                params.get("mint"), 
                params.get("amount"), 
                params.get("slippage", 0.1)
            )
            print(json.dumps(res))

        elif command == "sell":
            pk_bytes = base64.b64decode(params.get("privateKey"))
            keypair = Keypair.from_bytes(pk_bytes)
            res = executor.build_sell_tx(
                keypair, 
                params.get("mint"), 
                int(params.get("amount")), 
                params.get("slippage", 0.1)
            )
            print(json.dumps(res))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    main()
