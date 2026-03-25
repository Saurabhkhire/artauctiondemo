import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, assetUrl } from '../api';
import { useAuth } from '../context/AuthContext';

export default function AuctionRoom() {
  const { id } = useParams();
  const { user, refreshUser } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [amounts, setAmounts] = useState({});
  const [descOpen, setDescOpen] = useState({});
  const [roomBudget, setRoomBudget] = useState('');

  const load = async () => {
    const d = await api(`/api/auctions/${id}`);
    setData(d);
    await refreshUser();
  };

  useEffect(() => {
    load().catch(() => setError('Could not load auction'));
  }, [id]);

  useEffect(() => {
    if (!data || data.auction.status !== 'live') return undefined;
    const t = setInterval(() => {
      load().catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [data?.auction?.status, id]);

  async function placeBid(artId, preset) {
    setError('');
    const lot = data.items.find((i) => i.art_id === artId);
    const custom = amounts[artId];
    let amount = preset;
    if (preset == null) {
      amount = Number(custom);
    }
    if (!amount || amount <= 0) {
      setError('Enter a valid bid amount.');
      return;
    }
    const base = lot.current_bid != null ? lot.current_bid : lot.starting_bid;
    const increment = lot.current_bid != null ? Math.max(0.01, Math.ceil(base * 0.1 * 100) / 100) : 0;
    const min = lot.current_bid != null ? base + increment : base;
    if (amount < min - 1e-9) {
      setError(lot.current_bid != null ? `Bid must be at least $${min.toFixed(2)} (10% increment)` : `Opening bid at least $${min.toFixed(2)}`);
      return;
    }
    if (lot.max_bid_allowed != null && amount > lot.max_bid_allowed) {
      setError(`Bid cannot exceed ceiling $${lot.max_bid_allowed.toFixed(2)}`);
      return;
    }
    try {
      await api(`/api/auctions/${id}/bid`, {
        method: 'POST',
        body: JSON.stringify({ art_id: artId, amount }),
      });
      setAmounts((prev) => ({ ...prev, [artId]: '' }));
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function preRegisterAuction(e) {
    e.preventDefault();
    setError('');
    const cap = Number(roomBudget);
    if (!cap || cap <= 0) {
      setError('Enter a positive budget cap to pre-register.');
      return;
    }
    try {
      await api(`/api/auctions/${id}/register`, {
        method: 'POST',
        body: JSON.stringify({ budget_cap: cap }),
      });
      setRoomBudget('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const nowMsg = useMemo(() => {
    if (!data) return '';
    const a = data.auction;
    if (a.status === 'scheduled') return `Opens at ${new Date(a.start_at).toLocaleString()}`;
    if (a.status === 'live') return `Live until ${new Date(a.end_at).toLocaleString()}`;
    return 'This session has ended. Final results are fixed.';
  }, [data]);

  if (!user) {
    return (
      <div className="container" style={{ padding: '48px 0' }}>
        <p>Please sign in to view this auction.</p>
        <Link to="/login">Sign in</Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container" style={{ padding: '48px 0', color: 'var(--muted)' }}>
        {error || 'Loading…'}
      </div>
    );
  }

  const { auction, items, my_registration } = data;
  const canBid = user.role === 'buyer' && auction.status === 'live' && my_registration;

  return (
    <div className="container" style={{ padding: '32px 0 48px' }}>
      <header style={{ marginBottom: 24 }}>
        <Link to="/auction" style={{ fontSize: '0.9rem' }}>
          ← All auctions
        </Link>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <h1 className="font-display" style={{ margin: 0 }}>
            {auction.name}
          </h1>
          <span className={`pill ${auction.status}`}>{auction.status}</span>
        </div>
        <p style={{ color: 'var(--muted)', margin: '8px 0 0', maxWidth: 720 }}>{auction.description}</p>
        <p style={{ fontWeight: 600, marginTop: 8 }}>{nowMsg}</p>
        {user.role === 'buyer' && auction.status === 'scheduled' && !my_registration && (
          <form
            className="card form-grid"
            onSubmit={preRegisterAuction}
            style={{ marginTop: 16, border: '2px solid var(--lime)', background: 'rgba(184, 255, 61, 0.12)' }}
          >
            <strong>Pre-register to bid when this auction opens</strong>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)' }}>
              Set the maximum total you are willing to have committed across winning bids in this session (cannot exceed
              your virtual balance).
            </p>
            <label style={{ margin: 0 }}>
              Budget cap ($)
              <input
                type="number"
                min={1}
                step="1"
                value={roomBudget}
                onChange={(e) => setRoomBudget(e.target.value)}
                placeholder="e.g. 8000"
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Pre-register for this auction
            </button>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
              You can also use the <Link to="/buyer">Saleroom</Link> or the auctions list.
            </p>
          </form>
        )}
        {user.role === 'buyer' && auction.status === 'live' && !my_registration && (
          <p className="alert alert-error" style={{ marginTop: 16 }}>
            You did not pre-register before this session opened, so bidding is closed for your account.
          </p>
        )}
        {user.role === 'buyer' && my_registration && (
          <p style={{ marginTop: 12, fontSize: '0.9rem', color: 'var(--muted)' }}>
            Your budget cap for this session:{' '}
            <strong className="mono-nums">${Number(my_registration.budget_cap).toLocaleString()}</strong>
          </p>
        )}
      </header>

      {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

      <div className="grid-arts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
        {items.map((item) => {
          const base = item.current_bid != null ? item.current_bid : item.starting_bid;
          const increment = item.current_bid != null ? Math.max(0.01, Math.ceil(base * 0.1 * 100) / 100) : 0;
          const minNext = item.current_bid != null ? base + increment : base;
          const suggested = Math.ceil((minNext + Math.max(10, minNext * 0.05)) * 100) / 100;
          const quick =
            item.max_bid_allowed == null
              ? suggested
              : Math.min(item.max_bid_allowed, suggested);

          return (
            <article key={item.art_id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <img className="art-thumb" src={assetUrl(item.image_path)} alt="" />
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontFamily: 'Playfair Display' }}>{item.title}</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>by {item.artist_name}</p>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => setDescOpen((o) => ({ ...o, [item.art_id]: !o[item.art_id] }))}
              >
                {descOpen[item.art_id] ? 'Hide description' : 'Read description'}
              </button>
              {descOpen[item.art_id] && (
                <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{item.description}</p>
              )}
              <div
                style={{
                  borderTop: '1px solid var(--line)',
                  paddingTop: 12,
                  display: 'grid',
                  gap: 6,
                  fontSize: '0.95rem',
                }}
              >
                <div className="mono-nums">
                  <strong>Current bid:</strong>{' '}
                  {item.current_bid != null ? `$${item.current_bid.toLocaleString()}` : '— (none yet)'}
                </div>
                <div>
                  <strong>High bidder:</strong> {item.current_bidder_name || '—'}
                </div>
                <div className="mono-nums" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {item.max_bid_allowed != null ? (
                    <>
                      Ceiling ${item.max_bid_allowed.toLocaleString()} · Minimum bid ${item.starting_bid.toLocaleString()}
                    </>
                  ) : (
                    <>No per-lot cap · Minimum bid ${item.starting_bid.toLocaleString()}</>
                  )}
                </div>
              </div>

              {canBid && (
                <div className="form-grid" style={{ gap: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" className="btn btn-primary" onClick={() => placeBid(item.art_id, minNext)}>
                      Bid ${minNext.toFixed(2)}
                    </button>
                    {quick > minNext &&
                      (item.max_bid_allowed == null || quick <= item.max_bid_allowed) && (
                      <button type="button" className="btn btn-ghost" onClick={() => placeBid(item.art_id, quick)}>
                        Quick ${quick.toFixed(2)}
                      </button>
                    )}
                  </div>
                  <label style={{ margin: 0 }}>
                    Custom amount
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={amounts[item.art_id] ?? ''}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [item.art_id]: e.target.value }))}
                      />
                      <button type="button" className="btn btn-ghost" onClick={() => placeBid(item.art_id, null)}>
                        Place
                      </button>
                    </div>
                  </label>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
