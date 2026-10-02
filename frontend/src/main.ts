import './style.css'

interface Product {
  id: number;
  name: string;
  price: string;
  category: string;
  image: string;
  sizes?: string;
  colors?: string;
}

interface CartItem extends Product {
  selectedSize: string;
  selectedColor: string;
}

// Configuración de la URL del API para Producción (Render) y Desarrollo Local
const API_URL = import.meta.env.VITE_API_URL || 'https://tienda-nexus.onrender.com';

let allProducts: Product[] = [];
let cartItems: CartItem[] = [];
let showForm: boolean = false;
let showCart: boolean = false;
let currentCategory: string = 'Todos';
let searchQuery: string = '';
let editingProduct: Product | null = null;
let isAdmin: boolean = false;

// Datos de categorías con imágenes de muestra
const categoriesList = [
  { id: 'Todos', label: 'Ver todo', img: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=150' },
  { id: 'Hombre', label: 'Hombre', img: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=150' },
  { id: 'Mujer', label: 'Mujer', img: 'https://images.unsplash.com/photo-1525845859779-54d477ff291f?w=150' },
  { id: 'Niños', label: 'Niños', img: 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=150' },
  { id: 'Accesorios', label: 'Accesorios', img: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=150' }
];

// Cargar catálogo
async function loadProducts() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `<div class="loading">Cargando catálogo...</div>`

  try {
    const res = await fetch(`${API_URL}/api/products`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    allProducts = await res.json();
    applyFiltersAndRender();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="loading">Error al conectar con el servidor API (${API_URL})</div>`;
  }
}

// Crear producto enviando FormData
async function createProduct(formData: FormData) {
  try {
    const res = await fetch(`${API_URL}/api/products`, {
      method: 'POST',
      body: formData
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

// Actualizar producto enviando FormData
async function updateProduct(id: number, formData: FormData) {
  try {
    const res = await fetch(`${API_URL}/api/products/${id}`, {
      method: 'PUT',
      body: formData
    });

    if (res.ok) {
      editingProduct = null;
      await loadProducts();
    } else {
      const errData = await res.json().catch(() => ({ error: 'Error desconocido' }));
      alert(`Error al actualizar: ${errData.error || 'Verifique los datos'}`);
    }
  } catch (err) {
    alert('Error de red al actualizar.');
  }
}

// Eliminar producto
async function deleteProduct(id: number) {
  if (!confirm('¿Estás seguro de que deseas eliminar este producto?')) return;

  try {
    const res = await fetch(`${API_URL}/api/products/${id}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      allProducts = allProducts.filter(p => p.id !== id);
      cartItems = cartItems.filter(p => p.id !== id);
      applyFiltersAndRender();
    } else {
      alert('Error al eliminar el producto.');
    }
  } catch (err) {
    alert('Error de red al intentar eliminar.');
  }
}

// Helper para construir la URL completa de la imagen
function getImageUrl(imagePath: string): string {
  if (!imagePath) return '';
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  return `${API_URL}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
}

// --- MODAL DETALLE DE PRODUCTO ---

function openProductDetail(product: Product) {
  const modal = document.getElementById('product-detail-modal');
  const modalBody = document.getElementById('modal-product-body');

  if (!modal || !modalBody) return;

  const sizesArray = product.sizes ? product.sizes.split(',').map(s => s.trim()) : ['S', 'M', 'L'];
  const colorsArray = product.colors ? product.colors.split(',').map(c => c.trim()) : ['Estándar'];

  modalBody.innerHTML = `
    <div class="product-detail-layout">
      <div class="detail-image">
        <img src="${getImageUrl(product.image)}" alt="${product.name}">
      </div>
      <div class="detail-info">
        <h2>${product.name}</h2>
        <p class="detail-price">$${parseFloat(product.price).toFixed(2)}</p>
        <p><strong>Categoría:</strong> ${product.category}</p>
        
        <div class="variant-selector">
          <label for="select-size">Seleccionar Talla:</label>
          <select id="select-size">
            ${sizesArray.map(size => `<option value="${size}">${size}</option>`).join('')}
          </select>
        </div>

        <div class="variant-selector">
          <label for="select-color">Seleccionar Color:</label>
          <select id="select-color">
            ${colorsArray.map(color => `<option value="${color}">${color}</option>`).join('')}
          </select>
        </div>
        
        ${!isAdmin ? `
          <button id="btn-add-modal-cart" class="btn-submit" style="margin-top: 15px; width: 100%;">
            Agregar al Carrito
          </button>
        ` : ''}
      </div>
    </div>
  `;

  const addBtn = modalBody.querySelector('#btn-add-modal-cart');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const selectedSize = (document.getElementById('select-size') as HTMLSelectElement).value;
      const selectedColor = (document.getElementById('select-color') as HTMLSelectElement).value;

      cartItems.push({
        ...product,
        selectedSize,
        selectedColor
      });

      closeProductDetail();
      applyFiltersAndRender();
    });
  }

  modal.classList.remove('hidden');
}

function closeProductDetail() {
  const modal = document.getElementById('product-detail-modal');
  if (modal) modal.classList.add('hidden');
}

// --- MODAL CHECKOUT / PROCESO DE COMPRA ---

function openCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  const modalBody = document.getElementById('checkout-modal-body');
  if (!modal || !modalBody) return;

  const total = cartItems.reduce((acc, item) => acc + parseFloat(item.price), 0);

  modalBody.innerHTML = `
    <h2>Finalizar Compra</h2>
    <p>Resumen del pedido: <strong>${cartItems.length} producto(s)</strong></p>
    <p class="detail-price">Total a pagar: $${total.toFixed(2)}</p>
    
    <form id="checkout-form" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
      <input type="text" id="cust-name" placeholder="Nombre completo" required />
      <input type="email" id="cust-email" placeholder="Correo electrónico" required />
      <input type="text" id="cust-address" placeholder="Dirección de envío" required />
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

      modalBody.innerHTML = `
        <div class="checkout-success-container">
          <h2>🎉 ¡Compra Exitosa!</h2>
          <p>Gracias por tu compra, <strong>${customerName}</strong>.</p>
          <p>Hemos procesado tu pedido correctamente. Recibirás un correo de confirmación en breve.</p>
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

// Aplicar filtros
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

// Renderizado principal
function renderApp(productsToDisplay: Product[], selectedCategory = 'Todos') {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const cartTotal = cartItems.reduce((acc, p) => acc + parseFloat(p.price), 0);

  app.innerHTML = `
    <div class="App">
      <!-- Encabezado Estilo SHEIN -->
      <header class="navbar-container">
        <div class="navbar-top">
          <h1 class="brand-logo">NEXUSGEAR</h1>

          <div class="search-bar-container">
            <input 
              type="text" 
              id="search-input" 
              placeholder="Buscar productos..." 
              value="${searchQuery}" 
            />
          </div>
          
          <div class="navbar-actions">
            <button id="btn-toggle-role" class="btn-role-toggle" style="background:#222; color:white; padding:8px 12px; border-radius:6px; border:none; cursor:pointer;">
              ${isAdmin ? '👑 Modo Admin' : '👤 Modo Cliente'}
            </button>

            ${isAdmin ? `
              <button id="btn-toggle-form" class="btn-add-product">
                ${showForm ? '✕ Cerrar' : '+ Nuevo Producto'}
              </button>
            ` : ''}
            
            ${!isAdmin ? `
              <div id="btn-toggle-cart" class="cart-icon-container">
                <span class="cart-icon">🛒</span>
                <span class="cart-badge">${cartItems.length}</span>
              </div>
            ` : ''}
          </div>
        </div>
      </header>

      <!-- SECCIÓN COMPRAR POR CATEGORÍA -->
      <section class="shein-categories-section">
        <h2 class="shein-categories-title">COMPRAR POR CATEGORÍA</h2>
        <div class="shein-categories-grid">
          ${categoriesList.map(cat => `
            <div class="shein-category-card ${cat.id === selectedCategory ? 'active' : ''}" data-category="${cat.id}">
              <div class="shein-category-img-wrapper">
                <img src="${cat.img}" alt="${cat.label}">
              </div>
              <span class="shein-category-label">${cat.label}</span>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Carrito Ventana Flotante -->
      ${showCart && !isAdmin ? `
        <div class="cart-modal">
          <h3>Tu Carrito</h3>
          ${cartItems.length === 0 ? '<p>El carrito está vacío.</p>' : `
            <ul class="cart-list">
              ${cartItems.map((item, idx) => `
                <li>
                  <div>
                    <strong>${item.name}</strong><br/>
                    <small>Talla: ${item.selectedSize} | Color: ${item.selectedColor}</small><br/>                     <span>$${parseFloat(item.price).toFixed(2)}</span>
                  </div>
                  <button class="remove-cart-item-btn" data-index="${idx}">X</button>
                </li>
              `).join('')}
            </ul>
            <hr />
            <p class="cart-total"><strong>Total:</strong> $${cartTotal.toFixed(2)}</p>
            <button id="btn-go-checkout" class="btn-checkout">Proceder al Pago</button>
          `}
          <button id="btn-close-cart" class="btn-submit" style="margin-top:8px; width:100%; background-color:#718096;">Cerrar</button>
        </div>
      ` : ''}

      <!-- Formulario Crear (Admin) -->
      ${showForm && isAdmin ? `
        <div class="form-container">
          <h2>Añadir Nuevo Producto</h2>
          <form id="add-product-form" enctype="multipart/form-data">
            <input type="text" id="p-name" placeholder="Nombre del producto" required />
            <input type="number" step="0.01" id="p-price" placeholder="Precio ($)" required />
            <input type="text" id="p-sizes" placeholder="Tallas (ej: S, M, L, XL)" />
            <input type="text" id="p-colors" placeholder="Colores (ej: Negro, Azul, Rojo)" />
            <select id="p-category">
              <option value="Hombre">Hombre</option>
              <option value="Mujer">Mujer</option>
              <option value="Niños">Niños</option>
              <option value="Accesorios">Accesorios</option>
            </select>
            <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
              <label for="p-image" style="font-size:0.85rem; font-weight:600;">Imagen del producto:</label>
              <input type="file" id="p-image" accept="image/*" required />
            </div>
            <button type="submit" class="btn-submit">Guardar Producto</button>
          </form>
        </div>
      ` : ''}

      <!-- Formulario Editar (Admin) -->
      ${editingProduct && isAdmin ? `
        <div class="form-container edit-container">
          <h2>Editar Producto</h2>
          <form id="edit-product-form" enctype="multipart/form-data">
            <input type="text" id="edit-p-name" value="${editingProduct.name}" required />
            <input type="number" step="0.01" id="edit-p-price" value="${editingProduct.price}" required />
            <input type="text" id="edit-p-sizes" value="${editingProduct.sizes || ''}" placeholder="Tallas (ej: S, M, L, XL)" />
            <input type="text" id="edit-p-colors" value="${editingProduct.colors || ''}" placeholder="Colores (ej: Negro, Azul, Rojo)" />
            <select id="edit-p-category">
              <option value="Hombre" ${editingProduct.category === 'Hombre' ? 'selected' : ''}>Hombre</option>
              <option value="Mujer" ${editingProduct.category === 'Mujer' ? 'selected' : ''}>Mujer</option>
              <option value="Niños" ${editingProduct.category === 'Niños' ? 'selected' : ''}>Niños</option>
              <option value="Accesorios" ${editingProduct.category === 'Accesorios' ? 'selected' : ''}>Accesorios</option>
            </select>
            <div style="display:flex; flex-direction:column; gap:4px; text-align:left;">
              <label for="edit-p-image" style="font-size:0.85rem; font-weight:600;">Cambiar imagen (opcional):</label>
              <input type="file" id="edit-p-image" accept="image/*" />
            </div>
            <div style="display:flex; gap:10px; margin-top:10px;">
              <button type="submit" class="btn-submit" style="flex:1;">Actualizar</button>
              <button type="button" id="btn-cancel-edit" class="delete-btn" style="flex:1;">Cancelar</button>
            </div>
          </form>
        </div>
      ` : ''}

      <!-- Cuadrícula de Productos -->
      <div class="product-grid">
        ${productsToDisplay.length > 0 ? productsToDisplay.map(p => `
          <div class="product-card">
            <img src="${getImageUrl(p.image)}" alt="${p.name}" class="product-click-trigger" data-id="${p.id}" style="cursor:pointer;" />
            <h3 class="product-click-trigger" data-id="${p.id}" style="cursor:pointer;">${p.name}</h3>
            <p class="category">${p.category}</p>             <p class="price">$${parseFloat(p.price).toFixed(2)}</p>
            
            <div class="card-actions">
              ${!isAdmin ? `
                <button class="add-cart-btn" data-id="${p.id}">Agregar al carrito</button>
              ` : `
                <button class="edit-btn" data-id="${p.id}">✏️ Editar</button>
                <button class="delete-btn" data-id="${p.id}">Eliminar</button>
              `}
            </div>
          </div>
        `).join('') : '<p style="grid-column: 1/-1; text-align: center; color: #777;">No se encontraron productos.</p>'}
      </div>
    </div>
  `

  // --- REGISTRO DE EVENTOS ---

  // Evento de selección de categorías
  document.querySelectorAll('.shein-category-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const cat = (e.currentTarget as HTMLElement).getAttribute('data-category');
      if (cat) {
        currentCategory = cat;
        applyFiltersAndRender();
      }
    });
  });

  // Abrir Modal de Detalle
  document.querySelectorAll('.product-click-trigger').forEach(element => {
    element.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const id = Number(target.getAttribute('data-id'));
      const product = allProducts.find(p => p.id === id);
      if (product) openProductDetail(product);
    });
  });

  // Evento Botón Proceder al Pago
  document.querySelector('#btn-go-checkout')?.addEventListener('click', () => {
    openCheckoutModal();
  });

  // Toggle Rol
  document.querySelector('#btn-toggle-role')?.addEventListener('click', () => {
    isAdmin = !isAdmin;
    showForm = false;
    showCart = false;
    editingProduct = null;
    applyFiltersAndRender();
  });

  // Búsqueda
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

  // Toggles de carrito y formularios
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

  // Formulario Crear Producto
  const form = document.querySelector('#add-product-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const formData = new FormData();
      formData.append('name', (document.querySelector('#p-name') as HTMLInputElement).value);
      formData.append('price', (document.querySelector('#p-price') as HTMLInputElement).value);
      formData.append('sizes', (document.querySelector('#p-sizes') as HTMLInputElement).value);
      formData.append('colors', (document.querySelector('#p-colors') as HTMLInputElement).value);
      formData.append('category', (document.querySelector('#p-category') as HTMLSelectElement).value);

      const fileInput = document.querySelector('#p-image') as HTMLInputElement;
      if (fileInput.files && fileInput.files[0]) {
        formData.append('image', fileInput.files[0]);
      }

      createProduct(formData);
    });
  }

  // Formulario Editar Producto
  const editForm = document.querySelector('#edit-product-form');
  if (editForm && editingProduct) {
    const idToUpdate = editingProduct.id;
    editForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const formData = new FormData();
      formData.append('name', (document.querySelector('#edit-p-name') as HTMLInputElement).value);
      formData.append('price', (document.querySelector('#edit-p-price') as HTMLInputElement).value);
      formData.append('sizes', (document.querySelector('#edit-p-sizes') as HTMLInputElement).value);
      formData.append('colors', (document.querySelector('#edit-p-colors') as HTMLInputElement).value);
      formData.append('category', (document.querySelector('#edit-p-category') as HTMLSelectElement).value);

      const fileInput = document.querySelector('#edit-p-image') as HTMLInputElement;
      if (fileInput.files && fileInput.files[0]) {
        formData.append('image', fileInput.files[0]);
      }

      updateProduct(idToUpdate, formData);
    });

    document.querySelector('#btn-cancel-edit')?.addEventListener('click', () => {
      editingProduct = null;
      applyFiltersAndRender();
    });
  }

  // Eventos de botones en tarjetas
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
        const defaultSize = product.sizes ? product.sizes.split(',')[0].trim() : 'M';
        const defaultColor = product.colors ? product.colors.split(',')[0].trim() : 'Único';
        cartItems.push({ ...product, selectedSize: defaultSize, selectedColor: defaultColor });
        applyFiltersAndRender();
      }
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

// Configuración de eventos modales estáticos en el HTML
document.getElementById('close-detail-modal')?.addEventListener('click', closeProductDetail);
document.getElementById('close-checkout-modal')?.addEventListener('click', closeCheckoutModal);

window.addEventListener('click', (e) => {
  const detailModal = document.getElementById('product-detail-modal');
  const checkoutModal = document.getElementById('checkout-modal');
  if (e.target === detailModal) closeProductDetail();
  if (e.target === checkoutModal) closeCheckoutModal();
});

// Inicializar la aplicación
loadProducts();