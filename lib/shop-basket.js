// lib/shop-basket.js - the secret in a saved-basket link is stored only as a hash (pure).
import { createHash } from 'node:crypto';

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
