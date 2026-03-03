import sys
import unittest
import os

# Add scripts directory to path to import local_network_scanner
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'scripts')))

from local_network_scanner import detect_vendor

class TestLocalNetworkScanner(unittest.TestCase):
    def test_detect_vendor_hikvision(self):
        self.assertEqual(detect_vendor("Server: Hikvision-Webs"), "Hikvision")
        self.assertEqual(detect_vendor("HIK-some-info"), "Hikvision")
        self.assertEqual(detect_vendor("DS-2CD2143G0-I"), "Hikvision")

    def test_detect_vendor_dahua(self):
        self.assertEqual(detect_vendor("Dahua-Device"), "Dahua")
        self.assertEqual(detect_vendor("DH-IPC-info"), "Dahua")
        self.assertEqual(detect_vendor("IPC-HFW-something"), "Dahua")

    def test_detect_vendor_axis(self):
        self.assertEqual(detect_vendor("Axis Communications"), "Axis")
        self.assertEqual(detect_vendor("AXIS P1435-LE"), "Axis")

    def test_detect_vendor_avigilon(self):
        self.assertEqual(detect_vendor("Avigilon Control Center"), "Avigilon")

    def test_detect_vendor_amcrest(self):
        self.assertEqual(detect_vendor("Amcrest Camera"), "Amcrest")

    def test_detect_vendor_foscam(self):
        self.assertEqual(detect_vendor("Foscam IP Camera"), "Foscam")

    def test_detect_vendor_ubiquiti(self):
        self.assertEqual(detect_vendor("Ubiquiti Networks"), "Ubiquiti")
        self.assertEqual(detect_vendor("UBNT"), "Ubiquiti")
        self.assertEqual(detect_vendor("UniFi Video"), "Ubiquiti")

    def test_detect_vendor_reolink(self):
        self.assertEqual(detect_vendor("Reolink Tech"), "Reolink")

    def test_detect_vendor_tplink(self):
        self.assertEqual(detect_vendor("TP-Link"), "TP-Link")
        self.assertEqual(detect_vendor("Tapo Camera"), "TP-Link")

    def test_detect_vendor_wyze(self):
        self.assertEqual(detect_vendor("Wyze Labs"), "Wyze")

    def test_detect_vendor_onvif(self):
        self.assertEqual(detect_vendor("ONVIF Device"), "Generic ONVIF")
        self.assertEqual(detect_vendor("NetworkVideoTransmitter"), "Generic ONVIF")

    def test_detect_vendor_unknown(self):
        self.assertEqual(detect_vendor("Unknown Service"), "Unknown")
        self.assertEqual(detect_vendor(""), "Unknown")

    def test_detect_vendor_case_insensitive(self):
        self.assertEqual(detect_vendor("hikvision"), "Hikvision")
        self.assertEqual(detect_vendor("DAHUA"), "Dahua")

if __name__ == '__main__':
    unittest.main()
