import { login, register } from './auth'

// Crear el Modal/Formulario de Login y Registro en el DOM
export function initAuthUI(onAuthChange?: () => void) {
  // Insertar contenedor para el Modal de Login/Registro en el body
  const modalHTML = `
    <div id="auth-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:1000; justify-content:center; align-items:center;">
      <div style="background:#fff; padding:25px; border-radius:8px; width:100%; max-width:380px; position:relative; box-shadow: 0 4px 10px rgba(0,0,0,0.3); color:#333;">
        <button id="close-auth-modal" style="position:absolute; top:10px; right:15px; background:none; border:none; font-size:20px; cursor:pointer;">&times;</button>
        
        <!-- Formulario de Login -->
        <div id="login-form-container">
          <h2 style="margin-top:0;">Iniciar Sesión</h2>
          <div id="auth-error" style="color:red; font-size:14px; margin-bottom:10px;"></div>
          <form id="login-form">
            <div style="margin-bottom:12px;">
              <label style="display:block; font-size:14px;">Correo Electrónico:</label>
              <input type="email" id="login-email" required style="width:100%; padding:8px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block; font-size:14px;">Contraseña:</label>
              <input type="password" id="login-password" required style="width:100%; padding:8px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;">
            </div>
            <button type="submit" style="width:100%; padding:10px; background:#007bff; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Ingresar</button>
          </form>
          <p style="font-size:13px; margin-top:15px; text-align:center;">
            ¿No tienes cuenta? <a href="#" id="show-register" style="color:#007bff;">Regístrate aquí</a>
          </p>
        </div>

        <!-- Formulario de Registro -->
        <div id="register-form-container" style="display:none;">
          <h2 style="margin-top:0;">Crear Cuenta</h2>
          <div id="register-error" style="color:red; font-size:14px; margin-bottom:10px;"></div>
          <form id="register-form">
            <div style="margin-bottom:12px;">
              <label style="display:block; font-size:14px;">Nombre completo:</label>
              <input type="text" id="reg-name" required style="width:100%; padding:8px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block; font-size:14px;">Correo Electrónico:</label>
              <input type="email" id="reg-email" required style="width:100%; padding:8px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block; font-size:14px;">Contraseña:</label>
              <input type="password" id="reg-password" required style="width:100%; padding:8px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;">
            </div>
            <button type="submit" style="width:100%; padding:10px; background:#28a745; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Registrarse</button>
          </form>
          <p style="font-size:13px; margin-top:15px; text-align:center;">
            ¿Ya tienes cuenta? <a href="#" id="show-login" style="color:#007bff;">Inicia Sesión</a>
          </p>
        </div>

      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modal = document.getElementById('auth-modal')!;
  const loginContainer = document.getElementById('login-form-container')!;
  const registerContainer = document.getElementById('register-form-container')!;
  const errorDiv = document.getElementById('auth-error')!;
  const regErrorDiv = document.getElementById('register-error')!;

  // Eventos para conmutar vistas
  document.getElementById('close-auth-modal')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  document.getElementById('show-register')?.addEventListener('click', (e) => {
    e.preventDefault();
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'block';
  });

  document.getElementById('show-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    registerContainer.style.display = 'none';
    loginContainer.style.display = 'block';
  });

  // Submit Login
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';
    const email = (document.getElementById('login-email') as HTMLInputElement).value;
    const password = (document.getElementById('login-password') as HTMLInputElement).value;

    try {
      await login(email, password);
      modal.style.display = 'none';
      if (onAuthChange) onAuthChange();
    } catch (err: any) {
      errorDiv.textContent = err.message;
    }
  });

  // Submit Registro
  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    regErrorDiv.textContent = '';
    const name = (document.getElementById('reg-name') as HTMLInputElement).value;
    const email = (document.getElementById('reg-email') as HTMLInputElement).value;
    const password = (document.getElementById('reg-password') as HTMLInputElement).value;

    try {
      await register(name, email, password);
      modal.style.display = 'none';
      if (onAuthChange) onAuthChange();
    } catch (err: any) {
      regErrorDiv.textContent = err.message;
    }
  });
}

export function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'flex';
}