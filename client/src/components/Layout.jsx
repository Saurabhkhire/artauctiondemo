import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const linkStyle = ({ isActive }) => ({
  fontWeight: isActive ? 700 : 500,
  opacity: isActive ? 1 : 0.85,
});

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden />
            <span>
              <span className="brand-text">Momas High Society</span>
              <span className="brand-sub" style={{ display: 'block' }}>
                Art Auction
              </span>
            </span>
          </Link>
          <nav className="nav-links" aria-label="Main">
            <NavLink to="/" style={linkStyle} end>
              Home
            </NavLink>
            {user?.role === 'artist' && (
              <NavLink to="/artist" style={linkStyle}>
                Studio
              </NavLink>
            )}
            {user?.role === 'admin' && (
              <NavLink to="/admin" style={linkStyle}>
                Curator
              </NavLink>
            )}
            {user?.role === 'buyer' && (
              <>
                <NavLink to="/buyer" style={linkStyle}>
                  Saleroom
                </NavLink>
                <NavLink to="/buyer#my-purchases" style={linkStyle}>
                  My purchases
                </NavLink>
              </>
            )}
            <NavLink to="/auction" style={linkStyle}>
              Auctions
            </NavLink>
            {!user && (
              <>
                <NavLink to="/login" style={linkStyle}>
                  Sign in
                </NavLink>
                <Link to="/register">
                  <span className="btn btn-primary">Join</span>
                </Link>
              </>
            )}
            {user && (
              <>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {user.name}
                  {user.role === 'buyer' && (
                    <span className="mono-nums" style={{ marginLeft: 8 }}>
                      · ${Number(user.virtual_balance).toLocaleString()}
                    </span>
                  )}
                </span>
                <button type="button" className="btn btn-ghost" onClick={logout}>
                  Log out
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer style={{ padding: '40px 0', borderTop: '1px solid var(--line)', marginTop: 48 }}>
        <div className="container" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          Momas High Society Art Auction — demo. Virtual balance only; Stripe reserved for a later phase.
        </div>
      </footer>
    </>
  );
}
