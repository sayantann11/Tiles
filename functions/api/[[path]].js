// Cloudflare Pages Function: every /api/* request goes to the shared handler.
import { handle } from '../../server/app.js';
export const onRequest = ({ request, env }) => handle(request, env);
