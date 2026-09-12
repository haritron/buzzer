import os
import re

app_js_path = r'd:\Projects\New folder\public\app.js'

with open(app_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the end of triggerFlash
match = re.search(r'function triggerFlash\(type\).*?\}\s*\}\s*', content, re.DOTALL)
if match:
    new_content = content[:match.end()]
    with open(app_js_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Cleaned successfully.")
else:
    print("Could not find triggerFlash end.")
