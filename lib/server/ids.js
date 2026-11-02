// lib/server/ids.js - a new document with an explicit random id. Used instead of an automatic id, so a document is never
// written over another one, whichever database SDK is in use.
import { randomBytes } from 'node:crypto';
import { doc } from '../server-firestore.js';

export const newDocRef = (db, collectionName) => doc(db, collectionName, randomBytes(12).toString('hex'));
