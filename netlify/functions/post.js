// netlify/functions/post.js — Netlify Serverless Function handler for /api/post
import handler from '../../api/post.js';

export default async (req, context) => {
    let statusCode = 200;
    let headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    };
    let body = '';

    const mockRes = {
        setHeader(k, v) { headers[k] = v; return mockRes; },
        status(code) { statusCode = code; return mockRes; },
        json(data) { body = JSON.stringify(data); return mockRes; },
        end() { return mockRes; }
    };

    const url = new URL(req.url);
    const query = Object.fromEntries(url.searchParams);
    const mockReq = { method: req.method, query };

    await handler(mockReq, mockRes);

    return new Response(body, { status: statusCode, headers });
};
