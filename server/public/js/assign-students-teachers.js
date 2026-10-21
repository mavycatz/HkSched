(function(){
  const data = window.__AST__ || {};
  let slots = data.slots || [];
  let currentId = null;
  const loading = document.getElementById('ast-loading');
  const slotsEl = document.getElementById('ast-slots');
  const noSlot = document.getElementById('ast-no-slot');
  const slotInfo = document.getElementById('ast-slot-info');
  const assignedWrap = document.getElementById('ast-assigned');
  const assignedList = document.getElementById('ast-assigned-list');
  const assignForm = document.getElementById('ast-assign-form');
  const search = document.getElementById('ast-search');
  const searchBtn = document.getElementById('ast-search-btn');
  const results = document.getElementById('ast-results');
  const msg = document.getElementById('ast-assign-msg');
  function renderSlots(){
    loading.classList.add('d-none');
    if(!slots.length){ slotsEl.innerHTML='<div class="text-muted small">No slots</div>'; slotsEl.style.display='block'; return; }
    slotsEl.style.display='block';
    slotsEl.innerHTML = slots.map(s=>{
      const t = s.start_time ? new Date(s.start_time).toLocaleString() : '';
      return `<button type="button" class="list-group-item list-group-item-action" data-id="${s.id}"><div><strong>${s.title}</strong><div class="small text-muted">${s.area} • ${t}</div></div></button>`;
    }).join('');
    slotsEl.querySelectorAll('[data-id]').forEach(btn=>{
      btn.addEventListener('click', ()=>loadSlot(Number(btn.getAttribute('data-id'))));
    });
  }
  async function loadSlot(id){
    currentId = id;
    const res = await fetch('/api/duties/'+id+'/assignments');
    const d = await res.json();
    noSlot.classList.add('d-none');
    slotInfo.classList.remove('d-none');
    slotInfo.innerHTML = `<div class="p-2 border rounded"><strong>${d.slot.title}</strong><div class="small text-muted">${d.slot.area} • ${d.slot.start_time?new Date(d.slot.start_time).toLocaleString():''}</div></div>`;
    assignedWrap.classList.remove('d-none');
    assignedList.innerHTML = d.assignments.length ? d.assignments.map(a=>`<div class="list-group-item d-flex justify-content-between"><div><strong>${a.student_name}</strong><div class="small text-muted">${a.student_school_id}</div></div><button class="btn btn-sm btn-outline-danger" data-rem="${a.id}">Remove</button></div>`).join('') : '<div class="text-muted small">None assigned</div>';
    assignedList.querySelectorAll('[data-rem]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        if(!confirm('Remove assignment?')) return;
        const r = await fetch('/api/assignments/'+b.getAttribute('data-rem'),{method:'DELETE'});
        if(r.ok) loadSlot(currentId); else alert('Failed');
      });
    });
    assignForm.classList.remove('d-none');
    msg.textContent='';
    results.innerHTML='';
  }
  searchBtn.addEventListener('click', async ()=>{
    const q = search.value.trim();
    if(!q) return;
    const res = await fetch('/api/users/search?q='+encodeURIComponent(q));
    const d = await res.json();
    results.innerHTML = (d.users||[]).map(u=>`<button type="button" class="list-group-item list-group-item-action" data-uid="${u.id}">${u.name} (${u.school_id}) - ${u.role}</button>`).join('');
    results.querySelectorAll('[data-uid]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        if(!currentId){ msg.textContent='Select a slot first'; return; }
        const res2 = await fetch('/api/assignments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({duty_id: currentId, user_id: b.getAttribute('data-uid')})});
        if(res2.ok){ msg.textContent='Assigned'; loadSlot(currentId); results.innerHTML=''; search.value=''; }
        else { const j=await res2.json(); msg.textContent=j.error||'Failed'; }
      });
    });
  });
  renderSlots();
})();
