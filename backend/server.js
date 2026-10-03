require('dotenv').config(); // Cargar variables de entorno desde el archivo .env

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'nexusgear_clave_secreta_super_segura_2026';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

// Middleware
app.use(cors());
app.use(express.json());

// ----------------------------------------------------
// CONFIGURACIÓN DE MULTER (Subida local de imágenes)
// ----------------------------------------------------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

// Hacer pública la carpeta uploads para poder ver las fotos en el navegador
app.use('/uploads', express.static(uploadDir));

// ----------------------------------------------------
// CONFIGURACIÓN DE CONEXIÓN A POSTGRESQL (Clever Cloud)
// ----------------------------------------------------
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});

// ----------------------------------------------------
// MIDDLEWARES DE AUTENTICACIÓN Y ROLES
// ----------------------------------------------------
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado: Se requieren permisos de administrador' });
  }
  next();
}

// ----------------------------------------------------
// INICIALIZACIÓN DE LA BASE DE DATOS
// ----------------------------------------------------
async function initDB() {
  try {
    // 1. Crear la tabla de productos si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        category VARCHAR(100),
        image TEXT,
        sizes VARCHAR(100),
        colors VARCHAR(100)
      );
    `);

    // 2. Crear la tabla de usuarios
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 3. Asegurar columnas de tallas y colores en productos
    await pool.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes VARCHAR(100);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS colors VARCHAR(100);
    `);

    // 4. Poblar catálogo inicial solo si está vacía la tabla products
    const { rows } = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO products (name, price, category, image, sizes, colors) VALUES
        ('Chaqueta Denim Oversize', 45.99, 'Hombre', 'https://images.unsplash.com/photo-1544441893-675973e31985?w=300', 'S, M, L, XL', 'Azul, Negro'),
        ('Camiseta Básica Cotton', 18.50, 'Hombre', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300', 'S, M, L', 'Blanco, Negro, Gris'),
        ('Jeans Slim Fit', 35.00, 'Hombre', 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=300', '30, 32, 34', 'Azul Oscuro'),
        ('Blusa Casual Elegante', 28.00, 'Mujer', 'https://images.unsplash.com/photo-1551803091-e20673f15770?w=300', 'S, M, L', 'Blanco, Rosa'),
        ('Sudadera Hooded Black', 40.00, 'Mujer', 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=300', 'XS, S, M', 'Negro'),
        ('Conjunto Algodón Niños', 25.00, 'Niños', 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=300', '4, 6, 8, 10', 'Amarillo, Azul'),
        ('Vestido Estampado Niña', 22.00, 'Niños', 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=300', '2, 4, 6', 'Multicolor'),
        ('Gorra Urbana Snapback', 15.00, 'Accesorios', 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=300', 'Ajustable', 'Negro'),
        ('Mochila Minimalista', 38.00, 'Accesorios', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300', 'Única', 'Gris, Negro'),
        ('Lentes de Sol Retro', 18.00, 'Accesorios', 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=300', 'Única', 'Carey, Negro');
      `);
      console.log('✅ Catálogo inicial cargado.');
    }

    console.log('✅ Base de datos configurada correctamente.');
  } catch (err) {
    console.error('❌ Error al inicializar DB:', err.message);
  }
}

initDB();

// ----------------------------------------------------
// RUTAS DE AUTENTICACIÓN (AUTH)
// ----------------------------------------------------

// Registrar un nuevo usuario (POST)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'El correo ya se encuentra registrado' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, password_hash, 'customer']
    );

    const user = newUser.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Iniciar sesión (POST)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Por favor ingresa correo y contraseña' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener datos del usuario actual autenticado (GET)
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// RUTAS API PRODUCTOS
// ----------------------------------------------------

// Obtener todos los productos (Público)
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener un solo producto (Público)
app.get('/api/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    rows.length ? res.json(rows[0]) : res.status(404).json({ message: 'No encontrado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear producto (Protegido - Solo Admin)
app.post('/api/products', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, price, category, sizes, colors } = req.body;
    
    let imageUrl = '';
    if (req.file) {
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    } else {
      imageUrl = req.body.image || 'https://via.placeholder.com/300';
    }

    const { rows } = await pool.query(
      'INSERT INTO products (name, price, category, image, sizes, colors) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, price, category, imageUrl, sizes || 'S, M, L', colors || 'Variados']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar producto (Protegido - Solo Admin)
app.put('/api/products/:id', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, sizes, colors } = req.body;

    let imageUrl = req.body.image;
    if (req.file) {
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    const { rows } = await pool.query(
      'UPDATE products SET name = $1, price = $2, category = $3, image = $4, sizes = $5, colors = $6 WHERE id = $7 RETURNING *',
      [name, price, category, imageUrl, sizes, colors, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar producto (Protegido - Solo Admin)
app.delete('/api/products/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// SERVIR FRONTEND EN PRODUCCIÓN (Render)
// ----------------------------------------------------
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // Usar app.use como fallback para evitar el error de sintaxis en Express 5
  app.use((req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ----------------------------------------------------
// INICIALIZACIÓN DEL SERVIDOR
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});