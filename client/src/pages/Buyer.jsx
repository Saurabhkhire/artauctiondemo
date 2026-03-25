import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Buyer() {
  const { refreshUser } = useAuth();
  const [auctions, setAuctions] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState('');
  const [budgets, setBudgets] = useState({});

  async function load() {
    setError('');
    try {
      const auc = await api('/api/auctions');
      setAuctions(auc);
    } catch (e) {
      setError(e.message || 'Could not load auctions');
    }
    try {
      const purch = await api('/api/me/purchases');
      setPurchases(Array.isArray(purch) ? purch : []);
    } catch (e) {
      setPurchases([]);
      setError((prev) => prev || e.message || 'Could not load purchases');
    }
    await refreshUser();
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const purchasesByAuction = useMemo(() => {
    const m = new Map();
    for (const p of purchases) {
      const key = p.auction_id ?? p.auction_name;
      if (!m.has(key)) m.set(key, { auctionId: key, name: p.auction_name, items: [] });
      m.get(key).items.push(p);
    }
    return [...m.values()].sort((a, b) => {
      const maxId = (items) => Math.max(0, ...items.map((i) => i.id));
      return maxId(b.items) - maxId(a.items);
    });
  }, [purchases]);

  async function registerForAuction(id) {
    setError('');
    const cap = Number(budgets[id]);
    if (!cap || cap <= 0) {
      setError('Enter a positive budget cap, then click Pre-register.');
      return;
    }
    try {
      await api(`/api/auctions/${id}/register`, {
        method: 'POST',
        body: JSON.stringify({ budget_cap: cap }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="container" style={{ padding: '32px 0 48px' }}>
      <header style={{ marginBottom: 28 }}>
        <span className="pill">Saleroom</span>
        <h1 className="font-display" style={{ margin: '12px 0 8px' }}>
          Your auctions
        </h1>
        <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 620 }}>
          Before an auction opens, use <strong>Pre-register</strong> with a budget cap. The total of your winning bids in
          that session cannot exceed that cap (and cannot exceed your virtual balance). You can pre-register here, on
          the auction list, or inside the auction room.
        </p>
      </header>

      {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

      <section style={{ marginBottom: 40 }}>
        <h2 className="font-display">Sessions</h2>
        <div className="grid-arts" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
          {auctions.map((a) => {
            const scheduled = a.status === 'scheduled';
            const registered = !!a.my_registration;
            return (
              <div key={a.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{a.name}</h3>
                  <span className={`pill ${a.status}`}>{a.status}</span>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  Opens {new Date(a.start_at).toLocaleString()}
                  <br />
                  Closes {new Date(a.end_at).toLocaleString()}
                </p>

                {scheduled && !registered && (
                  <div
                    className="form-grid"
                    style={{
                      marginTop: 14,
                      padding: 14,
                      borderRadius: 10,
                      border: '2px solid var(--lime)',
                      background: 'rgba(184, 255, 61, 0.14)',
                    }}
                  >
                    <strong style={{ fontSize: '0.95rem' }}>Pre-register to bid</strong>
                    <label style={{ margin: 0 }}>
                      Your budget cap for this auction ($)
                      <input
                        type="number"
                        min={1}
                        step="1"
                        value={budgets[a.id] ?? ''}
                        onChange={(e) => setBudgets((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        placeholder="e.g. 5000"
                      />
                    </label>
                    <button type="button" className="btn btn-primary" onClick={() => registerForAuction(a.id)}>
                      Pre-register for this auction
                    </button>
                  </div>
                )}

                {scheduled && registered && (
                  <p
                    style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(92, 45, 145, 0.1)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <strong>Registered</strong>
                    <span className="mono-nums" style={{ marginLeft: 8 }}>
                      · cap ${Number(a.my_registration.budget_cap).toLocaleString()}
                    </span>
                  </p>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <Link to={`/auction/${a.id}`} className="btn btn-ghost" style={{ textDecoration: 'none' }}>
                    Open auction room
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="my-purchases" style={{ scrollMarginTop: 96 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <h2 className="font-display" style={{ margin: 0 }}>
            Art you bought (by auction)
          </h2>
          <button type="button" className="btn btn-ghost" onClick={() => load()}>
            Refresh list
          </button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
          After each auction ends, pieces you won show up here, grouped by session. Sales are written when the server
          finalizes the auction (usually within a few seconds of the end time). Use refresh if you just won something.
          Artists see sold work in Studio as <em>sold</em>.
        </p>
        {purchases.length === 0 && <p style={{ color: 'var(--muted)', marginTop: 16 }}>No purchases yet.</p>}
        {purchasesByAuction.map((group) => (
          <div key={String(group.auctionId)} style={{ marginTop: 28 }}>
            <h3
              className="font-display"
              style={{ fontSize: '1.15rem', margin: '0 0 12px', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}
            >
              {group.name}
            </h3>
            <div className="grid-arts">
              {group.items.map((p) => (
                <div key={p.id} className="card">
                  <img className="art-thumb" src={assetUrl(p.image_path)} alt="" />
                  <h4 style={{ fontSize: '1rem', margin: '12px 0 6px' }}>{p.title}</h4>
                  <p className="mono-nums" style={{ margin: '8px 0 0', fontWeight: 700 }}>
                    ${Number(p.final_price).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
