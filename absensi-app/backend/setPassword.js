/* ============================================================
   setPassword.js — Mengganti password akun (npm run set-password)

   Dijalankan langsung di server oleh Owner. Aplikasi belum punya
   halaman ganti password, dan password bawaan seed.js tertulis
   di repositori publik -- jadi mengganti keduanya adalah syarat
   sebelum aplikasi dipakai dengan data sungguhan.

   Password diminta lewat prompt, BUKAN lewat argumen perintah:
   argumen tersimpan di riwayat shell dan terlihat di daftar
   proses, sehingga password yang baru diganti langsung bocor
   ke tempat lain.
   ============================================================ */

const readline = require('node:readline');
const bcrypt = require('bcryptjs');
const db = require('./db');

const PANJANG_MINIMAL = 8;

function tanya(pertanyaan, { rahasia = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  return new Promise(resolve => {
    if (!rahasia) {
      rl.question(pertanyaan, jawaban => { rl.close(); resolve(jawaban.trim()); });
      return;
    }

    /* Ketikan password disembunyikan supaya tidak terbaca orang yang
       kebetulan melihat layar saat Owner mengetik di komputer kantor. */
    process.stdout.write(pertanyaan);
    const tulisAsli = rl._writeToOutput.bind(rl);
    rl._writeToOutput = () => tulisAsli('');
    rl.question('', jawaban => {
      rl._writeToOutput = tulisAsli;
      process.stdout.write('\n');
      rl.close();
      resolve(jawaban);
    });
  });
}

async function jalankan() {
  const akun = db.prepare('SELECT id, name, username, role FROM accounts ORDER BY id').all();

  if (akun.length === 0) {
    console.error('Belum ada akun di database. Jalankan `npm run seed` lebih dulu.');
    process.exit(1);
  }

  console.log('\nAkun yang terdaftar:\n');
  akun.forEach(a => console.log(`  ${a.username.padEnd(12)} ${a.role.padEnd(6)} ${a.name}`));
  console.log('');

  const username = await tanya('Username yang mau diganti passwordnya: ');
  const target = akun.find(a => a.username.toLowerCase() === username.toLowerCase());
  if (!target) {
    console.error(`\nTidak ada akun dengan username "${username}".`);
    process.exit(1);
  }

  const baru = await tanya(`Password baru untuk ${target.username} (minimal ${PANJANG_MINIMAL} karakter): `, { rahasia: true });
  if (baru.length < PANJANG_MINIMAL) {
    console.error(`\nPassword terlalu pendek. Minimal ${PANJANG_MINIMAL} karakter.`);
    process.exit(1);
  }

  const ulangi = await tanya('Ketik ulang password baru: ', { rahasia: true });
  if (baru !== ulangi) {
    console.error('\nKedua password tidak sama. Tidak ada yang diubah.');
    process.exit(1);
  }

  db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(baru, 10), target.id);

  /* Sesi yang sudah login memakai cookie, bukan password, sehingga tetap
     hidup setelah password diganti. Kalau alasan menggantinya adalah
     password bocor, sesi lama itu justru yang berbahaya -- jadi semuanya
     diputus dan semua orang harus masuk ulang. */
  const sesi = db.prepare('DELETE FROM sessions').run();

  console.log(`\nPassword ${target.username} berhasil diganti.`);
  console.log(`${sesi.changes} sesi login yang sedang berjalan ikut diputus; semua pengguna harus masuk ulang.\n`);
}

jalankan();
