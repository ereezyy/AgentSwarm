import os
import sys
import json
import asyncio
import aiohttp
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("StatusRelay")

class StatusRelay:
    """
    Syndicate Status Relay
    Sends real-time updates to Slack, Discord, or Webhooks.
    """
    def __init__(self, slack_webhook: str = None, discord_webhook: str = None):
        self.slack_webhook = slack_webhook or os.environ.get("SLACK_WEBHOOK_URL")
        self.discord_webhook = discord_webhook or os.environ.get("DISCORD_WEBHOOK_URL")
        
    async def send_alert(self, message: str, level: str = "INFO") -> bool:
        """
        Relay a status message to configured channels.
        """
        payload = {
            "text": f"[{level}] Syndicate Update: {message}",
            "username": "Syndicate Status Bot",
            "icon_emoji": ":ghost:"
        }
        
        success = True
        
        # Relay to Slack
        if self.slack_webhook:
            async with aiohttp.ClientSession() as session:
                try:
                    await session.post(self.slack_webhook, json=payload)
                except Exception as e:
                    logger.error(f"Slack Relay Error: {e}")
                    success = False

        # Relay to Discord (similar payload but slightly different format)
        if self.discord_webhook:
            discord_payload = {"content": f"**[{level}]** {message}"}
            async with aiohttp.ClientSession() as session:
                try:
                    await session.post(self.discord_webhook, json=discord_payload)
                except Exception as e:
                    logger.error(f"Discord Relay Error: {e}")
                    success = False
                    
        if not self.slack_webhook and not self.discord_webhook:
            logger.info(f"Relay Simulation: [{level}] {message}")
            
        return success

async def main():
    if len(sys.argv) < 2:
        return

    try:
        data = json.loads(sys.argv[1])
        message = data.get("message", "Heartbeat pulse detected.")
        level = data.get("level", "INFO")
        
        relay = StatusRelay()
        await relay.send_alert(message, level)
        print(json.dumps({"success": True}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    asyncio.run(main())
