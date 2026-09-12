import os

app_path = r'd:\Projects\New folder\public\app.js'
with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace the Open Display button
old_button = '<button class="btn btn-secondary" onclick="navigate(\'/display\')" target="_blank">Open Display</button>'
new_button = '<button class="btn btn-primary" style="background:#087f79; border-color:#087f79; margin-right:8px;" onclick="openMainPresenterModal()">Open presenter screen ↗</button>'
if old_button in content:
    content = content.replace(old_button, new_button)
else:
    print("Warning: could not find old button to replace")

# 2. Add the modal HTML
modal_html = """
      <!-- Presenter Modal -->
      <div id="mainPresenterModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:none; place-items:center; z-index:1000;">
        <div style="background:#fff; color:#333; padding:24px; border-radius:12px; width:90%; max-width:400px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
          <h2 style="margin:0 0 16px 0; font-size:20px;">Start Presentation</h2>
          <p style="margin-bottom:12px;">Select which round and batch to present in your room:</p>
          <select id="mainPresenterRoundSelect" style="width:100%; margin-bottom:16px; padding:10px; font-size:16px; border-radius:6px; border:1px solid #ccc;"></select>
          <select id="mainPresenterBatchSelect" style="width:100%; margin-bottom:16px; padding:10px; font-size:16px; border-radius:6px; border:1px solid #ccc;"></select>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="closeMainPresenterModal()" style="color:#333; background:transparent; border:1px solid #ccc;">Cancel</button>
            <button class="btn btn-primary" style="background:#087f79; border-color:#087f79;" onclick="startMainPresentation()">Present</button>
          </div>
        </div>
      </div>
"""

old_header_end = """        </div>
      </div>"""
new_header_end = old_header_end + modal_html

# Only replace the first occurrence (which is in the admin dashboard)
if old_header_end in content:
    content = content.replace(old_header_end, new_header_end, 1)
else:
    print("Warning: could not find old header end")

# 3. Append the script logic at the end
script_logic = """

// --- Presenter Modal Logic (Main Dashboard) ---
let mainLinkupRounds = [];

async function openMainPresenterModal() {
  const roundSelect = document.getElementById('mainPresenterRoundSelect');
  const batchSelect = document.getElementById('mainPresenterBatchSelect');
  const modal = document.getElementById('mainPresenterModal');
  roundSelect.innerHTML = '<option>Loading...</option>';
  batchSelect.innerHTML = '';
  modal.style.display = 'grid';

  try {
    const { data, error } = await supabaseClient.from('linkup_rounds').select('*').order('order_index');
    if (error) throw error;
    mainLinkupRounds = data || [];
    
    roundSelect.innerHTML = '';
    const roundsList = [...new Set(mainLinkupRounds.map(r => r.round_name || 'Round 1'))];
    if (roundsList.length === 0) {
      alert('Please create a round in the LinkUp dashboard first!');
      closeMainPresenterModal();
      return;
    }
    
    roundsList.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r; opt.textContent = r;
      roundSelect.appendChild(opt);
    });
    
    roundSelect.onchange = () => {
      batchSelect.innerHTML = '';
      const batches = [...new Set(mainLinkupRounds.filter(r => (r.round_name || 'Round 1') === roundSelect.value).map(r => r.batch_name || 'Batch 1'))];
      batches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        batchSelect.appendChild(opt);
      });
    };
    roundSelect.onchange(); // trigger initial populate
  } catch (e) {
    console.error(e);
    alert('Failed to load rounds');
    closeMainPresenterModal();
  }
}

function closeMainPresenterModal() {
  document.getElementById('mainPresenterModal').style.display = 'none';
}

async function startMainPresentation() {
  const round_name = document.getElementById('mainPresenterRoundSelect').value;
  const batch_name = document.getElementById('mainPresenterBatchSelect').value;
  
  const roundMatch = round_name.match(/\\d+/);
  const batchMatch = batch_name.match(/\\d+/);
  
  const active_round = roundMatch ? parseInt(roundMatch[0]) : 1;
  const active_batch = batchMatch ? parseInt(batchMatch[0]) : 1;
  
  const roundObj = mainLinkupRounds.find(r => (r.round_name || 'Round 1') === round_name && (r.batch_name || 'Batch 1') === batch_name);
  const active_linkup_round_id = roundObj ? roundObj.id : null;
  
  const rc = new URLSearchParams(window.location.search).get('room');
  
  try {
    if (rc) {
      const { data: roomData, error: roomError } = await supabaseClient.from('rooms').select('id').eq('room_code', rc).single();
      if (roomError) throw roomError;
      
      const { error } = await supabaseClient.from('game_state').update({
        active_round, 
        active_batch, 
        active_linkup_round_id, 
        linkup_clue_index: 0, 
        linkup_revealed: false
      }).eq('room_id', roomData.id);
      
      if (error) throw error;
    }
    closeMainPresenterModal();
    window.open('/display?room=' + rc, '_blank');
  } catch (err) {
    console.error(err);
    alert("Failed to start presentation");
  }
}
"""

if "openMainPresenterModal" not in content:
    content += script_logic

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done patching app.js")
