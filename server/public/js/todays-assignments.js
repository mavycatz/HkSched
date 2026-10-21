(function(){
  const data = window.__TA__ || {};
  const slots = data.slots || [];
  const assignments = data.assignments || [];
  const loading = document.getElementById('ta-loading');
  const empty = document.getElementById('ta-empty');
  const error = document.getElementById('ta-error');
  const wrap = document.getElementById('ta-table-wrap');
  const tbody = document.getElementById('ta-tbody');
  function render(){
    loading.classList.add('d-none');
    const items = assignments.length ? assignments : slots.map(s=>({id: null, duty_id: s.id, duty_title: s.title, duty_area: s.area, start_time: s.start_time, status: s.status}));
    if(!items.length){ empty.classList.remove('d-none'); wrap.style.display='none'; return; }
    wrap.style.display='block';
    tbody.innerHTML = items.map(it=>{
      const t = it.start_time ? new Date(it.start_time) : null;
      const time = t ? t.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-';
      const status = (it.status||'pending').toLowerCase();
      const badge = status.includes('done')||status.includes('complete') ? 'badge-done' : status.includes('overdue')||status.includes('miss') ? 'badge-overdue' : status.includes('ongo') ? 'badge-ongoing' : 'badge-pending';
      return `<tr>
        <td><strong>${it.duty_title||'-'}</strong></td>
        <td>${it.duty_area||'-'}</td>
        <td>${time}</td>
        <td><span class="badge badge-status ${badge}">${status}</span></td>
        <td class="text-end">${it.id ? `<button class="btn btn-sm btn-success" data-done="${it.id}">Mark Done</button>` : ''}</td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-done]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-done');
        const res = await fetch('/api/assignments/'+id+'/done',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
        if(res.ok){ btn.closest('tr').querySelector('.badge').className='badge badge-status badge-done'; btn.remove(); alert('Marked as done'); }
        else alert('Failed to mark done');
      });
    });
  }
  try { render(); } catch(e){ loading.classList.add('d-none'); error.classList.remove('d-none'); }
})();
