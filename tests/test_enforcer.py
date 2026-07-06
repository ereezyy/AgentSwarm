import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.append('muscle')
from enforcer import Enforcer, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_MOVE

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

    @patch('enforcer.pyautogui', create=True)
    def test_move_to_native_windows(self, mock_pyautogui):
        muscle = Enforcer()
        muscle.use_native_windows = True
        muscle.use_pyautogui = False
        muscle.screen_width = 1920
        muscle.screen_height = 1080
        muscle._mouse_event = MagicMock()

        muscle.move_to(960, 540)

        expected_abs_x = int(960 * 65535 / 1920)
        expected_abs_y = int(540 * 65535 / 1080)

        muscle._mouse_event.assert_called_once_with(
            MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE,
            expected_abs_x,
            expected_abs_y,
            0,
            0
        )

    @patch('enforcer.pyautogui', create=True)
    def test_move_to_pyautogui(self, mock_pyautogui):
        muscle = Enforcer()
        muscle.use_native_windows = False
        muscle.use_pyautogui = True

        muscle.move_to(100, 200)

        mock_pyautogui.moveTo.assert_called_once_with(100, 200)

    @patch('enforcer.pyautogui', create=True)
    def test_move_to_mock_fallback(self, mock_pyautogui):
        muscle = Enforcer()
        muscle.use_native_windows = False
        muscle.use_pyautogui = False
        muscle._mouse_event = MagicMock()

        muscle.move_to(100, 200)

        muscle._mouse_event.assert_not_called()
        mock_pyautogui.moveTo.assert_not_called()

if __name__ == '__main__':
    unittest.main()
