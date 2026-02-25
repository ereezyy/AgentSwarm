import socket
import argparse
import ipaddress
import concurrent.futures
import sys
import json
import uuid
import time
import re
from typing import List, Tuple, Dict, Any, Callable, Optional

# Common ports for IoT cameras and management interfaces
DEFAULT_PORTS = [80, 8080, 554, 88, 443]

# Regex patterns for common IoT manufacturers in banner strings
VENDOR_PATTERNS = {
    'Hikvision': r'(Hikvision|HIK|DS-2CD)',
    'Dahua': r'(Dahua|DH-|IPC-HFW)',
    'Axis': r'(Axis|AXIS)',
    'Avigilon': r'(Avigilon)',
    'Amcrest': r'(Amcrest)',
    'Foscam': r'(Foscam)',
    'Ubiquiti': r'(Ubiquiti|UBNT|UniFi)',
    'Reolink': r'(Reolink)',
    'TP-Link': r'(TP-Link|Tapo)',
    'Wyze': r'(Wyze)',
    'Generic ONVIF': r'(ONVIF|NetworkVideoTransmitter)'
}

def detect_vendor(banner: str) -> str:
    """Identify manufacturer from service banner."""
    for vendor, pattern in VENDOR_PATTERNS.items():
        if re.search(pattern, banner, re.IGNORECASE):
            return vendor
    return "Unknown"

def check_rtsp_auth(ip: str, port: int, timeout: float = 2.0) -> Tuple[str, str]:
    """
    Check RTSP authentication status by sending a DESCRIBE request.
    Returns (Auth Status, Details).
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))
            
            # 1. OPTIONS (Handshake)
            s.send(b'OPTIONS rtsp://%s:%d RTSP/1.0\r\nCSeq: 1\r\n\r\n' % (ip.encode(), port))
            options_resp = s.recv(1024).decode('utf-8', errors='ignore')
            
            # Extract server banner from OPTIONS if possible
            server_banner = "Unknown"
            for line in options_resp.split('\r\n'):
                if line.startswith('Server:'):
                    server_banner = line.split(':', 1)[1].strip()

            # 2. DESCRIBE (Check Auth)
            s.send(b'DESCRIBE rtsp://%s:%d RTSP/1.0\r\nCSeq: 2\r\nAccept: application/sdp\r\n\r\n' % (ip.encode(), port))
            describe_resp = s.recv(1024).decode('utf-8', errors='ignore')
            
            if "RTSP/1.0 200 OK" in describe_resp:
                return ("Open (Unauthenticated)", server_banner)
            elif "RTSP/1.0 401 Unauthorized" in describe_resp:
                return ("Auth Required", server_banner)
            else:
                return ("Unknown Response", server_banner)

    except Exception:
        return ("Connection Error", "Unknown")

def scan_host(ip: str, port: int, timeout: float = 1.0) -> Dict[str, Any]:
    """
    Connect to a host:port and attempt to identify the service and vulnerability status.
    Returns finding dict or None.
    """
    try:
        # Special handling for RTSP (Port 554)
        if port == 554:
            auth_status, server_banner = check_rtsp_auth(ip, port, timeout)
            vendor = detect_vendor(server_banner)
            return {
                "ip": ip,
                "port": port,
                "service": "RTSP",
                "banner": server_banner,
                "vendor": vendor,
                "auth_status": auth_status,
                "vulnerability": "High" if "Unauthenticated" in auth_status else "Low"
            }

        # HTTP/Other Services
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))
            
            # Try HTTP HEAD
            try:
                s.send(b'HEAD / HTTP/1.0\r\n\r\n')
            except Exception:
                pass

            banner = s.recv(1024).decode('utf-8', errors='ignore').strip()
            if not banner:
                banner = "Open (No Banner)"
            
            vendor = detect_vendor(banner)
            return {
                "ip": ip,
                "port": port,
                "service": "HTTP/TCP",
                "banner": banner[:100], # Truncate for display
                "vendor": vendor,
                "auth_status": "Unknown",
                "vulnerability": "Info"
            }

    except (socket.timeout, ConnectionRefusedError, OSError):
        return None

def onvif_discover(timeout: int = 2) -> List[Dict]:
    """
    Sends a WS-Discovery probe to the local multicast group to find ONVIF devices.
    Returns a list of discovered devices with their metadata.
    """
    WS_DISCOVERY_PROBE = b'''<?xml version="1.0" encoding="UTF-8"?>
    <e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
                xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
                xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
                xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
        <e:Header>
            <w:MessageID>uuid:%s</w:MessageID>
            <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
            <w:Action a:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
        </e:Header>
        <e:Body>
            <d:Probe>
                <d:Types>dn:NetworkVideoTransmitter</d:Types>
            </d:Probe>
        </e:Body>
    </e:Envelope>''' % str(uuid.uuid4()).encode()

    devices = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.settimeout(timeout)
        
        sock.sendto(WS_DISCOVERY_PROBE, ('239.255.255.250', 3702))
        
        start = time.time()
        while time.time() - start < timeout:
            try:
                data, addr = sock.recvfrom(65536)
                devices.append({
                    "ip": addr[0],
                    "port": 0, 
                    "service": "ONVIF (UDP)",
                    "banner": "WS-Discovery Response",
                    "vendor": "Unknown (ONVIF)",
                    "auth_status": "N/A",
                    "vulnerability": "Info"
                })
            except socket.timeout:
                break
    except Exception as e:
        print(f"[-] ONVIF Discovery error: {e}", file=sys.stderr)
    
    return devices

def run_scan(targets: List[str], ports: List[int] = DEFAULT_PORTS, max_threads: int = 50, deep_scan: bool = False, callback: Optional[Callable[[Dict], None]] = None) -> List[Dict]:
    """
    Scans a list of IP addresses for specified ports.
    If deep_scan is True, also attempts ONVIF discovery (local network only).
    """
    
    results = []
    found_ips = set()

    # 1. TCP Connect Scan
    valid_targets = []
    for ip in targets:
        try:
            ipaddress.ip_address(ip)
            valid_targets.append(ip)
        except ValueError:
            continue

    tasks = [(str(ip), port) for ip in valid_targets for port in ports]

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_threads) as executor:
        future_to_target = {
            executor.submit(scan_host, ip, port): (ip, port) 
            for ip, port in tasks
        }

        for future in concurrent.futures.as_completed(future_to_target):
            result = future.result()
            if result:
                results.append(result)
                found_ips.add(result['ip'])
                if callback:
                    callback(result)

    # 2. ONVIF Deep Scan (if requested)
    if deep_scan:
        onvif_results = onvif_discover()
        for dev in onvif_results:
            results.append(dev)
            if callback:
                callback(dev)
    
    return results

def parse_cidr(cidr: str) -> List[str]:
    try:
        network = ipaddress.ip_network(cidr, strict=False)
        return [str(ip) for ip in network.hosts()]
    except ValueError:
        return []

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Professional IoT Asset Discovery Tool"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--cidr", help="Target CIDR (e.g., 192.168.1.0/24)")
    group.add_argument("--targets", help="File containing list of target IPs (one per line)")
    
    parser.add_argument("--threads", type=int, default=50, help="Max threads (default: 50)")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    parser.add_argument("--ports", help="Comma-separated list of ports (default: 80,8080,554,88,443)")
    parser.add_argument("--deep", action="store_true", help="Enable Deep Scan (ONVIF Discovery)")
    
    args = parser.parse_args()
    
    target_ips = []
    
    if args.cidr:
        target_ips = parse_cidr(args.cidr)
        if not target_ips:
            print(f"[-] Invalid CIDR: {args.cidr}", file=sys.stderr)
            sys.exit(1)
            
    elif args.targets:
        try:
            with open(args.targets, 'r') as f:
                target_ips = [line.strip() for line in f if line.strip()]
        except FileNotFoundError:
            print(f"[-] Target file not found: {args.targets}", file=sys.stderr)
            sys.exit(1)

    ports = DEFAULT_PORTS
    if args.ports:
        try:
            ports = [int(p) for p in args.ports.split(',')]
        except ValueError:
            print("[-] Invalid ports list. Use format: 80,443,8080", file=sys.stderr)
            sys.exit(1)

    if not args.json:
        print(f"[*] Starting scan of {len(target_ips)} hosts for ports {ports}...")
        if args.deep:
            print("[*] Deep Scan enabled: sending ONVIF probes...")
        print(f"[*] Threads: {args.threads}")

    def cli_callback(finding):
        if not args.json:
            port_display = str(finding['port']) if finding['port'] > 0 else "UDP"
            print(f"[+] Found: {finding['ip']}:{port_display} | {finding['vendor']} | {finding['auth_status']}")

    results = run_scan(target_ips, ports, args.threads, args.deep, cli_callback)

    if args.json:
        print(json.dumps(results, indent=2))
