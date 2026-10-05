// Test-only: lets plain Node resolve "next/server" the way Next's bundler does.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function resolve(s,c,n){ return n(s==='next/server'?'next/server.js':s,c); }"));
