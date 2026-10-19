"""Records one run of the PIPELINE_3D demo as a video, for the home and project pages.

    python3 tools/record_demo.py            # then open http://localhost:8001/tools/record_demo.html

The page plays the demo (demo/) frame by frame on a virtual clock, sends every frame of the
map here, and this script assembles them with ffmpeg into
    assets/video/pipeline-3d.mp4   (H.264, 30 fps, plays everywhere)
    assets/video/pipeline-3d.jpg   (poster: the final route)
Options for the page go in its URL: ?seed=19&speed=2&fps=30&size=720.
Needs ffmpeg on the PATH. Stop the server with Ctrl+C when the page says it is done.
"""
import http.server
import json
import os
import shutil
import subprocess
import tempfile
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'video')
PORT = 8001
frames_dir = tempfile.mkdtemp(prefix='demo-frames-')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass

    def reply(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        data = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if url.path == '/__reset':                 # a new recording starts: drop old frames
            for f in os.listdir(frames_dir):
                os.remove(os.path.join(frames_dir, f))
            return self.reply({'ok': True})
        if url.path == '/__frame':
            n = int(urllib.parse.parse_qs(url.query)['n'][0])
            with open(os.path.join(frames_dir, f'{n:05d}.jpg'), 'wb') as f:
                f.write(data)
            return self.reply({'ok': True})
        if url.path == '/__done':
            opts = json.loads(data or b'{}')
            return self.reply(assemble(int(opts.get('fps', 30)), int(opts.get('last', 0))))
        self.reply({'error': 'unknown endpoint'}, 404)


def assemble(fps, last):
    os.makedirs(OUT, exist_ok=True)
    mp4 = os.path.join(OUT, 'pipeline-3d.mp4')
    jpg = os.path.join(OUT, 'pipeline-3d.jpg')
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(frames_dir, '%05d.jpg'),
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        return {'error': r.stderr}
    shutil.copyfile(os.path.join(frames_dir, f'{last:05d}.jpg'), jpg)
    return {'ok': True, 'mp4': os.path.relpath(mp4, ROOT), 'mp4_bytes': os.path.getsize(mp4),
            'poster': os.path.relpath(jpg, ROOT), 'frames': len(os.listdir(frames_dir))}


if __name__ == '__main__':
    print(f'serving {ROOT} on http://localhost:{PORT}/tools/record_demo.html (frames in {frames_dir})')
    try:
        http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        shutil.rmtree(frames_dir, ignore_errors=True)
