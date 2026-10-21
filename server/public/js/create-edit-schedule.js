(function(){
  const data = window.__CES__ || {};
  let slots = data.slots || [];
  const form = document.getElementById('ces-form');
  const list = document.getElementById('ces-list');
  const loading = document.getElementById('ces-loading');
  const empty = document.getElementById('ces-empty');
  const reset = document.getElementById('ces-reset');
  const del = document.getElementById('ces-delete');
  const msg = document.getElementById('ces-msg');
  function render(){
    loading.classList.add('d-none');
    if(!slots.length){ empty.classList.remove('d-none'); list.style.display='none'; return; }
    empty.classList.add('d-none');
    list.style.display='block';
    list.innerHTML = slots.map(s=>{
      const t = s.start_time ? new Date(s.start_time) : null;
      return `<button type="button" class="list-group-item list-group-item-action" data-id="${s.id}">
        <div class="d-flex justify-content-between"><div><strong>${s.title}</strong><div class="small text-muted">${s.area}</div></div><div class="small text-muted">${t?t.toLocaleString():''}</div></div>
      </button>`;
    }).join('');
    list.querySelectorAll('[data-id]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = Number(btn.getAttribute('data-id'));
        const s = slots.find(x=>x.id===id);
        if(!s) return;
        form.id.value = s.id;
        form.title.value = s.title||'';
        form.area.value = s.area||'';
        form.description.value = s.description||'';
        if(s.start_time){ form.start_time.value = new Date(s.start_time).toISOString().slice(0,16); }
        if(s.end_time){ form.end_time.value = new Date(s.end_time).toISOString().slice(0,16); }
        form.required_headcount.value = s.required_headcount||1;
        form.class_group.value = s.class_group||'';
        form.status.value = s.status||'pending';
        del.classList.remove('d-none');
        msg.textContent = 'Editing slot #'+s.id;
      });
    });
  }
  reset.addEventListener('click', ()=>{
    form.reset(); form.id.value=''; del.classList.add('d-none'); msg.textContent='Creating new slot';
  });
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    const id = body.id;
    delete body.id;
    msg.textContent = 'Saving...';
    try {
      let res;
      if(id){ res = await fetch('/api/duties/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
      else { res = await fetch('/api/duties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
      const data = await res.json();
      if(res.ok){ msg.textContent='Saved successfully'; setTimeout(()=>location.reload(), 800); }
      else msg.textContent = data.error || 'Error saving';
    } catch(ex){ msg.textContent = 'Error'; }
  });
  del.addEventListener('click', async ()=>{
    const id = form.id.value;
    if(!id) return;
    if(!confirm('Delete this duty slot?')) return;
    const res = await fetch('/api/duties/'+id,{method:'DELETE'});
    if(res.ok){ location.reload(); } else alert('Failed to delete');
  });
  render();
  msg.textContent = 'Creating new slot';
})();
