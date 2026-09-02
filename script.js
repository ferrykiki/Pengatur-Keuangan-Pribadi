// === KONFIGURASI ANGGARAN AWAL ===
const ANGGARAN_DEFAULT = {
    makan: { nama: "🍽️ Makan", batas: 1200000 },
    transportasi: { nama: "🚗 Transportasi", batas: 500000 },
    listrik: { nama: "⚡ Listrik", batas: 400000 },
    belanja: { nama: "🛒 Belanja Bulanan", batas: 800000 },
    internet: { nama: "📶 Internet", batas: 300000 },
    cicilan: { nama: "💳 Cicilan", batas: 500000 },
    hiburan: { nama: "🎬 Hiburan", batas: 300000 },
    tabungan: { nama: "💰 Tabungan", batas: 500000 },
    investasi: { nama: "📈 Investasi", batas: 300000 },
    lainnya: { nama: "📝 Lainnya", batas: 200000 }
};

// === VARIABEL GLOBAL ===
let db;
let GAJI_BULANAN = 5000000;
let transaksi = [];
let anggaran = {};
let grafik = null;

// === INISIALISASI BASIS DATA ===
function bukaBasisData() {
    return new Promise((resolve, reject) => {
        const permintaan = indexedDB.open("KeuanganPribadiDB", 2);

        permintaan.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains("transaksi")) {
                const tokoTransaksi = db.createObjectStore("transaksi", { keyPath: "id", autoIncrement: true });
                tokoTransaksi.createIndex("tanggal", "tanggal", { unique: false });
                tokoTransaksi.createIndex("kategori", "kategori", { unique: false });
            }
            if (!db.objectStoreNames.contains("pengaturan")) {
                db.createObjectStore("pengaturan", { keyPath: "kunci" });
            }
        };

        permintaan.onsuccess = (e) => { db = e.target.result; resolve(db); };
        permintaan.onerror = (e) => { alert("Gagal membuka basis data: " + e.target.errorCode); reject(e); };
    });
}

// === FUNGSI BASIS DATA ===
async function simpanPengaturanKeDB() {
    const tx = db.transaction("pengaturan", "readwrite");
    tx.objectStore("pengaturan").put({ kunci: "gaji_bulanan", nilai: GAJI_BULANAN });
    Object.entries(anggaran).forEach(([k, v]) => {
        tx.objectStore("pengaturan").put({ kunci: `anggaran_${k}`, nilai: { nama: v.nama, batas: v.batas } });
    });
}

async function muatPengaturanDariDB() {
    return new Promise((resolve) => {
        const tx = db.transaction("pengaturan", "readonly");
        const toko = tx.objectStore("pengaturan");
        const semua = toko.getAll();
        semua.onsuccess = (e) => {
            const daftar = e.target.result;
            GAJI_BULANAN = 5000000;
            anggaran = JSON.parse(JSON.stringify(ANGGARAN_DEFAULT));

            daftar.forEach(item => {
                if (item.kunci === "gaji_bulanan") {
                    GAJI_BULANAN = item.nilai;
                } else if (item.kunci.startsWith("anggaran_")) {
                    const k = item.kunci.replace("anggaran_", "");
                    if (anggaran[k]) {
                        anggaran[k].batas = item.nilai.batas;
                    }
                }
            });
            resolve();
        };
    });
}

async function simpanTransaksiKeDB(trx) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("transaksi", "readwrite");
        const toko = tx.objectStore("transaksi");
        const permintaan = toko.add(trx);
        permintaan.onsuccess = (e) => resolve(e.target.result);
        permintaan.onerror = reject;
    });
}

async function ambilSemuaTransaksiDariDB() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("transaksi", "readonly");
        const toko = tx.objectStore("transaksi");
        const permintaan = toko.getAll();
        permintaan.onsuccess = (e) => resolve(e.target.result);
        permintaan.onerror = reject;
    });
}

async function hapusTransaksiDariDB(id) {
    return new Promise((resolve) => {
        const tx = db.transaction("transaksi", "readwrite");
        tx.objectStore("transaksi").delete(id).onsuccess = resolve;
    });
}

// === HITUNG ULANG TOTAL TERPAKAI ===
function hitungUlangPengeluaran(semuaTrx) {
    Object.keys(anggaran).forEach(k => anggaran[k].terpakai = 0);
    semuaTrx.forEach(trx => {
        if (anggaran[trx.kategori]) {
            anggaran[trx.kategori].terpakai += trx.jumlah;
        }
    });
}

// === FORMAT RUPIAH ===
function formatRupiah(angka) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(angka);
}

// === PERBARUI SEMUA TAMPILAN ===
function perbaruiSemua() {
    const totalPengeluaran = Object.values(anggaran).reduce((sum, k) => sum + (k.terpakai || 0), 0);
    const sisa = GAJI_BULANAN - totalPengeluaran;

    document.getElementById("tampilGaji").textContent = formatRupiah(GAJI_BULANAN);
    document.getElementById("totalPemasukan").textContent = formatRupiah(GAJI_BULANAN);
    document.getElementById("totalPengeluaran").textContent = formatRupiah(totalPengeluaran);
    document.getElementById("sisaUang").textContent = formatRupiah(Math.max(0, sisa));

    renderAnggaran();
    perbaruiPilihanKategori();
    renderRiwayat();
    perbaruiGrafik();
}

// === PERBARUI DAFTAR PILIHAN KATEGORI ===
function perbaruiPilihanKategori() {
    const pilihan = document.getElementById("kategoriTransaksi");
    if (!pilihan) return;

    // Kosongkan daftar lama
    pilihan.innerHTML = "";

    // Isi ulang dari data anggaran yang TERBARU
    Object.entries(anggaran).forEach(([k, data]) => {
        const opsi = document.createElement("option");
        opsi.value = k; // Kode asli (makan, transportasi, dst.)
        opsi.textContent = data.nama; // Nama yang sudah diubah
        pilihan.appendChild(opsi);
    });
}

// === TAMPILKAN DAFTAR ANGGARAN DENGAN TOMBOL EDIT & HAPUS ===
function renderAnggaran() {
    const wadah = document.getElementById("daftarAnggaran");
    wadah.innerHTML = "";

    Object.entries(anggaran).forEach(([k, data]) => {
        const terpakai = data.terpakai || 0;
        const batas = data.batas || 0;
        const persen = Math.min(100, (terpakai / batas) * 100);
        let warnaBar = "#10b981"; // Hijau
        if (persen >= 90) warnaBar = "#ef4444"; // Merah
        else if (persen >= 70) warnaBar = "#f59e0b"; // Kuning

        wadah.innerHTML += `
            <div class="budget-item ${persen >= 100 ? 'danger' : ''}" data-kunci="${k}">
                <div class="budget-header">
                    <span class="nama-kategori" id="nama-${k}">${data.nama}</span>
                    <span class="angka-anggaran">
                        ${formatRupiah(terpakai)} / ${formatRupiah(batas)}
                    </span>
                    <div class="tombol-aksi">
                        <button class="btn-edit" data-kunci="${k}" title="Ubah nama & batas">✏️</button>
                        <button class="btn-hapus" data-kunci="${k}" title="Hapus kategori">🗑️</button>
                    </div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${persen}%; background: ${warnaBar}"></div>
                </div>
            </div>
        `;
    });

    // === TOMBOL EDIT — BUKA FORM UBAH ===
    document.querySelectorAll(".btn-edit").forEach(tombol => {
        tombol.addEventListener("click", async function () {
            const kunci = this.dataset.kunci;
            const data = anggaran[kunci];
            const namaBaru = prompt("Ubah nama kategori:", data.nama);
            if (namaBaru === null || namaBaru.trim().length < 2) return;

            const batasBaru = prompt("Ubah batas anggaran (Rp):", data.batas);
            if (batasBaru === null) return;
            const nilaiBatas = parseInt(batasBaru) || 0;
            if (nilaiBatas < 100) {
                alert("⚠️ Minimal Rp 100!");
                return;
            }

            anggaran[kunci].nama = namaBaru.trim();
            anggaran[kunci].batas = nilaiBatas;
            await simpanPengaturanKeDB();
            perbaruiSemua();
            alert("✅ Data berhasil diperbarui!");
        });
    });

    // === TOMBOL HAPUS — HAPUS KATEGORI ===
    document.querySelectorAll(".btn-hapus").forEach(tombol => {
        tombol.addEventListener("click", async function () {
            const kunci = this.dataset.kunci;
            const nama = anggaran[kunci].nama;
            const konfirmasi = confirm(`⚠️ Yakin ingin menghapus kategori:\n"${nama}"?\n\nSemua riwayat transaksi dalam kategori ini juga akan ikut terhapus!`);
            if (!konfirmasi) return;

            // Hapus kategori dari daftar anggaran
            delete anggaran[kunci];

            // Hapus semua transaksi dengan kategori ini
            transaksi = transaksi.filter(trx => trx.kategori !== kunci);

            // Hapus juga dari Basis Data
            const semuaId = transaksi.map(t => t.id);
            const tx = db.transaction("transaksi", "readwrite");
            const toko = tx.objectStore("transaksi");
            const semuaData = await ambilSemuaTransaksiDariDB();
            for (const trx of semuaData) {
                if (trx.kategori === kunci) {
                    toko.delete(trx.id);
                }
            }

            await simpanPengaturanKeDB();
            perbaruiSemua();
            alert("✅ Kategori berhasil dihapus!");
        });
    });
}

// === TAMPILKAN RIWAYAT TRANSAKSI ===
function renderRiwayat() {
    const wadah = document.getElementById("riwayatTransaksi");
    if (transaksi.length === 0) {
        wadah.innerHTML = `<tr><td colspan="4" class="empty">Belum ada transaksi</td></tr>`;
        return;
    }

    wadah.innerHTML = "";
    [...transaksi].reverse().forEach(trx => {
        wadah.innerHTML += `
            <tr>
                <td>${trx.tanggal}</td>
                <td>${anggaran[trx.kategori]?.nama || trx.kategori}</td>
                <td style="text-align:right; font-weight:500">${formatRupiah(trx.jumlah)}</td>
                <td><span class="hapus-btn" data-id="${trx.id}">Hapus</span></td>
            </tr>
        `;
    });

    document.querySelectorAll(".hapus-btn").forEach(btn => {
        btn.onclick = async () => {
            const id = parseInt(btn.dataset.id);
            await hapusTransaksiDariDB(id);
            transaksi = transaksi.filter(t => t.id !== id);
            hitungUlangPengeluaran(transaksi);
            perbaruiSemua();
        };
    });
}

// === TAMPILKAN GRAFIK ===
function perbaruiGrafik() {
    const label = Object.values(anggaran).map(d => d.nama);
    const nilai = Object.values(anggaran).map(d => d.terpakai || 0);
    const warna = [
        "#ef4444", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
        "#14b8a6", "#3b82f6", "#8b5cf6", "#d946ef", "#ec4899"
    ];

    if (grafik) grafik.destroy();
    const ctx = document.getElementById("grafikPengeluaran").getContext("2d");
    grafik = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: label,
            datasets: [{ data: nilai, backgroundColor: warna, borderWidth: 2, borderColor: "#fff" }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "right", labels: { boxWidth: 12, padding: 12, font: { size: 11 } } }
            }
        }
    });
}

// === PERINGATAN ANGGARAN ===
function cekAnggaran(kategori, jumlahBaru) {
    const data = anggaran[kategori];
    const setelah = (data.terpakai || 0) + jumlahBaru;
    const alertBox = document.getElementById("peringatanAnggaran");
    const alertText = document.getElementById("teksPeringatan");

    if (setelah > data.batas) {
        alertBox.classList.remove("hidden");
        alertText.textContent = `⚠️ Pengeluaran untuk ${data.nama} melebihi anggaran! Anggaran ${formatRupiah(data.batas)}, setelah ditambah menjadi ${formatRupiah(setelah)}.`;
    } else if (setelah >= data.batas * 0.9) {
        alertBox.classList.remove("hidden");
        alertText.textContent = `⚠️ Pengeluaran untuk ${data.nama} sudah mencapai ${Math.round((setelah/data.batas)*100)}% dari anggaran. Hati-hati!`;
    } else {
        alertBox.classList.add("hidden");
    }
}

// === ISI FORM PENGATURAN ===
function isiFormPengaturan() {
    document.getElementById("inputGaji").value = GAJI_BULANAN;
    const wadah = document.getElementById("formAnggaran");
    wadah.innerHTML = "";

    Object.entries(anggaran).forEach(([k, data]) => {
        wadah.innerHTML += `
            <div class="form-group">
                <label>${data.nama} (Rp)</label>
                <input type="number" class="input-anggaran" data-kat="${k}" value="${data.batas}">
            </div>
        `;
    });
}

// === SIMPAN PERUBAHAN PENGATURAN ===
async function simpanPengaturan() {
    const gajiBaru = parseInt(document.getElementById("inputGaji").value) || 0;
    if (gajiBaru < 1) { alert("Masukkan jumlah pemasukan yang benar!"); return; }
    GAJI_BULANAN = gajiBaru;

    document.querySelectorAll(".input-anggaran").forEach(input => {
        const k = input.dataset.kat;
        const nilai = parseInt(input.value) || 0;
        if (anggaran[k]) anggaran[k].batas = nilai;
    });

    await simpanPengaturanKeDB();
    tutupModal();
    perbaruiSemua();
    alert("✅ Pemasukan & anggaran berhasil diperbarui!");
}

// === BUKA/TUTUP MODAL ===
function bukaModal() {
    isiFormPengaturan();
    document.getElementById("modalPengaturan").classList.remove("tersembunyi");
}
function tutupModal() {
    document.getElementById("modalPengaturan").classList.add("tersembunyi");
}

// === FORM TRANSAKSI ===
document.getElementById("formTransaksi").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tanggal = document.getElementById("tglTransaksi").value;
    const kategori = document.getElementById("kategoriTransaksi").value;
    const jumlah = parseInt(document.getElementById("jumlahTransaksi").value) || 0;

    if (!tanggal || jumlah <= 0) {
        alert("Isi tanggal dan jumlah yang benar!");
        return;
    }

    cekAnggaran(kategori, jumlah);
    const trx = { tanggal, kategori, jumlah };
    trx.id = await simpanTransaksiKeDB(trx);
    transaksi.push(trx);
    anggaran[kategori].terpakai = (anggaran[kategori].terpakai || 0) + jumlah;

    perbaruiSemua();
    document.getElementById("jumlahTransaksi").value = "";
});

// === TOMBOL PENGATURAN ===
document.getElementById("btnBukaPengaturan").onclick = bukaModal;
document.getElementById("btnTutupModal").onclick = tutupModal;
document.getElementById("btnSimpanPengaturan").onclick = simpanPengaturan;
document.getElementById("modalPengaturan").onclick = (e) => {
    if (e.target.id === "modalPengaturan") tutupModal();
};

// === INISIALISASI APLIKASI ===
window.onload = async () => {
    document.getElementById("tglTransaksi").valueAsDate = new Date();
    await bukaBasisData();
    await muatPengaturanDariDB();
    transaksi = await ambilSemuaTransaksiDariDB();
    hitungUlangPengeluaran(transaksi);
    perbaruiSemua();
};