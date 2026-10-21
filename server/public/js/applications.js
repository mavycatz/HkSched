(function(){
  const data = window.__APP__ || {};
  const apps = data.apps || [];
  const role = data.role;
  const loading = document.getElementById('app-loading');
  const empty = document.getElementById('app-empty');
  const wrap = document.getElementById('app-table-wrap');
  const tbody = document.getElementById('app-tbody');
  function render(){
    loading.classList.add('d-none');
    if(!apps.length){ empty.classList.remove('d-none'); wrap.style.display='none'; return; }
    wrap.style.display='block';
    tbody.innerHTML = apps.map(a=>{
      const status = a.status;
      const badge = status==='approved'?'badge-done':status==='rejected'?'badge-overdue':'badge-pending';
      const canReview = role === 'CSDL' && status === 'pending';
      return `<tr>
        <td><strong>${a.applicant_name||'-'}</strong><div class="small text-muted">${a.applicant_school_id||''}</div></td>
        <td>${a.duty_title||'-'}<div class="small text-muted">${a.duty_area||''}</div></td>
        <td>${a.duty_date|| (a.created_at?new Date(a.created_at).toLocaleDateString():'-')}</td>
        <td class="small">${(a.message||'').substring(0,60)}</td>
        <td><span class="badge badge-status ${badge}">${status}</span></td>
        <td class="text-end">${canReview?`<button class="btn btn-sm btn-primary" data-review="${a.id}">Review</button>`:''}</td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-review]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.getElementById('review-app-id').value = btn.getAttribute('data-review');
        document.getElementById('review-note').value = '';
        new bootstrap.Modal(document.getElementById('reviewModal')).show();
      });
    });
  }
  document.getElementById('btn-approve').addEventListener('click', ()=>doReview('approve'));
  document.getElementById('btn-reject').addEventListener('click', ()=>doReview('reject'));
  async function doReview(action){
    const id = document.getElementById('review-app-id').value;
    const note = document.getElementById('review-note').value;
    const res = await fetch('/api/applications/'+id+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,note})});
    if(res.ok){ bootstrap.Modal.getInstance(document.getElementById('reviewModal')).hide(); alert(action==='approve'?'Approved and assigned':'Rejected'); location.reload(); }
    else alert('Failed');
  }
  render();
})();
