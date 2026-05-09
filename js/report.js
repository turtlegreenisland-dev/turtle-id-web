/* 回報頁邏輯：表單驗證 → base64 編碼 → POST 到 Apps Script */
(function () {
  const MAX_PHOTOS = 5;
  const MAX_BYTES = 10 * 1024 * 1024;
  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

  const els = {
    form: document.getElementById('reportForm'),
    name: document.getElementById('reporterName'),
    locSelect: document.getElementById('locationSelect'),
    locCustom: document.getElementById('locationCustom'),
    photoInput: document.getElementById('photoInput'),
    photoList: document.getElementById('photoList'),
    submitBtn: document.getElementById('submitBtn'),
    alertBox: document.getElementById('alertBox')
  };

  // 已選照片：{ file, side, dataUrl }
  const photos = [];

  function showAlert(type, msg) {
    els.alertBox.innerHTML = '<div class="alert alert-' + type + '">' + escapeHtml(msg) + '</div>';
  }

  function clearAlert() {
    els.alertBox.innerHTML = '';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // 地點下拉切換手動輸入
  els.locSelect.addEventListener('change', function () {
    if (els.locSelect.value === '__OTHER__') {
      els.locCustom.style.display = 'block';
      els.locCustom.required = true;
    } else {
      els.locCustom.style.display = 'none';
      els.locCustom.required = false;
      els.locCustom.value = '';
    }
  });

  // 照片選擇
  els.photoInput.addEventListener('change', function (ev) {
    const files = Array.from(ev.target.files || []);
    for (const f of files) {
      if (photos.length >= MAX_PHOTOS) {
        showAlert('error', '最多只能上傳 ' + MAX_PHOTOS + ' 張照片');
        break;
      }
      if (ALLOWED_MIME.indexOf(f.type) === -1) {
        showAlert('error', '不支援的格式：' + f.name);
        continue;
      }
      photos.push({ file: f, side: null, dataUrl: null });
    }
    els.photoInput.value = '';
    renderPhotos();
  });

  function renderPhotos() {
    els.photoList.innerHTML = '';
    photos.forEach(function (p, idx) {
      const item = document.createElement('div');
      item.className = 'photo-item';
      const sizeMB = (p.file.size / 1024 / 1024).toFixed(2);
      const overSize = p.file.size > MAX_BYTES;

      const img = document.createElement('img');
      img.alt = p.file.name;
      if (p.dataUrl) {
        img.src = p.dataUrl;
      } else {
        const reader = new FileReader();
        reader.onload = function (e) {
          img.src = e.target.result;
          p.dataUrl = e.target.result;
        };
        reader.readAsDataURL(p.file);
      }

      const meta = document.createElement('div');
      meta.className = 'photo-meta' + (overSize ? ' warn' : '');
      meta.textContent = p.file.name + ' (' + sizeMB + ' MB)' + (overSize ? ' — 超過 10MB，請壓縮' : '');

      const sideToggle = document.createElement('div');
      sideToggle.className = 'side-toggle';
      ['left', 'right'].forEach(function (s) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = s === 'left' ? '左側' : '右側';
        if (p.side === s) btn.classList.add('active');
        btn.addEventListener('click', function () {
          p.side = s;
          renderPhotos();
        });
        sideToggle.appendChild(btn);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '✕ 移除';
      removeBtn.addEventListener('click', function () {
        photos.splice(idx, 1);
        renderPhotos();
      });

      item.appendChild(img);
      item.appendChild(meta);
      item.appendChild(sideToggle);
      item.appendChild(removeBtn);
      els.photoList.appendChild(item);
    });
  }

  // base64 純編碼（去掉 data: prefix）
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = reader.result;
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  els.form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    clearAlert();

    if (!APP_CONFIG.APPS_SCRIPT_URL || APP_CONFIG.APPS_SCRIPT_URL.indexOf('（') === 0) {
      showAlert('error', '系統尚未設定，請聯絡管理員');
      return;
    }

    const name = els.name.value.trim();
    if (!name) { showAlert('error', '請填寫姓名'); return; }
    if (name.length > 20) { showAlert('error', '姓名最多 20 字'); return; }

    let location = els.locSelect.value;
    if (location === '__OTHER__') location = els.locCustom.value.trim();
    if (!location) { showAlert('error', '請選擇或輸入地點'); return; }

    if (photos.length === 0) { showAlert('error', '請至少上傳一張照片'); return; }
    for (const p of photos) {
      if (p.file.size > MAX_BYTES) { showAlert('error', '有照片超過 10MB，請先壓縮'); return; }
      if (!p.side) { showAlert('error', '每張照片都需指定左側或右側'); return; }
    }

    els.submitBtn.disabled = true;
    els.submitBtn.innerHTML = '<span class="spinner"></span>送出中…';

    try {
      const photoPayload = [];
      for (const p of photos) {
        const b64 = await fileToBase64(p.file);
        photoPayload.push({
          filename: p.file.name,
          mime: p.file.type,
          side: p.side,
          dataBase64: b64
        });
      }

      const resp = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        // Apps Script Web App: 用 text/plain 避開 CORS preflight
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          token: APP_CONFIG.REQUEST_TOKEN,
          name: name,
          location: location,
          photos: photoPayload
        })
      });
      const data = await resp.json();
      if (data.ok) {
        showAlert('success', '✓ 已收到您的回報！比對結果可在「查詢」頁面用姓名查詢。');
        els.form.reset();
        photos.length = 0;
        renderPhotos();
        els.locCustom.style.display = 'none';
      } else {
        showAlert('error', '送出失敗：' + friendlyError(data.error));
      }
    } catch (err) {
      console.error(err);
      showAlert('error', '網路錯誤，請稍後再試');
    } finally {
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = '送出回報';
    }
  });

  function friendlyError(code) {
    const map = {
      'unauthorized': '驗證失敗',
      'invalid_input': '輸入內容有誤',
      'rate_limited': '同一姓名每小時最多回報 3 次，請稍後再試',
      'invalid_photo_count': '照片數量不正確',
      'invalid_photo': '照片格式錯誤',
      'unsupported_format': '不支援的照片格式',
      'invalid_side': '左/右側標記錯誤',
      'file_too_large': '照片過大',
      'internal_error': '伺服器錯誤'
    };
    return map[code] || code || '未知錯誤';
  }
})();
