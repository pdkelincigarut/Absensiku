/* ============================================================
   faceEngine.js — Pembungkus face-api untuk kamera & descriptor

   Dipakai dua tempat: layar kios (absen) dan panel Owner
   (pendaftaran wajah). Keduanya butuh urutan yang sama —
   muat model, nyalakan kamera, ambil descriptor — jadi
   ditulis sekali di sini.

   Descriptor yang dihasilkan di sini SELALU dikirim ke server
   untuk dicocokkan. Jangan pernah menambah pencocokan di
   berkas ini: itu berarti mengunduh basis data wajah semua
   karyawan ke PC umum.
   ============================================================ */

const FaceEngine = {
  siap: false,
  memuat: null,

  /* Ukuran masukan tinyFaceDetector. 416 lebih teliti daripada 320 bawaan
     dan masih ringan untuk satu wajah dekat kamera. scoreThreshold dinaikkan
     dari 0,5: kios sering menangkap bayangan atau poster di dinding sebagai
     wajah, dan setiap deteksi palsu berujung penolakan yang membingungkan. */
  opsiDeteksi: null,

  async muatModel(onProgress) {
    if (this.siap) return;
    if (this.memuat) return this.memuat;

    this.memuat = (async () => {
      if (typeof faceapi === 'undefined') {
        throw new Error('Pustaka pengenalan wajah gagal dimuat.');
      }
      /* Berkas bobot model disimpan berakhiran .weights, BUKAN .bin seperti
         aslinya dari pustakanya, dan nama itu ikut diubah di dalam berkas
         *-weights_manifest.json.

         Alasannya bukan gaya penamaan: pemblokir iklan, antivirus, dan
         proxy kantor rutin menghadang permintaan berkas .bin. Di komputer
         ini permintaan .bin dijawab 204 tanpa isi sebelum sampai ke server,
         dan face-api gagal dengan "tensor should have 432 values but has 0"
         -- pesan yang tidak menyinggung soal pemblokiran sama sekali.
         Ekstensi lain (.dat, .weights) lolos. Jangan dikembalikan ke .bin. */
      const url = 'vendor/face-api/model';
      if (onProgress) onProgress('Memuat model pengenalan wajah...');
      await faceapi.nets.tinyFaceDetector.loadFromUri(url);
      await faceapi.nets.faceLandmark68Net.loadFromUri(url);
      await faceapi.nets.faceRecognitionNet.loadFromUri(url);
      this.opsiDeteksi = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.6 });
      this.siap = true;
    })();

    try {
      await this.memuat;
    } finally {
      this.memuat = null;
    }
  },

  /* Kamera hanya bisa dibuka di konteks aman: HTTPS atau localhost.
     Lewat http://<IP-LAN> objek navigator.mediaDevices bahkan tidak ada —
     bukan izinnya yang ditolak, melainkan API-nya memang tidak disediakan
     browser. Pesannya dibuat jelas supaya tidak dikira kamera rusak. */
  cekDukungan() {
    if (!window.isSecureContext) {
      return 'Kamera hanya bisa dipakai lewat alamat localhost di komputer server, atau lewat HTTPS. Halaman ini dibuka lewat alamat jaringan biasa, jadi browser tidak mengizinkan kamera.';
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return 'Browser ini tidak mendukung akses kamera.';
    }
    return null;
  },

  async nyalakanKamera(videoEl) {
    const halangan = this.cekDukungan();
    if (halangan) throw new Error(halangan);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  },

  matikanKamera(stream) {
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
  },

  /* Satu wajah saja. Kalau ada dua orang di depan kamera, ditolak: kios
     tidak punya cara menentukan yang mana yang sedang absen, dan menebak
     berarti mencatat absen orang yang cuma lewat di belakang. */
  async ambilDescriptor(videoEl) {
    if (!this.siap) throw new Error('Model belum siap.');

    const hasil = await faceapi
      .detectAllFaces(videoEl, this.opsiDeteksi)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (hasil.length === 0) return { error: 'Wajah belum terlihat. Hadapkan wajah ke kamera.' };
    if (hasil.length > 1) return { error: 'Terlihat lebih dari satu wajah. Pastikan hanya Anda yang di depan kamera.' };

    const wajah = hasil[0];
    const kotak = wajah.detection.box;

    /* Wajah yang terlalu kecil di bingkai menghasilkan descriptor yang
       kacau, dan itu muncul sebagai "tidak dikenali" yang membingungkan.
       Lebih baik disuruh mendekat. */
    if (kotak.width < videoEl.videoWidth * 0.18) {
      return { error: 'Wajah terlalu jauh. Mendekat sedikit ke kamera.' };
    }

    return { descriptor: Array.from(wajah.descriptor), box: kotak };
  },

  /* Foto bukti. Sengaja dikecilkan di sini: yang perlu dilihat Owner cukup
     "ini wajah siapa", dan gambar penuh 640x480 tanpa kompresi membuat
     database membengkak ratusan megabyte dalam setahun. */
  ambilFoto(videoEl, lebarTarget = 320) {
    const skala = lebarTarget / videoEl.videoWidth;
    const canvas = document.createElement('canvas');
    canvas.width = lebarTarget;
    canvas.height = Math.round(videoEl.videoHeight * skala);
    canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  }
};
