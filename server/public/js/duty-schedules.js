(function(){
  const data = window.__DS__ || {};
  let slots = data.slots || [];
  const loading = document.getElementById('ds-loading');
  const empty = document.getElementById('ds-empty');
  const list = document.getElementById('ds-list');
  function render(){
    loading.classList.add('d-none');
    if(!slots.length){ empty.classList.remove('d-none'); list.style.display='none'; return; }
    empty.classList.add('d-none');
    list.style.display='block';
    list.innerHTML = slots.map(s=>{
      const t = s.start_time ? new Date(s.start_time) : null;
      const time = t ? t.toLocaleString() : '-';
      return `<a href="#" class="list-group-item list-group-item-action" data-id="${s.id}">
        <div class="d-flex justify-content-between">
          <div><strong>${s.title||'-'}</strong><div class="small text-muted">${s.area||'-'} ${s.class_group? '• '+s.class_group:''}</div></div>
          <div class="text-end small text-muted">${time}</div>
        </div>
      </a>`;
    }).join('');
    list.querySelectorAll('[data-id]').forEach(el=>{
      el.addEventListener('click', async (e)=>{
        e.preventDefault();
        const id = el.getAttribute('data-id');
        const res = await fetch('/api/duties/'+id);
        const d = await res.json();
        const body = document.getElementById('dd-content');
        body.innerHTML = `<p><strong>${d.slot.title}</strong></p><p>Area: ${d.slot.area}</p><p>Time: ${d.slot.start_time ? new Date(d.slot.start_time).toLocaleString() : '-'}</p><p>Status: ${d.slot.status}</p><p>Assigned: ${d.assignments.length}</p>`;
        new bootstrap.Modal(document.getElementById('dutyDetailModal')).show();
      });
    });
  }
  render();
})();
