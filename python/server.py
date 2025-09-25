#!/usr/bin/env python3

import os
import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import mimetypes

class MarkdownServer(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)

        # API endpoint to get file tree
        if parsed_path.path == '/api/files':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            file_tree = self.build_file_tree('samples')
            self.wfile.write(json.dumps(file_tree).encode())
            return

        # API endpoint to get file content
        elif parsed_path.path == '/api/file':
            query = parse_qs(parsed_path.query)
            if 'path' in query:
                file_path = os.path.join('samples', query['path'][0])
                if os.path.exists(file_path) and file_path.endswith('.md'):
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/plain; charset=utf-8')
                    self.end_headers()
                    with open(file_path, 'r', encoding='utf-8') as f:
                        self.wfile.write(f.read().encode('utf-8'))
                    return
            self.send_error(404, "File not found")
            return

        # Serve the main HTML file for root
        elif parsed_path.path == '/':
            self.path = '/index.html'

        # Default to serving static files
        return SimpleHTTPRequestHandler.do_GET(self)

    def build_file_tree(self, root_dir):
        tree = {}
        if not os.path.exists(root_dir):
            return tree

        for item in os.listdir(root_dir):
            item_path = os.path.join(root_dir, item)
            if os.path.isdir(item_path):
                # Recursively build tree for subdirectories
                tree[item] = self.build_file_tree(item_path)
            elif item.endswith('.md'):
                # Only include markdown files
                tree[item] = True

        return tree

    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        SimpleHTTPRequestHandler.end_headers(self)

if __name__ == '__main__':
    port = 8888
    server_address = ('', port)
    httpd = HTTPServer(server_address, MarkdownServer)

    print(f"🚀 Markdown & Mermaid Viewer Server")
    print(f"📁 Serving files from: samples/")
    print(f"🌐 Open http://localhost:{port} in your browser")
    print(f"Press Ctrl+C to stop the server")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server stopped")