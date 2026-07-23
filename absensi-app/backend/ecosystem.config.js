/* ============================================================
   ecosystem.config.js — Konfigurasi pm2 untuk menjalankan server
   ini terus-menerus di background (auto-restart kalau crash, auto-
   jalan lagi setelah reboot lewat `pm2 startup`).
   GANTI nilai SESSION_SECRET di bawah sebelum menjalankan di server
   kantor -- jangan pakai nilai contoh ini.
   ============================================================ */

module.exports = {
  apps: [
    {
      name: 'absensiku',
      script: 'server.js',
      env: {
        PORT: 3000,
        SESSION_SECRET: 'GANTI_DENGAN_STRING_ACAK_PANJANG_SEBELUM_DEPLOY'
      }
    }
  ]
};
