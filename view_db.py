import os
import json
import webbrowser
import http.server
import socketserver
from urllib.parse import urlparse, parse_qs
from sqlalchemy import create_engine, MetaData, Table, select, text, func

# Load environment variables from backend/.env if it exists
ENV_PATH = "backend/.env" if os.path.exists("backend/.env") else ".env"
DATABASE_URL = "sqlite:///./backend/atlas_v3.db"

if os.path.exists(ENV_PATH):
    with open(ENV_PATH, "r") as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if "=" in stripped:
                key, val = stripped.split("=", 1)
                if key.strip() == "DATABASE_URL":
                    val = val.strip().strip('"').strip("'")
                    if val:
                        DATABASE_URL = val
                        break

# Fix for postgres:// protocol common in cloud hosting
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Fix relative SQLite path if running from root
if DATABASE_URL.startswith("sqlite:///./"):
    # If SQLite file is in backend/ and we are in root, prefix with backend/
    sqlite_filename = DATABASE_URL.replace("sqlite:///./", "")
    if not os.path.exists(sqlite_filename) and os.path.exists(f"backend/{sqlite_filename}"):
        DATABASE_URL = f"sqlite:///./backend/{sqlite_filename}"

PORT = 8555

HTML_CONTENT = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ATLAS Database Explorer</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0b0f19;
            --sidebar-bg: #111827;
            --card-bg: rgba(255, 255, 255, 0.03);
            --border-color: rgba(255, 255, 255, 0.08);
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --accent-color: #10b981;
            --accent-glow: rgba(16, 185, 129, 0.15);
            --danger-color: #ef4444;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            scrollbar-width: thin;
            scrollbar-color: var(--border-color) transparent;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-primary);
            display: flex;
            height: 100vh;
            overflow: hidden;
        }

        /* Sidebar Styles */
        .sidebar {
            width: 320px;
            background-color: var(--sidebar-bg);
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            padding: 24px;
            overflow-y: auto;
        }

        .logo-container {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .logo-icon {
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            color: white;
            box-shadow: 0 0 15px var(--accent-glow);
        }

        .logo-title {
            font-size: 20px;
            font-weight: 800;
            letter-spacing: -0.5px;
            background: linear-gradient(to right, #ffffff, #9ca3af);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .db-status {
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 24px;
            padding: 4px 8px;
            background-color: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            word-break: break-all;
        }

        .section-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: var(--text-secondary);
            margin-bottom: 12px;
        }

        .table-list {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .table-item {
            padding: 12px 16px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 1px solid transparent;
            font-weight: 500;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .table-item:hover {
            background-color: var(--card-bg);
            border-color: var(--border-color);
        }

        .table-item.active {
            background-color: var(--accent-glow);
            border-color: var(--accent-color);
            color: var(--accent-color);
            font-weight: 600;
        }

        .badge {
            background-color: rgba(255, 255, 255, 0.08);
            color: var(--text-secondary);
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 20px;
            font-weight: 600;
        }

        .table-item.active .badge {
            background-color: var(--accent-color);
            color: white;
        }

        /* Main Viewport */
        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Top Bar */
        .topbar {
            height: 84px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 40px;
        }

        .topbar-title {
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.5px;
        }

        .search-container {
            position: relative;
            width: 320px;
        }

        .search-input {
            width: 100%;
            padding: 10px 16px;
            background-color: var(--sidebar-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            color: white;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s ease;
        }

        .search-input:focus {
            border-color: var(--accent-color);
        }

        /* Grid Content */
        .grid-container {
            flex: 1;
            padding: 40px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        /* Table Card View */
        .table-card {
            background-color: var(--sidebar-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .scroll-wrapper {
            overflow-x: auto;
            max-width: 100%;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 14px;
        }

        th {
            background-color: rgba(255, 255, 255, 0.02);
            border-bottom: 1px solid var(--border-color);
            padding: 16px 20px;
            font-weight: 600;
            color: var(--text-secondary);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        td {
            padding: 16px 20px;
            border-bottom: 1px solid var(--border-color);
            color: var(--text-primary);
            max-width: 250px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        tr:last-child td {
            border-bottom: none;
        }

        tr:hover td {
            background-color: rgba(255, 255, 255, 0.01);
        }

        /* Status badges */
        .role-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .role-admin { background-color: rgba(239, 68, 68, 0.15); color: #ef4444; }
        .role-program_chair { background-color: rgba(16, 185, 129, 0.15); color: #10b981; }
        .role-faculty { background-color: rgba(59, 130, 246, 0.15); color: #3b82f6; }

        /* Empty State */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--text-secondary);
            gap: 16px;
        }

        .empty-icon {
            font-size: 64px;
        }
    </style>
</head>
<body>
    <!-- Sidebar -->
    <div class="sidebar">
        <div class="logo-container">
            <div class="logo-icon">A</div>
            <div class="logo-title">ATLAS DB Explorer</div>
        </div>
        <div class="db-status" id="db-status-text">Connecting...</div>
        <div class="section-title">Database Tables</div>
        <ul class="table-list" id="table-list">
            <!-- Tables load here -->
        </ul>
    </div>

    <!-- Main Viewport -->
    <div class="main-content">
        <!-- Topbar -->
        <div class="topbar">
            <div class="topbar-title" id="active-table-title">Select a Table</div>
            <div class="search-container">
                <input type="text" class="search-input" id="search-box" placeholder="Search rows..." oninput="filterTable()">
            </div>
        </div>

        <!-- Grid Container -->
        <div class="grid-container" id="main-viewport">
            <div class="empty-state">
                <div class="empty-icon">📁</div>
                <div>Click a table on the sidebar to view its structure and records.</div>
            </div>
        </div>
    </div>

    <script>
        let currentData = [];
        let headers = [];

        async function loadConnectionStatus() {
            try {
                const response = await fetch('/api/status');
                const status = await response.json();
                document.getElementById('db-status-text').innerText = "Connected to: " + status.url;
            } catch (err) {
                document.getElementById('db-status-text').innerText = "Connection Error";
            }
        }

        async function loadTables() {
            try {
                const response = await fetch('/api/tables');
                const tables = await response.json();
                const list = document.getElementById('table-list');
                list.innerHTML = '';
                
                tables.forEach(table => {
                    const li = document.createElement('li');
                    li.className = 'table-item';
                    li.innerHTML = `<span>${table.name}</span><span class="badge">${table.count}</span>`;
                    li.onclick = () => {
                        document.querySelectorAll('.table-item').forEach(el => el.classList.remove('active'));
                        li.classList.add('active');
                        loadTableData(table.name);
                    };
                    list.appendChild(li);
                });
            } catch (err) {
                console.error("Failed to load tables", err);
            }
        }

        async function loadTableData(tableName) {
            document.getElementById('active-table-title').innerText = tableName;
            const viewport = document.getElementById('main-viewport');
            viewport.innerHTML = '<div class="empty-state"><div>Loading records...</div></div>';
            
            try {
                const response = await fetch(`/api/table-data?name=${tableName}`);
                const data = await response.json();
                currentData = data.rows;
                headers = data.columns;
                
                renderTable(currentData);
            } catch (err) {
                viewport.innerHTML = `<div class="empty-state"><div style="color: var(--danger-color)">Error loading data: ${err}</div></div>`;
            }
        }

        function renderTable(rows) {
            const viewport = document.getElementById('main-viewport');
            if (rows.length === 0) {
                viewport.innerHTML = '<div class="empty-state"><div>No records found in this table.</div></div>';
                return;
            }

            let tableHtml = `
                <div class="table-card">
                    <div class="scroll-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    ${headers.map(h => `<th>${h}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody id="table-body">
                                ${rows.map(row => `
                                    <tr>
                                        ${headers.map(h => {
                                            const val = row[h] !== null ? row[h] : '<span style="color: var(--text-secondary); font-style: italic;">null</span>';
                                            if (h === 'role') {
                                                return `<td><span class="role-badge role-${row[h]}">${row[h]}</span></td>`;
                                            }
                                            return `<td title="${val}">${val}</td>`;
                                        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            viewport.innerHTML = tableHtml;
        }

        function filterTable() {
            const query = document.getElementById('search-box').value.toLowerCase().trim();
            if (!query) {
                renderTable(currentData);
                return;
            }

            const filtered = currentData.filter(row => {
                return Object.values(row).some(val => 
                    String(val).toLowerCase().includes(query)
                );
            });
            renderTable(filtered);
        }

        // Initial Load
        loadConnectionStatus();
        loadTables();
    </script>
</body>
</html>
"""

class DatabaseAPIHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Mute console logs to keep terminal clean
        return

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        
        if path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(HTML_CONTENT.encode("utf-8"))
            
        elif path == "/api/status":
            # Mask credentials from UI
            url_obj = urlparse(DATABASE_URL)
            masked_url = f"{url_obj.scheme}://{url_obj.hostname or 'local'}"
            if url_obj.path:
                masked_url += url_obj.path
                
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"url": masked_url}).encode("utf-8"))
            
        elif path == "/api/tables":
            engine = create_engine(DATABASE_URL)
            try:
                # Query table names and counts dynamically using SQLAlchemy
                metadata = MetaData()
                metadata.reflect(bind=engine)
                tables = []
                
                with engine.connect() as conn:
                    for tname in sorted(metadata.tables.keys()):
                        if tname.startswith("sqlite_"): continue
                        t = metadata.tables[tname]
                        # Run a count query
                        res = conn.execute(select(func.count()).select_from(t)).scalar()
                        tables.append({"name": tname, "count": res})
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(tables).encode("utf-8"))
            except Exception as e:
                self.send_error(500, str(e))
            finally:
                engine.dispose()
                
        elif path == "/api/table-data":
            query_params = parse_qs(parsed_url.query)
            table_name = query_params.get("name", [None])[0]
            
            if not table_name:
                self.send_error(400, "Missing name parameter")
                return
                
            engine = create_engine(DATABASE_URL)
            try:
                metadata = MetaData()
                metadata.reflect(bind=engine)
                
                if table_name not in metadata.tables:
                    self.send_error(404, f"Table {table_name} not found")
                    return
                    
                t = metadata.tables[table_name]
                columns = [c.name for c in t.columns]
                
                with engine.connect() as conn:
                    # Query all rows
                    res = conn.execute(select(t))
                    rows = []
                    for row in res.fetchall():
                        # Map row values to dict
                        row_dict = {}
                        for i, col_name in enumerate(columns):
                            val = row[i]
                            # Handle non-serializable objects (like datetime, date, time)
                            if hasattr(val, "isoformat"):
                                val = val.isoformat()
                            elif hasattr(val, "strftime"):
                                val = val.strftime("%H:%M:%S")
                            row_dict[col_name] = val
                        rows.append(row_dict)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"columns": columns, "rows": rows}).encode("utf-8"))
            except Exception as e:
                self.send_error(500, str(e))
            finally:
                engine.dispose()
        else:
            self.send_error(404, "Not Found")

def main():
    print("=== ATLAS DATABASE EXPLORER ===")
    
    # Connect and verify using SQLAlchemy
    engine = create_engine(DATABASE_URL)
    try:
        with engine.connect() as conn:
            # Mask credentials for terminal output
            url_obj = urlparse(DATABASE_URL)
            masked_url = f"{url_obj.scheme}://{url_obj.hostname or 'local'}"
            if url_obj.path:
                masked_url += url_obj.path
            print(f"Connected successfully to database: {masked_url}")
    except Exception as e:
        print(f"[ERROR] Failed to connect to database: {e}")
        return
    finally:
        engine.dispose()
        
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), DatabaseAPIHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"\n[SUCCESS] Explorer Server started successfully!")
        print(f"Opening your browser automatically: {url}")
        print("Press Ctrl+C to close and exit.")
        
        # Open in default web browser
        webbrowser.open(url)
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down database explorer server. Bye!")

if __name__ == "__main__":
    main()
