import os
import re

app_js_path = r'd:\Projects\New folder\public\app.js'
style_css_path = r'd:\Projects\New folder\public\style.css'

# 1. Update style.css
with open(style_css_path, 'r', encoding='utf-8') as f:
    css_content = f.read()

css_content = css_content.replace('max-width: 1000px;', 'max-width: 1400px;')
css_content = css_content.replace('grid-template-columns: 1fr 2fr;', 'grid-template-columns: 1fr 1.5fr 1.5fr;')

with open(style_css_path, 'w', encoding='utf-8') as f:
    f.write(css_content)


# 2. Update app.js
with open(app_js_path, 'r', encoding='utf-8') as f:
    app_content = f.read()

# Remove the Show Leaderboard button
app_content = re.sub(r'<button class="btn btn-primary"[^>]*onclick="toggleLeaderboard\(\)"[^>]*>.*?<\/button>', '', app_content, flags=re.DOTALL)

# Create the leaderboard panel HTML
leaderboard_panel = """
      <div class="panel">
        <h3 class="mb-4">Live Leaderboard</h3>
        <div class="team-list">
          ${[...globalState.teams].sort((a,b) => b.score - a.score).map((t, index) => `
            <div class="team-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px; margin-bottom:8px; border-radius:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="font-size:1.5rem; font-weight:900; color:${index === 0 ? '#fbbf24' : index === 1 ? '#94a3b8' : index === 2 ? '#b45309' : 'rgba(255,255,255,0.5)'}; width:30px;">#${index+1}</div>
                <div>
                  <strong style="font-size:1.2rem;">${t.teamName}</strong><br>
                  <small style="color:var(--text-secondary);">${t.memberName}</small>
                </div>
              </div>
              <div style="font-size:1.8rem; font-weight:bold; color:#4ade80;">
                ${t.score}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
"""

# Insert the panel before the closing tag of admin-container
app_content = app_content.replace("</div>\n    </div>\n  `;\n\n  \n}", "</div>\n" + leaderboard_panel + "\n    </div>\n  `;\n\n  \n}")

with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(app_content)

print("done")
