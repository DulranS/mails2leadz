#!/usr/bin/env node
// npm run setup:env - writes .env.example with every optional key, grouped by feature. Copy it to .env and fill in what you need.
import fs from 'node:fs';
import { envTemplate } from '../lib/setup-status.js';
fs.writeFileSync('.env.example', envTemplate());
console.log('Wrote .env.example. Copy it to .env and fill in the features you want.');
