"""Local server for the site, without browser caching.

    python3 tools/serve.py          # then open http://localhost:8000

Same as `python3 -m http.server 8000` run from the site folder, except that every response
says Cache-Control: no-store, so the browser always shows the files as they are on disk
(the plain server lets the browser keep old versions of the scripts). It also answers
byte-range requests, so videos can be scrubbed and replayed as on GitHub Pages.
Optional: a port number, e.g. `python3 tools/serve.py 8080`.
"""
import functools
import http.server
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        m = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers.get('Range', ''))
        path = self.translate_path(self.path)
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        a, b = m.groups()
        start = int(a) if a else max(0, size - int(b))
        end = min(int(b), size - 1) if a and b else size - 1
        if start >= size:
            self.send_error(416)
            return None
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        n = getattr(self, '_remaining', None)
        if n is None:
            return super().copyfile(source, outputfile)
        while n > 0:
            chunk = source.read(min(65536, n))
            if not chunk:
                break
            outputfile.write(chunk)
            n -= len(chunk)
        self._remaining = None


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'http://localhost:{port}  (Ctrl+C to stop)')
    try:
        http.server.ThreadingHTTPServer(('', port), functools.partial(Handler, directory=ROOT)).serve_forever()
    except KeyboardInterrupt:
        pass
