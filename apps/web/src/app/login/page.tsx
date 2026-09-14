'use client';

import { FormEvent, useState } from 'react';
import { LogIn } from 'lucide-react';
import { buildApiUrl } from '../../lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(buildApiUrl('/auth/login'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError('E-mail ou senha invalidos.');
        return;
      }

      window.location.assign('/dashboard');
    } catch {
      setError('Não foi possível conectar a API.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <h1 id="login-title" className="login-title">
          CRM Novo
        </h1>
        <p className="login-subtitle">Acesso administrativo da Code a Code.</p>

        <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              autoComplete="current-password"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>

          <div className="error-message" role="status">
            {error}
          </div>

          <button className="primary-button" disabled={loading} type="submit">
            <LogIn aria-hidden="true" size={18} />
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
