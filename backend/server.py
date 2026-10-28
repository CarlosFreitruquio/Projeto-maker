"""
Gota Limpa — Servidor Backend em Python
Suporta execução direta com a biblioteca padrão (http.server) ou com Flask/FastAPI se instalados.
Entrega os arquivos estáticos de ../frontend e provê a API REST para sensores de pH e turbidez.
"""

import os
import sys
import json
import time
from datetime import datetime
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", 3000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

store = {
    "startedAt": datetime.utcnow().isoformat() + "Z",
    "sources": {
        "fonte-1": [],
        "fonte-2": []
    },
    "turbidity": []
}

class GotaLimpRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def _send_json(self, status_code, data):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/status":
            self._send_json(200, {
                "status": "online",
                "service": "Gota Limpa Python Backend",
                "version": "1.0.0",
                "startedAt": store["startedAt"],
                "counts": {
                    "fonte1": len(store["sources"]["fonte-1"]),
                    "fonte2": len(store["sources"]["fonte-2"]),
                    "turbidity": len(store["turbidity"])
                }
            })
            return

        if path == "/api/readings":
            f1 = store["sources"]["fonte-1"]
            f2 = store["sources"]["fonte-2"]
            turb = store["turbidity"]

            def mean(lst, key):
                return round(sum(x[key] for x in lst) / len(lst), 3) if lst else None

            self._send_json(200, {
                "sources": {
                    "fonte-1": {
                        "count": len(f1),
                        "mean": mean(f1, "ph"),
                        "last": f1[-1] if f1 else None,
                        "readings": f1[-50:]
                    },
                    "fonte-2": {
                        "count": len(f2),
                        "mean": mean(f2, "ph"),
                        "last": f2[-1] if f2 else None,
                        "readings": f2[-50:]
                    }
                },
                "turbidity": {
                    "count": len(turb),
                    "mean": mean(turb, "ntu"),
                    "last": turb[-1] if turb else None,
                    "readings": turb[-50:]
                }
            })
            return

        if path == "/api/export":
            query = parse_qs(parsed.query)
            if query.get("format", [""])[0] == "csv":
                lines = ["tipo,id,fonte_ou_sensor,valor,origem,timestamp"]
                for src, lst in store["sources"].items():
                    for item in lst:
                        lines.append(f"PH,{item['id']},{src},{item['ph']},{item['origin']},{item['timestamp']}")
                for item in store["turbidity"]:
                    lines.append(f"TURBIDEZ,{item['id']},turbidez,{item['ntu']},{item['origin']},{item['timestamp']}")

                body = "\n".join(lines).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="gota-limpa-dados.csv"')
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
                return

            self._send_json(200, store)
            return

        # Servir arquivos estáticos do frontend/
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/readings":
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length).decode("utf-8").strip()
            now = datetime.utcnow().isoformat() + "Z"

            results = []
            try:
                if raw_body.startswith("{") or raw_body.startswith("["):
                    data = json.loads(raw_body)
                    items = data if isinstance(data, list) else [data]
                    for item in items:
                        ts = item.get("timestamp", now)
                        orig = item.get("origin", "sensor")
                        if "ph" in item:
                            ph = float(item["ph"])
                            if 0 <= ph <= 14:
                                src = "fonte-2" if item.get("sourceId") == "fonte-2" else "fonte-1"
                                rec = {"id": f"{src}-{int(time.time()*1000)}", "sourceId": src, "ph": round(ph, 3), "origin": orig, "timestamp": ts}
                                store["sources"][src].append(rec)
                                results.append(rec)
                        if "turbidity" in item or "ntu" in item:
                            ntu = float(item.get("turbidity", item.get("ntu")))
                            if ntu >= 0:
                                rec = {"id": f"turbidez-{int(time.time()*1000)}", "ntu": round(ntu, 2), "origin": orig, "timestamp": ts}
                                store["turbidity"].append(rec)
                                results.append(rec)
                self._send_json(201, {"success": True, "receivedCount": len(results), "results": results})
            except Exception as e:
                self._send_json(400, {"success": False, "error": str(e)})
            return

        self._send_json(404, {"error": "Rota não encontrada"})

def run():
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, GotaLimpaRequestHandler)
    print("=" * 52)
    print(f" Servidor Gota Limpa (Python) iniciado!")
    print(f" Endereço local:  http://localhost:{PORT}")
    print(f" Frontend servido de: {FRONTEND_DIR}")
    print("=" * 52)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")

if __name__ == "__main__":
    run()

