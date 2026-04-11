// URL base do backend. Pode ser sobrescrita via REACT_APP_API_URL
// (build-time var do Create React App). Defina no Railway/Vercel/etc
// como REACT_APP_API_URL=https://api.dominio.com (sem barra no final).
//
// Fallback: producao atual no Railway.
export const API = (process.env.REACT_APP_API_URL || 'https://anonimizador-lgpd-production.up.railway.app').replace(/\/$/, '');
