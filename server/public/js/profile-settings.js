(function(){
  const form = document.getElementById('ps-form');
  const msg = document.getElementById('ps-msg');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d = await res.json();
    msg.textContent = d.ok ? 'Profile updated' : (d.error||'Error');
    msg.className = d.ok ? 'mt-2 small text-success' : 'mt-2 small text-danger';
  });
  const np = document.getElementById('np-form');
  const npm = document.getElementById('np-msg');
  np.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const prefs = { email: document.getElementById('np-email').checked, in_app: document.getElementById('np-inapp').checked };
    const res = await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notification_preferences: prefs})});
    const d = await res.json();
    npm.textContent = d.ok ? 'Preferences updated' : 'Error';
    npm.className = d.ok ? 'mt-2 small text-success' : 'mt-2 small text-danger';
  });
  const cp = document.getElementById('cp-form');
  const cpm = document.getElementById('cp-msg');
  cp.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(cp);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch('/api/profile/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d = await res.json();
    cpm.textContent = d.ok ? 'Password changed' : (d.error||'Error');
    cpm.className = d.ok ? 'mt-2 small text-success' : 'mt-2 small text-danger';
    if(d.ok) cp.reset();
  });
})();
