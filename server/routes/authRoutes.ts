// Absorbed from server/routes.ts: /api/auth/* endpoints (login, logout, me)

import { Router } from "express";
import { pool } from "../db";

const router = Router();

async function isValidToken(token: string): Promise<boolean> {
  try {
    const result = await pool.query(
      "SELECT sess FROM session WHERE sid = $1 AND expire > NOW()",
      [token]
    );
    if (result.rows.length === 0) return false;
    const sess = result.rows[0].sess;
    return sess?.authenticated === true;
  } catch {
    return false;
  }
}

router.get("/auth/me", async (req, res) => {
  if (req.session?.authenticated) {
    return res.json({ authenticated: true });
  }
  const token = req.headers["x-auth-token"] as string | undefined;
  if (token && await isValidToken(token)) {
    return res.json({ authenticated: true });
  }
  res.status(401).json({ authenticated: false });
});

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  const validUsername = process.env.AUTH_USERNAME;
  const validPassword = process.env.AUTH_PASSWORD;
  if (!validUsername || !validPassword) {
    return res.status(500).json({ message: "Auth credentials not configured. Set AUTH_USERNAME and AUTH_PASSWORD secrets." });
  }
  if (username === validUsername && password === validPassword) {
    req.session.authenticated = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ message: "Session save failed" });
      res.json({ ok: true, token: req.session.id });
    });
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

export { isValidToken };
export default router;
