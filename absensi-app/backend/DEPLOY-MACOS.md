# Panduan Deploy AbsensiKu ke iMac (Server Kantor)

Panduan ini untuk **Owner**, dijalankan langsung di iMac yang akan jadi server. PC HR (Windows) tidak perlu instalasi apa pun — cukup buka alamat server lewat browser di langkah terakhir.

## 1. Prasyarat: install Node.js

Server ini butuh **Node.js versi 22.5 atau lebih baru** (dipakai fitur database bawaan `node:sqlite`, jadi tidak perlu kompilasi apa pun saat instalasi).

1. Buka [nodejs.org](https://nodejs.org), download installer **LTS** untuk macOS, jalankan seperti instalasi aplikasi biasa.
2. Cek di Terminal (buka lewat Spotlight, ketik "Terminal"):
   ```bash
   node --version
   ```
   Pastikan hasilnya `v22.5.0` ke atas.

Git biasanya sudah tersedia di macOS. Kalau `git --version` di Terminal belum jalan, macOS akan otomatis menawarkan instalasi Command Line Tools — ikuti saja.

## 2. Ambil kode aplikasi

Di Terminal:
```bash
cd ~
git clone https://github.com/pdkelincigarut/Absensiku.git
cd Absensiku/absensi-app/backend
```

## 3. Install & siapkan data

```bash
npm install
npm run seed
```
`npm run seed` hanya perlu dijalankan **sekali** (mengisi akun demo `hradmin`/`hr123` dan `owner`/`owner123` + 3 karyawan contoh — ganti/tambah data karyawan sungguhan lewat aplikasi setelah jalan, lewat tab Data Karyawan).

## 4. Set kunci keamanan sesi (SESSION_SECRET)

Buka file `ecosystem.config.js` di folder `backend/`, ganti baris:
```js
SESSION_SECRET: 'GANTI_DENGAN_STRING_ACAK_PANJANG_SEBELUM_DEPLOY'
```
dengan string acak panjang milik sendiri. Bisa generate lewat Terminal:
```bash
openssl rand -hex 32
```
Salin hasilnya, tempel menggantikan nilai di atas. **Jangan pakai nilai contoh di atas** — itu bukan rahasia lagi karena ada di kode publik.

## 5. Jalankan server terus-menerus (pm2)

Supaya server tetap jalan di background dan otomatis nyala lagi setelah iMac restart:
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```
`pm2 startup` akan mencetak satu baris perintah (biasanya perlu `sudo`) — salin dan jalankan perintah itu persis seperti yang ditampilkan, supaya pm2 otomatis start saat iMac dinyalakan.

Cek server sudah jalan:
```bash
pm2 status
```
harus terlihat `absensiku` dengan status `online`.

## 6. Cari alamat IP iMac di jaringan kantor

PC HR butuh alamat ini untuk mengakses aplikasi:
```bash
ipconfig getifaddr en0
```
(kalau iMac pakai Wi-Fi bukan kabel, hasilnya biasanya dari `en0`; kalau kosong coba `ipconfig getifaddr en1`). Atau lihat lewat **System Settings → Wi-Fi/Ethernet → Details → TCP/IP**.

**Disarankan:** minta admin jaringan/router set **DHCP reservation** (IP tetap) untuk iMac ini, supaya alamatnya tidak berubah-ubah setiap kali router restart — kalau tidak, PC HR harus update alamat setiap kali IP berubah.

## 7. Izinkan lewat Firewall macOS

Ini perlu dilakukan Owner sendiri langsung di iMac (bukan lewat Terminal/Claude):
**System Settings → Network → Firewall → Options** — pastikan Node diizinkan menerima koneksi masuk. Kalau muncul dialog "Do you want the application node to accept incoming connections?" saat pertama kali server jalan, pilih **Allow**.

## 8. Cegah iMac tidur

Di **System Settings → Lock Screen / Battery**, matikan mode tidur otomatis (atau minimal aktifkan **"Prevent automatic sleeping on power adapter when the display is off"**) — kalau iMac tidur penuh, server berhenti bisa diakses dari jaringan.

## 9. Akses dari PC HR (Windows)

Tidak perlu instal apa pun — buka browser apa saja, ketik:
```
http://<IP-iMac-dari-langkah-6>:3000
```
contoh: `http://192.168.1.42:3000`

## 10. Update aplikasi di kemudian hari

Kalau ada revisi/fitur baru yang sudah di-push ke GitHub:
```bash
cd ~/Absensiku
git pull
cd absensi-app/backend
npm install        # kalau ada dependency baru
pm2 restart absensiku
```

## 11. Backup data

Satu-satunya sumber data ada di file:
```
~/Absensiku/absensi-app/backend/data/absensiku.db
```
Sarankan salin file ini secara berkala (mis. ke Time Machine atau cloud storage) sebagai backup.
