# Panduan Deploy AbsensiKu — Server di PC Windows

Susunannya: **PC Windows menjadi server**, dan komputer lain (iMac, PC HR, laptop) cukup membuka alamatnya lewat browser. Tidak ada yang perlu diinstal di komputer client — satu pun tidak.

Panduan ini dijalankan **sekali saja** di PC Windows yang akan jadi server.

> Aplikasi ini memang dikembangkan dan diuji di Windows, jadi tidak ada penyesuaian kode apa pun untuk berjalan di sini.

---

## 1. Pilih PC yang tepat

PC yang jadi server harus:
- **menyala selama jam kerja** — kalau PC ini mati, semua client tidak bisa absen
- terhubung ke jaringan kantor lewat **kabel LAN** kalau bisa (Wi-Fi lebih rentan berganti alamat)
- tidak sering dimatikan mendadak

### Jam & zona waktu PC ini menentukan gaji karyawan

**Ini bukan pengaturan kosmetik.** Jam masuk dan jam pulang diambil dari jam PC server — bukan dari jam komputer client, dan bukan dari jam yang diketik siapa pun. Potongan keterlambatan dihitung dari jam masuk itu. Kalau jam atau zona waktu PC server meleset, **potongan gaji seluruh karyawan ikut meleset.**

Buka **Settings → Time & language → Date & time**, lalu pastikan:
- **Time zone**: `(UTC+07:00) Bangkok, Hanoi, Jakarta` — sesuaikan kalau kantor berada di WITA/WIT
- **Set time automatically**: **On**
- **Set time zone automatically**: **Off** (supaya tidak berpindah sendiri)

Periksa hasilnya:
```cmd
node -e "console.log(new Date().toString())"
```
Harus menampilkan jam yang sama dengan jam dinding kantor, dan diakhiri `GMT+0700`.

## 2. Install Node.js

Butuh **Node.js versi 22.5 atau lebih baru** (aplikasi memakai database bawaan Node, jadi tidak ada kompilasi apa pun saat instalasi).

1. Buka [nodejs.org](https://nodejs.org), unduh installer **LTS untuk Windows**, jalankan seperti aplikasi biasa (klik Next sampai selesai).
2. Buka **Command Prompt** (tekan Windows, ketik `cmd`), lalu:
   ```cmd
   node --version
   ```
   Hasilnya harus `v22.5.0` ke atas.

## 3. Ambil kode aplikasi

Kalau **Git** sudah terpasang:
```cmd
cd C:\
git clone https://github.com/pdkelincigarut/Absensiku.git
cd Absensiku\absensi-app\backend
```

Kalau tidak punya Git: buka halaman repo di browser → tombol hijau **Code** → **Download ZIP** → ekstrak ke `C:\Absensiku`, lalu:
```cmd
cd C:\Absensiku\absensi-app\backend
```

> Kalau memakai ZIP, pembaruan di kemudian hari harus unduh ulang. Pakai Git kalau bisa — jauh lebih mudah (lihat bagian 11).

## 4. Install & siapkan data

```cmd
npm install
npm run seed
```
`npm run seed` cukup **sekali** — mengisi akun awal (`hradmin`/`hr123`, `owner`/`owner123`) dan 3 karyawan contoh. Data karyawan sungguhan diisi lewat aplikasi nanti, di tab Data Karyawan.

> ⛔ **Jangan pernah menjalankan `npm run seed:demo` di server ini.** Perintah itu **menghapus seluruh isi database**, termasuk semua riwayat absensi, lalu menggantinya dengan data contoh untuk presentasi. Itu hanya untuk komputer pengembangan.

## 5. Ganti password kedua akun — WAJIB

Password `hr123` dan `owner123` tertulis di repositori publik. Selama belum diganti, **siapa pun di jaringan kantor yang membuka repositori itu bisa masuk sebagai Owner dan melihat seluruh data gaji.**

```cmd
npm run set-password
```
Perintah ini menampilkan daftar akun, menanyakan mau ganti yang mana, lalu meminta password baru dua kali (ketikannya disembunyikan). **Jalankan dua kali** — sekali untuk `owner`, sekali untuk `hradmin`.

Semua sesi login yang sedang berjalan otomatis diputus setiap kali password diganti.

## 6. Siapkan kunci keamanan sesi & folder backup

Buat kunci acak:
```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Salin hasilnya (deretan 64 huruf/angka).

Buka **Command Prompt sebagai Administrator** (klik kanan ikon Command Prompt → *Run as administrator*), lalu:
```cmd
setx /M SESSION_SECRET "tempel-hasil-acak-di-sini"
setx /M BACKUP_DIR "D:\BackupAbsensi"
```

- `SESSION_SECRET` mengamankan sesi login. Jangan pakai contoh dari mana pun — harus acak milik sendiri.
- `BACKUP_DIR` menentukan tempat salinan harian database disimpan. **Arahkan ke drive yang berbeda** dari tempat aplikasi (mis. `D:\`), atau ke folder yang tersinkron ke cloud (OneDrive/Google Drive). Kalau dibiarkan kosong, salinannya menumpuk di `data\backups` pada drive yang sama — menolong saat data salah terhapus, tapi tidak menolong saat drive-nya rusak.

Kedua nilai ini tersimpan di Windows, **bukan di dalam folder aplikasi** — jadi tidak ikut hilang atau tertimpa saat aplikasi diperbarui.

Tutup Command Prompt, buka baru, lalu pastikan sudah terbaca:
```cmd
echo %SESSION_SECRET%
```

## 7. Coba jalankan

```cmd
cd C:\Absensiku\absensi-app\backend
npm start
```
Muncul tulisan `AbsensiKu backend jalan di http://localhost:3000`.

Kalau Windows menampilkan kotak **"Windows Defender Firewall has blocked some features of this app"** — pilih **Allow access**, dan centang **Private networks**. Ini yang membuat komputer lain bisa menjangkau server. Kalau kotaknya tidak muncul, lihat bagian 9.

Buka `http://localhost:3000` di browser PC ini untuk memastikan tampilannya normal.

Hentikan dulu dengan `Ctrl+C` — berikutnya akan dijalankan otomatis.

## 8. Jalankan otomatis saat PC menyala

Supaya server hidup sendiri setiap PC dinyalakan, tanpa perlu ada yang login atau membuka Command Prompt.

Buka **Task Scheduler** (tekan Windows, ketik `Task Scheduler`), lalu **Create Task…** (bukan *Basic Task*):

**Tab General**
- Name: `AbsensiKu Server`
- Pilih **Run whether user is logged on or not**
- Centang **Run with highest privileges**
- Configure for: **Windows 10** (atau versi Windows PC itu)

**Tab Triggers** → New…
- Begin the task: **At startup**
- OK

**Tab Actions** → New…
- Action: **Start a program**
- Program/script: `C:\Program Files\nodejs\node.exe`
- Add arguments: `server.js`
- Start in: `C:\Absensiku\absensi-app\backend`
- OK

**Tab Settings**
- Centang **If the task fails, restart every:** `1 minute`, **Attempt to restart up to:** `3 times`
- **Hapus centang** *Stop the task if it runs longer than* — server memang harus jalan terus

Klik OK. Windows akan meminta password akun Windows-mu (karena tadi memilih "run whether user is logged on or not").

Restart PC, lalu buka `http://localhost:3000` untuk memastikan server hidup sendiri.

## 9. Pastikan Firewall mengizinkan

Kalau komputer client tidak bisa membuka alamatnya, kemungkinan besar Firewall memblokir. Buka **Command Prompt sebagai Administrator**:

```cmd
netsh advfirewall firewall add rule name="AbsensiKu" dir=in action=allow protocol=TCP localport=3000
```

Satu baris ini membuka port 3000 untuk jaringan lokal.

## 10. Cari alamat IP PC server & kunci alamatnya

```cmd
ipconfig
```
Cari baris **IPv4 Address** pada adapter yang terhubung ke jaringan kantor — biasanya berbentuk `192.168.x.x`. Contoh: `192.168.10.13`.

> Kalau muncul beberapa IPv4 Address, abaikan yang berawalan `172.x` — itu biasanya adapter virtual (WSL/Hyper-V/VirtualBox), bukan jaringan kantor.

**Penting:** minta admin jaringan mengunci alamat ini lewat **DHCP reservation** di router. Kalau IP-nya berubah sewaktu-waktu, semua komputer client langsung tidak bisa mengakses dan alamatnya harus diketik ulang satu per satu.

## 11. Cegah PC tidur

**Settings → System → Power & battery → Screen and sleep** — atur **Sleep** ke **Never** (minimal saat tersambung listrik). Kalau PC tidur, server berhenti bisa dijangkau dari jaringan.

Layar boleh saja mati; yang tidak boleh adalah PC-nya *sleep* atau *hibernate*.

## 12. Akses dari komputer client (iMac, PC lain)

Tidak perlu instal apa pun. Buka browser apa saja (Safari, Chrome, Edge), ketik:
```
http://<IP-dari-langkah-10>:3000
```
contoh: `http://192.168.10.13:3000`

Berlaku sama untuk berapa pun jumlah client. Sarankan simpan sebagai bookmark supaya tidak diketik ulang setiap hari.

**Aplikasi tidak butuh internet.** Tailwind dan seluruh berkas font disajikan dari dalam aplikasi sendiri, jadi tampilannya tetap utuh walau internet kantor sedang mati. Yang dibutuhkan hanya jaringan lokal antara client dan PC server.

## 13. Update aplikasi di kemudian hari

Kalau ada perbaikan/fitur baru yang sudah di-push ke GitHub:
```cmd
cd C:\Absensiku
git pull
cd absensi-app\backend
npm install
```
lalu restart server: buka **Task Scheduler**, klik kanan `AbsensiKu Server` → **End**, lalu **Run**.

Migrasi database berjalan otomatis saat server hidup — tidak ada langkah tambahan.

## 14. Backup data

Satu-satunya sumber data ada di:
```
C:\Absensiku\absensi-app\backend\data\absensiku.db
```

### Backup harian otomatis

Server membuat salinan database **satu kali setiap hari, otomatis** — tidak perlu penjadwal terpisah. Salinannya bernama tanggal, disimpan di folder `BACKUP_DIR` dari langkah 6:

```
D:\BackupAbsensi\absensiku-2026-08-12.db
D:\BackupAbsensi\absensiku-2026-08-11.db
...
```

Aturannya:
- **Satu salinan per hari.** Kalau hari itu sudah ada, tidak dibuat lagi.
- **Maksimal 30 salinan.** Begitu lewat 30, yang paling lama otomatis dihapus — folder selalu berisi 30 hari terakhir.
- Server memeriksa setiap jam, bukan menunggu tepat 24 jam. Jadi kalau PC sempat mati semalaman atau server di-restart, salinan hari itu tetap dibuat begitu server hidup lagi.
- Backup yang gagal **tidak** mematikan server — mencatat absensi lebih penting daripada menyalinnya.

Salinan dibuat dengan `VACUUM INTO`, bukan menyalin berkas `.db` begitu saja. Database berjalan dalam mode WAL: menyalin berkasnya langsung saat server jalan bisa menghasilkan salinan yang isinya tertinggal atau rusak.

### Backup manual

Kapan saja, mis. sebelum melakukan perubahan besar:
```cmd
npm run backup
npm run backup -- --force
```

### Memulihkan dari backup

1. Hentikan server lewat Task Scheduler (klik kanan → **End**)
2. Salin berkas backup menimpa yang asli:
   ```cmd
   copy /Y D:\BackupAbsensi\absensiku-2026-08-12.db C:\Absensiku\absensi-app\backend\data\absensiku.db
   ```
3. Hapus sisa berkas WAL kalau ada — kalau tertinggal, isinya bisa menimpa balik data yang baru dipulihkan:
   ```cmd
   del C:\Absensiku\absensi-app\backend\data\absensiku.db-wal
   del C:\Absensiku\absensi-app\backend\data\absensiku.db-shm
   ```
4. Jalankan server lagi lewat Task Scheduler (klik kanan → **Run**)

---

## Kalau ada masalah

| Gejala | Kemungkinan sebabnya |
|---|---|
| Client tidak bisa membuka alamatnya | Firewall memblokir (langkah 9), atau IP server berubah (langkah 10) |
| Tadinya bisa, sekarang tidak | IP server berubah karena router restart — kunci lewat DHCP reservation |
| Halaman terbuka tapi tampilan berantakan | Seharusnya tidak terjadi; aset sudah lokal. Coba muat ulang paksa (Ctrl+Shift+R) |
| Server tidak hidup setelah PC restart | Cek Task Scheduler: task `AbsensiKu Server`, kolom **Last Run Result** |
| Ingin melihat log server | Task Scheduler tidak menyimpan keluaran. Jalankan manual lewat `npm start` untuk melihat pesannya |
