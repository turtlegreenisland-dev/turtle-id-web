/* 管理頁邏輯：GIS 登入 + admin 路由呼叫 Apps Script */
(function () {
  let currentIdToken = null;
  let currentEmail = null;

  const els = {
    loginCard: document.getElementById('loginCard'),
    googleSignIn: document.getElementById('googleSignIn'),
    loginAlert: document.getElementById('loginAlert'),
    adminContent: document.getElementById('adminContent'),
    userEmail: document.getElementById('userEmail'),
    signOutBtn: document.getElementById('signOutBtn'),
    systemStatus: document.getElementById('systemStatus'),
    refreshHealthBtn: document.getElementById('refreshHealthBtn'),
    batchFolderId: document.getElementById('batchFolderId'),
    batchStartBtn: document.getElementById('batchStartBtn'),
    batchProgress: document.getElementById('batchProgress'),
    rebuildBtn: document.getElementById('rebuildBtn'),
    rebuildAlert: document.getElementById('rebuildAlert'),
    recentRecords: document.getElementById('recentRecords')
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function showInline(el, type, msg) {
    el.innerHTML = '<div class="alert alert-' + type + '">' + escapeHtml(msg) + '</div>';
  }

  function clearInline(el) { el.innerHTML = ''; }

  // ---------- GIS 初始化 ----------
  function initGsi() {
    if (!APP_CONFIG.GOOGLE_CLIENT_ID || APP_CONFIG.GOOGLE_CLIENT_ID.indexOf('（') === 0) {
      showInline(els.loginAlert, 'error', '尚未設定 Google Client ID');
      return;
    }
    google.accounts.id.initialize({
      client_id: APP_CONFIG.GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false
    });
    google.accounts.id.renderButton(els.googleSignIn, {
      theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'zh-TW'
    });
  }

  function handleCredentialResponse(resp) {
    if (!resp || !resp.credential) {
      showInline(els.loginAlert, 'error', '登入失敗');
      return;
    }
    currentIdToken = resp.credential;
    const payload = parseJwt(currentIdToken);
    currentEmail = (payload && payload.email) || '';
    if (!payload || payload.email_verified !== true) {
      showInline(els.loginAlert, 'error', 'Email 未驗證');
      return;
    }
    enterAdmin();
  }

  function parseJwt(token) {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function enterAdmin() {
    els.loginCard.style.display = 'none';
    els.adminContent.style.display = 'block';
    els.userEmail.textContent = currentEmail;
    refreshHealth();
    refreshRecentRecords();
  }

  els.signOutBtn.addEventListener('click', function () {
    currentIdToken = null;
    currentEmail = null;
    google.accounts.id.disableAutoSelect();
    location.reload();
  });

  // ---------- 通用 admin 呼叫 ----------
  async function callAdmin(action, extra) {
    if (!currentIdToken) throw new Error('not_signed_in');
    const body = Object.assign({ action: action, idToken: currentIdToken }, extra || {});
    const resp = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'unknown_error');
    return data.data;
  }

  // ---------- 健康狀態 ----------
  async function refreshHealth() {
    els.systemStatus.innerHTML = '<p class="helper-text">載入中…</p>';
    try {
      const data = await callAdmin('admin_health');
      const stats = (data && data.stats) || {};
      els.systemStatus.innerHTML =
        '<div class="stat-grid">' +
          stat('狀態', data && data.ok ? '正常' : '異常') +
          stat('模型載入', data && data.model_loaded ? '是' : '否') +
          stat('左側個體', stats.left_individuals || 0) +
          stat('右側個體', stats.right_individuals || 0) +
          stat('左側照片', stats.left_photos || 0) +
          stat('右側照片', stats.right_photos || 0) +
        '</div>';
    } catch (err) {
      const msg = err.message === 'forbidden' ? '您沒有管理權限' : '無法取得系統狀態：' + err.message;
      els.systemStatus.innerHTML = '<div class="alert alert-error">' + escapeHtml(msg) + '</div>';
    }
  }

  function stat(label, num) {
    return '<div class="stat-card"><div class="stat-num">' + escapeHtml(num) + '</div>' +
           '<div class="stat-label">' + escapeHtml(label) + '</div></div>';
  }

  els.refreshHealthBtn.addEventListener('click', refreshHealth);

  // ---------- 批量比對 ----------
  els.batchStartBtn.addEventListener('click', async function () {
    clearInline(els.batchProgress);
    const folderId = els.batchFolderId.value.trim();
    if (!folderId) {
      showInline(els.batchProgress, 'error', '請輸入資料夾 ID');
      return;
    }
    els.batchStartBtn.disabled = true;
    els.batchStartBtn.innerHTML = '<span class="spinner"></span>處理中…';
    try {
      const data = await callAdmin('admin_batch_process', { folderId: folderId });
      const msg = '已處理 ' + (data.processed || 0) + ' / ' + (data.total || 0) +
                  '（' + (data.message || '') + '）';
      const pct = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 100;
      els.batchProgress.innerHTML =
        '<div class="progress"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div>' + escapeHtml(msg) + '</div>';
      refreshRecentRecords();
    } catch (err) {
      showInline(els.batchProgress, 'error', '失敗：' + err.message);
    } finally {
      els.batchStartBtn.disabled = false;
      els.batchStartBtn.textContent = '開始批量比對';
    }
  });

  // ---------- 重建索引 ----------
  els.rebuildBtn.addEventListener('click', async function () {
    if (!confirm('確定要重建索引嗎？這可能需要幾分鐘。')) return;
    clearInline(els.rebuildAlert);
    els.rebuildBtn.disabled = true;
    els.rebuildBtn.innerHTML = '<span class="spinner"></span>重建中…';
    try {
      const data = await callAdmin('admin_rebuild_index');
      showInline(els.rebuildAlert, 'success',
        '完成：' + (data.individuals || 0) + ' 個體、' + (data.photos || 0) + ' 張照片');
      refreshHealth();
    } catch (err) {
      showInline(els.rebuildAlert, 'error', '失敗：' + err.message);
    } finally {
      els.rebuildBtn.disabled = false;
      els.rebuildBtn.textContent = '重建索引';
    }
  });

  // ---------- 最近紀錄 ----------
  async function refreshRecentRecords() {
    els.recentRecords.innerHTML = '<p class="helper-text">載入中…</p>';
    try {
      const records = await callAdmin('admin_recent_records', { limit: 10 });
      if (!records || records.length === 0) {
        els.recentRecords.innerHTML = '<p class="helper-text">尚無紀錄</p>';
        return;
      }
      const rows = records.map(function (r) {
        return '<tr>' +
          '<td>' + escapeHtml(fmtTime(r.timestamp)) + '</td>' +
          '<td>' + escapeHtml(r.source || '') + '</td>' +
          '<td>' + escapeHtml(r.reporter || '') + '</td>' +
          '<td>' + escapeHtml(r.location || '') + '</td>' +
          '<td>' + escapeHtml(r.side === 'left' ? '左' : r.side === 'right' ? '右' : '') + '</td>' +
          '<td>' + escapeHtml(r.status || '') + '</td>' +
          '<td>' + escapeHtml(r.top1 || '') + '</td>' +
          '<td>' + escapeHtml(r.archive || '') + '</td>' +
        '</tr>';
      }).join('');
      els.recentRecords.innerHTML =
        '<div style="overflow-x:auto;"><table class="records-table">' +
        '<thead><tr><th>時間</th><th>來源</th><th>回報者</th><th>地點</th><th>側</th>' +
        '<th>狀態</th><th>Top1</th><th>入庫</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    } catch (err) {
      els.recentRecords.innerHTML = '<div class="alert alert-error">' + escapeHtml('讀取失敗：' + err.message) + '</div>';
    }
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('zh-TW', { hour12: false });
  }

  // 等 GIS script 載入
  window.addEventListener('load', function () {
    if (window.google && window.google.accounts) {
      initGsi();
    } else {
      const wait = setInterval(function () {
        if (window.google && window.google.accounts) {
          clearInterval(wait);
          initGsi();
        }
      }, 200);
    }
  });
})();
