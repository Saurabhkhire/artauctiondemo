import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Protected from './components/Protected';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Artist from './pages/Artist';
import Admin from './pages/Admin';
import Buyer from './pages/Buyer';
import AuctionList from './pages/AuctionList';
import AuctionRoom from './pages/AuctionRoom';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/auction" element={<AuctionList />} />
        <Route path="/auction/:id" element={<AuctionRoom />} />
        <Route
          path="/artist"
          element={
            <Protected roles={['artist']}>
              <Artist />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected roles={['admin']}>
              <Admin />
            </Protected>
          }
        />
        <Route
          path="/buyer"
          element={
            <Protected roles={['buyer']}>
              <Buyer />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
