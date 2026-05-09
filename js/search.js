/* 查詢頁邏輯：GET 到 Apps Script 取回紀錄 */
(function () {
  const els = {
    form: document.getElementById('searchForm'),
    name: document.getElementById('searchName'),
    btn: document.getElementById('searchBtn'),
    alertBox: document.getElementById('alertBox'),
    results: document.getElementById('resultsArea'),
    modal: document.getElementById('imageModal'),
    modalImg: document.getElementById('modalImage'),
    modalClose: document.getElementById('modalClose')
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function showAlert(type, msg) {
    els.alertBox.innerHTML = '<div class="alert alert-' + type + '">' + escapeHtml(msg) + '</div>';
  }

  function clearAlert() { els.alertBox.innerHTML = ''; }

  function statusClass(s) {
    if (s === '已完成') return 'status-done';
    if (s === '比對失敗') return 'status-failed';
    return 'status-pending';
  }

  /** 從 "GT003 (0.91)" 解析出分數 */
  function parseScore(rankStr) {
    const m = String(rankStr || '').match(/\(([0-9.]+)\)/);
    return m ? parseFloat(m[1]) : NaN;
  }

  function rankClass(score) {
    if (isNaN(score)) return 'rank-low';
    if (score >= 0.8) return 'rank-high';
    if (score >= 0.5) return 'rank-mid';
    return 'rank-low';
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('zh-TW', { hour12: false });
  }

  function sideLabel(s) {
    return s === 'left' ? '左側' : s === 'right' ? '右側' : (s || '—');
  }

  function renderResults(results) {
    if (!results || results.length === 0) {
      els.results.innerHTML = '<p class="helper-text">查無此姓名的回報紀錄</p>';
      return;
    }
    const html = results.map(function (r) {
      const ranks = (r.results || []).map(function (rk) {
        const score = parseScore(rk);
        return '<span class="rank-item ' + rankClass(score) + '">' + escapeHtml(rk) + '</span>';
      }).join('');
      const thumb = r.thumbnail_url
        ? '<img src="' + escapeHtml(r.thumbnail_url) + '" alt="" data-full="' + escapeHtml(r.thumbnail_url.replace(/sz=w\d+/, 'sz=w1600')) + '">'
        : '<div style="height:120px;background:var(--c-sand);border-radius:6px;"></div>';
      return '<div class="search-result">' +
        '<div>' + thumb + '</div>' +
        '<div>' +
          '<div class="result-meta">' +
            '<span><strong>時間：</strong>' + escapeHtml(fmtTime(r.timestamp)) + '</span>' +
            '<span><strong>地點：</strong>' + escapeHtml(r.location || '—') + '</span>' +
            '<span><strong>側別：</strong>' + escapeHtml(sideLabel(r.side)) + '</span>' +
            '<span class="status-tag ' + statusClass(r.status) + '">' + escapeHtml(r.status || '—') + '</span>' +
          '</div>' +
          '<div class="rank-list">' + (ranks || '<span class="helper-text">尚無比對結果</span>') + '</div>' +
        '</div>' +
        '</div>';
    }).join('');
    els.results.innerHTML = html;

    // 點縮圖看大圖
    els.results.querySelectorAll('.search-result img').forEach(function (img) {
      img.addEventListener('click', function () {
        els.modalImg.src = img.dataset.full || img.src;
        els.modal.classList.add('show');
      });
    });
  }

  els.modalClose.addEventListener('click', function () {
    els.modal.classList.remove('show');
    els.modalImg.src = '';
  });
  els.modal.addEventListener('click', function (e) {
    if (e.target === els.modal) {
      els.modal.classList.remove('show');
      els.modalImg.src = '';
    }
  });

  els.form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    clearAlert();
    const name = els.name.value.trim();
    if (!name) return;

    if (!APP_CONFIG.APPS_SCRIPT_URL || APP_CONFIG.APPS_SCRIPT_URL.indexOf('（') === 0) {
      showAlert('error', '系統尚未設定，請聯絡管理員');
      return;
    }

    els.btn.disabled = true;
    els.btn.innerHTML = '<span class="spinner"></span>搜尋中…';
    els.results.innerHTML = '';

    try {
      const url = APP_CONFIG.APPS_SCRIPT_URL + '?name=' + encodeURIComponent(name);
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.ok) {
        renderResults(data.results || []);
      } else {
        showAlert('error', '查詢失敗：' + (data.error || '未知錯誤'));
      }
    } catch (err) {
      console.error(err);
      showAlert('error', '網路錯誤，請稍後再試');
    } finally {
      els.btn.disabled = false;
      els.btn.textContent = '搜尋';
    }
  });

  // URL 帶 ?name= 自動查詢
  const params = new URLSearchParams(location.search);
  if (params.get('name')) {
    els.name.value = params.get('name');
    els.form.dispatchEvent(new Event('submit'));
  }
})();
