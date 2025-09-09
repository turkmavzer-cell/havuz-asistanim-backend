// Gerekli kütüphaneleri projemize dahil ediyoruz
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

// Express uygulamasını oluşturuyoruz
const app = express();
// Geliştirme ortamından (Live Server) ve diğer potansiyel adreslerden gelen isteklere izin ver
const corsOptions = {
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json()); // Sunucunun gelen JSON verilerini işlemesini sağlar
const port = process.env.PORT || 3000; // Render.com için port ayarı

// =================================================================
// --- SUPABASE VERİTABANI BAĞLANTI AYARLARI ---
// =================================================================
const pool = new Pool({
  user: 'postgres.gyiflbirwhkdetxoceyw',
  host: 'aws-1-eu-central-1.pooler.supabase.com',
  database: 'postgres',
  password: '1837837', // Lütfen bu şifreyi daha sonra güvenli bir yerden yönetin
  port: 6543,
  ssl: {
    rejectUnauthorized: false
  }
});

// Veritabanına bağlanmayı deniyoruz
pool.connect((err) => {
  if (err) {
    return console.error('Veritabanına bağlanırken hata oluştu:', err.stack);
  }
  console.log('Bulut Veritabanına (Supabase) başarıyla bağlanıldı.');
});

// =================================================================
// --- API ENDPOINT'LERİ (NİHAİ VERSİYON) ---
// =================================================================

// Sunucunun çalışıp çalışmadığını kontrol etmek için ana endpoint
app.get('/', (req, res) => {
    res.send('Havuz Asistanım API başarıyla çalışıyor!');
});

// --- KULLANICI VE HAVUZ VERİLERİNİ BİRLİKTE GETİRME (GİRİŞ İÇİN) ---
app.get('/api/users/:userId/data', async (req, res) => {
  const { userId } = req.params;
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }
    const user = userResult.rows[0];

    const poolsResult = await pool.query('SELECT * FROM pools WHERE user_id = $1', [userId]);
    const pools = poolsResult.rows;

    res.status(200).json({ user, pools: pools || [] });
  } catch (err) {
    console.error('Kullanıcı verisi alınırken hata:', err.message);
    res.status(500).json({ error: 'Sunucu hatası oluştu.' });
  }
});

// --- YENİ HAVUZ EKLEME ---
app.post('/api/pools', async (req, res) => {
  try {
    const { userId, name, type, width, length, depth } = req.body;
    if (!userId || !name || !width || !length || !depth) {
      return res.status(400).json({ error: 'Eksik bilgi gönderildi.' });
    }
    const volume_m3 = parseFloat(width) * parseFloat(length) * parseFloat(depth);

    const newPool = await pool.query(
      "INSERT INTO pools (user_id, pool_name, type, width, length, depth, volume_m3) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [userId, name, type, width, length, depth, volume_m3]
    );
    res.status(201).json(newPool.rows[0]);
  } catch (err) {
    console.error('Havuz eklenirken hata:', err.message);
    res.status(500).json({ error: 'Sunucu hatası oluştu.' });
  }
});

// --- HAVUZ AYARLARINI GÜNCELLEME ---
app.put('/api/pools/:poolId', async (req, res) => {
    try {
        const { poolId } = req.params;
        const { mode, equipment, history, tasks, lastPh, lastCl, lastTa, lastTc, lastCya, lastCh } = req.body;

        const fields = [];
        const values = [];
        let queryIndex = 1;

        if (mode !== undefined) { fields.push(`mode = $${queryIndex++}`); values.push(mode); }
        if (equipment !== undefined) { fields.push(`equipment = $${queryIndex++}`); values.push(equipment); }
        if (history !== undefined) { fields.push(`history = $${queryIndex++}`); values.push(history); }
        if (tasks !== undefined) { fields.push(`tasks = $${queryIndex++}`); values.push(tasks); }
        if (lastPh !== undefined) { fields.push(`last_ph = $${queryIndex++}`); values.push(lastPh); }
        if (lastCl !== undefined) { fields.push(`last_cl = $${queryIndex++}`); values.push(lastCl); }
        if (lastTa !== undefined) { fields.push(`last_ta = $${queryIndex++}`); values.push(lastTa); }
        if (lastTc !== undefined) { fields.push(`last_tc = $${queryIndex++}`); values.push(lastTc); }
        if (lastCya !== undefined) { fields.push(`last_cya = $${queryIndex++}`); values.push(lastCya); }
        if (lastCh !== undefined) { fields.push(`last_ch = $${queryIndex++}`); values.push(lastCh); }
        
        if (fields.length === 0) return res.status(400).json({ error: 'Güncellenecek veri bulunamadı.' });

        const updateQuery = `UPDATE pools SET ${fields.join(', ')} WHERE id = $${queryIndex} RETURNING *`;
        values.push(poolId);

        const updatedPool = await pool.query(updateQuery, values);
        if (updatedPool.rowCount === 0) return res.status(404).json({ error: 'Havuz bulunamadı.' });
        res.json(updatedPool.rows[0]);
    } catch (err) {
        console.error('Havuz güncellenirken hata:', err.message);
        res.status(500).json({ error: 'Sunucu hatası oluştu.' });
    }
});

// --- HAVUZ SİLME ---
app.delete('/api/pools/:poolId', async (req, res) => {
    try {
        const { poolId } = req.params;
        const deletePool = await pool.query("DELETE FROM pools WHERE id = $1 RETURNING *", [poolId]);
        if (deletePool.rowCount === 0) return res.status(404).json({ error: 'Havuz bulunamadı.' });
        res.json({ message: 'Havuz başarıyla silindi.' });
    } catch (err) {
        console.error('Havuz silinirken hata:', err.message);
        res.status(500).json({ error: 'Sunucu hatası oluştu.' });
    }
});

// --- ÖLÇÜM KAYDETME ---
app.post('/api/measurements', async (req, res) => {
  try {
    const { poolId, userId, ph, free_chlorine, total_chlorine, total_alkalinity, cyanuric_acid, calcium_hardness, bather_load } = req.body;
    if (!poolId || !userId) return res.status(400).json({ error: 'poolId ve userId zorunludur.' });

    const newMeasurement = await pool.query(
      `INSERT INTO measurements (pool_id, user_id, ph, free_chlorine, total_chlorine, total_alkalinity, cyanuric_acid, calcium_hardness, bather_load) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [poolId, userId, ph, free_chlorine, total_chlorine, total_alkalinity, cyanuric_acid, calcium_hardness, bather_load]
    );
    res.status(201).json(newMeasurement.rows[0]);
  } catch (err) {
    console.error('Ölçüm kaydedilirken hata:', err.message);
    res.status(500).json({ error: 'Sunucu hatası oluştu.' });
  }
});

// Sunucuyu dinlemeye başlıyoruz
app.listen(port, () => {
  console.log(`Sunucu http://localhost:${port} adresinde çalışıyor.`);
});

