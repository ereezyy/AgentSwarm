import asyncio
import json
import os
import sys

class Summarizer:
    def __init__(self):
        self.max_chunk_size = 4000

    async def summarize(self, text, goal="prospecting"):
        """
        Summarizes long text into actionable intelligence.
        In a real scenario, this would call a cheap LLM (like Llama 3 via Groq).
        For now, we simulate the extraction of key signals.
        """
        if not text:
            return {"summary": "No data", "signals": []}

        # Simulated AI logic: extract tech, names, and pain points
        signals = []
        if "React" in text or "TypeScript" in text:
            signals.append("Modern Web Stack")
        if "Solana" in text or "Rust" in text:
            signals.append("Crypto/DeFi Focused")
        if "remotely" in text.lower():
            signals.append("Remote First")

        return {
            "summary": text[:200] + "...", # Basic truncation for simulation
            "key_signals": signals,
            "char_count": len(text),
            "compression_ratio": round(200 / len(text), 2) if len(text) > 0 else 0
        }

async def main():
    try:
        input_data = json.load(sys.stdin)
        content = input_data.get('content', '')
        goal = input_data.get('goal', 'prospecting')

        engine = Summarizer()
        result = await engine.summarize(content, goal)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    asyncio.run(main())
