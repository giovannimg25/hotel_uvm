const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../sitio_web/pages')));

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'holiday_estate',
    port: process.env.DB_PORT || 3306
};

let pool;

async function connectDB() {
    try {
        pool = await mysql.createPool(dbConfig);
        console.log('✅ Conectado a MySQL');
    } catch (error) {
        console.error('❌ Error conectando a MySQL:', error.message);
        process.exit(1);
    }
}

// ========== ENDPOINTS ==========

// --- Habitaciones ---
app.get('/api/habitaciones', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, nombre, tipo, capacidad, precio_base, descripcion, imagen_url FROM habitaciones WHERE activo = 1');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/habitaciones/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM habitaciones WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Habitación no encontrada' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Reservas ---
app.get('/api/reservas', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT r.*, c.nombre as cliente_nombre, h.numero as habitacion_numero, h.nombre as habitacion_nombre
            FROM reservas r
            JOIN clientes c ON r.cliente_id = c.id
            JOIN habitaciones h ON r.habitacion_id = h.id
            ORDER BY r.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/reservas', async (req, res) => {
    const { cliente_nombre, cliente_email, cliente_telefono, habitacion_id, fecha_checkin, fecha_checkout, adultos, ninos, precio_noche, precio_total, empresa_id } = req.body;
    try {
        let cliente_id;
        const [existente] = await pool.execute('SELECT id FROM clientes WHERE email = ?', [cliente_email]);
        if (existente.length > 0) {
            cliente_id = existente[0].id;
        } else {
            const [result] = await pool.execute(
                'INSERT INTO clientes (nombre, email, telefono, tipo) VALUES (?, ?, ?, ?)',
                [cliente_nombre, cliente_email, cliente_telefono, 'regular']
            );
            cliente_id = result.insertId;
        }

        const [result] = await pool.execute(
            `INSERT INTO reservas (cliente_id, habitacion_id, empresa_id, fecha_checkin, fecha_checkout, adultos, ninos, precio_noche, precio_total, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmada')`,
            [cliente_id, habitacion_id, empresa_id || null, fecha_checkin, fecha_checkout, adultos, ninos, precio_noche, precio_total]
        );

        await pool.execute(
            'INSERT INTO actividades (usuario, accion, detalle) VALUES (?, ?, ?)',
            ['Recepcionista', 'nueva_reserva', `Reserva ID ${result.insertId} para ${cliente_nombre}`]
        );

        res.json({ id: result.insertId, message: 'Reserva confirmada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/reservas/:id/estado', async (req, res) => {
    const { estado } = req.body;
    try {
        await pool.execute('UPDATE reservas SET estado = ? WHERE id = ?', [estado, req.params.id]);
        res.json({ message: 'Estado actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Empresas ---
app.get('/api/empresas', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT e.*, COUNT(DISTINCT c.id) as clientes_count,
                   (SELECT COUNT(*) FROM contratos WHERE empresa_id = e.id AND activo = 1) as tiene_contrato_activo
            FROM empresas e
            LEFT JOIN clientes c ON e.id = c.empresa_id
            GROUP BY e.id
            ORDER BY e.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/empresas/:id', async (req, res) => {
    try {
        const [empresa] = await pool.execute('SELECT * FROM empresas WHERE id = ?', [req.params.id]);
        if (empresa.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' });
        const [contratos] = await pool.execute('SELECT * FROM contratos WHERE empresa_id = ? ORDER BY created_at DESC', [req.params.id]);
        const [clientes] = await pool.execute('SELECT id, nombre, email FROM clientes WHERE empresa_id = ?', [req.params.id]);
        res.json({ ...empresa[0], contratos, clientes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/empresas', async (req, res) => {
    const { nombre, industria, contacto_nombre, contacto_email, contacto_telefono, descuento_base } = req.body;
    try {
        const [result] = await pool.execute(
            'INSERT INTO empresas (nombre, industria, contacto_nombre, contacto_email, contacto_telefono, descuento_base) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre, industria, contacto_nombre, contacto_email, contacto_telefono, descuento_base || 0]
        );
        res.json({ id: result.insertId, message: 'Empresa creada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/empresas/:id', async (req, res) => {
    const { nombre, industria, contacto_nombre, contacto_email, contacto_telefono, estado, descuento_base } = req.body;
    try {
        await pool.execute(
            'UPDATE empresas SET nombre=?, industria=?, contacto_nombre=?, contacto_email=?, contacto_telefono=?, estado=?, descuento_base=? WHERE id=?',
            [nombre, industria, contacto_nombre, contacto_email, contacto_telefono, estado, descuento_base, req.params.id]
        );
        res.json({ message: 'Empresa actualizada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Contratos ---
app.post('/api/contratos', async (req, res) => {
    const { empresa_id, fecha_inicio, fecha_fin, descuento_estandar, descuento_ejecutivo, descuento_suite } = req.body;
    try {
        await pool.execute('UPDATE contratos SET activo = 0 WHERE empresa_id = ?', [empresa_id]);
        const [result] = await pool.execute(
            `INSERT INTO contratos (empresa_id, fecha_inicio, fecha_fin, descuento_estandar, descuento_ejecutivo, descuento_suite) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [empresa_id, fecha_inicio, fecha_fin, descuento_estandar, descuento_ejecutivo, descuento_suite]
        );
        res.json({ id: result.insertId, message: 'Contrato creado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Admin KPIs ---
app.get('/api/admin/kpis', async (req, res) => {
    try {
        const [ocupacion] = await pool.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN r.estado IN ('confirmada','checkin') AND CURDATE() BETWEEN r.fecha_checkin AND r.fecha_checkout THEN 1 ELSE 0 END) as ocupadas
            FROM habitaciones h
            LEFT JOIN reservas r ON h.id = r.habitacion_id
        `);
        const [ingresos] = await pool.execute(`
            SELECT COALESCE(SUM(precio_total),0) as total
            FROM reservas
            WHERE MONTH(created_at)=MONTH(CURDATE()) AND YEAR(created_at)=YEAR(CURDATE())
              AND estado IN ('confirmada','checkin','checkout')
        `);
        const [hoy] = await pool.execute(`
            SELECT COUNT(*) as total FROM reservas WHERE estado='confirmada' AND fecha_checkin=CURDATE()
        `);
        const [actividad] = await pool.execute(`SELECT * FROM actividades ORDER BY created_at DESC LIMIT 10`);

        const porcentaje = ocupacion[0].total ? ((ocupacion[0].ocupadas / ocupacion[0].total) * 100).toFixed(1) : 0;
        res.json({
            ocupacion: { porcentaje, ocupadas: ocupacion[0].ocupadas, total: ocupacion[0].total },
            ingresos: { total: ingresos[0].total, meta: 1000000 },
            huespedes_hoy: hoy[0].total,
            actividad_reciente: actividad
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Clientes (para búsqueda) ---
app.get('/api/clientes', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, nombre, email, telefono FROM clientes ORDER BY nombre');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Iniciar servidor
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
        console.log(`📄 Admin: http://localhost:${PORT}/admin.html`);
        console.log(`📄 Recepcionista: http://localhost:${PORT}/recepcionista.html`);
        console.log(`📄 Gerente: http://localhost:${PORT}/gerente.html`);
    });
});