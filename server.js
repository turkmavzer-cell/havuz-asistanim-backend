// Gerekli kütüphaneleri projemize dahil ediyoruz
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

// Express uygulamasını oluşturuyoruz
const app = express();
app.use(cors()); // CORS middleware'ini etkinleştir
app.use(express.json()); // Sunucunun gelen JSON verilerini işlemesini sağlar
const port = process.env.PORT || 3000; // Render.com için port ayarı

// =================================================================
// --- SUPABASE VERİTABANI BAĞLANTI AYARLARI (POOLER VERSİYONU) ---
// =================================================================
const pool = new Pool({
  user: 'postgres.gyiflbirwhkdetxoceyw',
  host: 'aws-1-eu-central-1.pooler.supabase.com',
  database: 'postgres',
  password: '1837837', // Lütfen bu şifreyi daha sonra değiştirin
  port: 6543,
  ssl: {
    rejectUnauthorized: false
  }
});

// Veritabanına bağlanmayı deniyoruz
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Veritabanına bağlanırken hata oluştu:', err.stack);
  }
  client.release();
  console.log('Bulut Veritabanına (Supabase) başarıyla bağlanıldı.');
});


// =================================================================
// --- API ENDPOINT'LERİ (TEMİZLENMİŞ VE TUTARLI VERSİYON) ---
// =================================================================

// Sunucunun çalışıp çalışmadığını kontrol etmek için ana endpoint
app.get('/', (req, res) => {
    res.send('Havuz Asistanım API çalışıyor!');
});


// --- KULLANICI VE HAVUZ VERİLERİNİ BİRLİKTE GETİRME (GİRİŞ İÇİN) ---
app.get('/api/users/:userId/data', async (req, res) => {
  const { userId } = req.params;
  try {
    // 1. Kullanıcı bilgilerini çek
    const userResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }
    const user = userResult.rows[0];

    // 2. Kullanıcıya ait havuzları çek
    const poolsResult = await pool.query('SELECT * FROM pools WHERE user_id = $1', [userId]);
    const pools = poolsResult.rows;

    // 3. Her şeyi birlikte gönder
    res.status(200).json({
      user: user,
      pools: pools || []
    });
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

    // Frontend'den gelen boyutlarla hacmi hesapla
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

// --- HAVUZ AYARLARINI GÜNCELLEME (mode, equipment, son değerler vb.) ---
app.put('/api/pools/:poolId', async (req, res) => {
    try {
        const { poolId } = req.params;
        // Güncellenebilecek tüm alanları body'den alıyoruz
        const {
            mode, equipment, history, tasks,
            lastPh, lastCl, lastTa, lastTc, lastCya, lastCh
        } = req.body;

        // Gelen veriye göre dinamik bir UPDATE sorgusu oluşturuyoruz
        const fields = [];
        const values = [];
        let queryIndex = 1;

        if (mode) { fields.push(`mode = $${queryIndex++}`); values.push(mode); }
        if (equipment) { fields.push(`equipment = $${queryIndex++}`); values.push(equipment); }
        if (history) { fields.push(`history = $${queryIndex++}`); values.push(history); }
        if (tasks) { fields.push(`tasks = $${queryIndex++}`); values.push(tasks); }
        if (lastPh) { fields.push(`last_ph = $${queryIndex++}`); values.push(lastPh); }
        if (lastCl) { fields.push(`last_cl = $${queryIndex++}`); values.push(lastCl); }
        if (lastTa) { fields.push(`last_ta = $${queryIndex++}`); values.push(lastTa); }
        if (lastTc) { fields.push(`last_tc = $${queryIndex++}`); values.push(lastTc); }
        if (lastCya) { fields.push(`last_cya = $${queryIndex++}`); values.push(lastCya); }
        if (lastCh) { fields.push(`last_ch = $${queryIndex++}`); values.push(lastCh); }
        
        if (fields.length === 0) {
            return res.status(400).json({ error: 'Güncellenecek veri bulunamadı.' });
        }

        const updateQuery = `UPDATE pools SET ${fields.join(', ')} WHERE id = $${queryIndex} RETURNING *`;
        values.push(poolId);

        const updatedPool = await pool.query(updateQuery, values);

        if (updatedPool.rowCount === 0) {
            return res.status(404).json({ error: 'Havuz bulunamadı.' });
        }
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
        if (deletePool.rowCount === 0) {
            return res.status(404).json({ error: 'Havuz bulunamadı.' });
        }
        res.json({ message: 'Havuz başarıyla silindi.', deletedPool: deletePool.rows[0] });
    } catch (err) {
        console.error('Havuz silinirken hata:', err.message);
        res.status(500).json({ error: 'Sunucu hatası oluştu.' });
    }
});


// --- ÖLÇÜM KAYDETME ---
app.post('/api/measurements', async (req, res) => {
  try {
    const {
        poolId, userId, ph, free_chlorine, total_chlorine,
        total_alkalinity, cyanuric_acid, calcium_hardness, bather_load
    } = req.body;

    if (!poolId || !userId) {
      return res.status(400).json({ error: 'Eksik bilgi: poolId ve userId zorunludur.' });
    }
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
