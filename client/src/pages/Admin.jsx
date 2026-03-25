import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../api';

function defaultLotState() {
  return { picked: false, starting_bid: 0 };
}

export default function Admin() {
  const [selectable, setSelectable] = useState([]);
  const [artists, setArtists] = useState([]);
  const [users, setUsers] = useState([]);
  const [allArts, setAllArts] = useState([]);
  const [adminOpsError, setAdminOpsError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [selected, setSelected] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [auctions, setAuctions] = useState([]);

  const [invTitle, setInvTitle] = useState('');
  const [invDescription, setInvDescription] = useState('');
  const [invArtistId, setInvArtistId] = useState('');
  const [invFile, setInvFile] = useState(null);
  const [invBusy, setInvBusy] = useState(false);
  const [invError, setInvError] = useState('');
  const [invOk, setInvOk] = useState('');

  async function load() {
    const [arts, auc, artistList, userRows, artRows] = await Promise.all([
      api('/api/arts/selectable'),
      api('/api/auctions'),
      api('/api/admin/artists'),
      api('/api/admin/users'),
      api('/api/admin/arts'),
    ]);
    setSelectable(arts);
    setAuctions(auc);
    setArtists(artistList);
    setUsers(userRows);
    setAllArts(artRows);
    const init = {};
    for (const a of arts) {
      init[a.id] = { ...defaultLotState() };
    }
    setSelected((prev) => {
      const next = { ...init };
      for (const k of Object.keys(prev)) {
        if (next[k] != null) {
          next[k] = { ...next[k], ...prev[k], picked: !!prev[k]?.picked };
        }
      }
      return next;
    });
    if (artistList.length && !invArtistId) {
      setInvArtistId(String(artistList[0].id));
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  function toggleArt(id) {
    setSelected((prev) => {
      const cur = { ...(prev[id] || defaultLotState()) };
      cur.picked = !cur.picked;
      return { ...prev, [id]: cur };
    });
  }

  function updateLot(id, field, rawValue) {
    setSelected((prev) => {
      const cur = { ...(prev[id] || defaultLotState()) };
      const nextVal = field.includes('bid')
        ? rawValue === ''
          ? ''
          : Number(rawValue)
        : rawValue;
      return {
        ...prev,
        [id]: { ...cur, [field]: nextVal },
      };
    });
  }

  async function addInventory(e) {
    e.preventDefault();
    setInvError('');
    setInvOk('');
    if (!invArtistId) {
      setInvError('Create an artist account first, or pick an artist.');
      return;
    }
    if (!invFile) {
      setInvError('Choose an image file.');
      return;
    }
    const fd = new FormData();
    fd.append('title', invTitle.trim());
    fd.append('description', invDescription.trim());
    fd.append('artist_id', invArtistId);
    fd.append('image', invFile);
    setInvBusy(true);
    try {
      await api('/api/arts', { method: 'POST', body: fd });
      setInvTitle('');
      setInvDescription('');
      setInvFile(null);
      setInvOk('Work added to inventory.');
      await load();
    } catch (err) {
      setInvError(err.message || 'Upload failed');
    } finally {
      setInvBusy(false);
    }
  }

  async function createAuction(e) {
    e.preventDefault();
    setError('');
    const lots = Object.entries(selected)
      .filter(([, v]) => v && v.picked)
      .map(([art_id, v]) => ({
        art_id: Number(art_id),
        starting_bid: v.starting_bid === '' ? 0 : Number(v.starting_bid) || 0,
      }));

    if (!name.trim()) {
      setError('Enter an auction name.');
      return;
    }
    if (!startAt || !endAt) {
      setError('Choose both start and end date/time.');
      return;
    }
    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      setError('Invalid date/time.');
      return;
    }
    if (endMs <= startMs) {
      setError('End date/time must be after the start.');
      return;
    }
    if (lots.length === 0) {
      setError('Select at least one artwork (checkbox) and set an opening bid for each (use 0 if you want no minimum).');
      return;
    }
    for (const l of lots) {
      if (!Number.isFinite(l.starting_bid) || l.starting_bid < 0) {
        setError('Each selected lot needs a valid opening bid (0 or greater).');
        return;
      }
    }

    setBusy(true);
    try {
      await api('/api/auctions', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description,
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
          lots,
        }),
      });
      setName('');
      setDescription('');
      setStartAt('');
      setEndAt('');
      setSelected({});
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(userId) {
    setAdminOpsError('');
    try {
      await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setAdminOpsError(e.message);
    }
  }

  async function deleteArt(artId) {
    setAdminOpsError('');
    try {
      await api(`/api/admin/arts/${artId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setAdminOpsError(e.message);
    }
  }

  async function resellArt(artId) {
    setAdminOpsError('');
    try {
      await api(`/api/admin/arts/${artId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'available' }),
      });
      await load();
    } catch (e) {
      setAdminOpsError(e.message);
    }
  }

  return (
    <div className="container" style={{ padding: '32px 0 48px' }}>
      <header style={{ marginBottom: 28 }}>
        <span className="pill">Curator desk</span>
        <h1 className="font-display" style={{ margin: '12px 0 8px' }}>
          Compose a session
        </h1>
        <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 640 }}>
          Add inventory below (or ask an artist to use Studio). Only <strong>available</strong> works can be scheduled.
          Check each lot you want and set an opening bid. There is no per-artwork bid cap: only each buyer’s
          pre-registered budget and virtual balance limit how high bids can go.
        </p>
      </header>

      {adminOpsError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {adminOpsError}
        </div>
      )}

      <section className="card form-grid" style={{ marginBottom: 24 }}>
        <h2 className="font-display" style={{ margin: 0 }}>
          Add inventory
        </h2>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
          Uploads are stored under the chosen artist (10 works max per artist).{' '}
          <Link to="/register">Register an artist</Link> or use Studio while logged in as one.
        </p>
        {invError && <div className="alert alert-error">{invError}</div>}
        {invOk && (
          <div className="alert" style={{ background: 'rgba(92, 45, 145, 0.1)', border: '1px solid var(--purple-light)' }}>
            {invOk}
          </div>
        )}
        {artists.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            No artist accounts exist yet. Create one via <Link to="/register">Join</Link> (type: Artist), then refresh
            this page.
          </p>
        ) : (
          <form className="form-grid" onSubmit={addInventory}>
            <label>
              Credit to artist
              <select value={invArtistId} onChange={(e) => setInvArtistId(e.target.value)} required>
                {artists.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input value={invTitle} onChange={(e) => setInvTitle(e.target.value)} required />
            </label>
            <label>
              Description
              <textarea value={invDescription} onChange={(e) => setInvDescription(e.target.value)} rows={3} />
            </label>
            <label>
              Image
              <input type="file" accept="image/*" onChange={(e) => setInvFile(e.target.files?.[0] || null)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={invBusy}>
              {invBusy ? 'Uploading…' : 'Add to gallery inventory'}
            </button>
          </form>
        )}
      </section>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 className="font-display" style={{ marginTop: 0 }}>
          Manage users
        </h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
          Admin can delete any user (except themselves). Deleting a user also deletes their related bids/registrations/sales.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--line)' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--line)' }}>Email</th>
                <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--line)' }}>Role</th>
                <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--line)' }}>Balance</th>
                <th style={{ padding: 10, borderBottom: '1px solid var(--line)' }} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>{u.name}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>{u.email}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>{u.role}</td>
                  <td className="mono-nums" style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
                    ${Number(u.virtual_balance || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: 10, borderBottom: '1px solid var(--line)', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => deleteUser(u.id)}
                      style={{ borderColor: 'rgba(184,50,92,0.35)' }}
                    >
                      Delete user
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 10, color: 'var(--muted)' }}>
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 className="font-display" style={{ marginTop: 0 }}>
          Manage artworks
        </h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
          Delete any art, or resell a sold art by switching it back to <strong>available</strong>.
        </p>
        <div className="grid-arts" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
          {allArts.map((a) => (
            <div key={a.id} className="card" style={{ padding: 14 }}>
              <img className="art-thumb" src={assetUrl(a.image_path)} alt="" />
              <h3 style={{ fontSize: '1rem', margin: '12px 0 6px' }}>{a.title}</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>by {a.artist_name}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <span className="pill" style={{ fontSize: '0.65rem' }}>
                  {a.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {a.status === 'sold' && (
                  <button type="button" className="btn btn-primary" onClick={() => resellArt(a.id)}>
                    Mark unsold (resell)
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => deleteArt(a.id)}
                  style={{ borderColor: 'rgba(184,50,92,0.35)' }}
                >
                  Delete art
                </button>
              </div>
            </div>
          ))}
          {allArts.length === 0 && <p style={{ color: 'var(--muted)' }}>No artworks yet.</p>}
        </div>
      </section>

      <form onSubmit={createAuction}>
        <div className="split split-2">
          <div className="card form-grid">
            <h2 className="font-display" style={{ margin: 0 }}>
              Session details
            </h2>
            {error && <div className="alert alert-error">{error}</div>}
            <label>
              Auction name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </label>
            <label>
              Start (local time)
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
            </label>
            <label>
              End (local time)
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required />
            </label>
          </div>

          <div className="card">
            <h2 className="font-display" style={{ marginTop: 0 }}>
              Select lots
            </h2>
            {selectable.length === 0 && (
              <p style={{ color: 'var(--muted)' }}>
                No available works. Use <strong>Add inventory</strong> above or the{' '}
                <Link to="/artist">Artist studio</Link>.
              </p>
            )}
            <div className="form-grid" style={{ maxHeight: '420px', overflow: 'auto', paddingRight: 6 }}>
              {selectable.map((a) => {
                const st = selected[a.id] || defaultLotState();
                return (
                  <div
                    key={a.id}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      padding: 12,
                      display: 'grid',
                      gap: 8,
                      background: st.picked ? 'rgba(92, 45, 145, 0.08)' : '#fff',
                    }}
                  >
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!st.picked} onChange={() => toggleArt(a.id)} />
                      <img
                        src={assetUrl(a.image_path)}
                        alt=""
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
                      />
                      <span>
                        <strong>{a.title}</strong>
                        <br />
                        <small style={{ color: 'var(--muted)' }}>{a.artist_name}</small>
                      </span>
                    </label>
                    {st.picked && (
                      <label style={{ margin: 0 }}>
                        Opening bid ($)
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={st.starting_bid === '' ? '' : st.starting_bid}
                          onChange={(e) => updateLot(a.id, 'starting_bid', e.target.value)}
                        />
                        <small style={{ fontWeight: 400 }}>First bid must be at least this amount.</small>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Scheduling…' : 'Schedule auction'}
          </button>
        </div>
      </form>

      <section style={{ marginTop: 36 }}>
        <h2 className="font-display">Scheduled & past sessions</h2>
        <div className="grid-arts" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
          {auctions.map((au) => (
            <div key={au.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{au.name}</h3>
                <span className={`pill ${au.status}`}>{au.status}</span>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                {new Date(au.start_at).toLocaleString()} — {new Date(au.end_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
