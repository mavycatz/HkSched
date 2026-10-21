(function(){
  const data = window.__MC__ || {};
  let slots = data.slots || [];
  const tbody = document.getElementById('mc-tbody');
  const empty = document.getElementById('mc-empty');
  function render(){
    if(!slots.length){ empty.classList.remove('d-none'); return; }
    empty.classList.add('d-none');
    tbody.innerHTML = slots.map(s=>{
      const t = s.start_time ? new Date(s.start_time) : null;
      const isOverdue = t && t < new Date() && s.status !== 'completed';
      const status = s.status || (isOverdue?'missed':'pending');
      return `<tr class="${isOverdue?'table-warning':''}">
        <td><strong>${s.title||'-'}</strong></td>
        <td>${s.area||'-'}</td>
        <td>${t?t.toLocaleString(): '-'}</td>
        <td>${s.assignee_name||'-'}</td>
        <td><span class="badge badge-status ${status==='completed'?'badge-done':status==='missed'?'badge-overdue':'badge-pending'}">${status}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-success me-1" data-comp="${s.id}">Mark Complete</button>
          <button class="btn btn-sm btn-outline-warning" data-remind="${s.id}">Send Reminder</button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-comp]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        if(!confirm('Mark duty complete?')) return;
        const r = await fetch('/api/duties/'+b.getAttribute('data-comp')+'/complete',{method:'POST'});
        if(r.ok){ location.reload(); } else alert('Failed');
      });
    });
    tbody.querySelectorAll('[data-remind]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const r = await fetch('/api/duties/'+b.getAttribute('data-remind')+'/remind',{method:'POST'});
        if(r.ok){ alert('Reminder sent'); } else alert('Failed');
      });
    });
  }
  render();
})();
