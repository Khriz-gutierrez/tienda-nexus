import './style.css'
import { getToken, getCurrentUser, logout, type User } from './auth'
import { initAuthUI, openAuthModal } from './ui-auth'

interface Product {
  id: number;
  name: string;
  price: string;
  category: string;
  image: string;
  sizes?: string;
  colors?: string;
  stock?: number;
}

interface CartItem extends Product {
  selectedSize: string;
  selectedColor: string;
  quantity: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://tienda-nexus.onrender.com';

let currentUser: User | null = null;
let allProducts: Product[] = [];
let cartItems: CartItem[] = [];
let showForm: boolean = false;
let showCart: boolean = false;
let currentCategory: string = 'Todos';
let searchQuery: string = '';
let editingProduct: Product | null = null;
let isAdmin: boolean = false;
let activeTab: 'catalog' | 'dashboard' = 'catalog'; 
let adminSubTab: 'inventory' | 'metrics' | 'reports' = 'inventory';

const categoriesList = [
  { id: 'Todos', label: 'Ver todo', img: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=150' },
  { id: 'Hombre', label: 'Hombre', img: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=150' },
  { id: 'Mujer', label: 'Mujer', img: 'https://images.unsplash.com/photo-1525845859779-54d477ff291f?w=150' },
  { id: 'Niños', label: 'Niños', img: 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=150' },
  { id: 'Accesorios', label: 'Accesorios', img: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=150' }
];

async function checkUserSession() {
  currentUser = await getCurrentUser();
  isAdmin = currentUser?.role === 'admin';
  applyFiltersAndRender();
}

async function loadProducts() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `<div class="loading">Cargando catálogo...</div>`

  try {
    const res = await fetch(`${API_URL}/api/products`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    
    const savedStocks = JSON.parse(localStorage.getItem('nexus_stocks') || '{}');

    allProducts = data.map((p: any) => ({
      ...p,
      stock: savedStocks[p.id] !== undefined ? savedStocks[p.id] : (p.stock !== undefined ? p.stock : 15)
    }));
    applyFiltersAndRender();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="loading">Error al conectar con el servidor API (${API_URL})</div>`;
  }
}

function saveStockToLocalStorage(id: number, stockValue: number) {
  const savedStocks = JSON.parse(localStorage.getItem('nexus_stocks') || '{}');
  savedStocks[id] = stockValue;
  localStorage.setItem('nexus_stocks', JSON.stringify(savedStocks));
}

async function createProduct(productData: { name: string; price: string; sizes: string; colors: string; category: string; image: string; stock: number }) {
  const token = getToken();
  if (!token) {
    alert('Debes iniciar sesión como Administrador.');
    openAuthModal();
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(productData)
    });

    if (res.ok) {
      showForm = false;
      await loadProducts();
    } else {
      const errData = await res.json().catch(() => ({ error: 'Error desconocido' }));
      alert(`Error al guardar: ${errData.error || 'Verifique los datos'}`);
    }
  } catch (err) {
    alert('Error de red al guardar.');
  }
}

async function updateProduct(id: number, productData: { name: string; price: string; sizes: string; colors: string; category: string; image: string; stock: number }) {
  const token = getToken();
  if (!token) {
    alert('Debes iniciar sesión como Administrador.');
    openAuthModal();
    return;
  }

  try {
    saveStockToLocalStorage(id, productData.stock);

    await fetch(`${API_URL}/api/products/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(productData)
    });

    editingProduct = null;
    await loadProducts();
  } catch (err) {
    saveStockToLocalStorage(id, productData.stock);
    editingProduct = null;
    await loadProducts();
  }
}

async function deleteProduct(id: number) {
  const token = getToken();
  if (!token) {
    alert('Debes iniciar sesión como Administrador.');
    openAuthModal();
    return;
  }

  if (!confirm('¿Estás seguro de que deseas eliminar este producto?')) return;

  try {
    const res = await fetch(`${API_URL}/api/products/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      allProducts = allProducts.filter(p => p.id !== id);
      cartItems = cartItems.filter(p => p.id !== id);
      applyFiltersAndRender();
    } else {
      const errData = await res.json().catch(() => ({ error: 'Error al eliminar' }));
      alert(`Error: ${errData.error || 'No fue posible eliminar el producto'}`);
    }
  } catch (err) {
    alert('Error de red al intentar eliminar.');
  }
}

function getImageUrl(imagePath: string): string {
  if (!imagePath) return '';

  if (imagePath.includes('drive.google.com') || imagePath.includes('googleusercontent.com')) {
    const match = imagePath.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = match ? match[1] : null;

    if (fileId) {
      return `https://lh3.googleusercontent.com/d/${fileId}=s1000`;
    }
  }

  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  return `${API_URL}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
}

function openProductDetail(product: Product) {
  const modal = document.getElementById('product-detail-modal');
  const modalBody = document.getElementById('modal-product-body');

  if (!modal || !modalBody) return;

  const isAccesorios = product.category === 'Accesorios';
  const sizesArray = product.sizes ? product.sizes.split(',').map(s => s.trim()) : ['S', 'M', 'L'];
  const colorsArray = product.colors ? product.colors.split(',').map(c => c.trim()) : ['Estándar'];
  const stockVal = product.stock !== undefined ? product.stock : 15;

  const whatsappMessage = encodeURIComponent(`Hola, estoy interesado en el producto: *${product.name}* (Precio: $${product.price}). ¿Está disponible?`);
  const whatsappUrl = `https://wa.me/50588888888?text=${whatsappMessage}`;

  modalBody.innerHTML = `
    <div class="product-detail-layout">
      <div class="detail-image">
        <img src="${getImageUrl(product.image)}" alt="${product.name}">
      </div>
      <div class="detail-info">
        <h2>${product.name}</h2>
        <p class="detail-price">$${parseFloat(product.price).toFixed(2)}</p>
        <p><strong>Categoría:</strong> ${product.category}</p>
        <p><strong>Disponibilidad:</strong> ${stockVal > 0 ? `${stockVal} unidades disponibles` : 'Agotado'}</p>
        
        ${!isAccesorios ? `
          <div class="variant-selector" style="margin-top: 15px;">
            <label style="font-size: 0.85rem; font-weight: bold; color: #4a5568; display: block; margin-bottom: 6px;">Seleccionar Talla:</label>
            <div id="size-options-container" style="display: flex; gap: 8px;">
              ${sizesArray.map((size, idx) => `
                <button type="button" class="size-pill-btn ${idx === 0 ? 'active' : ''}" data-size="${size}" style="padding: 6px 14px; border: 1px solid ${idx === 0 ? '#3d312a' : '#d4c5b9'}; background: ${idx === 0 ? '#3d312a' : 'white'}; color: ${idx === 0 ? 'white' : '#3d312a'}; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                  ${size}
                </button>
              `).join('')}
            </div>
            <input type="hidden" id="selected-size-value" value="${sizesArray[0]}" />
          </div>
        ` : ''}

        <div class="variant-selector" style="margin-top: 15px;">
          <label for="select-color" style="font-size: 0.85rem; font-weight: bold; color: #4a5568; display: block; margin-bottom: 6px;">Seleccionar Color:</label>
          <select id="select-color" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #d4c5b9;">
            ${colorsArray.map(color => `<option value="${color}">${color}</option>`).join('')}
          </select>
        </div>
        
        ${!isAdmin ? `
          <button id="btn-add-modal-cart" class="btn-submit" style="margin-top: 20px; width: 100%; ${stockVal === 0 ? 'background:#ccc; cursor:not-allowed;' : ''}" ${stockVal === 0 ? 'disabled' : ''}>
            ${stockVal === 0 ? 'Producto Agotado' : '🛒 Agregar al Carrito'}
          </button>
          
          <a href="${whatsappUrl}" target="_blank" class="btn-whatsapp" style="display:block; background:#25d366; color:white; text-align:center; padding:10px; border-radius:6px; margin-top:10px; text-decoration:none; font-weight:bold;">
            💬 Consultar por WhatsApp
          </a>
        ` : ''}
      </div>
    </div>
  `;

  const sizeButtons = modalBody.querySelectorAll('.size-pill-btn');
  const sizeInput = modalBody.querySelector('#selected-size-value') as HTMLInputElement;

  sizeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      sizeButtons.forEach(b => {
        (b as HTMLElement).style.background = 'white';
        (b as HTMLElement).style.color = '#3d312a';
        (b as HTMLElement).style.borderColor = '#d4c5b9';
      });
      const target = e.currentTarget as HTMLElement;
      target.style.background = '#3d312a';
      target.style.color = 'white';
      target.style.borderColor = '#3d312a';
      if (sizeInput) {
        sizeInput.value = target.getAttribute('data-size') || 'Única';
      }
    });
  });

  const addBtn = modalBody.querySelector('#btn-add-modal-cart');
  if (addBtn && stockVal > 0) {
    addBtn.addEventListener('click', () => {
      const selectedSize = sizeInput ? sizeInput.value : (isAccesorios ? 'Única' : sizesArray[0]);
      const selectedColor = (document.getElementById('select-color') as HTMLSelectElement).value;

      const existingIndex = cartItems.findIndex(
        item => item.id === product.id && item.selectedSize === selectedSize && item.selectedColor === selectedColor
      );

      if (existingIndex > -1) {
        if (cartItems[existingIndex].quantity < stockVal) {
          cartItems[existingIndex].quantity += 1;
        } else {
          alert('No puedes agregar más unidades que el stock disponible.');
          return;
        }
      } else {
        cartItems.push({
          ...product,
          selectedSize,
          selectedColor,
          quantity: 1
        });
      }

      closeProductDetail();
      showCart = true;
      applyFiltersAndRender();
    });
  }

  modal.classList.remove('hidden');
}

function closeProductDetail() {
  const modal = document.getElementById('product-detail-modal');
  if (modal) modal.classList.add('hidden');
}

function openCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  const modalBody = document.getElementById('checkout-modal-body');
  if (!modal || !modalBody) return;

  const total = cartItems.reduce((acc, item) => acc + (parseFloat(item.price) * item.quantity), 0);

  modalBody.innerHTML = `
    <h2>Finalizar Compra</h2>
    <p>Resumen del pedido: <strong>${cartItems.reduce((sum, i) => sum + i.quantity, 0)} producto(s)</strong></p>
    <p class="detail-price">Total a pagar: $${total.toFixed(2)}</p>
    
    <form id="checkout-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
      <input type="text" id="cust-name" placeholder="Nombre completo" value="${currentUser ? currentUser.name : ''}" required />
      <input type="email" id="cust-email" placeholder="Correo electrónico" value="${currentUser ? currentUser.email : ''}" required />
      <input type="text" id="cust-address" placeholder="Dirección de envío (Local)" required />
      <select id="payment-method" required>
        <option value="Tarjeta">Tarjeta de Crédito / Débito</option>
        <option value="Transferencia">Transferencia Bancaria</option>
        <option value="Efectivo">Pago Contra Entrega</option>
      </select>
      <button type="submit" class="btn-submit" style="margin-top:10px;">Confirmar y Pagar</button>
    </form>
  `;

  const checkoutForm = modalBody.querySelector('#checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const customerName = (document.getElementById('cust-name') as HTMLInputElement).value;

      cartItems.forEach(cartItem => {
        const productInStock = allProducts.find(p => p.id === cartItem.id);
        if (productInStock) {
          const currentStock = productInStock.stock !== undefined ? productInStock.stock : 15;
          const newStock = Math.max(0, currentStock - cartItem.quantity);
          productInStock.stock = newStock;
          saveStockToLocalStorage(productInStock.id, newStock);
        }
      });

      modalBody.innerHTML = `
        <div class="checkout-success-container">
          <h2>🎉 ¡Compra Exitosa!</h2>
          <p>Gracias por tu compra, <strong>${customerName}</strong>.</p>
          <p>Hemos procesado tu pedido correctamente y actualizado el inventario.</p>
          <button id="btn-finish-checkout" class="btn-submit" style="margin-top:15px;">Aceptar</button>
        </div>
      `;

      cartItems = [];
      showCart = false;

      document.getElementById('btn-finish-checkout')?.addEventListener('click', () => {
        closeCheckoutModal();
        applyFiltersAndRender();
      });
    });
  }

  modal.classList.remove('hidden');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  if (modal) modal.classList.add('hidden');
}

function applyFiltersAndRender() {
  let filtered = allProducts;

  if (currentCategory !== 'Todos') {
    filtered = filtered.filter(p => p.category === currentCategory);
  }

  if (searchQuery.trim() !== '') {
    const query = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.category.toLowerCase().includes(query)
    );
  }

  renderApp(filtered, currentCategory);
}

function renderAdminDashboard() {
  const totalProducts = allProducts.length;
  const totalValue = allProducts.reduce((sum, p) => sum + parseFloat(p.price || '0'), 0);
  const categoryCounts = allProducts.reduce((acc: Record<string, number>, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  return `
    <div class="admin-dashboard-layout">
      <div class="admin-sidebar">
        <div class="admin-sidebar-title">Gestión Boutique</div>
        <button class="admin-nav-item ${adminSubTab === 'inventory' ? 'active' : ''}" data-subtab="inventory">
          📦 Inventario y Artículos
        </button>
        <button class="admin-nav-item ${adminSubTab === 'metrics' ? 'active' : ''}" data-subtab="metrics">
          📈 Métricas y Resumen
        </button>
        <button class="admin-nav-item ${adminSubTab === 'reports' ? 'active' : ''}" data-subtab="reports">
          📋 Reportes Fiscales / IVA
        </button>
      </div>

      <div class="admin-content-area">
        ${adminSubTab === 'inventory' ? `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <h3 style="margin:0; color:#3d312a;">Inventario General de Productos</h3>
            <span style="font-size:0.85rem; color:#8c7a6b;">Total en catálogo: <strong>${totalProducts}</strong></span>
          </div>
          <table class="report-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${allProducts.map((p) => {
                const stockVal = p.stock !== undefined ? p.stock : 15;
                const isOut = stockVal === 0;
                const isLow = stockVal > 0 && stockVal <= 5;
                
                let badgeClass = 'published';
                let badgeText = 'Publicado';
                if (isOut) {
                  badgeClass = 'out-of-stock';
                  badgeText = 'Agotado';
                } else if (isLow) {
                  badgeClass = 'draft';
                  badgeText = 'Pocas Unidades';
                }

                return `
                  <tr>
                    <td>#${p.id}</td>
                    <td>
                      <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${getImageUrl(p.image)}" alt="${p.name}" style="width:35px; height:35px; object-fit:cover; border-radius:4px;" />
                        <strong>${p.name}</strong>
                      </div>
                    </td>
                    <td>${p.category}</td>
                    <td><strong>$${parseFloat(p.price).toFixed(2)}</strong></td>
                    <td>${stockVal} un.</td>
                    <td>
                      <span class="status-badge ${badgeClass}">
                        ${badgeText}
                      </span>
                    </td>
                    <td>
                      <div class="table-action-btns">
                        <button class="btn-table-edit edit-btn" data-id="${p.id}">✏️ Editar</button>
                        <button class="btn-table-delete delete-btn" data-id="${p.id}">🗑️ Eliminar</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : ''}

        ${adminSubTab === 'metrics' ? `
          <h3 style="margin-top:0; color:#3d312a;">Métricas y Estado General</h3>
          <div class="dashboard-cards-grid">
            <div class="metric-card">
              <h3>Total de Productos</h3>
              <p class="metric-value">${totalProducts}</p>
            </div>
            <div class="metric-card">
              <h3>Valor del Catálogo</h3>
              <p class="metric-value">$${totalValue.toFixed(2)}</p>
            </div>
            <div class="metric-card">
              <h3>Categorías Activas</h3>
              <p class="metric-value">${Object.keys(categoryCounts).length}</p>
            </div>
          </div>
        ` : ''}

        ${adminSubTab === 'reports' ? `
          <h3 style="margin-top:0; color:#3d312a;">Reportes de Categorías y Facturación Fiscal (IVA 15%)</h3>
          <table class="report-table" style="margin-top:15px;">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Artículos Registrados</th>
                <th>Participación del Total</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(categoryCounts).map(([cat, count]) => `
                <tr>
                  <td><strong>${cat}</strong></td>
                  <td>${count}</td>
                  <td>${totalProducts > 0 ? ((count / totalProducts) * 100).toFixed(1) : 0}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
      </div>
    </div>
  `;
}

function renderApp(productsToDisplay: Product[], selectedCategory = 'Todos') {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const totalCartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cartItems.reduce((acc, p) => acc + (parseFloat(p.price) * p.quantity), 0);

  app.innerHTML = `
    <div class="App">
      <header class="navbar-container">
        <div class="navbar-top">
          <h1 class="brand-logo">NEXUSGEAR</h1>

          <div class="search-bar-container">
            <input 
              type="text" 
              id="search-input" 
              placeholder="Buscar productos en NexusGear..." 
              value="${searchQuery}" 
            />
          </div>
          
          <div class="navbar-actions">
            ${currentUser ? `
              <span class="user-badge-name">
                👤 ${currentUser.name}${isAdmin ? ' (Admin)' : ''}
              </span>
              <button id="btn-logout" class="btn-logout-red">
                Salir
              </button>
            ` : `
              <button id="btn-open-auth" class="btn-login-blue">
                🔑 Iniciar Sesión
              </button>
            `}
            
            ${!isAdmin ? `
              <div id="btn-toggle-cart" class="cart-icon-container" style="cursor:pointer;">
                <span class="cart-icon">🛒</span>
                <span class="cart-badge">${totalCartCount}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="navbar-subnav">
          <div class="categories-dropdown-container">
            <button id="btn-categories-toggle" class="categories-toggle-btn">
              Categorías ▾
            </button>
            <div id="categories-dropdown-menu" class="categories-dropdown-content">
              ${categoriesList.map(cat => `
                <div class="dropdown-category-item ${cat.id === selectedCategory ? 'active' : ''}" data-category="${cat.id}">
                  <img src="${cat.img}" alt="${cat.label}" class="dropdown-cat-thumb" />
                  <span>${cat.label}</span>
                </div>
              `).join('')}
            </div>
          </div>

          ${isAdmin ? `
            <div class="admin-subnav-actions">
              <button id="btn-toggle-dashboard" class="btn-subnav-action">
                ${activeTab === 'dashboard' ? '🛒 Ver Catálogo' : '📊 Panel de Administración'}
              </button>
              <button id="btn-toggle-form" class="btn-subnav-action btn-add">
                ${showForm ? '✕ Cerrar' : '+ Nuevo Producto'}
              </button>
            </div>
          ` : ''}
        </div>
      </header>

      ${activeTab === 'dashboard' && isAdmin ? renderAdminDashboard() : `
        
        <section class="hero-banner">
          <div class="hero-banner-content">
            <div class="hero-text">
              <h1>Moda y Estilo al Alcance de tus Manos</h1>
              <p>Explora lo nuevo en nuestra tienda. Encuentra las mejores prendas y accesorios seleccionados especialmente para ti, con calidad garantizada y envíos locales.</p>
              <button class="hero-btn" id="btn-explore-collection">Ver Catálogo</button>
            </div>
            <div class="hero-image">
              <img src="https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600" alt="NexusGear Store" />
            </div>
          </div>
        </section>

        ${showCart && !isAdmin ? `
          <div class="cart-modal side-cart-panel" style="position:fixed; top:0; right:0; width:380px; height:100vh; background:white; box-shadow:-4px 0 15px rgba(61,49,42,0.15); z-index:1000; padding:20px; display:flex; flex-direction:column; box-sizing:border-box;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee8e2; padding-bottom:10px;">
              <h3>Tu Bolsa de Compras</h3>
              <button id="btn-close-cart" style="background:none; border:none; font-size:1.2rem; cursor:pointer;">✕</button>
            </div>
            
            <div style="flex:1; overflow-y:auto; margin-top:15px;">
              ${cartItems.length === 0 ? '<p style="text-align:center; color:#777; margin-top:40px;">Tu carrito está vacío.</p>' : `
                <ul class="cart-list" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px;">
                  ${cartItems.map((item, idx) => `
                    <li style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f7f4f0; padding-bottom:10px;">
                      <div>
                        <strong>${item.name}</strong><br/>
                        <small style="color:#666;">Talla: ${item.selectedSize} | Color: ${item.selectedColor}</small><br/>
                        <span style="color:#3d312a; font-weight:600;">$${parseFloat(item.price).toFixed(2)}</span>
                      </div>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <button class="decrease-qty-btn" data-index="${idx}" style="padding:2px 6px; background:#f7f4f0; border:none; border-radius:4px; cursor:pointer;">-</button>
                        <span>${item.quantity}</span>
                        <button class="increase-qty-btn" data-index="${idx}" style="padding:2px 6px; background:#f7f4f0; border:none; border-radius:4px; cursor:pointer;">+</button>
                        <button class="remove-cart-item-btn" data-index="${idx}" style="background:none; border:none; color:red; cursor:pointer; margin-left:6px;">🗑️</button>
                      </div>
                    </li>
                  `).join('')}
                </ul>
              `}
            </div>

            ${cartItems.length > 0 ? `
              <div style="border-top:1px solid #eee8e2; padding-top:15px; margin-top:auto;">
                <p class="cart-total" style="display:flex; justify-content:space-between; font-size:1.1rem; margin-bottom:15px;">
                  <span>Subtotal / Total:</span> <strong>$${cartTotal.toFixed(2)}</strong>
                </p>
                <button id="btn-go-checkout" class="btn-checkout" style="width:100%; padding:12px; background:#3d312a; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">
                  Proceder al Pago Seguro
                </button>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${showForm && isAdmin ? `
          <div class="form-container">
            <h2>Añadir Nuevo Producto</h2>
            <form id="add-product-form">
              <input type="text" id="p-name" placeholder="Nombre del producto" required />
              <input type="number" step="0.01" id="p-price" placeholder="Precio ($)" required />
              <input type="number" id="p-stock" placeholder="Cantidad en Stock (Ej: 15)" value="15" required />
              <input type="text" id="p-sizes" placeholder="Tallas (ej: S, M, L, XL - Opcional)" />
              <input type="text" id="p-colors" placeholder="Colores (ej: Negro, Azul, Rojo)" />
              <select id="p-category">
                <option value="Hombre">Hombre</option>
                <option value="Mujer">Mujer</option>
                <option value="Niños">Niños</option>
                <option value="Accesorios">Accesorios</option>
              </select>
              <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
                <label for="p-image" style="font-size:0.85rem; font-weight:600;">URL de la imagen (Google Drive o Web):</label>
                <input type="text" id="p-image" placeholder="Ej: https://drive.google.com/file/d/..." required />
              </div>
              <button type="submit" class="btn-submit">Guardar Producto</button>
            </form>
          </div>
        ` : ''}

        ${editingProduct && isAdmin ? `
          <div class="form-container edit-container">
            <h2>Editar Producto</h2>
            <form id="edit-product-form">
              <input type="text" id="edit-p-name" value="${editingProduct.name}" required />
              <input type="number" step="0.01" id="edit-p-price" value="${editingProduct.price}" required />
              <input type="number" id="edit-p-stock" value="${editingProduct.stock !== undefined ? editingProduct.stock : 15}" placeholder="Cantidad en Stock" required />
              <input type="text" id="edit-p-sizes" value="${editingProduct.sizes || ''}" placeholder="Tallas (ej: S, M, L, XL)" />
              <input type="text" id="edit-p-colors" value="${editingProduct.colors || ''}" placeholder="Colores (ej: Negro, Azul)" />
              <select id="edit-p-category">
                <option value="Hombre" ${editingProduct.category === 'Hombre' ? 'selected' : ''}>Hombre</option>
                <option value="Mujer" ${editingProduct.category === 'Mujer' ? 'selected' : ''}>Mujer</option>
                <option value="Niños" ${editingProduct.category === 'Niños' ? 'selected' : ''}>Niños</option>
                <option value="Accesorios" ${editingProduct.category === 'Accesorios' ? 'selected' : ''}>Accesorios</option>
              </select>
              <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
                <label for="edit-p-image" style="font-size:0.85rem; font-weight:600;">URL de la imagen (Google Drive o Web):</label>
                <input type="text" id="edit-p-image" value="${editingProduct.image || ''}" required />
              </div>
              <div style="display:flex; gap:10px; margin-top:10px;">
                <button type="submit" class="btn-submit" style="flex:1;">Actualizar</button>
                <button type="button" id="btn-cancel-edit" class="delete-btn" style="flex:1;">Cancelar</button>
              </div>
            </form>
          </div>
        ` : ''}

        <div class="product-grid" style="margin-top: 20px;">
          ${productsToDisplay.length > 0 ? productsToDisplay.map((p, index) => `
            <div class="product-card" style="position: relative;">
              ${index < 3 ? `<span style="position: absolute; top: 22px; left: 22px; background: #3d312a; color: white; font-size: 0.7rem; font-weight: bold; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; z-index: 2;">New</span>` : ''}
              <img src="${getImageUrl(p.image)}" alt="${p.name}" class="product-click-trigger" data-id="${p.id}" style="cursor:pointer;" />
              <h3 class="product-click-trigger" data-id="${p.id}" style="cursor:pointer;">${p.name}</h3>
              <p class="category">${p.category}</p> <p class="price">$${parseFloat(p.price).toFixed(2)}</p>
              
              <div class="card-actions">
                ${!isAdmin ? `
                  <button class="add-cart-btn" data-id="${p.id}">Ver Detalles / Comprar</button>
                ` : `
                  <button class="edit-btn" data-id="${p.id}">✏️ Editar</button>
                  <button class="delete-btn" data-id="${p.id}">Eliminar</button>
                `}
              </div>
            </div>
          `).join('') : '<p style="grid-column: 1/-1; text-align: center; color: #777; padding: 40px;">No se encontraron productos.</p>'}
        </div>
      `}
    </div>
  `

  document.querySelector('#btn-open-auth')?.addEventListener('click', openAuthModal);
  document.querySelector('#btn-logout')?.addEventListener('click', logout);

  document.querySelector('#btn-explore-collection')?.addEventListener('click', () => {
    window.scrollTo({ top: 450, behavior: 'smooth' });
  });

  document.querySelectorAll('.admin-nav-item').forEach(button => {
    button.addEventListener('click', (e) => {
      const subtab = (e.currentTarget as HTMLElement).getAttribute('data-subtab');
      if (subtab === 'inventory' || subtab === 'metrics' || subtab === 'reports') {
        adminSubTab = subtab;
        applyFiltersAndRender();
      }
    });
  });

  document.querySelectorAll('.dropdown-category-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const cat = (e.currentTarget as HTMLElement).getAttribute('data-category');
      if (cat) {
        currentCategory = cat;
        applyFiltersAndRender();
      }
    });
  });

  document.querySelector('#btn-toggle-dashboard')?.addEventListener('click', () => {
    activeTab = activeTab === 'catalog' ? 'dashboard' : 'catalog';
    showForm = false;
    applyFiltersAndRender();
  });

  document.querySelectorAll('.product-click-trigger').forEach(element => {
    element.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const id = Number(target.getAttribute('data-id'));
      const product = allProducts.find(p => p.id === id);
      if (product) openProductDetail(product);
    });
  });

  document.querySelector('#btn-go-checkout')?.addEventListener('click', () => {
    openCheckoutModal();
  });

  const searchInput = document.querySelector<HTMLInputElement>('#search-input');
  if (searchInput) {
    searchInput.focus();
    const valLength = searchInput.value.length;
    searchInput.setSelectionRange(valLength, valLength);

    searchInput.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      applyFiltersAndRender();
    });
  }

  document.querySelector('#btn-toggle-form')?.addEventListener('click', () => {
    showForm = !showForm;
    if (showForm) { showCart = false; editingProduct = null; }
    applyFiltersAndRender();
  });

  document.querySelector('#btn-toggle-cart')?.addEventListener('click', () => {
    showCart = !showCart;
    if (showCart) { showForm = false; editingProduct = null; }
    applyFiltersAndRender();
  });

  document.querySelector('#btn-close-cart')?.addEventListener('click', () => {
    showCart = false;
    applyFiltersAndRender();
  });

  const form = document.querySelector('#add-product-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const productData = {
        name: (document.querySelector('#p-name') as HTMLInputElement).value,
        price: (document.querySelector('#p-price') as HTMLInputElement).value,
        stock: Number((document.querySelector('#p-stock') as HTMLInputElement).value),
        sizes: (document.querySelector('#p-sizes') as HTMLInputElement).value,
        colors: (document.querySelector('#p-colors') as HTMLInputElement).value,
        category: (document.querySelector('#p-category') as HTMLSelectElement).value,
        image: (document.querySelector('#p-image') as HTMLInputElement).value
      };

      createProduct(productData);
    });
  }

  const editForm = document.querySelector('#edit-product-form');
  if (editForm && editingProduct) {
    const idToUpdate = editingProduct.id;
    editForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const stockInputValue = (document.querySelector('#edit-p-stock') as HTMLInputElement).value;

      const productData = {
        name: (document.querySelector('#edit-p-name') as HTMLInputElement).value,
        price: (document.querySelector('#edit-p-price') as HTMLInputElement).value,
        stock: stockInputValue !== '' ? Number(stockInputValue) : 0,
        sizes: (document.querySelector('#edit-p-sizes') as HTMLInputElement).value,
        colors: (document.querySelector('#edit-p-colors') as HTMLInputElement).value,
        category: (document.querySelector('#edit-p-category') as HTMLSelectElement).value,
        image: (document.querySelector('#edit-p-image') as HTMLInputElement).value
      };

      updateProduct(idToUpdate, productData);
    });

    document.querySelector('#btn-cancel-edit')?.addEventListener('click', () => {
      editingProduct = null;
      applyFiltersAndRender();
    });
  }

  document.querySelectorAll('.edit-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number((e.currentTarget as HTMLElement).getAttribute('data-id'));
      const product = allProducts.find(p => p.id === id);
      if (product) {
        editingProduct = product;
        showForm = false;
        showCart = false;
        applyFiltersAndRender();
      }
    });
  });

  document.querySelectorAll('.add-cart-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number((e.currentTarget as HTMLElement).getAttribute('data-id'));
      const product = allProducts.find(p => p.id === id);
      if (product) {
        openProductDetail(product);
      }
    });
  });

  document.querySelectorAll('.increase-qty-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const index = Number((e.currentTarget as HTMLElement).getAttribute('data-index'));
      const item = cartItems[index];
      const prodRef = allProducts.find(p => p.id === item.id);
      const maxStock = prodRef && prodRef.stock !== undefined ? prodRef.stock : 15;

      if (item.quantity < maxStock) {
        item.quantity += 1;
        applyFiltersAndRender();
      } else {
        alert('Has alcanzado el límite del stock disponible.');
      }
    });
  });

  document.querySelectorAll('.decrease-qty-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const index = Number((e.currentTarget as HTMLElement).getAttribute('data-index'));
      if (cartItems[index].quantity > 1) {
        cartItems[index].quantity -= 1;
      } else {
        cartItems.splice(index, 1);
      }
      applyFiltersAndRender();
    });
  });

  document.querySelectorAll('.remove-cart-item-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const index = Number((e.currentTarget as HTMLElement).getAttribute('data-index'));
      cartItems.splice(index, 1);
      applyFiltersAndRender();
    });
  });

  document.querySelectorAll('.delete-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id && (e.currentTarget as HTMLElement).id !== 'btn-cancel-edit') {
        deleteProduct(Number(id));
      }
    });
  });
}

document.getElementById('close-detail-modal')?.addEventListener('click', closeProductDetail);
document.getElementById('close-checkout-modal')?.addEventListener('click', closeCheckoutModal);

window.addEventListener('click', (e) => {
  const detailModal = document.getElementById('product-detail-modal');
  const checkoutModal = document.getElementById('checkout-modal');
  if (e.target === detailModal) closeProductDetail();
  if (e.target === checkoutModal) closeCheckoutModal();
});

initAuthUI(() => {
  checkUserSession();
});

checkUserSession();
loadProducts();