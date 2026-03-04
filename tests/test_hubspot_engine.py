import sys
import os
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../muscle')))

# Instead of global mocking sys.modules['aiohttp'], we must ensure that aiohttp is mocked during import if not installed
try:
    import aiohttp
except ImportError:
    from unittest.mock import MagicMock
    sys.modules['aiohttp'] = MagicMock()

from hubspot_engine import HubSpotEngine

class MockResponse:
    def __init__(self, status, json_data):
        self.status = status
        self.json_data = json_data

    async def json(self):
        return self.json_data

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        pass

class MockSession:
    def __init__(self, mock_response=None, mock_exception=None):
        self.mock_response = mock_response
        self.mock_exception = mock_exception
        self.post_args = None
        self.post_kwargs = None

    def post(self, *args, **kwargs):
        self.post_args = args
        self.post_kwargs = kwargs
        if self.mock_exception:
            raise self.mock_exception
        return self.mock_response

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        pass

class TestHubSpotEngine(unittest.IsolatedAsyncioTestCase):
    async def test_sync_lead_simulation_mode(self):
        engine = HubSpotEngine(access_token="YOUR_HUBSPOT_ACCESS_TOKEN")
        result = await engine.sync_lead({"email": "test@example.com"})
        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "simulated")

    @patch('hubspot_engine.aiohttp.ClientSession')
    async def test_sync_lead_success(self, mock_client_session):
        mock_response = MockResponse(200, {"id": "12345"})
        mock_session = MockSession(mock_response=mock_response)
        mock_client_session.return_value = mock_session

        engine = HubSpotEngine(access_token="VALID_TOKEN")
        result = await engine.sync_lead({"email": "test@example.com"})

        self.assertTrue(result["success"])
        self.assertEqual(result["hubspot_id"], "12345")
        self.assertEqual(result["status"], "synced")

        # Verify properties
        args = mock_session.post_args
        kwargs = mock_session.post_kwargs
        self.assertEqual(args[0], "https://api.hubapi.com/crm/v3/objects/contacts")
        self.assertIn("json", kwargs)
        self.assertEqual(kwargs["json"]["properties"]["email"], "test@example.com")
        self.assertEqual(kwargs["json"]["properties"]["firstname"], "Lead")
        self.assertIn("headers", kwargs)
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer VALID_TOKEN")

    @patch('hubspot_engine.aiohttp.ClientSession')
    async def test_sync_lead_error_status(self, mock_client_session):
        mock_response = MockResponse(400, {"message": "Invalid request"})
        mock_session = MockSession(mock_response=mock_response)
        mock_client_session.return_value = mock_session

        engine = HubSpotEngine(access_token="VALID_TOKEN")
        result = await engine.sync_lead({"email": "test@example.com"})

        self.assertFalse(result["success"])
        self.assertEqual(result["error"], {"message": "Invalid request"})

    @patch('hubspot_engine.aiohttp.ClientSession')
    async def test_sync_lead_exception(self, mock_client_session):
        # We need a context manager that raises when entered
        class ExceptionSession:
            def post(self, *args, **kwargs):
                class ExceptionResponse:
                    async def __aenter__(self):
                        raise Exception("Network error")
                    async def __aexit__(self, *args):
                        pass
                return ExceptionResponse()

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

        mock_client_session.return_value = ExceptionSession()

        engine = HubSpotEngine(access_token="VALID_TOKEN")
        result = await engine.sync_lead({"email": "test@example.com"})

        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "Network error")

    @patch('hubspot_engine.aiohttp.ClientSession')
    async def test_sync_lead_custom_properties(self, mock_client_session):
        mock_response = MockResponse(201, {"id": "67890"})
        mock_session = MockSession(mock_response=mock_response)
        mock_client_session.return_value = mock_session

        engine = HubSpotEngine(access_token="VALID_TOKEN")

        # Test with custom properties
        lead = {
            "email": "custom@example.com",
            "first_name": "John",
            "last_name": "Doe",
            "company": "Acme Corp",
            "title": "CEO",
            "id": "1001"
        }

        result = await engine.sync_lead(lead)

        self.assertTrue(result["success"])
        self.assertEqual(result["hubspot_id"], "67890")

        # Verify custom properties were sent correctly
        kwargs = mock_session.post_kwargs
        properties = kwargs["json"]["properties"]
        self.assertEqual(properties["email"], "custom@example.com")
        self.assertEqual(properties["firstname"], "John")
        self.assertEqual(properties["lastname"], "Doe")
        self.assertEqual(properties["company"], "Acme Corp")
        self.assertEqual(properties["jobtitle"], "CEO")

if __name__ == "__main__":
    unittest.main()
