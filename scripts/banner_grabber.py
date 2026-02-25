import socket
import argparse
import sys

def get_banner(ip, port, timeout=5):
    """
    Connects to a specific IP and port to retrieve the service banner.
    
    This is a primitive building block used in larger, authorized audit systems to
    identify service versions and potential vulnerabilities. It is designed to be
    run against a single target within an authorized scope.
    
    Args:
        ip (str): The target IP address.
        port (int): The target port number.
        timeout (int): Connection timeout in seconds.
    """
    try:
        # Create a socket object
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        # Set a timeout to handle varying network conditions
        s.settimeout(timeout)
        
        print(f"[*] Connecting to {ip} on port {port} with {timeout}s timeout...")
        s.connect((ip, port))
        
        # Send a generic HTTP request just in case the service expects one to trigger a response
        # Many services (like SSH or FTP) send a banner immediately upon connection.
        # HTTP servers usually wait for a request.
        try:
            s.send(b'HEAD / HTTP/1.0\r\n\r\n')
        except Exception:
            pass # Some services might close connection immediately or not accept data
            
        # Receive data (the banner)
        banner = s.recv(1024)
        
        if banner:
            print(f"[+] Banner received:\n{banner.decode('utf-8', errors='ignore').strip()}")
        else:
            print("[-] Connection established, but no banner received.")
            
        s.close()
        
    except socket.timeout:
        print(f"[-] Connection timed out after {timeout} seconds. (Host might be down or firewalled)")
    except ConnectionRefusedError:
        print("[-] Connection refused (Port is closed).")
    except OSError as e:
         print(f"[-] Network error: {e}")
    except Exception as e:
        print(f"[-] An unexpected error occurred: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Educational Banner Grabber - A utility for authorized network auditing."
    )
    parser.add_argument("ip", help="Target IP address")
    parser.add_argument("port", type=int, help="Target port (e.g., 80, 21, 22)")
    parser.add_argument("--timeout", type=int, default=5, help="Connection timeout in seconds (default: 5)")
    
    args = parser.parse_args()
    
    if args.port < 1 or args.port > 65535:
        print("[-] Error: Port must be between 1 and 65535.")
        sys.exit(1)
        
    get_banner(args.ip, args.port, args.timeout)
