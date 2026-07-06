import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Mock external dependencies that are not installed in the sandbox before importing module
sys.modules['requests'] = MagicMock()
sys.modules['dotenv'] = MagicMock()

# Add 'muscle' to sys.path so we can import jules_bridge
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'muscle')))

from jules_bridge import JulesBridge
import requests

class TestJulesBridge(unittest.TestCase):
    def setUp(self):
        # Prevent it from loading or saving memory during tests
        with patch('jules_bridge.JulesBridge._load_memory', return_value={}):
            self.bridge = JulesBridge(api_key="test_api_key")
        self.bridge.memory = {}

    @patch('jules_bridge.requests.post')
    def test_create_session_no_memory(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"session_id": "12345", "status": "CREATED"}
        mock_post.return_value = mock_response

        result = self.bridge.create_session("Write a test", "github.com/test/repo", title="Test Task")

        self.assertEqual(result, {"session_id": "12345", "status": "CREATED"})
        mock_post.assert_called_once()

        # Check payload
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], f"{self.bridge.base_url}/sessions")

        payload = kwargs.get('json')
        self.assertIsNotNone(payload)
        self.assertEqual(payload["prompt"], "Write a test")
        self.assertEqual(payload["sourceContext"]["source"], "github.com/test/repo")
        self.assertEqual(payload["automationMode"], "NONE")
        self.assertEqual(payload["title"], "Test Task")

    @patch('jules_bridge.requests.post')
    def test_create_session_with_memory(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"session_id": "67890"}
        mock_post.return_value = mock_response

        self.bridge.memory = {
            "key1": {"value": "value1"},
            "key2": {"value": "value2"}
        }

        result = self.bridge.create_session("Write a test", "github.com/test/repo")

        self.assertEqual(result, {"session_id": "67890"})
        mock_post.assert_called_once()

        payload = mock_post.call_args[1].get('json')
        self.assertIn("CRITICAL CONTEXT FROM PAST SESSIONS:\n", payload["prompt"])
        self.assertIn("- key1: value1\n", payload["prompt"])
        self.assertIn("- key2: value2\n", payload["prompt"])

    @patch('jules_bridge.requests.post')
    def test_create_session_auto_pr(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"session_id": "abcde"}
        mock_post.return_value = mock_response

        result = self.bridge.create_session("Write a test", "github.com/test/repo", auto_pr=True)

        self.assertEqual(result, {"session_id": "abcde"})
        mock_post.assert_called_once()

        payload = mock_post.call_args[1].get('json')
        self.assertEqual(payload["automationMode"], "AUTO_CREATE_PR")

    @patch('jules_bridge.requests.post')
    def test_create_session_error(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = "Bad Request"
        mock_post.return_value = mock_response

        result = self.bridge.create_session("Write a test", "github.com/test/repo")

        self.assertEqual(result, {"error": "Bad Request", "status": 400})
        mock_post.assert_called_once()

if __name__ == '__main__':
    unittest.main()
