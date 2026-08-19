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

## 4b. Memindahkan data dari server lama (iMac)

Kalau iMac sempat dipakai sebagai server dan datanya sudah terisi, data itu
bisa dilanjutkan di PC Windows ini. Yang dipindahkan hanya **satu berkas
database**; foto karyawan ikut di dalamnya karena disimpan sebagai BLOB.

> **Jangan menyalin `absensiku.db` mentah-mentah selagi server iMac hidup.**
> Database berjalan dalam mode WAL, artinya perubahan terbaru masih menunggu
> di berkas pendamping `absensiku.db-wal`. Menyalin `.db` saja bisa
> menghasilkan berkas yang tertinggal beberapa transaksi, atau rusak di
> tengah transaksi — dan kerusakan semacam itu sering baru terasa
> berminggu-minggu kemudian saat baris tertentu kebetulan dibaca.

### Langkah 1 — Buat salinan konsisten di iMac

Di Terminal iMac, masuk ke folder `absensi-app/backend`, lalu:

```bash
npm run backup
```

Perintah ini memakai `VACUUM INTO`, yang membuat satu berkas utuh dan
konsisten walau server sedang jalan. Hasilnya ada di folder backup dengan
nama seperti `absensiku-2026-08-19.db`.

Kalau server iMac sudah dimatikan permanen, salin saja berkas backup terakhir
dari folder itu.

### Langkah 2 — Pindahkan berkasnya

Lewat flashdisk, jaringan, atau cara apa pun. Yang dipindah cukup satu berkas
`.db` tadi. Berkas `-wal` dan `-shm` **tidak perlu** ikut — isinya sudah
tergabung ke dalam hasil `VACUUM INTO`.

### Langkah 3 — Periksa dulu sebelum dipakai

Di PC Windows, dari folder `absensi-app\backend`:

```bash
npm run periksa-db -- "D:\salinan\absensiku-2026-08-19.db"
```

Perintah ini tidak mengubah apa pun, hanya memeriksa dan melapor:

- **keutuhan berkas** (`integrity_check`) — menangkap salinan yang terpotong
- **versi struktur data** — menolak database yang berasal dari aplikasi
  **lebih baru** daripada kode di PC ini. Kode lama tidak tahu cara membaca
  kolom yang belum dikenalnya, dan tidak ada jalan mundur. Kalau ini yang
  muncul, jalankan `git pull` dulu.
- **isi pokoknya** — berkas sah tapi kosong biasanya berarti salah ambil
  berkas.

Lanjutkan hanya kalau baris terakhirnya berbunyi `HASIL: Berkas sehat dan cocok`.

### Langkah 4 — Pasang

Hentikan dulu server Windows kalau sedang jalan, lalu:

```bash
copy "D:\salinan\absensiku-2026-08-19.db" "data\absensiku.db"
```

Kalau `data\absensiku.db` sudah ada isinya dan masih ingin disimpan,
ganti namanya dulu — jangan ditimpa begitu saja.

### Langkah 5 — Jalankan

```bash
npm start
```

Saat pertama dijalankan, migrasi yang belum ada di database lama akan dipasang
sendiri, dan tercetak di layar seperti:

```
Migration diterapkan: 012_face_recognition.sql
```

Ini normal. Database dari iMac dibuat sebelum fitur pengenalan wajah ada, jadi
tabel wajahnya baru dibuat sekarang dalam keadaan kosong. **Data lama tidak
ada yang berubah** — migrasi hanya menambah tabel dan kolom, tidak pernah
mengubah atau menghapus isi yang sudah ada.

### Langkah 6 — Ganti password, lalu periksa

```bash
npm run set-password
```

Wajib. Selain mengganti password, perintah ini menghapus semua sesi login
bawaan dari komputer lama.

Terakhir, buka aplikasinya dan cocokkan tiga hal dengan iMac:

1. **Jumlah karyawan** di tab Data Karyawan
2. **Laporan Gaji** periode berjalan — total gaji bersihnya harus sama persis
3. **Jam dan zona waktu PC ini** (lihat bagian 1) — jam server menentukan
   keterlambatan, dan keterlambatan menentukan potongan gaji

Kalau ketiganya cocok, pemindahan berhasil.

### Yang tidak ikut pindah

- **Pendaftaran wajah** — belum ada di database iMac, jadi semua karyawan
  mulai dari keadaan "belum terdaftar". Daftarkan ulang lewat tab Wajah.
- **Foto bukti absen** — sama, mulai dari kosong.
- **Sesi login** — sengaja dibuang di Langkah 6.

Semua data lain ikut: karyawan beserta fotonya, seluruh riwayat absensi,
jabatan, divisi, hari libur, aturan keterlambatan, jadwal kerja, dan log
perubahan.

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

## 13. Panel Check In & pengenalan wajah

### Kamera HANYA jalan di PC server ini

Browser cuma mengizinkan kamera pada alamat `localhost` atau alamat HTTPS.
Lewat `http://192.168.x.x:3000` objek kameranya bahkan tidak disediakan
browser — ini bukan soal izin yang bisa diklik, melainkan aturan browser.

Artinya:

- **PC kios harus PC server ini juga.** Buka `http://localhost:3000` di PC ini,
  pilih tab **Check In**. Ini cara yang disarankan.
- Komputer client (iMac, PC lain) tetap bisa membuka aplikasi lewat alamat IP
  untuk panel HR dan Owner. Yang tidak bisa dari sana cuma kameranya.

Cek cepat — buka Console browser (F12) di halaman aplikasi, ketik:

```js
window.isSecureContext
```

`true` berarti kamera bisa dipakai, `false` berarti tidak.

### Urutan penerapan

1. Login sebagai **Owner**, buka tab **Wajah**.
2. Daftarkan wajah karyawan satu per satu. Tiap orang diambil 5 kali dengan
   posisi kepala sedikit berbeda. Perlu sekitar satu menit per orang.
3. Begitu wajah seseorang terdaftar, **tombol manual untuk orang itu langsung
   mati** — dia hanya bisa absen lewat kamera. Yang belum terdaftar masih
   memakai tombol, jadi pendaftarannya boleh dicicil.
4. Taruh webcam setinggi wajah orang berdiri, jangan membelakangi jendela.
   Pencahayaan yang berubah-ubah adalah penyebab nomor satu wajah tidak
   dikenali.

### Kalau ada yang tidak dikenali

Bukan masalah selama jarang. Karyawan bisa mencoba lagi; kalau tetap gagal,
HR mencatatkan absennya dari panel HR (tercatat di Log Perubahan dengan
alasan). Kalau seseorang sering gagal — potong rambut, kacamata baru,
berjenggot — daftarkan ulang wajahnya lewat tab Wajah.

### Foto bukti

Setiap absen lewat kamera menyimpan satu foto. Lihat di tab **Wajah** bagian
bawah, pilih tanggalnya. Foto disimpan 40 hari lalu terhapus sendiri — begitu lewat, tanggal paling awal terhapus dengan sendirinya.

Foto inilah pengaman yang sebenarnya, bukan ketelitian pengenalannya: sistem
pengenal wajah mana pun bisa dikelabui foto di layar ponsel. Yang menahan
orang menitipkan absen adalah tahu bahwa setiap ceklis meninggalkan foto yang
bisa dibuka Owner.

### Persetujuan karyawan

Data wajah termasuk data pribadi spesifik menurut UU PDP No. 27/2022.
Siapkan persetujuan tertulis dari tiap karyawan sebelum mendaftarkan
wajahnya. Yang disimpan aplikasi bukan foto wajah melainkan 128 angka ciri
yang tidak bisa dikembalikan menjadi gambar, tapi persetujuannya tetap perlu.

## 14. Update aplikasi di kemudian hari

Kalau ada perbaikan/fitur baru yang sudah di-push ke GitHub:
```cmd
cd C:\Absensiku
git pull
cd absensi-app\backend
npm install
```
lalu restart server: buka **Task Scheduler**, klik kanan `AbsensiKu Server` → **End**, lalu **Run**.

Migrasi database berjalan otomatis saat server hidup — tidak ada langkah tambahan.

## 15. Backup data

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
