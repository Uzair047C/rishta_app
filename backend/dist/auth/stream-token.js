"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamToken = streamToken;
const node_crypto_1 = require("node:crypto");
const b64url = (input) => Buffer.from(input).toString('base64url');
/**
 * Stream Chat HS256 user token. Hand-rolled rather than pulling in stream-chat's
 * server SDK for what is a 10-line JWT — the SDK's only other job here (creating
 * channels) happens client-side from the Flutter SDK.
 */
function streamToken(userId, ttlSeconds = 60 * 60 * 24) {
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiSecret)
        throw new Error('STREAM_API_SECRET not configured');
    const iat = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ user_id: userId, iat, exp: iat + ttlSeconds }));
    const signature = (0, node_crypto_1.createHmac)('sha256', apiSecret)
        .update(`${header}.${payload}`)
        .digest('base64url');
    return `${header}.${payload}.${signature}`;
}
//# sourceMappingURL=stream-token.js.map