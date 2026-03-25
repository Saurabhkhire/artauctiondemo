import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const u = await login(email, password);
      if (u.role === 'artist') nav('/artist');
      else if (u.role === 'admin') nav('/admin');
      else if (u.role === 'buyer') nav('/buyer');
      else nav('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    }
  }

  return (
    <div className="container" style={{ maxWidth: 440, padding: '40px 0' }}>
      <h1 className="font-display">Sign in</h1>
      <p style={{ color: 'var(--muted)' }}>Welcome back to the saleroom.</p>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <form className="card form-grid" onSubmit={onSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" className="btn btn-primary">
          Continue
        </button>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
