"""
Happen companion agent.

A small always-running local HTTP server (127.0.0.1:8765) that acts as the bridge
between the Happen web app and the local tracker.py script.

Endpoints:
  GET  /health            -> { ok: true }
  POST /checkin           -> starts tracking for a session  { sessionId, token, backendUrl }
  POST /checkout          -> stops tracking and uploads results
                            { sessionId, token, backendUrl }
  GET  /status            -> { tracking: bool, sessionName }

Security:
  * Binds to loopback only.
  * CORS restricted to the Happen frontend origin.
  * The JWT token supplied by the web app is validated against the backend before
    tracking starts and is used to authorize the check-out upload.
"""

import json
import os
import sys
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlparse, parse_qs
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)
if sys.stdout is None or sys.stderr is None:
    agent_log = open(os.path.join(BASE_DIR, "agent.log"), "a", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = agent_log
    if sys.stderr is None:
        sys.stderr = agent_log

HOST = "127.0.0.1"
PORT = 8765
DEFAULT_BACKEND = os.environ.get("HAPPEN_BACKEND", "http://localhost:5000")
CORS_ORIGINS = [
    "http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:5173",
    "https://localhost:3000", "https://localhost:3001", "https://localhost:3002", "https://localhost:5173",
]

# ---------------------------------------------------------------- imports of tracker
# Tracker lives next to this agent. Importing it also sets up the module-level Data dirs.
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.dirname(BASE_DIR))

import tracker  # noqa: E402
from tracker import AdvancedActivityTracker  # noqa: E402


# ---------------------------------------------------------------- tracking state
class TrackingState:
    def __init__(self):
        self.lock = threading.Lock()
        self.tracker = None        # AdvancedActivityTracker instance
        self.thread = None         # background thread
        self.stop_event = None     # threading.Event
        self.session_id = None
        self.session_name = None
        self.report_info = None    # dict from tracker.get_report_info()

state = TrackingState()


# ---------------------------------------------------------------- helpers
def next_session_folder():
    """Return path to a fresh ./Data/Tracking-data_<N> folder relative to tracker dir."""
    data_dir = os.path.join(BASE_DIR, "Data")
    os.makedirs(data_dir, exist_ok=True)
    n = 0
    while os.path.exists(os.path.join(data_dir, f"Tracking-data_{n + 1}")):
        n += 1
    return os.path.join(data_dir, f"Tracking-data_{n + 1}")


def validate_token(backend, token):
    """Validate the JWT against the backend /api/activity/me endpoint."""
    try:
        req = Request(f"{backend}/api/activity/me",
                      headers={"Authorization": f"Bearer {token}"})
        with urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception:
        return False


def start_tracking(session_id, token, backend):
    with state.lock:
        if state.tracker is not None:
            return {"ok": False, "error": "Already tracking a session"}

        if not validate_token(backend, token):
            return {"ok": False, "error": "Token validation failed"}

        folder = next_session_folder()
        stop_event = threading.Event()
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        output_file = f"advanced_activity_report_{ts}.docx"
        tracker_obj = AdvancedActivityTracker(
            output_file=output_file,
            capture_screenshots=True,
            session_dir=folder,
        )

        def run():
            try:
                info = tracker_obj.run_until_stopped(
                    stop_event=stop_event,
                    interval_seconds=5,
                    screenshot_interval_seconds=30,
                )
                info["backend"] = backend
                info["token"] = token
                info["session_id"] = session_id
                with state.lock:
                    state.report_info = info
            except Exception as e:
                print(f"[agent] tracking error: {e}")
                with state.lock:
                    state.report_info = {"error": str(e)}

        thread = threading.Thread(target=run, daemon=True)
        state.tracker = tracker_obj
        state.thread = thread
        state.stop_event = stop_event
        state.session_id = session_id
        state.session_name = os.path.basename(folder)
        state.report_info = None
        thread.start()

        return {"ok": True, "sessionName": os.path.basename(folder)}


def stop_tracking():
    with state.lock:
        tracker_obj = state.tracker
        stop_event = state.stop_event
        thread = state.thread
    if tracker_obj is None:
        return {"ok": False, "error": "Not tracking"}

    stop_event.set()
    if thread:
        thread.join(timeout=10)

    with state.lock:
        info = state.report_info
        if info is None:
            info = tracker_obj.get_report_info()
        session_id = state.session_id
        state.tracker = None
        state.thread = None
        state.stop_event = None
        state.session_id = None

    if isinstance(info, dict) and info.get("error"):
        return {"ok": False, "error": info["error"]}

    upload_result = upload_report(info, session_id)
    return {"ok": True, "upload": upload_result}


def upload_report(info, session_id):
    """Multipart POST the report files + summary JSON to the backend check-out endpoint."""
    import uuid

    backend = info.get("backend", DEFAULT_BACKEND)
    token = info.get("token", "")
    folder = info.get("dir", "")
    docx = info.get("docx")
    json_path = info.get("json")
    screenshots_dir = info.get("screenshots_dir")

    boundary = uuid.uuid4().hex
    # use future-style: assemble multipart body
    body = bytearray()
    def add_field(name, value):
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(str(value).encode())
        body.extend(b"\r\n")

    def add_file(name, filename, content):
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode())
        body.extend(b"Content-Type: application/octet-stream\r\n\r\n")
        body.extend(content)
        body.extend(b"\r\n")

    add_field("sessionId", session_id)

    # Load raw JSON summary + activities
    summary = {}
    raw = []
    if json_path and os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            summary = data.get("summary", {})
            raw = data.get("activities", [])
        except Exception:
            pass
    add_field("summary", json.dumps(summary))
    add_field("raw", json.dumps(raw))
    if folder:
        add_field("tracking_dir", os.path.basename(folder))

    # Report file
    if docx and os.path.exists(docx):
        with open(docx, "rb") as f:
            add_file("files", os.path.basename(docx), f.read())

    # Screenshots
    if screenshots_dir and os.path.isdir(screenshots_dir):
        for fn in sorted(os.listdir(screenshots_dir)):
            p = os.path.join(screenshots_dir, fn)
            if os.path.isfile(p):
                with open(p, "rb") as f:
                    add_file("files", fn, f.read())

    body.extend(f"--{boundary}--\r\n".encode())

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    }
    try:
        req = Request(f"{backend}/api/activity/check-out", data=bytes(body), headers=headers, method="POST")
        with urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode())
            return {"ok": True, "session": payload}
    except HTTPError as e:
        detail = e.read().decode() if e.fp else str(e)
        return {"ok": False, "error": f"HTTP {e.code}: {detail}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------- HTTP handler
class AgentHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # quiet default logging
        pass

    def _cors(self):
        origin = self.headers.get("Origin")
        if origin in CORS_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _send(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode() or "{}")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/health":
            return self._send(200, {"ok": True, "service": "happen-agent", "version": 1})
        if path == "/status":
            with state.lock:
                return self._send(200, {
                    "tracking": state.tracker is not None,
                    "sessionId": state.session_id,
                    "sessionName": state.session_name,
                })
        self._send(404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            body = self._read_json()
        except Exception:
            body = {}
        if path == "/checkin":
            sid = body.get("sessionId")
            token = body.get("token")
            backend = body.get("backendUrl") or DEFAULT_BACKEND
            if not sid or not token:
                return self._send(400, {"error": "sessionId and token required"})
            result = start_tracking(sid, token, backend)
            code = 200 if result.get("ok") else 400
            return self._send(code, result)
        if path == "/checkout":
            result = stop_tracking()
            code = 200 if result.get("ok") else 400
            return self._send(code, result)
        self._send(404, {"error": "Not found"})


def main():
    print(f"Happen companion agent listening on http://{HOST}:{PORT}")
    try:
        server = ThreadingHTTPServer((HOST, PORT), AgentHandler)
    except OSError as e:
        print(f"Failed to start agent on port {PORT}: {e}")
        print("Is another agent instance already running?")
        sys.exit(1)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAgent stopped.")


if __name__ == "__main__":
    main()
