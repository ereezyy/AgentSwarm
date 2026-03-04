import unittest
import os
import sys
import json
from unittest.mock import patch, mock_open

# Add ai_engine to sys.path so we can import inference_server
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AI_ENGINE_DIR = os.path.join(BASE_DIR, 'ai_engine')
sys.path.append(AI_ENGINE_DIR)

from inference_server import PureMLP, matrix_vector_mult, relu, sigmoid

class TestInferenceServer(unittest.TestCase):

    def setUp(self):
        # A simple mocked weights dictionary mimicking the expected structure
        self.mock_weights = {
            "W1": [[0.5, -0.5], [0.1, 0.2]], # 2 inputs, 2 hidden nodes
            "b1": [0.0, 0.1],
            "W2": [[1.0, 0.0], [0.0, 1.0]],
            "b2": [0.0, 0.0],
            "W3": [[1.0, 1.0], [1.0, 1.0]],
            "b3": [-0.5, -0.5],
            "W4": [[1.0], [-1.0]],
            "b4": [0.0]
        }
        self.mock_weights_json = json.dumps(self.mock_weights)

    @patch("builtins.open", new_callable=mock_open)
    def test_pure_mlp_predict(self, mock_file):
        # Setup mock file to return our mock weights
        mock_file.return_value.read.return_value = self.mock_weights_json

        # Instantiate PureMLP
        mlp = PureMLP("dummy_path.json")

        # Test predict with sample features
        features = [1.0, 2.0]
        prob = mlp.predict(features)

        self.assertIsInstance(prob, float)
        # Expected prediction manually traced:
        # features = [1.0, 2.0]
        # x1[0] = 1.0*0.5 + 2.0*0.1 + 0.0 = 0.7
        # x1[1] = 1.0*(-0.5) + 2.0*0.2 + 0.1 = -0.5 + 0.4 + 0.1 = 0.0
        # relu(x1) = [0.7, 0.0]
        # x2 = matrix_vector_mult(W2, [0.7, 0.0], b2) = [0.7, 0.0]
        # relu(x2) = [0.7, 0.0]
        # x3[0] = 0.7*1.0 + 0.0*1.0 + (-0.5) = 0.2
        # x3[1] = 0.7*1.0 + 0.0*1.0 + (-0.5) = 0.2
        # relu(x3) = [0.2, 0.2]
        # x4 = 0.2*1.0 + 0.2*(-1.0) + 0.0 = 0.0
        # sigmoid(0.0) = 0.5
        self.assertAlmostEqual(prob, 0.5, places=5)

    @patch("builtins.open", new_callable=mock_open)
    def test_pure_mlp_predict_edge_cases(self, mock_file):
        # Setup mock file to return our mock weights
        mock_file.return_value.read.return_value = self.mock_weights_json

        # Instantiate PureMLP
        mlp = PureMLP("dummy_path.json")

        # Test with zero features
        prob_zeros = mlp.predict([0.0, 0.0])
        # x1 = [0, 0.1] -> [0, 0.1]
        # x2 = [0, 0.1] -> [0, 0.1]
        # x3 = [-0.4, -0.4] -> [0, 0]
        # x4 = [0]
        # sigmoid(0) = 0.5
        self.assertAlmostEqual(prob_zeros, 0.5, places=5)

        # Test with negative features
        prob_neg = mlp.predict([-10.0, -10.0])
        self.assertTrue(0.0 <= prob_neg <= 1.0)
        self.assertIsInstance(prob_neg, float)

if __name__ == '__main__':
    unittest.main()
