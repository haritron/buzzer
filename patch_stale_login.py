import os

server_js_path = r'd:\Projects\New folder\server.js'
app_js_path = r'd:\Projects\New folder\public\app.js'

# 1. Update server.js to use requireGlobalAdmin on /api/rooms/create
with open(server_js_path, 'r', encoding='utf-8') as f:
    server_content = f.read()

server_content = server_content.replace(
    "app.post('/api/rooms/create', async (req, res) => {",
    "app.post('/api/rooms/create', requireGlobalAdmin, async (req, res) => {"
)

with open(server_js_path, 'w', encoding='utf-8') as f:
    f.write(server_content)

# 2. Update app.js to handle 401 Unauthorized from /api/rooms/create by logging out
with open(app_js_path, 'r', encoding='utf-8') as f:
    app_content = f.read()

create_new_room_replacement = """
    const res = await fetch('/api/rooms/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId })
    });
    
    if (res.status === 401) {
      alert("Your session has expired or is invalid. Please log in again.");
      logoutGlobalAdmin();
      return;
    }
    
    const data = await res.json();
    if (data.ok) {
      window.location.search = '?room=' + data.roomCode;
    } else {
      alert(data.message);
    }
"""

if "const res = await fetch('/api/rooms/create'" in app_content:
    import re
    app_content = re.sub(
        r'const res = await fetch\(\'/api/rooms/create\'.*?\.then\(r => r\.json\(\)\);\s*if \(res\.ok\) \{\s*window\.location\.search = \'\?room=\' \+ res\.roomCode;\s*\} else \{\s*alert\(res\.message\);\s*\}',
        create_new_room_replacement.strip(),
        app_content,
        flags=re.DOTALL
    )

with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(app_content)

print("done")
