import { db } from './db.js';

export function refreshAuctionRow(auction) {
  const now = new Date();
  const start = new Date(auction.start_at);
  const end = new Date(auction.end_at);
  let status = auction.status;
  if (now < start) status = 'scheduled';
  else if (now >= start && now < end) status = 'live';
  else status = 'ended';

  if (status !== auction.status) {
    // Best-effort; don't block request paths on status refresh
    void db.run(`UPDATE auctions SET status = ? WHERE id = ?`, [status, auction.id]);
    auction.status = status;
  }
  return auction;
}

export function getCurrentHighBid(auctionId, artId) {
  // Note: kept synchronous API shape for callers; internally uses async db.get
  // Callers of getCurrentHighBid in routes are already async and should await getCurrentHighBidAsync.
  throw new Error('Use getCurrentHighBidAsync');
}

/** Sum of amounts where user is current high bidder on each lot in auction */
export async function getCurrentHighBidAsync(auctionId, artId) {
  const row = await db.get(
    `SELECT b.amount, b.user_id, u.name as bidder_name
     FROM bids b
     JOIN users u ON u.id = b.user_id
     WHERE b.auction_id = ? AND b.art_id = ?
     ORDER BY b.amount DESC, b.id DESC
     LIMIT 1`,
    [auctionId, artId]
  );
  return row || null;
}

export async function sumWinningCommitment(auctionId, userId) {
  const lots = await db.all(`SELECT art_id FROM auction_arts WHERE auction_id = ?`, [auctionId]);
  let sum = 0;
  for (const { art_id } of lots) {
    const hi = await getCurrentHighBidAsync(auctionId, art_id);
    if (hi && Number(hi.user_id) === Number(userId)) sum += Number(hi.amount);
  }
  return sum;
}

export function finalizeAuction(auctionId) {
  // fire-and-forget, but transactional internally
  void db
    .transaction(async (tx) => {
      let auction = await tx.get(`SELECT * FROM auctions WHERE id = ?`, [auctionId]);
      if (!auction || auction.finalized) return;
      refreshAuctionRow(auction);
      auction = await tx.get(`SELECT * FROM auctions WHERE id = ?`, [auctionId]);
      if (!auction || auction.status !== 'ended' || auction.finalized) return;

      const lots = await tx.all(`SELECT * FROM auction_arts WHERE auction_id = ?`, [auctionId]);

      for (const lot of lots) {
        const hi = await tx.get(
          `SELECT b.amount, b.user_id
           FROM bids b
           WHERE b.auction_id = ? AND b.art_id = ?
           ORDER BY b.amount DESC, b.id DESC
           LIMIT 1`,
          [auctionId, lot.art_id]
        );

        if (hi) {
          await tx.run(
            `INSERT INTO art_sales (auction_id, art_id, buyer_id, final_price) VALUES (?,?,?,?)`,
            [auctionId, lot.art_id, Number(hi.user_id), Number(hi.amount)]
          );
          await tx.run(`UPDATE arts SET status = 'sold' WHERE id = ?`, [lot.art_id]);
          await tx.run(`UPDATE users SET virtual_balance = virtual_balance - ? WHERE id = ?`, [
            Number(hi.amount),
            Number(hi.user_id),
          ]);
          const artist = await tx.get(`SELECT artist_id FROM arts WHERE id = ?`, [lot.art_id]);
          if (artist) {
            await tx.run(`UPDATE users SET virtual_balance = virtual_balance + ? WHERE id = ?`, [
              Number(hi.amount),
              Number(artist.artist_id),
            ]);
          }
        } else {
          await tx.run(`UPDATE arts SET status = 'available' WHERE id = ?`, [lot.art_id]);
        }
      }

      await tx.run(`UPDATE auctions SET finalized = 1, status = 'ended' WHERE id = ?`, [auctionId]);
    })
    .catch((e) => console.error('finalizeAuction', auctionId, e));
}

export async function refreshAllAuctions() {
  const rows = await db.all(`SELECT * FROM auctions WHERE finalized = 0`, []);
  for (const a of rows) {
    refreshAuctionRow(a);
    const end = new Date(a.end_at);
    if (new Date() >= end && a.status === 'ended') {
      finalizeAuction(a.id);
    }
  }
}
