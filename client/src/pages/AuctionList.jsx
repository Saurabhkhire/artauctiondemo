import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function AuctionList() {
  const { user, refreshUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [listError, setListError] = useState('');

  async function load() {
    const data = await api('/api/auctions');
    setRows(data);
    await refreshUser();
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function registerForAuction(id, e) {
    e.preventDefault();
    e.stopPropagation();
    setListError('');
    const cap = Number(budgets[id]);
    if (!cap || cap <= 0) {
      setListError('Enter a budget cap for that auction, then press Pre-register again.');
      return;
    }
    try {
      await api(`/api/auctions/${id}/register`, {
        method: 'POST',
        body: JSON.stringify({ budget_cap: cap }),
      });
      await load();
    } catch (err) {
      setListError(err.message);
    }
  }

  return (
    <div className="container" style={{ padding: '32px 0 48px' }}>
      <h1 className="font-display">Auctions</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 560 }}>
        Browse sessions. Buyers must <strong>pre-register</strong> (budget cap) before the start time — use the highlighted
        box on each card or the Saleroom page.
      </p>
      {!user && (
        <p style={{ marginTop: 12 }}>
          <Link to="/login" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Sign in to bid
          </Link>
        </p>
      )}
      {listError && <div className="alert alert-error" style={{ marginTop: 16 }}>{listError}</div>}

      <div className="grid-arts" style={{ marginTop: 24, gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
        {rows.map((a) => {
          const buyer = user?.role === 'buyer';
          const scheduled = a.status === 'scheduled';
          const registered = !!a.my_registration;

          return (
            <div key={a.id} className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontFamily: 'Playfair Display' }}>{a.name}</h2>
                <span className={`pill ${a.status}`}>{a.status}</span>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>
                {new Date(a.start_at).toLocaleString()} — {new Date(a.end_at).toLocaleString()}
              </p>

              {buyer && scheduled && !registered && (
                <form
                  onSubmit={(e) => registerForAuction(a.id, e)}
                  className="form-grid"
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: '2px solid var(--lime)',
                    background: 'rgba(184, 255, 61, 0.14)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <strong style={{ fontSize: '0.9rem' }}>Pre-register</strong>
                  <label style={{ margin: 0 }}>
                    Budget cap ($)
                    <input
                      type="number"
                      min={1}
                      step="1"
                      value={budgets[a.id] ?? ''}
                      onChange={(e) => setBudgets((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      placeholder="Required to bid"
                    />
                  </label>
                  <button type="submit" className="btn btn-primary">
                    Pre-register for this auction
                  </button>
                </form>
              )}

              {buyer && scheduled && registered && (
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--accent-soft)', fontWeight: 600 }}>
                  You are pre-registered (cap ${Number(a.my_registration.budget_cap).toLocaleString()})
                </p>
              )}

              <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                <Link to={`/auction/${a.id}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
                  View auction room →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      {rows.length === 0 && <p style={{ color: 'var(--muted)' }}>No auctions scheduled yet.</p>}
    </div>
  );
}
