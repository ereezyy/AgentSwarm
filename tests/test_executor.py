import sys
import os
import unittest
from unittest.mock import MagicMock, patch

sys.path.append(os.path.abspath('muscle'))
from executor import Executor

from solders.pubkey import Pubkey
from solders.keypair import Keypair
from solana.rpc.api import Client
import struct

class TestExecutor(unittest.TestCase):
    def setUp(self):
        # We mock the client to avoid hitting actual endpoints during tests
        with patch('solana.rpc.api.Client') as MockClient:
            self.mock_client = MockClient.return_value
            self.executor = Executor("mock_rpc_url")

    def test_build_buy_tx(self):
        # Setup mock bonding curve data
        mock_curve_data = MagicMock()
        mock_curve_data.virtual_token_reserves = 1000  # 1,000 tokens
        mock_curve_data.virtual_sol_reserves = 500     # 500 SOL

        self.executor.get_bonding_curve_data = MagicMock(return_value=mock_curve_data)

        # We need a Keypair and a random mint
        test_keypair = Keypair()
        test_mint = Pubkey.from_string("So11111111111111111111111111111111111111112")

        sol_amount = 2.0  # 2 SOL -> 2,000,000,000 lamports
        slippage = 0.1

        # Expected calculation:
        # sol_lamports = 2000000000
        # buy_amount = (2000000000 * 1000) // 500 = 4000000000
        # max_sol = int(2000000000 * (1 + 0.1)) = 2200000000
        expected_buy_amount = 4000000000
        expected_max_sol = 2200000000

        # Mock recent blockhash to avoid failure in create_and_sign_tx
        mock_recent_blockhash_res = MagicMock()
        mock_recent_blockhash_res.value.blockhash = __import__('solders.hash', fromlist=['Hash']).Hash.default()
        self.executor.client.get_latest_blockhash = MagicMock(return_value=mock_recent_blockhash_res)

        # Run function
        result = self.executor.build_buy_tx(
            keypair=test_keypair,
            mint_str=str(test_mint),
            sol_amount=sol_amount,
            slippage=slippage,
            priority_fee=100000
        )

        self.assertTrue(result["success"])
        self.assertIn("tx", result)

        # The true test is whether we can observe the instructions generated
        # Let's mock create_and_sign_tx to intercept the instructions passed to it
        self.executor.create_and_sign_tx = MagicMock(return_value={"success": True, "tx": "mocked"})

        result_mocked = self.executor.build_buy_tx(
            keypair=test_keypair,
            mint_str=str(test_mint),
            sol_amount=sol_amount,
            slippage=slippage,
            priority_fee=100000
        )

        self.executor.create_and_sign_tx.assert_called_once()
        args, kwargs = self.executor.create_and_sign_tx.call_args
        instructions = args[1]

        self.assertEqual(len(instructions), 2)
        fee_ix = instructions[0]
        buy_ix = instructions[1]

        # Assert priority fee ix data
        self.assertEqual(fee_ix.data, struct.pack("<BQ", 3, 100000))

        # Assert buy ix data
        # buy: sha256("global:buy")[:8] -> 16927863322537952870
        BUY_METHOD = struct.pack("<Q", 16927863322537952870)
        expected_buy_data = BUY_METHOD + struct.pack("<QQ", expected_buy_amount, expected_max_sol)
        self.assertEqual(buy_ix.data, expected_buy_data)

    def test_build_sell_tx(self):
        # Setup mock bonding curve data
        mock_curve_data = MagicMock()
        mock_curve_data.virtual_token_reserves = 1000  # 1,000 tokens
        mock_curve_data.virtual_sol_reserves = 500     # 500 SOL

        self.executor.get_bonding_curve_data = MagicMock(return_value=mock_curve_data)

        # We need a Keypair and a random mint
        test_keypair = Keypair()
        test_mint = Pubkey.from_string("So11111111111111111111111111111111111111112")

        token_amount = 2000
        slippage = 0.1

        # Expected calculation:
        # sol_output = (2000 * 500) // 1000 = 1000
        # min_sol = int(1000 * (1 - 0.1)) = 900
        expected_min_sol = 900

        # Mock create_and_sign_tx
        self.executor.create_and_sign_tx = MagicMock(return_value={"success": True, "tx": "mocked"})

        result = self.executor.build_sell_tx(
            keypair=test_keypair,
            mint_str=str(test_mint),
            token_amount=token_amount,
            slippage=slippage,
            priority_fee=100000
        )

        self.assertTrue(result["success"])

        self.executor.create_and_sign_tx.assert_called_once()
        args, kwargs = self.executor.create_and_sign_tx.call_args
        instructions = args[1]

        self.assertEqual(len(instructions), 2)
        fee_ix = instructions[0]
        sell_ix = instructions[1]

        # Assert priority fee ix data
        self.assertEqual(fee_ix.data, struct.pack("<BQ", 3, 100000))

        # Assert sell ix data
        # sell: sha256("global:sell")[:8] -> 12502976635542562355
        SELL_METHOD = struct.pack("<Q", 12502976635542562355)
        expected_sell_data = SELL_METHOD + struct.pack("<QQ", token_amount, expected_min_sol)
        self.assertEqual(sell_ix.data, expected_sell_data)

if __name__ == '__main__':
    unittest.main()
