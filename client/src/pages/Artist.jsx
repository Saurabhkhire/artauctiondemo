import { useEffect, useState } from 'react';
import { api, assetUrl } from '../api';

export default function Artist() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const rows = await api('/api/arts/mine');
    setItems(rows);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Please choose an image.');
      return;
    }
    const fd = new FormData();
    fd.append('title', title);
    fd.append('description', description);
    fd.append('image', file);
    setBusy(true);
    try {
      await api('/api/arts', { method: 'POST', body: fd });
      setTitle('');
      setDescription('');
      setFile(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const remaining = Math.max(0, 10 - items.length);

  return (
    <div className="container" style={{ padding: '32px 0 48px' }}>
      <header style={{ marginBottom: 28 }}>
        <span className="pill">Artist studio</span>
        <h1 className="font-display" style={{ margin: '12px 0 8px' }}>
          Your portfolio
        </h1>
        <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 560 }}>
          You may list up to ten works. Only pieces marked <em>available</em> can be chosen by the curator for a new
          auction.
        </p>
      </header>

      <div className="split split-2">
        <form className="card form-grid" onSubmit={onSubmit}>
          <h2 className="font-display" style={{ margin: 0 }}>
            Upload a work
          </h2>
          {error && <div className="alert alert-error">{error}</div>}
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </label>
          <label>
            Image
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || remaining === 0}>
            {remaining === 0 ? 'Portfolio full' : busy ? 'Publishing…' : 'Publish to gallery'}
          </button>
          <small>{remaining} slot{remaining === 1 ? '' : 's'} remaining.</small>
        </form>

        <div>
          <h2 className="font-display">In the archive</h2>
          <div className="grid-arts" style={{ marginTop: 16 }}>
            {items.length === 0 && <p style={{ color: 'var(--muted)' }}>No works yet.</p>}
            {items.map((a) => (
              <div key={a.id} className="card" style={{ padding: 14 }}>
                <img className="art-thumb" src={assetUrl(a.image_path)} alt="" />
                <h3 style={{ fontSize: '1rem', margin: '12px 0 6px' }}>{a.title}</h3>
                <span className="pill" style={{ fontSize: '0.65rem' }}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
