const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lbdpaedflraegmyeyiat.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_fc7Gs9mzlB7IrVS-PyijdQ_isJxONfg';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('linkup_rounds').select('*').limit(1);
  console.log('Error:', error);
  console.log('Data:', data);
}
test();
