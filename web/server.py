# server.py（放在 web 資料夾）
import http.server, socketserver, mimetypes, sys
mimetypes.add_type('application/wasm', '.wasm')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()
