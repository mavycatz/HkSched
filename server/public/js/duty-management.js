(function(){
  const data = window.__DM__ || {};
  let all = (data.slots || []).map(s => {
    const d = s.start_time ? new Date(s.start_time) : null;
    const status = (s.status || 'pending').toLowerCase();
    const norm = status === 'missed' ? 'cancelled' : status;
    return {
      id: s.id,
      title: s.title || 'Duty',
      area: s.area || '-',
      description: s.description || s.title || '-',
      start_time: s.start_time,
      end_time: s.end_time,
      date: d,
      month: d ? d.toLocaleString('en-US', { month: 'short' }) : '-',
      day: d ? d.getDate() : '-',
      weekday: d ? d.toLocaleString('en-US', { weekday: 'short' }) : '-',
      person: s.assignee_name || 'Unassigned',
      teacher: s.class_group || s.assignee_name || '-',
      status: norm,
      raw: s
    };
  });
  all.sort((a,b)=> (b.date?b.date.getTime():0) - (a.date?a.date.getTime():0));

  const skel = document.getElementById('dm-skel');
  const list = document.getElementById('dm-list');
  const empty = document.getElementById('dm-empty');
  const error = document.getElementById('dm-error');
  const search = document.getElementById('dm-search');
  const statusF = document.getElementById('dm-status');
  const dateF = document.getElementById('dm-date');
  const sortF = document.getElementById('dm-sort');
  const count = document.getElementById('dm-count');
  const prev = document.getElementById('dm-prev');
  const next = document.getElementById('dm-next');
  const pagesEl = document.getElementById('dm-pages');
  const createBtn = document.getElementById('dm-create-btn');
  const modalEl = document.getElementById('dmModal');
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  const form = document.getElementById('dm-form');
  const formMsg = document.getElementById('dm-form-msg');
  const modalTitle = document.getElementById('dmModalTitle');

  let page = 1;
  const pageSize = 5;

  function apply(){
    let items = all.slice();
    const q = (search.value||'').toLowerCase();
    if(q){
      items = items.filter(it => (it.person.toLowerCase().includes(q) || it.area.toLowerCase().includes(q) || it.title.toLowerCase().includes(q) || it.description.toLowerCase().includes(q)));
    }
    const sf = statusF.value;
    if(sf && sf !== 'all'){ items = items.filter(it => it.status === sf); }
    if(dateF.value){
      items = items.filter(it => it.date && it.date.toISOString().slice(0,10) === dateF.value);
    }
    if(sortF.value === 'oldest'){
      items.sort((a,b)=>(a.date?a.date.getTime():0)-(b.date?b.date.getTime():0));
    }else{
      items.sort((a,b)=>(b.date?b.date.getTime():0)-(a.date?a.date.getTime():0));
    }
    render(items);
  }

  function render(items){
    skel.style.display = 'none';
    if(!items.length){ list.style.display='none'; empty.classList.remove('d-none'); count.textContent='Showing 0 of 0 duties'; pagesEl.innerHTML=''; prev.disabled=true; next.disabled=true; return; }
    empty.classList.add('d-none');
    list.style.display='flex';
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total/pageSize));
    if(page > pages) page = pages;
    const start = (page-1)*pageSize;
    const view = items.slice(start, start+pageSize);
    count.textContent = `Showing ${start+1}-${Math.min(start+pageSize,total)} of ${total} duties`;
    list.innerHTML = view.map(it=>{
      const initials = it.person.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
      const time = it.date ? it.date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
      const end = it.raw.end_time ? new Date(it.raw.end_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
      const timeStr = end ? time + ' - ' + end : time;
      return `<article class="dm-card status-${it.status}">
        <div class="dm-date">
          <div class="dm-date-month">${it.month}</div>
          <div class="dm-date-day">${it.day}</div>
          <div class="dm-date-week">${it.weekday}</div>
        </div>
        <div class="dm-main">
          <div class="dm-top">
            <div class="dm-person">
              <div class="dm-avatar">${initials}</div>
              <div class="dm-name">${it.person}</div>
            </div>
            <span class="dm-badge ${it.status}">${it.status === 'cancelled' ? 'Cancelled' : it.status === 'completed' ? 'Completed' : 'Pending'}</span>
          </div>
          <div class="dm-meta">
            <div class="dm-meta-item"><i class="bi bi-book"></i><span>${it.area}</span></div>
            <div class="dm-meta-item"><i class="bi bi-broom"></i><span>${it.title}</span></div>
            <div class="dm-meta-item"><i class="bi bi-clock"></i><span>${timeStr || '-'}</span></div>
            <div class="dm-meta-item"><i class="bi bi-person-badge"></i><span>${it.teacher}</span></div>
          </div>
        </div>
        ${data.isStaff ? `<div class="dm-actions">
          <button class="dm-icon-btn edit" data-edit="${it.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="dm-icon-btn del" data-del="${it.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </div>` : ''}
      </article>`;
    }).join('');
    list.querySelectorAll('[data-edit]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = Number(btn.getAttribute('data-edit'));
        const s = all.find(x=>x.id===id);
        if(!s) return;
        modalTitle.textContent = 'Edit schedule';
        form.id.value = s.id;
        form.title.value = s.raw.title || '';
        form.area.value = s.raw.area || '';
        form.description.value = s.raw.description || '';
        if(s.raw.start_time){ form.start_time.value = new Date(s.raw.start_time).toISOString().slice(0,16); }
        if(s.raw.end_time){ form.end_time.value = new Date(s.raw.end_time).toISOString().slice(0,16); }
        form.status.value = s.raw.status === 'missed' ? 'missed' : s.raw.status || 'pending';
        form.class_group.value = s.raw.class_group || '';
        formMsg.textContent = '';
        if(modal) modal.show();
      });
    });
    list.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-del');
        if(!confirm('Delete this duty?')) return;
        const res = await fetch('/api/duties/'+id,{method:'DELETE'});
        if(res.ok){ location.reload(); } else alert('Failed to delete');
      });
    });

    pagesEl.innerHTML = '';
    for(let p=1;p<=pages;p++){
      const b = document.createElement('button');
      b.className = 'dm-page' + (p===page?' active':'');
      b.textContent = p;
      b.addEventListener('click', ()=>{ page=p; apply(); });
      pagesEl.appendChild(b);
    }
    prev.disabled = page<=1;
    next.disabled = page>=pages;
    prev.onclick = ()=>{ if(page>1){ page--; apply(); }};
    next.onclick = ()=>{ if(page<pages){ page++; apply(); }};
  }

  if(createBtn){
    createBtn.addEventListener('click', ()=>{
      modalTitle.textContent = 'Create schedule';
      form.reset(); form.id.value='';
      form.status.value = 'pending';
      formMsg.textContent = '';
      if(modal) modal.show();
    });
  }

  if(form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      const id = body.id;
      delete body.id;
      if(body.status === 'missed') body.status = 'pending';
      formMsg.textContent = 'Saving...';
      try {
        let res;
        if(id){ res = await fetch('/api/duties/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
        else { res = await fetch('/api/duties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
        const j = await res.json();
        if(res.ok){ formMsg.textContent='Saved'; setTimeout(()=>location.reload(), 600); }
        else formMsg.textContent = j.error || 'Error saving';
      } catch(ex){ formMsg.textContent = 'Error'; }
    });
  }

  [search,statusF,dateF,sortF].forEach(el=>{ if(el) el.addEventListener('input', ()=>{ page=1; apply(); }); if(el && el.tagName==='SELECT') el.addEventListener('change', ()=>{ page=1; apply(); }); });
  setTimeout(apply, 150);
})();
