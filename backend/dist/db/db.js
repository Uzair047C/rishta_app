"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Db = exports.Repo = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
/**
 * The read shapes every caller needs. Defined once here and inherited by both
 * Db and Repo, so the SQL-running code is not duplicated across them.
 */
class Reader {
    async all(sql, params = []) {
        return (await this.query(sql, params)).rows;
    }
    async one(sql, params = []) {
        return ((await this.query(sql, params)).rows[0] ?? null);
    }
    async count(sql, params = []) {
        const rows = (await this.query(sql, params)).rows;
        return Number(rows[0]?.n ?? 0);
    }
}
/**
 * Generic table gateway. One class serves every table: the only thing that
 * varies is the table name, so it is a constructor argument rather than a
 * subclass per entity.
 *
 * Table and column names are interpolated into SQL. That is safe because they
 * come from server-authored code — never from a request body.
 */
class Repo extends Reader {
    conn;
    table;
    constructor(conn, table) {
        super();
        this.conn = conn;
        this.table = table;
    }
    query(sql, params = []) {
        return this.conn.query(sql, params);
    }
    byId(id) {
        return this.one(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
    }
    /** INSERT built from the object's own keys — one path for every table. */
    async insert(dto) {
        const keys = Object.keys(dto);
        const cols = keys.map((k) => `"${k}"`).join(', ');
        const holes = keys.map((_, i) => `$${i + 1}`).join(', ');
        const row = await this.one(`INSERT INTO ${this.table} (${cols}) VALUES (${holes}) RETURNING *`, Object.values(dto));
        return row;
    }
    /** UPDATE built from the object's own keys. */
    async set(id, dto) {
        const keys = Object.keys(dto);
        if (!keys.length)
            return this.byId(id);
        const assignments = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
        return this.one(`UPDATE ${this.table} SET ${assignments} WHERE id = $1 RETURNING *`, [id, ...Object.values(dto)]);
    }
    async remove(id) {
        return (await this.query(`DELETE FROM ${this.table} WHERE id = $1`, [id])).rowCount ?? 0;
    }
}
exports.Repo = Repo;
let Db = class Db extends Reader {
    /** ponytail: fixed pool of 10. Raise max if p99 latency tracks pool wait. */
    pool = new pg_1.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
    });
    query(sql, params = []) {
        return this.pool.query(sql, params);
    }
    /** A table gateway, bound to a transaction connection when one is supplied. */
    repo(table, conn = this) {
        return new Repo(conn, table);
    }
    /** Runs fn in a transaction, rolling back on any throw. */
    async tx(fn) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const out = await fn(client);
            await client.query('COMMIT');
            return out;
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    onModuleDestroy() {
        return this.pool.end();
    }
};
exports.Db = Db;
exports.Db = Db = __decorate([
    (0, common_1.Injectable)()
], Db);
//# sourceMappingURL=db.js.map