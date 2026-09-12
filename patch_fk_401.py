import os
import re

server_js_path = r'd:\Projects\New folder\server.js'

with open(server_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add foreign key check to the insert error handler in /api/rooms/create
patch_code = """
      } else {
        console.error("Room creation error/no room returned. Error:", error, "newRoom:", newRoom);
        if (error && error.code === '23503') {
           // Foreign key violation on admin_id
           return res.status(401).json({ ok: false, message: 'Your admin session is invalid (ID not found in database). Please log out and log in again.' });
        }
      }
"""

content = re.sub(
    r'\} else \{\s*console\.error\("Room creation error/no room returned\. Error:", error, "newRoom:", newRoom\);\s*\}',
    patch_code.strip(),
    content,
    flags=re.DOTALL
)

with open(server_js_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("done")
