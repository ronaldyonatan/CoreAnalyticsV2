# Data Studio SQL Server — audit & minimal fix (5 November 2026)

## Audit sebelum perubahan

**Backend aktif: voice-auth-backend**, bukan data-studio-backend.

Alur request saat ini:

```text
React src/dataStudio/Connections.tsx
  /voice-api/api/studio/connections[/test|/<id>/active]
    Vite /voice-api -> http://127.0.0.1:5001 (prefix dihapus)
      voice-auth-backend/server.py
        app.routes.studio_connections_api.studio_connections_bp
```

Nginx yang tersedia juga mem-proxy `/voice-api/` ke `voice-auth:5001/`. Keempat endpoint GET list, POST create, POST test, dan PATCH active terdaftar pada blueprint tersebut. Port 5001 sedang listen; cwd proses Python menunjuk folder voice-auth-backend. Permintaan live tanpa cookie ke GET list dan POST test menghasilkan `401 AUTH_REQUIRED`.

`data-studio-backend` berisi connector dynamic, blueprint Connections, helper enkripsi, kontrak RBAC, repository kosong dan dua file migrasi. Tidak ditemukan server/entrypoint yang mendaftarkan blueprint itu. API scaffold mengimpor `app.services.session_security`, `auth_service`, dan `studio_connections` yang tidak ada dalam paket Data Studio tersebut. Ia belum merupakan layanan independen yang dapat menggantikan backend aktif.

Duplikasi yang ditemukan:

- Kedua folder mendefinisikan connector SQL Server.
- Kedua folder mendefinisikan blueprint dengan prefix dan nama yang sama; hanya versi voice-auth yang diregistrasi oleh server aktif.
- Folder Data Studio mempunyai helper Fernet sendiri, tetapi tidak memiliki implementasi metadata/session yang independen dan aktif. Metadata path yang dipakai React melalui voice-auth menggunakan BEAM, bukan repository baru.

**Penyebab 403 berdasarkan path aktif:** route `/test` memeriksa `STUDIO_ALLOWED_SQL_HOSTS` secara langsung, kemudian connector aktif mengulangi allowlist exact-host. Keduanya tidak membaca mode dynamic. Implementasi dynamic di folder Data Studio tidak digunakan oleh path ini. Karena itu mengganti environment saja tidak cukup.

Security yang sudah ada dan dipertahankan:

- Cookie `core_session`, validasi sesi lewat BEAM, izin route `data_studio` dari profil akses server.
- Mutasi memeriksa cookie/header `core_csrf` / `X-CSRF-Token` dan Origin melalui `session_security.valid_csrf()`.
- Metadata menggunakan `core_api` dan Fernet sebelum password dikirim ke BEAM. Key, format ciphertext, prosedur, payload metadata dan penyimpanan tidak diubah.
- Password login, voice login, endpoint sesi, management dan permission resolver tidak diubah.

Memindahkan endpoint sekarang akan memutus ketergantungan session/RBAC/metadata. Tidak dilakukan migrasi endpoint, gateway atau protokol autentikasi baru.

## Implementasi minimal

1. Connector **aktif** mengadaptasi validator dynamic yang sudah tersedia di folder Data Studio, lalu menambahkan pembatasan CIDR/port dan pemeriksaan alamat mesin sendiri. Kedua backend memiliki package bernama `app`; tidak ditambahkan import silang/sys.path hack. Konteks build Docker yang tersedia hanya voice-auth-backend, sehingga dependensi runtime pada sibling Data Studio akan merusak packaging. Connector scaffold yang tidak aktif dibiarkan untuk konsolidasi terpisah.
2. Route aktif menghapus guard allowlist hardcoded pada `/test`. Test dan Save memanggil validator connector yang sama. URL, field JSON, session, CSRF dan envelope response tetap. Policy denial memakai 403; konfigurasi salah/tidak lengkap memakai 503.
3. Startup lokal membaca konfigurasi khusus development tanpa mengeksekusi `.env` sebagai shell. Environment generik yang diberikan operator tetap lebih diprioritaskan.

Tidak ada SQL host individual ditanam dalam kode. Subnet/port disetujui melalui konfigurasi server; host lain dalam subnet yang sama dapat dimasukkan lewat form tanpa edit environment atau restart per koneksi.

### Policy pusat pada path aktif

| Setting | Perilaku |
|---|---|
| `STUDIO_SQL_HOST_POLICY` | `allowlist` default, atau opt-in `dynamic`; nilai lain ditolak |
| `STUDIO_ALLOWED_SQL_HOSTS` | Digunakan hanya pada mode allowlist |
| `STUDIO_SQL_ALLOWED_NETWORKS` | Daftar CIDR dipisahkan koma; wajib dan tidak boleh kosong pada dynamic |
| `STUDIO_SQL_ALLOWED_PORTS` | Port TCP yang diizinkan; default `1433` |
| `STUDIO_ALLOW_UNTRUSTED_CERT` | Gate yang sudah ada; connector tetap default `false`, tidak diaktifkan baru oleh fix |

Semua jawaban DNS diperiksa. Jawaban mixed unsafe/outside-CIDR ditolak, lalu koneksi memakai **IP numerik hasil validasi**, bukan hostname yang bisa di-resolve ulang. `HostnameInCertificate` mempertahankan pemeriksaan nama sertifikat untuk FQDN. Loopback, link-local, multicast, reserved/special ranges, metadata cloud yang dikenal, alamat backend sendiri, serta network/broadcast IPv4 subnet ditolak. Delimiter connection-string ditolak pada host/database/username; password tetap dibungkus/di-escape menurut ODBC. Error ODBC diklasifikasikan tanpa mengembalikan pesan driver mentah, password atau connection string.

`HostnameInCertificate` didukung ODBC 18; setting ini tidak menggantikan trust chain CA. Rujukan resmi: [Microsoft ODBC Linux/macOS connection keywords](https://learn.microsoft.com/en-gb/sql/connect/odbc/linux-mac/connection-string-keywords-and-data-source-names-dsns?view=sql-server-ver15). Jangan memperbaiki error sertifikat dengan menonaktifkan TLS secara global.

### Aktivasi lokal dan implikasi produksi

Tambahan `.env` **hanya namespace development**:

```dotenv
STUDIO_DEV_SQL_HOST_POLICY=dynamic
STUDIO_DEV_SQL_ALLOWED_NETWORKS=0.0.0.0/0,::/0
STUDIO_DEV_SQL_ALLOWED_PORTS=*
```

Script `start_coreanalytics_dev_fixed.sh` memetakan nilai tersebut ke `STUDIO_SQL_*` hanya ketika dijalankan lokal. Nilai generic `STUDIO_SQL_*` yang sudah diekspor operator lebih diprioritaskan. Pada container saat ini, CMD menjalankan `python server.py`, bukan script macOS; `.env` memang dibaca Compose tetapi kode connector mengabaikan `STUDIO_DEV_*`. Jadi tidak ada perpindahan produksi ke dynamic secara diam-diam. Untuk produksi, operator harus secara eksplisit memilih mode dan CIDR/port yang benar; network egress tetap perlu dibatasi.

Script lokal sejak sebelum task ini mempunyai default `STUDIO_ALLOW_UNTRUSTED_CERT=true` untuk development. Fix **tidak menambahkan atau mengubah default lama tersebut**. Contoh start di bawah secara eksplisit memilih verifikasi TLS ketat (`false`). Jika sertifikat SQL belum dipercaya, perbaiki CA/nama sertifikat; jangan menganggap TLS error sebagai allowlist error.

## File yang diubah oleh task ini

| Full path | Alasan dan ringkasan |
|---|---|
| `/Users/ronaldyonatan/CoreAnalyticsV2/voice-auth-backend/app/connectors/sqlserver.py` | Path connector yang benar-benar dipakai; dynamic policy, CIDR/port, blok alamat sensitif, DNS pinning, TLS identity dan error aman |
| `/Users/ronaldyonatan/CoreAnalyticsV2/voice-auth-backend/app/routes/studio_connections_api.py` | Test dan Save memakai validator yang sama; menghapus guard allowlist route yang menyebabkan 403 sebelum connector |
| `/Users/ronaldyonatan/CoreAnalyticsV2/voice-auth-backend/start_coreanalytics_dev_fixed.sh` | Membaca dan mengekspor policy lokal dengan precedence environment yang eksplisit |
| `/Users/ronaldyonatan/CoreAnalyticsV2/voice-auth-backend/.env` | Menambahkan tiga nilai `STUDIO_DEV_*`; key/credential existing dipertahankan |
| `/Users/ronaldyonatan/CoreAnalyticsV2/voice-auth-backend/tests/test_studio_sql_policy.py` | Pengujian offline connector, API, security, enkripsi dan startup mapping |
| `/Users/ronaldyonatan/CoreAnalyticsV2/voice-auth-backend/STUDIO_SQL_POLICY_AUDIT.md` | Audit, batas verifikasi, perintah lokal dan follow-up |

Empat file existing diubah dan dua file ditambahkan. Sebagian file existing tersebut sudah untracked sebelum task. Tidak mengubah data-studio-backend, auth/session functions, core_api_client, server registration, frontend, theme/CSS/dashboard, Docker/Compose, requirement, schema atau stored procedure. Working tree sudah memiliki perubahan pengguna pada area tersebut sejak awal; semuanya dipertahankan.

## Verifikasi dan batas bukti

- **19 unit/in-process API tests lulus**, memakai unittest bawaan, tanpa dependency baru.
- Policy .174, .12, dan host permitted baru .99 lulus; allowlist default tetap membatasi host individual.
- Invalid hostname, DNS gagal/mixed, subnet/port di luar policy, localhost, metadata, multicast, network/broadcast, dan own-interface ditolak.
- DNS dipin ke IP; TLS certificate hostname dan escaped password diperiksa melalui mocked ODBC.
- Invalid credentials, timeout, TLS, database unavailable dan unreachable driver errors diklasifikasikan dan disanitasi melalui mock; bukan percobaan login real.
- Flask test client memakai validasi cookie/session/CSRF yang existing, dengan BEAM/profile lookup dimock. Missing/revoked session, permission dan CSRF/Origin ditolak sebelum network connect.
- Test dan Save memakai policy sama. Save memverifikasi enkripsi Fernet aktual dengan key sementara dan BEAM write yang dimock. Tidak ada penulisan metadata real.
- Syntax AST dan import connector/blueprint lulus; `bash -n` startup script lulus. ODBC Driver 18 tersedia pada `.venv` lokal.
- **Live TCP** `172.16.20.174:1433` dan `172.16.20.12:1433` reachable. Validator baru dalam proses Python baru mengizinkan keduanya melalui policy lokal. TCP reachability bukan login/query SQL.
- Endpoint live tanpa session menghasilkan `401 AUTH_REQUIRED`; tidak ada bypass auth untuk uji live.
- Login/query SQL authenticated pada kedua server, authenticated browser Test/Save, voice/password login real, User/Group real dan dashboard dengan data real **belum diuji**. Tidak ada kredensial SQL atau sesi pengguna yang dipakai/diambil. Frontend `npm run build` lulus (release-version check, TypeScript dan Vite); terdapat warning ukuran chunk >500 kB. Source frontend tidak diubah.
- Proses Flask existing (port 5001) mempunyai reload dimatikan dan tidak direstart oleh agent. Restart diperlukan agar handler/connector baru benar-benar digunakan.

## Perintah macOS

Dari root repository:

```sh
cd /Users/ronaldyonatan/CoreAnalyticsV2
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -B -m unittest discover \
  -s voice-auth-backend/tests -p 'test_studio_sql_policy.py' -v
bash -n voice-auth-backend/start_coreanalytics_dev_fixed.sh
```

Hentikan backend lama melalui Ctrl+C di terminal pemiliknya, lalu jalankan:

```sh
cd /Users/ronaldyonatan/CoreAnalyticsV2
STUDIO_ALLOW_UNTRUSTED_CERT=false \
  bash voice-auth-backend/start_coreanalytics_dev_fixed.sh
```

Tidak perlu mengubah `.env` untuk menambahkan host lain pada subnet yang telah disetujui. Jika environment shell sebelumnya memaksa `allowlist`, override eksplisit untuk sesi development:

```sh
STUDIO_SQL_HOST_POLICY=dynamic \
STUDIO_SQL_ALLOWED_NETWORKS='0.0.0.0/0,::/0' \
STUDIO_SQL_ALLOWED_PORTS='*' \
STUDIO_ALLOW_UNTRUSTED_CERT=false \
  bash voice-auth-backend/start_coreanalytics_dev_fixed.sh
```

Di terminal frontend yang terpisah:

```sh
cd /Users/ronaldyonatan/CoreAnalyticsV2/voice-dashboard
npm run dev -- --host localhost
```

Buka `http://localhost:5173` agar sesuai Origin development yang sudah digunakan script. Login dengan akun yang memiliki izin Data Studio, buka Connections, uji `.174` dan `.12` dengan database dan kredensial SQL yang benar. Pertahankan Encrypt Transport dan certificate validation. Pastikan hasil sukses benar-benar berisi success dari query fixed connector. Uji Save hanya jika memang ingin membuat metadata koneksi.

Pemeriksaan negatif tanpa kredensial:

```sh
curl -i http://127.0.0.1:5001/api/studio/connections
```

Hasil yang diharapkan: `401 AUTH_REQUIRED`. Jangan menaruh password SQL pada perintah curl atau shell history.

## Git diff dan pemisahan perubahan awal pengguna

Saat audit awal working tree sudah memiliki perubahan Docker/Compose, backend auth, frontend dan file baru Data Studio. `git diff --stat` pada akhir pemeriksaan tracked files memperlihatkan **15 files changed, 313 insertions(+), 58 deletions(-)**; angka itu mencakup perubahan awal pengguna dan bukan ukuran fix ini saja. Connector, route dan startup script aktif sudah berstatus untracked saat task dimulai, sehingga perubahan isinya tidak muncul sebagai delta dalam `git diff` biasa. File unit test dan dokumen ini baru ditambahkan oleh task.

Scope task diverifikasi menggunakan hash terhadap snapshot awal; hanya enam path pada tabel di atas yang boleh berbeda. `git diff --check` global menemukan trailing whitespace yang sudah ada di `voice-dashboard/vite.config.ts:28`; file tersebut sengaja tidak diubah. Syntax/whitespace pada file fix diperiksa terpisah. Tidak ada staging, commit atau push.

## Follow-up arsitektur — tidak diimplementasikan

- Jadikan SQL host policy/connector satu package yang dapat diuji dan dipaketkan oleh owner Data Studio; jangan memakai import silang dua package bernama `app` dari sibling directory.
- Aktifkan Data Studio sebagai layanan hanya melalui migrasi terpisah yang mempertahankan kontrak session/RBAC/CSRF dan routing aplikasi tunggal.
- Selaraskan scaffold/README Data Studio dengan kontrak metadata aktif setelah migrasi disetujui. Connector scaffold yang belum aktif belum mendapat pembatasan baru di task ini; jangan mengaktifkannya seolah sudah memakai policy aktif yang diperbaiki.
- Tidak ada duplicate file dihapus dan tidak ada schema migration diterapkan.

## Penyesuaian kebutuhan self-service

Kebutuhan produk diperjelas: pengguna membuat koneksi ke sumber data mereka tanpa perubahan IP/subnet oleh programmer. Konfigurasi lokal kini memilih dynamic dengan `STUDIO_DEV_SQL_ALLOWED_NETWORKS=0.0.0.0/0,::/0` dan `STUDIO_DEV_SQL_ALLOWED_PORTS=*`. Ini satu keputusan deployment untuk mengizinkan tujuan SQL pengguna, bukan allowlist per pelanggan. Semua alamat IPv4/IPv6 yang lolos pemeriksaan infrastruktur dapat dipakai, termasuk 192.167.10.249; port custom 1–65535 didukung. Loopback, alamat mesin sendiri, link-local/metadata, multicast dan rentang khusus yang diblokir tetap ditolak. Mode restricted dengan CIDR/port tertentu tetap tersedia.

Untuk deployment Docker, set satu kali `STUDIO_SQL_HOST_POLICY=dynamic`, `STUDIO_SQL_ALLOWED_NETWORKS=0.0.0.0/0,::/0`, `STUDIO_SQL_ALLOWED_PORTS=*` di environment service aktif. File Compose/Docker tidak diubah oleh penyesuaian ini. Default connector tetap allowlist jika operator tidak memilih dynamic.

Kebebasan konfigurasi bukan jaminan jaringan dapat dijangkau. IP privat pelanggan memerlukan routing/VPN/agent; firewall, credential, izin database, dan sertifikat tetap menentukan keberhasilan. Test/Save saat ini merupakan metadata dan pemeriksaan konektivitas; pipeline ingestion, penjadwalan, sink data center dan konsumsi dashboard tidak otomatis dibuat oleh perubahan policy ini. Arsitektur lanjutan perlu worker ingestion dan connector agent untuk jaringan pelanggan, serta kuota/concurrency dan audit koneksi di batas layanan. Tidak ada klaim bahwa fitur tersebut sudah diimplementasikan.

Tambahan regresi self-service mencakup lintas subnet, alamat publik pengguna, IPv6, FQDN, custom port, penolakan port invalid dan pemblokiran metadata/mesin sendiri. Pengujian ini offline; tidak mengirim koneksi ke alamat publik contoh. Total suite kini 20 tes.

## Keputusan scope saat ini: koneksi organisasi dahulu

Atas arahan pengguna berikutnya, kesiapan public multi-tenant ditunda. Konfigurasi lokal aktif dibatasi kembali ke `STUDIO_DEV_SQL_ALLOWED_NETWORKS=172.16.20.0/24,192.167.10.249/32` dan `STUDIO_DEV_SQL_ALLOWED_PORTS=1433`. IP Alibaba Cloud disetujui pengguna sebagai server organisasi. Dukungan konfigurasi dynamic luas/custom port di connector tetap tersedia tetapi tidak diaktifkan konfigurasi lokal ini. Contoh konfigurasi luas pada bagian sebelumnya merupakan opsi self-service mendatang, bukan konfigurasi lokal terbaru. Environment generic yang diwariskan terminal tetap mengalahkan alias DEV; gunakan nilai restricted eksplisit saat restart jika sebelumnya memakai broad override. Belum ada pengujian login/query SQL live ke Alibaba Cloud.

## Perluasan subnet Alibaba Cloud

Pengguna meminta seluruh 192.167.10.xx, sehingga konfigurasi lokal terbaru adalah `STUDIO_DEV_SQL_ALLOWED_NETWORKS=172.16.20.0/24,192.167.10.0/24`, port 1433. Tulisan 1902.167.10.xx ditafsirkan sebagai salah ketik berdasarkan IP 192.167.10.249 yang sudah dikonfirmasi sebelumnya. Alamat host .1 sampai .254 pada subnet Alibaba Cloud diterima; network/broadcast dan subnet tetangga tetap ditolak. Ini menggantikan pembatasan /32 pada keputusan sebelumnya. Validasi offline dilakukan tanpa koneksi/login SQL nyata.
