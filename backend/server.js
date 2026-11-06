require('dotenv').config(); // Cargar variables de entorno desde el archivo .env

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
    // 1. Crear tabla de productos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        category VARCHAR(100),
        image TEXT,
        sizes VARCHAR(100),
        colors VARCHAR(100),
        stock INT DEFAULT 50,
        status VARCHAR(20) DEFAULT 'Published'
      );
    `);

    // 2. Crear tabla de usuarios
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

    // 3. Crear tabla de Pedidos / Facturas (Soporte Fiscal Nicaragua - DGI)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        customer_name VARCHAR(150) NOT NULL,
        customer_email VARCHAR(150) NOT NULL,
        shipping_address TEXT NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        invoice_type VARCHAR(20) DEFAULT 'interna', -- 'interna' o 'fiscal'
        fiscal_number VARCHAR(50),
        subtotal NUMERIC(10, 2) NOT NULL,
        tax_iva NUMERIC(10, 2) DEFAULT 0.00, -- 15% IVA Nicaragua
        total NUMERIC(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 4. Detalle de items de cada pedido
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id) ON DELETE SET NULL,
        product_name VARCHAR(255) NOT NULL,
        quantity INT NOT NULL,
        unit_price NUMERIC(10, 2) NOT NULL,
        selected_size VARCHAR(50),
        selected_color VARCHAR(50)
      );
    `);

    // 5. Asegurar columnas en products si la tabla ya existía
    await pool.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INT DEFAULT 50;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Published';
    `);

    // 6. Poblado inicial si la tabla products está vacía
    const { rows } = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO products (name, price, category, image, sizes, colors, stock, status) VALUES
        ('Chaqueta Denim Oversize', 45.99, 'Hombre', 'https://images.unsplash.com/photo-1544441893-675973e31985?w=300', 'S, M, L, XL', 'Azul, Negro', 25, 'Published'),
        ('Camiseta Básica Cotton', 18.50, 'Hombre', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300', 'S, M, L', 'Blanco, Negro, Gris', 40, 'Published'),
        ('Jeans Slim Fit', 35.00, 'Hombre', 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=300', '30, 32, 34', 'Azul Oscuro', 15, 'Published'),
        ('Blusa Casual Elegante', 28.00, 'Mujer', 'https://images.unsplash.com/photo-1551803091-e20673f15770?w=300', 'S, M, L', 'Blanco, Rosa', 30, 'Published'),
        ('Sudadera Hooded Black', 40.00, 'Mujer', 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=300', 'XS, S, M', 'Negro', 18, 'Published'),
        ('Conjunto Algodón Niños', 25.00, 'Niños', 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=300', '4, 6, 8, 10', 'Amarillo, Azul', 20, 'Published'),
        ('Vestido Estampado Niña', 22.00, 'Niños', 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=300', '2, 4, 6', 'Multicolor', 12, 'Published'),
        ('Gorra Urbana Snapback', 15.00, 'Accesorios', 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=300', 'Ajustable', 'Negro', 50, 'Published'),
        ('Mochila Minimalista', 38.00, 'Accesorios', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300', 'Única', 'Gris, Negro', 10, 'Published'),
        ('Lentes de Sol Retro', 18.00, 'Accesorios', 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=300', 'Única', 'Carey, Negro', 35, 'Published');
      `);
      console.log('✅ Catálogo inicial cargado.');
    }

    console.log('✅ Base de datos configurada correctamente con soporte de ventas y facturación.');
  } catch (err) {
    console.error('❌ Error al inicializar DB:', err.message);
  }
}

initDB();

// ----------------------------------------------------
// RUTAS DE AUTENTICACIÓN (AUTH)
// ----------------------------------------------------

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

app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    rows.length ? res.json(rows[0]) : res.status(404).json({ message: 'No encontrado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear producto (Protegido - Solo Admin)
app.post('/api/products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, price, category, image, sizes, colors, stock, status } = req.body;
    
    const imageUrl = image || 'https://via.placeholder.com/300';

    const { rows } = await pool.query(
      'INSERT INTO products (name, price, category, image, sizes, colors, stock, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, price, category, imageUrl, sizes || 'S, M, L', colors || 'Variados', stock || 50, status || 'Published']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar producto (Protegido - Solo Admin)
app.put('/api/products/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, image, sizes, colors, stock, status } = req.body;

    const imageUrl = image || 'https://via.placeholder.com/300';

    const { rows } = await pool.query(
      'UPDATE products SET name = $1, price = $2, category = $3, image = $4, sizes = $5, colors = $6, stock = COALESCE($7, stock), status = COALESCE($8, status) WHERE id = $9 RETURNING *',
      [name, price, category, imageUrl, sizes, colors, stock, status, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// RUTAS DE VENTAS Y FACTURACIÓN (Nicaragua DGI / Interna)
// ----------------------------------------------------

// Registrar un Checkout / Crear Factura
app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customerName, customerEmail, shippingAddress, paymentMethod, items, isFiscalInvoice } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'El carrito no contiene productos' });
    }

    await client.query('BEGIN');

    // Calcular Totales e IVA (15% en Nicaragua para facturas fiscales)
    let subtotal = 0;
    for (const item of items) {
      subtotal += parseFloat(item.price) * (item.quantity || 1);
    }

    const taxIva = isFiscalInvoice ? parseFloat((subtotal * 0.15).toFixed(2)) : 0.00;
    const total = parseFloat((subtotal + taxIva).toFixed(2));
    
    // Generar Número Fiscal consecutivo si aplica
    let fiscalNumber = null;
    if (isFiscalInvoice) {
      const orderCountResult = await client.query("SELECT COUNT(*) FROM orders WHERE invoice_type = 'fiscal'");
      const count = parseInt(orderCountResult.rows[0].count) + 1;
      fiscalNumber = `FAC-NI-${String(count).padStart(6, '0')}`;
    }

    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, customer_email, shipping_address, payment_method, invoice_type, fiscal_number, subtotal, tax_iva, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [customerName, customerEmail, shippingAddress, paymentMethod, isFiscalInvoice ? 'fiscal' : 'interna', fiscalNumber, subtotal, taxIva, total]
    );

    const newOrder = orderResult.rows[0];

    // Registrar items y descontar stock
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, selected_size, selected_color)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newOrder.id, item.id, item.name, item.quantity || 1, item.price, item.selectedSize || 'Única', item.selectedColor || 'Estándar']
      );

      // Descontar del inventario
      await client.query(
        `UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2`,
        [item.quantity || 1, item.id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Orden y factura procesadas con éxito',
      order: newOrder
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Obtener reporte de facturas/ventas (Protegido - Solo Admin)
app.get('/api/orders/report', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(rows);
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