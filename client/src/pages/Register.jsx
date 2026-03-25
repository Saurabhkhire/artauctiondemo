import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('buyer');
  const [useStripe, setUseStripe] = useState(false);
  const [stripeNote, setStripeNote] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        name,
        email,
        password,
        role,
        use_stripe_future: useStripe,
        stripe_placeholder: stripeNote || undefined,
      };
      const u = await register(payload);
      if (u.role === 'artist') nav('/artist');
      else if (u.role === 'admin') nav('/admin');
      else if (u.role === 'buyer') nav('/buyer');
      else nav('/');
    } catch (err) {
      setError(err.message || 'Registration failed');
    }
  }

  return (
    <div className="container" style={{ maxWidth: 480, padding: '40px 0' }}>
      <h1 className="font-display">Join</h1>
      <p style={{ color: 'var(--muted)' }}>Open registration — verification comes later.</p>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <form className="card form-grid" onSubmit={onSubmit}>
        <label>
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </label>
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
            autoComplete="new-password"
            minLength={6}
          />
        </label>
        <label>
          Account type
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="buyer">Buyer</option>
            <option value="artist">Artist</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {role === 'buyer' && (
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Buyer balance is set when you <strong>pre-register</strong> for your first auction (budget cap).
          </div>
        )}

        <div
          style={{
            border: '1px dashed var(--line)',
            borderRadius: 10,
            padding: 14,
            background: 'rgba(184, 255, 61, 0.1)',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={useStripe} onChange={(e) => setUseStripe(e.target.checked)} />
            <span style={{ color: 'var(--ink)' }}>Plan to use Stripe for payments later</span>
          </label>
          <label style={{ marginTop: 12 }}>
            Notes / placeholder for Stripe (optional)
            <input
              value={stripeNote}
              onChange={(e) => setStripeNote(e.target.value)}
              placeholder="Customer reference, intent, etc."
            />
          </label>
        </div>

        <button type="submit" className="btn btn-primary">
          Create account
        </button>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
          Already a member? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
