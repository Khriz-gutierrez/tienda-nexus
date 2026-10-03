// Si estás probando en local (computadora):
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

async function parseResponse(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (e) {
    return { error: text || `Error del servidor (${res.status})` };
  }
}

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string): void {
  localStorage.setItem('token', token);
}

export function logout(): void {
  localStorage.removeItem('token');
  window.location.reload();
}

export async function getCurrentUser(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      return await parseResponse(res);
    } else {
      logout();
      return null;
    }
  } catch (err) {
    console.error('Error al verificar sesión:', err);
    return null;
  }
}

export async function login(email: string, password: string) {
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await parseResponse(res);
    if (!res.ok) throw new Error(data.error || data.message || 'Error al iniciar sesión');

    if (data.token) {
      setToken(data.token);
    }

    return data.user;
  } catch (error: any) {
    throw new Error(error.message || 'Error de conexión con el servidor');
  }
}

export async function register(name: string, email: string, password: string) {
  try {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await parseResponse(res);
    if (!res.ok) throw new Error(data.error || data.message || 'Error al registrar usuario');

    if (data.token) {
      setToken(data.token);
    }

    return data.user;
  } catch (error: any) {
    throw new Error(error.message || 'Error de conexión al registrar usuario');
  }
}