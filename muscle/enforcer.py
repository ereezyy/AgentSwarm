# muscle/enforcer.py - The Muscle (Raw Python/ctypes Edition)
# No external libs. Just raw power.
import sys
import time
import ctypes
import random

# Windows API Constants
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_ABSOLUTE = 0x8000
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010

class Enforcer:
    def __init__(self):
        self.user32 = ctypes.windll.user32
        self.screen_width = self.user32.GetSystemMetrics(0)
        self.screen_height = self.user32.GetSystemMetrics(1)
        print(f"💪 THE ENFORCER IS ONLINE. Screen: {self.screen_width}x{self.screen_height}")

    def speak(self, msg):
        print(f"[THE ENFORCER]: {msg}")

    def _mouse_event(self, flags, x, y, data, extra_info):
        self.user32.mouse_event(flags, x, y, data, extra_info)

    def move_to(self, x, y):
        # Normalize coordinates
        abs_x = int(x * 65535 / self.screen_width)
        abs_y = int(y * 65535 / self.screen_height)
        self._mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, abs_x, abs_y, 0, 0)
    
    def click(self):
        self._mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        time.sleep(0.05)
        self._mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)

    def shake_down(self):
        self.speak("Shaking down the desktop...")
        # Move aggressively to random points
        for _ in range(5):
            x = random.randint(0, self.screen_width)
            y = random.randint(0, self.screen_height)
            self.move_to(x, y)
            time.sleep(0.1)
        self.speak("Turf secure. They know we're here.")

    def whack(self):
        self.speak("Whacking target (Click).")
        self.click()

    def type_threat(self, text):
        self.speak(f"Typing threat: {text}")
        # Simple simulated typing (complex char mapping requires more code, keeping it simple for verification)
        # This is a placeholder for actual keystroke injection if needed
        pass

if __name__ == "__main__":
    muscle = Enforcer()
    
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        args = sys.argv[2:]
        
        if cmd == "shakedown":
            muscle.shake_down()
        elif cmd == "whack":
            muscle.whack()
        elif cmd == "threat":
            muscle.type_threat(" ".join(args))
        else:
            muscle.speak(f"Unknown order: {cmd}")
    else:
        muscle.speak("Waiting for orders. (args: shakedown, whack, threat)")
