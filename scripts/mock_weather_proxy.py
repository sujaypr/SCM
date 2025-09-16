from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import urllib.parse

class Handler(BaseHTTPRequestHandler):
    def _send_json(self, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path.startswith('/weather/'):
            city = path[len('/weather/'):].strip('/')
            data = {
                'city': city,
                'temp': 26.5,
                'weather': [{'main': 'Clear', 'description': 'clear sky'}],
                'description': 'clear sky',
                'wind': {'speed': 3.2}
            }
            self._send_json(data)
            return

        if path == '/weather':
            lat = qs.get('lat', [None])[0]
            lon = qs.get('lon', [None])[0]
            data = {
                'lat': float(lat) if lat else None,
                'lon': float(lon) if lon else None,
                'temp': 23.1,
                'weather': [{'main': 'Clouds', 'description': 'scattered clouds'}],
                'description': 'scattered clouds',
                'wind': {'speed': 4.0}
            }
            self._send_json(data)
            return

        # fallback
        self.send_response(404)
        self.end_headers()

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 3000), Handler)
    print('Mock weather proxy running on http://0.0.0.0:3000')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
        print('Mock weather proxy stopped')
