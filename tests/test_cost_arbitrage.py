import sys
import os
import unittest

sys.path.append(os.path.abspath('muscle'))
from cost_arbitrage import CostArbitrage

class TestCostArbitrage(unittest.TestCase):
    def setUp(self):
        self.arbitrage = CostArbitrage()

    def test_decide_route_cost(self):
        request_data = {
            'prompt': 'This is a test prompt.',
            'strategy': 'cost'
        }
        result = self.arbitrage.decide_route(request_data)

        self.assertEqual(result['selected']['provider'], 'anthropic')
        self.assertEqual(result['selected']['model'], 'claude-3-haiku')
        self.assertEqual(result['selected']['score'], 0.95)
        self.assertEqual(result['estimated_tokens'], len(request_data['prompt']) / 4)
        self.assertIn("Strategy 'cost' selected claude-3-haiku", result['reasoning'])

    def test_decide_route_quality(self):
        request_data = {
            'prompt': 'This is a high quality test prompt that needs deep thinking.',
            'strategy': 'quality'
        }
        result = self.arbitrage.decide_route(request_data)

        self.assertEqual(result['selected']['provider'], 'openai')
        self.assertEqual(result['selected']['model'], 'gpt-4-turbo')
        self.assertEqual(result['selected']['score'], 0.98)
        self.assertEqual(result['estimated_tokens'], len(request_data['prompt']) / 4)
        self.assertIn("Strategy 'quality' selected gpt-4-turbo", result['reasoning'])

    def test_decide_route_balanced(self):
        request_data = {
            'prompt': 'This prompt just uses default balanced strategy.',
            # strategy is explicitly omitted
        }
        result = self.arbitrage.decide_route(request_data)

        self.assertEqual(result['selected']['provider'], 'google')
        self.assertEqual(result['selected']['model'], 'gemini-pro')
        self.assertEqual(result['selected']['score'], 0.9)
        self.assertEqual(result['estimated_tokens'], len(request_data['prompt']) / 4)
        self.assertIn("Strategy 'balanced' selected gemini-pro", result['reasoning'])

    def test_decide_route_empty_prompt(self):
        request_data = {
            # empty prompt
            'strategy': 'cost'
        }
        result = self.arbitrage.decide_route(request_data)

        self.assertEqual(result['estimated_tokens'], 0)

if __name__ == '__main__':
    unittest.main()
