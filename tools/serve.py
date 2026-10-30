#!/usr/bin/env python3
"""Dev server that refuses to let the browser cache anything.

A plain file server lets the browser hold on to old ES modules, so after a
code change you can never be quite sure what is running - and clearing the
cache also clears localStorage, which holds the key bindings, the mouse
settings and the campaign progress.

This serves every file with no-store and answers no conditional requests, so
an ordinary reload is always the current code and localStorage survives.

Binds 127.0.0.1 by default. Pass 0.0.0.0 as the host to reach it from another
machine on the network (another device, or Windows when running under WSL).

  python3 tools/serve.py [port] [host]      default 8099 127.0.0.1
"""
import http.server, socketserver, sys, os, socket

class NoCache(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        # a 304 is exactly how a stale module survives a reload
        for h in ('If-Modified-Since', 'If-None-Match'):
            if h in self.headers:
                del self.headers[h]
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '304' not in (args[1] if len(args) > 1 else ''):
            super().log_message(fmt, *args)

def lan_address():
    """The address this machine is reachable at from the rest of the network."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))          # sets a route, sends nothing
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((host, port), NoCache) as httpd:
        shown = lan_address() if host == '0.0.0.0' else host
        lines = ['serving %s  (nothing is cached)' % os.getcwd()]
        if shown and shown != '127.0.0.1':
            lines += ['  http://%s:%d/                 from another device' % (shown, port),
                      '  http://%s:%d/#level=act1-1    a level directly' % (shown, port),
                      '  http://%s:%d/#unlock          every level in the picker' % (shown, port)]
        lines.append('  http://127.0.0.1:%d/                 from this machine' % port)
        sys.stdout.write('\n'.join(lines) + '\n')
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print()
