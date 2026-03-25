import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="container">
      <section className="hero">
        <span className="pill">High society saleroom</span>
        <h1>Bid with calm precision.</h1>
        <p>
          Momas High Society Art Auction brings artists, curators, and collectors together. Register, preview lots,
          and raise the paddle when the room opens — timed to the real clock.
        </p>
        {!user ? (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" className="btn btn-primary">
              Create account
            </Link>
            <Link to="/login" className="btn btn-ghost">
              Sign in
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/auction" className="btn btn-primary">
              View auctions
            </Link>
            {user.role === 'buyer' && (
              <Link to="/buyer" className="btn btn-ghost">
                Saleroom
              </Link>
            )}
            {user.role === 'artist' && (
              <Link to="/artist" className="btn btn-ghost">
                Studio
              </Link>
            )}
            {user.role === 'admin' && (
              <Link to="/admin" className="btn btn-ghost">
                Curator desk
              </Link>
            )}
          </div>
        )}
      </section>

      <div className="split split-2" style={{ marginBottom: 48 }}>
        <div className="card">
          <h2 className="font-display" style={{ marginTop: 0 }}>
            For artists
          </h2>
          <p style={{ color: 'var(--muted)' }}>
            Upload up to ten works with rich imagery and notes. Once a piece enters a curated auction, it remains
            exclusive to that sale until the hammer falls.
          </p>
        </div>
        <div className="card">
          <h2 className="font-display" style={{ marginTop: 0 }}>
            For buyers
          </h2>
          <p style={{ color: 'var(--muted)' }}>
            Pre-register before the session begins, set your spending ceiling, and bid in real time. Each lot honors
            an upper limit set by the curator — the room never runs past its mark.
          </p>
        </div>
      </div>
    </div>
  );
}
