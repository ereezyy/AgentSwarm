import sys
import unittest
sys.path.append('muscle')
from enforcer import Enforcer

class TestEnforcer(unittest.TestCase):
    def test_instantiation(self):
        try:
            muscle = Enforcer()
        except Exception as e:
            self.fail(f"Enforcer() raised {e} unexpectedly!")

    def test_methods(self):
        muscle = Enforcer()
        # Mocking speak to suppress stdout during tests
        muscle.speak = lambda x: None

        try:
            muscle.move_to(100, 100)
            muscle.click()
            muscle.shake_down()
            muscle.whack()
            muscle.type_threat("test")
        except Exception as e:
            self.fail(f"Methods raised {e} unexpectedly!")

if __name__ == '__main__':
    unittest.main()
