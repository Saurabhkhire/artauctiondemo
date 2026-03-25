import express from 'express';
import cors from 'cors';
import path from 'path';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db, initDb } from './db.js';
import { signToken, requireAuth, requireRole, authOptional } from './middleware/auth.js';
import {
  refreshAllAuctions,
  refreshAuctionRow,
  getCurrentHighBidAsync,
  sumWinningCommitment,
  finalizeAuction,
} from './auctionEngine.js';

/** DB value when there is no per-lot bid cap (only buyer budget / virtual balance apply) */
const LOT_BID_NO_CEILING = 1e15;
const LOT_CEILING_ENFORCED_BELOW = 1e14;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// If the React app is built (client/dist), serve it from the same server.
// This enables “single-host” deployments (one domain for UI + API).
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

app.use((_req, res, next) => {
  try {
    void refreshAllAuctions();
  } catch (e) {
    console.error('refreshAllAuctions:', e);
  }
  next();
});

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ——— Auth ———
app.post(
  '/api/register',
  asyncHandler(async (req, res) => {
    const { name, email, password, role, use_stripe_future, stripe_placeholder } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (!['artist', 'buyer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const hash = await bcrypt.hash(password, 10);
    const stripeFlag = use_stripe_future ? 1 : 0;
    try {
      const r = await db.run(
        `INSERT INTO users (name,email,password_hash,role,virtual_balance,use_stripe_future,stripe_placeholder)
         VALUES (?,?,?,?,?,?,?)`,
        [name, email.toLowerCase().trim(), hash, role, 0, stripeFlag, stripe_placeholder || null]
      );
      const newId = db.dialect === 'sqlite' ? r.lastInsertRowid : r.rows?.[0]?.id;
      const user = await db.get(
        `SELECT id,name,email,role,virtual_balance,use_stripe_future FROM users WHERE id = ?`,
        [newId]
      );
      const token = signToken({ id: user.id, role: user.role });
      res.json({ user, token });
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
      console.error('register:', e);
      return res.status(500).json({ error: 'Registration failed' });
    }
  })
);

app.post(
  '/api/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
    const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signToken({ id: user.id, role: user.role });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        virtual_balance: user.virtual_balance,
        use_stripe_future: user.use_stripe_future,
      },
    });
  })
);

app.get('/api/me', requireAuth, (req, res) => {
  (async () => {
    const user = await db.get(
      `SELECT id,name,email,role,virtual_balance,use_stripe_future,stripe_placeholder FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

// ——— Arts (artist) ———
app.get('/api/arts/mine', requireAuth, requireRole('artist'), (req, res) => {
  (async () => {
    const rows = await db.all(
      `SELECT id,title,description,image_path,status,created_at FROM arts WHERE artist_id = ? ORDER BY id DESC`,
      [req.user.id]
    );
    res.json(rows);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

app.get('/api/admin/artists', requireAuth, requireRole('admin'), (_req, res) => {
  (async () => {
    const rows = await db.all(`SELECT id, name, email FROM users WHERE role = 'artist' ORDER BY name`, []);
    res.json(rows);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

app.post('/api/arts', requireAuth, requireRole('artist', 'admin'), upload.single('image'), (req, res) => {
  (async () => {
    let artistUserId = req.user.id;
    if (req.user.role === 'admin') {
      const aid = Number(req.body.artist_id);
      if (!aid) return res.status(400).json({ error: 'Choose an artist to attach this work to' });
      const artist = await db.get(`SELECT id, role FROM users WHERE id = ?`, [aid]);
      if (!artist || artist.role !== 'artist') return res.status(400).json({ error: 'Invalid artist' });
      artistUserId = aid;
    }
    const row = await db.get(`SELECT COUNT(*) as c FROM arts WHERE artist_id = ?`, [artistUserId]);
    const count = Number(row?.c ?? 0);
    if (count >= 10) return res.status(400).json({ error: 'Maximum of 10 artworks per artist' });
    const title = (req.body.title || '').trim();
    const description = (req.body.description || '').trim();
    if (!title) return res.status(400).json({ error: 'Title required' });
    if (!req.file) return res.status(400).json({ error: 'Image required' });
    const rel = `/uploads/${req.file.filename}`;
    const r = await db.run(
      `INSERT INTO arts (artist_id,title,description,image_path,status) VALUES (?,?,?,?, 'available')`,
      [artistUserId, title, description, rel]
    );
    const newId = db.dialect === 'sqlite' ? r.lastInsertRowid : r.rows?.[0]?.id;
    const art = await db.get(`SELECT * FROM arts WHERE id = ?`, [newId]);
    res.json(art);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

// Admin: arts available to add to a new auction
app.get('/api/arts/selectable', requireAuth, requireRole('admin'), (_req, res) => {
  (async () => {
    const rows = await db.all(
      `SELECT a.id,a.title,a.description,a.image_path,a.status,u.name as artist_name
       FROM arts a JOIN users u ON u.id = a.artist_id
       WHERE a.status = 'available'
       ORDER BY a.id DESC`,
      []
    );
    res.json(rows);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

// ——— Admin management ———
app.get('/api/admin/users', requireAuth, requireRole('admin'), (req, res) => {
  (async () => {
    const rows = await db.all(
      `SELECT id,name,email,role,virtual_balance,created_at FROM users ORDER BY created_at DESC`,
      []
    );
    res.json(rows);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

app.delete('/api/admin/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  (async () => {
    const targetId = Number(req.params.id);
    if (!targetId) return res.status(400).json({ error: 'Invalid user id' });
    if (Number(req.user.id) === targetId) return res.status(400).json({ error: 'You cannot delete yourself' });

    const target = await db.get(`SELECT id, role FROM users WHERE id = ?`, [targetId]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    await db.transaction(async (tx) => {
      // Delete buyer-related rows
      await tx.run(`DELETE FROM bids WHERE user_id = ?`, [targetId]);
      await tx.run(`DELETE FROM auction_registrations WHERE user_id = ?`, [targetId]);
      await tx.run(`DELETE FROM art_sales WHERE buyer_id = ?`, [targetId]);

      // If artist, delete their arts and related rows
      if (target.role === 'artist') {
        const arts = await tx.all(`SELECT id,status FROM arts WHERE artist_id = ?`, [targetId]);
        for (const a of arts) {
          await tx.run(`DELETE FROM bids WHERE art_id = ?`, [a.id]);
          await tx.run(`DELETE FROM auction_arts WHERE art_id = ?`, [a.id]);
          await tx.run(`DELETE FROM art_sales WHERE art_id = ?`, [a.id]);
          await tx.run(`DELETE FROM arts WHERE id = ?`, [a.id]);
        }
      }

      // If admin, delete auctions they created (best-effort cleanup)
      if (target.role === 'admin') {
        const auctions = await tx.all(`SELECT id FROM auctions WHERE created_by = ?`, [targetId]);
        for (const au of auctions) {
          // revert any in-auction arts back to available
          const lots = await tx.all(`SELECT art_id FROM auction_arts WHERE auction_id = ?`, [au.id]);
          for (const l of lots) {
            await tx.run(`UPDATE arts SET status = 'available' WHERE id = ? AND status = 'in_auction'`, [l.art_id]);
          }
          await tx.run(`DELETE FROM bids WHERE auction_id = ?`, [au.id]);
          await tx.run(`DELETE FROM auction_registrations WHERE auction_id = ?`, [au.id]);
          await tx.run(`DELETE FROM auction_arts WHERE auction_id = ?`, [au.id]);
          await tx.run(`DELETE FROM auctions WHERE id = ?`, [au.id]);
        }
      }

      await tx.run(`DELETE FROM users WHERE id = ?`, [targetId]);
    });

    res.json({ ok: true });
  })().catch((e) => res.status(500).json({ error: e.message }));
});

app.get('/api/admin/arts', requireAuth, requireRole('admin'), (req, res) => {
  (async () => {
    const rows = await db.all(
      `SELECT a.id,a.title,a.status,a.image_path,a.artist_id,u.name as artist_name
       FROM arts a JOIN users u ON u.id = a.artist_id
       ORDER BY a.id DESC`,
      []
    );
    res.json(rows);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

app.delete('/api/admin/arts/:id', requireAuth, requireRole('admin'), (req, res) => {
  (async () => {
    const artId = Number(req.params.id);
    if (!artId) return res.status(400).json({ error: 'Invalid art id' });

    await db.transaction(async (tx) => {
      await tx.run(`DELETE FROM bids WHERE art_id = ?`, [artId]);
      await tx.run(`DELETE FROM auction_arts WHERE art_id = ?`, [artId]);
      await tx.run(`DELETE FROM art_sales WHERE art_id = ?`, [artId]);
      await tx.run(`DELETE FROM arts WHERE id = ?`, [artId]);
    });
    res.json({ ok: true });
  })().catch((e) => res.status(500).json({ error: e.message }));
});

app.patch('/api/admin/arts/:id/status', requireAuth, requireRole('admin'), (req, res) => {
  (async () => {
    const artId = Number(req.params.id);
    const status = String(req.body?.status || '');
    if (!artId) return res.status(400).json({ error: 'Invalid art id' });
    if (!['available', 'sold', 'in_auction'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    // Allow “sold → available” to resell: remove sale record and mark available.
    await db.transaction(async (tx) => {
      if (status === 'available') {
        await tx.run(`DELETE FROM art_sales WHERE art_id = ?`, [artId]);
      }
      await tx.run(`UPDATE arts SET status = ? WHERE id = ?`, [status, artId]);
    });
    const art = await db.get(`SELECT id,title,status,image_path FROM arts WHERE id = ?`, [artId]);
    res.json(art);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

// ——— Auctions ———
app.post('/api/auctions', requireAuth, requireRole('admin'), (req, res) => {
  (async () => {
    const { name, description, start_at, end_at, lots } = req.body || {};
    if (!name || !start_at || !end_at || !Array.isArray(lots) || lots.length === 0) {
      return res.status(400).json({ error: 'Invalid auction payload' });
    }
    const start = new Date(start_at);
    const end = new Date(end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'Invalid dates' });
    }

    const auctionId = await db.transaction(async (tx) => {
      const ar = await tx.run(
        `INSERT INTO auctions (name,description,start_at,end_at,created_by,status) VALUES (?,?,?,?, ?, 'scheduled')`,
        [name, description || '', start.toISOString(), end.toISOString(), req.user.id]
      );
      const createdId = tx.dialect === 'sqlite' ? ar.lastInsertRowid : ar.rows?.[0]?.id;
      for (const lot of lots) {
        const artId = lot.art_id;
        const starting_bid = Number(lot.starting_bid ?? 0);
        if (!artId || !Number.isFinite(starting_bid) || starting_bid < 0) {
          throw new Error('Invalid lot or opening bid');
        }
        let max_bid_allowed = LOT_BID_NO_CEILING;
        if (lot.max_bid_allowed != null && lot.max_bid_allowed !== '') {
          const m = Number(lot.max_bid_allowed);
          if (!Number.isFinite(m) || m <= 0) throw new Error('Invalid lot ceiling');
          max_bid_allowed = m;
        }
        if (starting_bid > max_bid_allowed) throw new Error('Opening bid cannot exceed lot ceiling');
        const art = await tx.get(`SELECT status FROM arts WHERE id = ?`, [artId]);
        if (!art || art.status !== 'available') throw new Error('Art not available');
        const ch = await tx.run(`UPDATE arts SET status = 'in_auction' WHERE id = ? AND status = 'available'`, [artId]);
        const changes = ch.changes ?? ch.rowCount ?? 0;
        if (changes !== 1) throw new Error('Art not available');
        await tx.run(
          `INSERT INTO auction_arts (auction_id,art_id,starting_bid,max_bid_allowed) VALUES (?,?,?,?)`,
          [createdId, artId, starting_bid, max_bid_allowed]
        );
      }
      return createdId;
    });

    const auction = await db.get(`SELECT * FROM auctions WHERE id = ?`, [auctionId]);
    res.json(auction);
  })().catch((e) => res.status(400).json({ error: e.message || 'Could not create auction' }));
});

app.get('/api/auctions', authOptional, (req, res) => {
  (async () => {
    await refreshAllAuctions();
    const rows = await db.all(`SELECT * FROM auctions ORDER BY start_at DESC`, []);
    const mapped = rows.map((a) => refreshAuctionRow({ ...a }));
    if (req.user?.role === 'buyer') {
      const regs = await db.all(`SELECT auction_id, budget_cap FROM auction_registrations WHERE user_id = ?`, [
        req.user.id,
      ]);
      const byAuction = Object.fromEntries(regs.map((r) => [r.auction_id, { budget_cap: r.budget_cap }]));
      return res.json(
        mapped.map((a) => ({
          ...a,
          my_registration: byAuction[a.id] ?? null,
        }))
      );
    }
    res.json(mapped);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

app.get('/api/auctions/:id', authOptional, (req, res) => {
  (async () => {
    await refreshAllAuctions();
    let auction = await db.get(`SELECT * FROM auctions WHERE id = ?`, [Number(req.params.id)]);
    if (!auction) return res.status(404).json({ error: 'Not found' });
    auction = refreshAuctionRow({ ...auction });
    if (auction.status === 'ended') finalizeAuction(auction.id);

    const lots = await db.all(
      `SELECT aa.art_id, aa.starting_bid, aa.max_bid_allowed,
              ar.title, ar.description, ar.image_path, ar.artist_id,
              u.name as artist_name
       FROM auction_arts aa
       JOIN arts ar ON ar.id = aa.art_id
       JOIN users u ON u.id = ar.artist_id
       WHERE aa.auction_id = ?`,
      [auction.id]
    );

    const items = [];
    for (const lot of lots) {
      const hi = await getCurrentHighBidAsync(auction.id, lot.art_id);
      const capped = Number(lot.max_bid_allowed) < LOT_CEILING_ENFORCED_BELOW;
      items.push({
        art_id: lot.art_id,
        title: lot.title,
        description: lot.description,
        image_path: lot.image_path,
        artist_name: lot.artist_name,
        starting_bid: Number(lot.starting_bid),
        max_bid_allowed: capped ? Number(lot.max_bid_allowed) : null,
        current_bid: hi?.amount != null ? Number(hi.amount) : null,
        current_bidder_id: hi?.user_id ?? null,
        current_bidder_name: hi?.bidder_name ?? null,
      });
    }

    const reg = req.user
      ? await db.get(`SELECT * FROM auction_registrations WHERE auction_id = ? AND user_id = ?`, [
          auction.id,
          req.user.id,
        ])
      : null;

    res.json({ auction, items, my_registration: reg });
  })().catch((e) => res.status(500).json({ error: e.message }));
});

// Buyer: register for auction with price cap (budget for winning bids total)
app.post('/api/auctions/:id/register', requireAuth, requireRole('buyer'), (req, res) => {
  (async () => {
    await refreshAllAuctions();
    const auctionId = Number(req.params.id);
    const auction = await db.get(`SELECT * FROM auctions WHERE id = ?`, [auctionId]);
    if (!auction) return res.status(404).json({ error: 'Not found' });
    refreshAuctionRow(auction);
    if (auction.status !== 'scheduled') {
      return res.status(400).json({ error: 'Registration only before auction starts' });
    }
    const now = new Date();
    if (now >= new Date(auction.start_at)) {
      return res.status(400).json({ error: 'Auction already started' });
    }

    const budget_cap = Number(req.body?.budget_cap);
    if (!budget_cap || budget_cap <= 0) return res.status(400).json({ error: 'Invalid budget cap' });

    // Buyer does not set virtual balance at registration. First auction registration sets their balance.
    const user = await db.get(`SELECT virtual_balance FROM users WHERE id = ?`, [req.user.id]);
    const currentBalance = Number(user?.virtual_balance ?? 0);
    if (currentBalance <= 0) {
      await db.run(`UPDATE users SET virtual_balance = ? WHERE id = ?`, [budget_cap, req.user.id]);
    } else if (budget_cap > currentBalance) {
      return res.status(400).json({ error: 'Budget cap cannot exceed your virtual balance' });
    }

    try {
      await db.run(`INSERT INTO auction_registrations (auction_id,user_id,budget_cap) VALUES (?,?,?)`, [
        auctionId,
        req.user.id,
        budget_cap,
      ]);
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'Already registered' });
      console.error('auction register:', e);
      return res.status(500).json({ error: 'Could not register for auction' });
    }
    const reg = await db.get(`SELECT * FROM auction_registrations WHERE auction_id = ? AND user_id = ?`, [
      auctionId,
      req.user.id,
    ]);
    res.json(reg);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

app.post('/api/auctions/:id/bid', requireAuth, requireRole('buyer'), (req, res) => {
  (async () => {
    await refreshAllAuctions();
    const auctionId = Number(req.params.id);
    const { art_id, amount } = req.body || {};
    const bidAmount = Number(amount);
    const artId = Number(art_id);
    if (!artId || !bidAmount || bidAmount <= 0) return res.status(400).json({ error: 'Invalid bid' });

    const auction = await db.get(`SELECT * FROM auctions WHERE id = ?`, [auctionId]);
    if (!auction) return res.status(404).json({ error: 'Not found' });
    refreshAuctionRow(auction);
    if (auction.status !== 'live') {
      return res.status(400).json({ error: 'Auction is not live' });
    }

    const lot = await db.get(`SELECT * FROM auction_arts WHERE auction_id = ? AND art_id = ?`, [auctionId, artId]);
    if (!lot) return res.status(404).json({ error: 'Art not in this auction' });

    const reg = await db.get(`SELECT * FROM auction_registrations WHERE auction_id = ? AND user_id = ?`, [
      auctionId,
      req.user.id,
    ]);
    if (!reg) return res.status(403).json({ error: 'You must pre-register for this auction' });

    if (Number(lot.max_bid_allowed) < LOT_CEILING_ENFORCED_BELOW && bidAmount > Number(lot.max_bid_allowed)) {
      return res.status(400).json({ error: `Bid cannot exceed ceiling of ${lot.max_bid_allowed}` });
    }

    const hi = await getCurrentHighBidAsync(auctionId, artId);
    const base = hi ? Number(hi.amount) : Number(lot.starting_bid);
    const increment = hi ? Math.max(0.01, Math.ceil(base * 0.1 * 100) / 100) : 0;
    const minBid = hi ? base + increment : base;

    if (bidAmount < minBid - 1e-9) {
      return res.status(400).json({
        error: hi
          ? `Bid must be at least ${minBid.toFixed(2)} (10% increment)`
          : `Opening bid at least ${minBid.toFixed(2)}`,
      });
    }

    const user = await db.get(`SELECT virtual_balance FROM users WHERE id = ?`, [req.user.id]);
    const prevWin = hi && Number(hi.user_id) === Number(req.user.id) ? Number(hi.amount) : 0;
    const currentSum = await sumWinningCommitment(auctionId, req.user.id);
    const newSum = currentSum - prevWin + bidAmount;
    if (newSum > Number(reg.budget_cap) + 1e-9) {
      return res.status(400).json({ error: 'Bid would exceed your registered budget cap for this auction' });
    }
    if (newSum > Number(user.virtual_balance) + 1e-9) {
      return res.status(400).json({ error: 'Not enough virtual balance for this commitment' });
    }

    await db.run(`INSERT INTO bids (auction_id,art_id,user_id,amount) VALUES (?,?,?,?)`, [
      auctionId,
      artId,
      req.user.id,
      bidAmount,
    ]);

    const fresh = await getCurrentHighBidAsync(auctionId, artId);
    res.json({ ok: true, current_bid: Number(fresh.amount), current_bidder_name: fresh.bidder_name });
  })().catch((e) => res.status(500).json({ error: e.message }));
});

app.get('/api/me/purchases', requireAuth, requireRole('buyer'), (req, res) => {
  (async () => {
    await refreshAllAuctions();
    const buyerId = Number(req.user.id);
    const rows = await db.all(
      `SELECT s.id, s.auction_id, s.art_id, s.buyer_id, s.final_price, s.created_at,
              a.title, a.description, a.image_path, au.name as auction_name
       FROM art_sales s
       JOIN arts a ON a.id = s.art_id
       JOIN auctions au ON au.id = s.auction_id
       WHERE s.buyer_id = ?
       ORDER BY s.id DESC`,
      [buyerId]
    );
    res.json(rows);
  })().catch((e) => res.status(500).json({ error: e.message }));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Server error' });
});

// SPA fallback (only when client/dist is present)
if (fs.existsSync(clientDist)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

await initDb();

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`Art auction API on http://${HOST}:${PORT}`);
});
