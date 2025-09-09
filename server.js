// Gerekli kütüphaneleri projemize dahil ediyoruz
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

// Express uygulamasını oluşturuyoruz
const app = express();
app.use(cors()); // CORS middleware'ini etkinleştir
app.use(express.json()); // Sunucunun gelen JSON verilerini işlemesini sağlar
const port = 3000; // Sunucumuzun çalışacağı port

// =================================================================
// --- SUPABASE VERİTABANI BAĞLANTI AYARLARI (POOLER VERSİYONU) ---
// =================================================================
const pool = new Pool({
  user: 'postgres.gyiflbirwhkdetxoceyw', // DİKKAT: Yeni kullanıcı adı
  host: 'aws-1-eu-central-1.pooler.supabase.com',
  database: 'postgres',
  password: '1837837', // Şifremiz aynı
  port: 6543, // Yeni port
  ssl: true 
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
// --- API ENDPOINT'LERİ ---
// =================================================================

// --- KULLANICI İŞLEMLERİ ---
app.post('/api/users', async (req, res) => {
  const { google_id, email, name } = req.body;
  if (!google_id || !email || !name) {
    return res.status(400).json({ error: 'Eksik bilgi: google_id, email ve name alanları zorunludur.' });
  }
  try {
    const newUser = await pool.query("INSERT INTO Users (google_id, email, name) VALUES ($1, $2, $3) RETURNING *", [google_id, email, name]);
    res.status(201).json(newUser.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Sunucu hatası oluştu.' });
  }
});

// --- HAVUZ İŞLEMLERİ ---
app.get('/api/users/:userId/pools', async (req, res) => {
  try {
    const { userId } = req.params;
    const allPools = await pool.query("SELECT * FROM Pools WHERE user_id = $1", [userId]);
    res.json(allPools.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Sunucu hatası oluştu.' });
  }
});

app.post('/api/pools', async (req, res) => {
  try {
    const { user_id, pool_name, volume_m3, filter_type, pump_capacity_m3_hr, routine_chlorine_type } = req.body;
    if (!user_id || !pool_name || !volume_m3) {
      return res.status(400).json({ error: 'Eksik bilgi: user_id, pool_name ve volume_m3 zorunludur.' });
    }
    const newPool = await pool.query(
      "INSERT INTO Pools (user_id, pool_name, volume_m3, filter_type, pump_capacity_m3_hr, routine_chlorine_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [user_id, pool_name, volume_m3, filter_type, pump_capacity_m3_hr, routine_chlorine_type]
    );
    res.status(201).json(newPool.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Sunucu hatası oluştu.' });
  }
});

app.delete('/api/pools/:poolId', async (req, res) => {
    try {
        const { poolId } = req.params;
        const deletePool = await pool.query("DELETE FROM Pools WHERE pool_id = $1 RETURNING *", [poolId]);
        if (deletePool.rowCount === 0) {
            return res.status(404).json({ error: 'Havuz bulunamadı.' });
        }
        res.json({ message: 'Havuz başarıyla silindi.', deletedPool: deletePool.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Sunucu hatası oluştu.' });
    }
});

app.put('/api/pools/:poolId', async (req, res) => {
    try {
        const { poolId } = req.params;
        const { pool_name, volume_m3 } = req.body;
        if (!pool_name || !volume_m3) {
            return res.status(400).json({ error: 'Eksik bilgi: pool_name ve volume_m3 zorunludur.' });
        }
        const updatedPool = await pool.query(
            "UPDATE Pools SET pool_name = $1, volume_m3 = $2 WHERE pool_id = $3 RETURNING *",
            [pool_name, volume_m3, poolId]
        );
        if (updatedPool.rowCount === 0) {
            return res.status(404).json({ error: 'Havuz bulunamadı.' });
        }
        res.json(updatedPool.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Sunucu hatası oluştu.' });
    }
});

// --- ÖLÇÜM İŞLEMLERİ ---
app.get('/api/pools/:poolId/measurements', async (req, res) => {
  try {
    const { poolId } = req.params;
    const measurements = await pool.query(
      "SELECT * FROM Measurements WHERE pool_id = $1 ORDER BY measurement_date DESC", 
      [poolId]
    );
    res.json( measurements.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Sunucu hatası oluştu.' });
  }
});

app.post('/api/measurements', async (req, res) => {
  try {
    const { pool_id, ph, free_chlorine_ppm, total_alkalinity_ppm, cyanuric_acid_ppm, calcium_hardness_ppm, notes } = req.body;
    if (!pool_id) {
      return res.status(400).json({ error: 'Eksik bilgi: pool_id zorunludur.' });
    }
    const newMeasurement = await pool.query(
      "INSERT INTO Measurements (pool_id, ph, free_chlorine_ppm, total_alkalinity_ppm, cyanuric_acid_ppm, calcium_hardness_ppm, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [pool_id, ph, free_chlorine_ppm, total_alkalinity_ppm, cyanuric_acid_ppm, calcium_hardness_ppm, notes]
    );
    res.status(201).json(newMeasurement.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Sunucu hatası oluştu.' });
  }
});


// Sunucuyu dinlemeye başlıyoruz
app.listen(port, () => {
  console.log(`Sunucu http://localhost:${port} adresinde çalışıyor.`);
});