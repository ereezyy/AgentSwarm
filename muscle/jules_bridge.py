# muscle/jules_bridge.py - Interface for Google Jules API
import os
import sys
import json
import requests
from dotenv import load_dotenv

load_dotenv()

class JulesBridge:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("JULES_API_KEY")
        self.base_url = "https://jules.googleapis.com/v1alpha"
        self.headers = {
            "X-Goog-Api-Key": self.api_key,
            "Content-Type": "application/json"
        }
        self.memory_path = os.path.join(os.path.dirname(__file__), "../missions/jules_memory.json")
        self.memory = self._load_memory()

    def _load_memory(self):
        if os.path.exists(self.memory_path):
            try:
                with open(self.memory_path, 'r') as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def _save_memory(self):
        os.makedirs(os.path.dirname(self.memory_path), exist_ok=True)
        with open(self.memory_path, 'w') as f:
            json.dump(self.memory, f, indent=2)

    def learn(self, key, value):
        """Stores a persistent lesson about the codebase."""
        self.memory[key] = {
            "value": value,
            "timestamp": os.path.getmtime(self.memory_path) if os.path.exists(self.memory_path) else 0
        }
        self._save_memory()

    def list_sources(self):
        """Lists available sources (e.g. connected GitHub repos)."""
        response = requests.get(f"{self.base_url}/sources", headers=self.headers)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": response.text, "status": response.status_code}

    def create_session(self, prompt, source_name, title="Syndicate Task", auto_pr=False):
        """Creates a new coding session with cumulative memory context."""
        memory_context = ""
        if self.memory:
            memory_context = "\n\nCRITICAL CONTEXT FROM PAST SESSIONS:\n"
            for key, data in self.memory.items():
                memory_context += f"- {key}: {data['value']}\n"
        
        full_prompt = f"{prompt}{memory_context}"

        data = {
            "prompt": full_prompt,
            "sourceContext": {
                "source": source_name,
                "githubRepoContext": {
                    "startingBranch": "master"
                }
            },
            "automationMode": "AUTO_CREATE_PR" if auto_pr else "NONE",
            "title": title
        }
        response = requests.post(f"{self.base_url}/sessions", headers=self.headers, json=data)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": response.text, "status": response.status_code}

    def get_session(self, session_id):
        """Polls session status."""
        response = requests.get(f"{self.base_url}/sessions/{session_id}", headers=self.headers)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": response.text, "status": response.status_code}

    def list_sessions(self, source_name=None):
        """Lists active and past sessions."""
        params = {}
        if source_name: params["source"] = source_name
        response = requests.get(f"{self.base_url}/sessions", headers=self.headers, params=params)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": response.text, "status": response.status_code}

    def approve_session(self, session_id):
        """Approves a session and triggers PR merge (if auto_pr was set)."""
        response = requests.post(f"{self.base_url}/sessions/{session_id}:approve", headers=self.headers)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": response.text, "status": response.status_code}

if __name__ == "__main__":
    bridge = JulesBridge()
    if len(sys.argv) > 1:
        if sys.argv[1] == "--list":
            print(json.dumps(bridge.list_sources(), indent=2))
        elif sys.argv[1] == "--list-sessions":
            print(json.dumps(bridge.list_sessions(), indent=2))
        elif sys.argv[1] == "--approve" and len(sys.argv) > 2:
            print(json.dumps(bridge.approve_session(sys.argv[2]), indent=2))
        elif sys.argv[1] == "--test":
            sources = bridge.list_sources()
            if "sources" in sources and len(sources["sources"]) > 0:
                print(f"✅ Connection successful. Found {len(sources['sources'])} sources.")
            else:
                print(f"⚠️ Connected, but no sources found: {sources}")
    else:
        # Default: list sources to verify connection
        print(json.dumps(bridge.list_sources(), indent=2))
