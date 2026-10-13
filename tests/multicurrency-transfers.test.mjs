import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createBankingApp } from '../services/banking/src/app.ts';
import { migrate } from '../packages/shared/db.ts';
import { transferFee } from '../services/banking/src/transfer-fees.ts';
test('Foreign currency fees use 5 and 1 units without changing RUB fees', () => {
    for (const currency of ['RUB', 'USD', 'EUR']) {
        const standard = transferFee({ premium: false, plan: 'standard', expiresAt: null }, currency);
        const plus = transferFee({ premium: true, plan: 'plus', expiresAt: new Date(Date.now() + 86400000).toISOString() }, currency);
        assert.equal(standard.currency, currency);
        assert.equal(standard.feeMinor, currency === 'RUB' ? '50000' : '500');
        assert.equal(plus.currency, currency);
        assert.equal(plus.feeMinor, currency === 'RUB' ? '10000' : '100');
    }
});
test('Real PostgreSQL transfers preserve currencies, balances and replay', { skip: !process.env.TEST_BANKING_DATABASE_URL }, async (t) => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_BANKING_DATABASE_URL });
    await pool.query('CREATE SCHEMA IF NOT EXISTS banking');
    await migrate(pool, new URL('../services/banking/migrations/001-initial.sql', import.meta.url));
    const users = [{ id: randomUUID(), name: 'Егор Проверка', phone: '+79001234567' }, { id: randomUUID(), name: 'Никита Проверка', phone: '+79007654321' }];
    let premium = false;
    const app = createBankingApp(pool, { async snapshot() { return { version: 'test', rates: { USD: 80, EUR: 90 } }; } }, { async resolve(lookup) { const u = users.find(u => 'id' in lookup ? u.id === lookup.id : u.phone === lookup.phone); if (!u)
            throw Error('No fixture user'); return u; } }, { async current() { return { premium, plan: premium ? 'plus' : 'standard', expiresAt: premium ? new Date(Date.now() + 86400000).toISOString() : null }; } });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const request = async (user, path, body, key) => { const r = await fetch('http://127.0.0.1:' + server.address().port + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Internal-Token': process.env.INTERNAL_TOKEN || 'cardo-local-internal', 'X-User-Id': user.id, 'X-User-Name': encodeURIComponent(user.name), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, data: await r.json() }; };
    const allCards = [];
    for (const u of users)
        allCards.push((await request(u, '/api/cards')).data);
    const balance = async (user, currency) => BigInt((await pool.query('SELECT balance_minor FROM banking.accounts WHERE user_id=$1 AND currency=$2', [user.id, currency])).rows[0].balance_minor);
    const recipients = {};
    t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }); const c = await pool.connect(); try {
        await c.query('BEGIN');
        for (const table of ['recipients', 'outbox', 'receipts', 'transactions', 'limits', 'cards', 'accounts', 'workspaces'])
            await c.query('DELETE FROM banking.' + table + ' WHERE user_id=ANY($1::uuid[])', [users.map(u => u.id)]);
        await c.query('COMMIT');
    }
    finally {
        c.release();
        await pool.end();
    } });
    for (const plus of [false, true])
        for (const currency of ['RUB', 'USD', 'EUR'])
            await t.test(currency + ' ' + (plus ? 'plus' : 'standard'), async () => {
                premium = plus;
                const fee = currency === 'RUB' ? (plus ? 10000n : 50000n) : (plus ? 100n : 500n);
                const quote = await request(users[0], '/api/transfer/fee?currency=' + currency);
                assert.equal(quote.status, 200);
                assert.equal(quote.data.currency, currency);
                assert.equal(quote.data.feeMinor, String(fee));
                const recipient = await request(users[0], '/api/recipients/resolve', { phone: users[1].phone, currency });
                assert.equal(recipient.status, 200);
                assert.equal(recipient.data.currency, currency);
                recipients[currency] = recipient.data;
                const otherBalances = {};
                for (const cur of ['RUB', 'USD', 'EUR'].filter(c => c !== currency))
                    otherBalances[cur] = await balance(users[0], cur);
                await pool.query('UPDATE banking.accounts SET balance_minor=CASE WHEN user_id=$1 THEN 100000 ELSE 0 END WHERE user_id=ANY($2::uuid[]) AND currency=$3', [users[0].id, users.map(u => u.id), currency]);
                const card = allCards[0].find(c => c.code === currency), key = randomUUID(), body = { cardId: card.id, recipientId: recipient.data.id, amount: '25.50' };
                const sent = await request(users[0], '/api/transfer', body, key);
                assert.equal(sent.status, 200, JSON.stringify(sent.data));
                assert.equal(sent.data.currency, currency);
                assert.equal(sent.data.feeMinor, String(fee));
                assert.equal(sent.data.totalDebitMinor, String(2550n + fee));
                assert.equal(await balance(users[0], currency), 100000n - 2550n - fee);
                assert.equal(await balance(users[1], currency), 2550n);
                for (const [cur, b] of Object.entries(otherBalances))
                    assert.equal(await balance(users[0], cur), b);
                const feeRow = (await pool.query('SELECT currency,amount_minor FROM banking.transactions WHERE user_id=$1 AND id=$2', [users[0].id, sent.data.feeOperationId])).rows[0];
                assert.equal(feeRow.currency, currency);
                assert.equal(BigInt(feeRow.amount_minor), -fee);
                const replay = await request(users[0], '/api/transfer', body, key);
                assert.deepEqual(replay, sent);
                assert.equal(await balance(users[1], currency), 2550n);
                const event = (await pool.query('SELECT payload FROM banking.outbox WHERE user_id=$1 AND payload->\'payload\'->>\'transferId\'=$2', [users[0].id, sent.data.transferId])).rows[0].payload;
                assert.equal(event.payload.currency, currency);
            });
    await t.test('Phone recipients remain separate by currency', async () => { assert.equal(new Set(Object.values(recipients).map(r => r.id)).size, 3); });
    await t.test('Card lookup derives currency and rejects an explicit mismatch', async () => { const card = allCards[1].find(c => c.code === 'EUR'), number = (await pool.query('SELECT number FROM banking.cards WHERE user_id=$1 AND id=$2', [users[1].id, card.id])).rows[0].number; const r = await request(users[0], '/api/recipients/resolve', { cardNumber: number }); assert.equal(r.status, 200); assert.equal(r.data.currency, 'EUR'); assert.equal((await request(users[0], '/api/recipients/resolve', { cardNumber: number, currency: 'USD' })).status, 422); });
    await t.test('Mismatched currencies, frozen cards and insufficient funds do not change balances', async () => {
        const card = allCards[0].find(c => c.code === 'USD');
        let before = await balance(users[0], 'USD');
        const mismatch = await request(users[0], '/api/transfer', { cardId: card.id, recipientId: recipients.EUR.id, amount: '10' }, randomUUID());
        assert.equal(mismatch.status, 422);
        assert.equal(await balance(users[0], 'USD'), before);
        await request(users[0], '/api/cards/' + card.id + '/freeze', { frozen: true });
        assert.equal((await request(users[0], '/api/transfer', { cardId: card.id, recipientId: recipients.USD.id, amount: '10' }, randomUUID())).status, 409);
        assert.equal(await balance(users[0], 'USD'), before);
        await request(users[0], '/api/cards/' + card.id + '/freeze', { frozen: false });
        await pool.query('UPDATE banking.accounts SET balance_minor=1099 WHERE user_id=$1 AND currency=\'USD\'', [users[0].id]);
        assert.equal((await request(users[0], '/api/transfer', { cardId: card.id, recipientId: recipients.USD.id, amount: '10' }, randomUUID())).status, 409);
        assert.equal(await balance(users[0], 'USD'), 1099n);
    });
    await t.test('Unknown currencies are rejected by lookup and quote', async () => { assert.equal((await request(users[0], '/api/transfer/fee?currency=CHF')).status, 422); assert.equal((await request(users[0], '/api/recipients/resolve', { phone: users[1].phone, currency: 'CHF' })).status, 422); });
});
