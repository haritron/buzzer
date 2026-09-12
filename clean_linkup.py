import os

file_path = r"d:\Projects\New folder\public\linkup.html"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

bad_block1 = """					if (state.show_leaderboard) {
						updateLeaderboard();
						$('leaderboardOverlay').classList.add('show');
					}"""

bad_block2 = """					if (state.show_leaderboard) {
						updateLeaderboard();
						$('leaderboardOverlay').classList.add('show');
					}"""

# Try removing with exact indentation
content = content.replace(bad_block1, "")
# Try removing with alternative indentation (tab vs spaces or just the core lines)

# A more robust regex approach just in case
import re
content = re.sub(r'[\t ]*if\s*\(\s*state\.show_leaderboard\s*\)\s*\{\s*updateLeaderboard\(\);\s*\$\(\'leaderboardOverlay\'\)\.classList\.add\(\'show\'\);\s*\}', '', content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Cleaned all occurrences of state.show_leaderboard")
