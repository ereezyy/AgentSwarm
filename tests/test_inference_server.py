import sys
import os
import unittest
import math

# Add ai_engine to sys.path so we can import inference_server
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ai_engine')))
import inference_server

class TestInferenceServerPurePythonUtils(unittest.TestCase):

    def test_dot_product(self):
        v1 = [1.0, 2.0, 3.0]
        v2 = [4.0, 5.0, 6.0]
        self.assertAlmostEqual(inference_server.dot_product(v1, v2), 32.0)

        v1 = [-1.0, 0.0, 2.0]
        v2 = [3.0, 4.0, -5.0]
        self.assertAlmostEqual(inference_server.dot_product(v1, v2), -13.0)

        v1 = [0.0, 0.0]
        v2 = [1.0, 1.0]
        self.assertAlmostEqual(inference_server.dot_product(v1, v2), 0.0)

    def test_matrix_vector_mult(self):
        # W[input_dim][output_dim]
        # v = [2 elements]
        # b = [3 elements]
        W = [
            [1.0, 2.0, 3.0], # weights from input 0 to outputs 0, 1, 2
            [4.0, 5.0, 6.0]  # weights from input 1 to outputs 0, 1, 2
        ]
        v = [2.0, 3.0]
        b = [0.1, 0.2, 0.3]

        res = inference_server.matrix_vector_mult(W, v, b)

        # Expected calculation:
        # out 0: (2.0 * 1.0) + (3.0 * 4.0) + 0.1 = 2.0 + 12.0 + 0.1 = 14.1
        # out 1: (2.0 * 2.0) + (3.0 * 5.0) + 0.2 = 4.0 + 15.0 + 0.2 = 19.2
        # out 2: (2.0 * 3.0) + (3.0 * 6.0) + 0.3 = 6.0 + 18.0 + 0.3 = 24.3

        self.assertEqual(len(res), 3)
        self.assertAlmostEqual(res[0], 14.1)
        self.assertAlmostEqual(res[1], 19.2)
        self.assertAlmostEqual(res[2], 24.3)

        # Test with zeros
        W_zeros = [[0.0, 0.0], [0.0, 0.0]]
        v_zeros = [1.0, 1.0]
        b_zeros = [0.0, 0.0]
        res_zeros = inference_server.matrix_vector_mult(W_zeros, v_zeros, b_zeros)
        self.assertEqual(res_zeros, [0.0, 0.0])

    def test_relu(self):
        v = [1.0, -1.0, 0.0, 5.5, -99.9]
        expected = [1.0, 0.0, 0.0, 5.5, 0.0]
        res = inference_server.relu(v)
        self.assertEqual(res, expected)

    def test_sigmoid(self):
        # Extreme positives should return 1.0
        self.assertEqual(inference_server.sigmoid(100), 1.0)
        self.assertEqual(inference_server.sigmoid(51), 1.0)

        # Extreme negatives should return 0.0
        self.assertEqual(inference_server.sigmoid(-100), 0.0)
        self.assertEqual(inference_server.sigmoid(-51), 0.0)

        # Zero should be 0.5
        self.assertAlmostEqual(inference_server.sigmoid(0), 0.5)

        # Normal values
        self.assertAlmostEqual(inference_server.sigmoid(2), 1.0 / (1.0 + math.exp(-2)))
        self.assertAlmostEqual(inference_server.sigmoid(-2), 1.0 / (1.0 + math.exp(2)))

if __name__ == '__main__':
    unittest.main()
