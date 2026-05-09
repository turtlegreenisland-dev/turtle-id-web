// 部署後請填入實際值
const APP_CONFIG = {
  // Apps Script Web App URL（部署後從 Apps Script「部署 → 管理部署」取得）
  // 範例：https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxx/exec
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwaqpXbKn67MRHnl_tne6ApZ2A3wev6YfyPharxs18gVS6rdF5cUYsPbXxfLDHl34-Q/exec',

  // 一般回報的 request token，要與 Script Properties 的 REQUEST_TOKEN 一致
  REQUEST_TOKEN: '433e331ad318d96f893f139630095aff',

  // Google OAuth Client ID（管理頁登入用）
  // 在 Google Cloud Console → APIs & Services → Credentials 建立 OAuth client (Web application)
  // 授權的 JavaScript 來源：https://<your-github-username>.github.io
  GOOGLE_CLIENT_ID: '846664728156-ld2ied4d49qrhvm0vkmvhi9uie30596j.apps.googleusercontent.com'
};
