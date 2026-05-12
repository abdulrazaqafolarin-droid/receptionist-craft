// Self-contained Supabase REST client using fetch()
// Replaces npm:@supabase/supabase-js for edge function deployment via Management API
// Supports all query patterns used by widget-chat

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "apikey": SERVICE_KEY,
    "Authorization": `Bearer ${SERVICE_KEY}`,
  };
}

type QueryResult<T> = { data: T | null; error: { message: string } | null };

// Makes any promise look like { data, error } for destructuring
function asResult<T>(promise: Promise<QueryResult<T>>): QueryResult<T> & Promise<QueryResult<T>> {
  const obj = promise as QueryResult<T> & Promise<QueryResult<T>>;
  return obj;
}

// ─── SELECT query builder ──────────────────────────────────────────────────

class SelectQuery<T = Record<string, unknown>> {
  private filters: Array<{ col: string; val: string; op?: string }> = [];
  private orderCol = "";
  private orderAsc = true;
  private limitVal = 0;

  constructor(
    private table: string,
    private columns: string,
  ) {}

  eq(col: string, val: string | number | boolean): this {
    this.filters.push({ col, val: String(val), op: "eq" });
    return this;
  }

  contains(col: string, val: Record<string, string>): this {
    this.filters.push({ col, val: JSON.stringify(val), op: "cs" });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }

  limit(n: number): this {
    this.limitVal = n;
    return this;
  }

  maybeSingle(): QueryResult<T> & Promise<QueryResult<T>> {
    this.limitVal = 1;
    return this.execute("maybe");
  }

  single(): QueryResult<T> & Promise<QueryResult<T>> {
    this.limitVal = 1;
    return this.execute("exact");
  }

  private execute(mode: "list" | "maybe" | "exact"): QueryResult<T> & Promise<QueryResult<T>> {
    const promise = (async (): Promise<QueryResult<T>> => {
      try {
        const params: Record<string, string> = { select: this.columns };
        for (const f of this.filters) {
          if (f.op === "cs") {
            params[f.col] = `cs.${f.val}`;
          } else {
            params[f.col] = `eq.${f.val}`;
          }
        }
        if (this.orderCol) params.order = `${this.orderCol}.${this.orderAsc ? "asc" : "desc"}`;
        if (this.limitVal > 0) params.limit = String(this.limitVal);
        const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
        const url = `${SUPABASE_URL}/rest/v1/${this.table}?${qs}`;
        const res = await fetch(url, { method: "GET", headers: authHeaders() });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          return { data: null, error: { message: `GET ${res.status}: ${txt}` } };
        }
        const json = (await res.json()) as T[];
        if (mode === "maybe") return { data: json[0] ?? null, error: null };
        if (mode === "exact") return json.length > 0 ? { data: json[0], error: null } : { data: null, error: { message: "Not found" } };
        return { data: json as unknown as T, error: null };
      } catch (err) {
        return { data: null, error: { message: String(err) } };
      }
    })();
    return asResult<T>(promise);
  }

  // Allow awaiting the query directly (returns T[])
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.execute("list");
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

// ─── Mutation query (INSERT / UPSERT) ─────────────────────────────────────

class MutationQuery {
  constructor(
    private table: string,
    private data: Record<string, unknown> | Record<string, unknown>[],
    private method: "POST",
    private prefer: string,
  ) {}

  then<TResult1 = QueryResult<Record<string, unknown>>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Record<string, unknown>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const promise = (async (): Promise<QueryResult<Record<string, unknown>>> => {
      try {
        const url = `${SUPABASE_URL}/rest/v1/${this.table}?select=*`;
        const res = await fetch(url, {
          method: this.method,
          headers: { ...authHeaders(), Prefer: this.prefer },
          body: JSON.stringify(this.data),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          return { data: null, error: { message: `${this.method} ${res.status}: ${txt}` } };
        }
        const json = (await res.json()) as Record<string, unknown>[];
        return { data: json[0] ?? null, error: null };
      } catch (err) {
        return { data: null, error: { message: String(err) } };
      }
    })();
    return promise.then(onfulfilled, onrejected);
  }
}

// ─── Table entry point ─────────────────────────────────────────────────────

class FromBuilder {
  constructor(private table: string) {}

  select(columns: string): SelectQuery {
    return new SelectQuery(this.table, columns);
  }

  insert(row: Record<string, unknown> | Record<string, unknown>[]): MutationQuery {
    return new MutationQuery(this.table, row, "POST", "return=representation");
  }

  upsert(row: Record<string, unknown>, opts?: { onConflict?: string }): MutationQuery {
    const prefer = opts?.onConflict
      ? `resolution=merge-duplicates,on_conflict=${opts.onConflict}`
      : "resolution=merge-duplicates";
    return new MutationQuery(this.table, row, "POST", prefer);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export const supabase = {
  from(table: string): FromBuilder {
    return new FromBuilder(table);
  },

  rpc: async <T = unknown>(fn: string, params: Record<string, unknown>): Promise<QueryResult<T>> => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return { data: null, error: { message: `RPC ${res.status}: ${txt}` } };
      }
      return { data: (await res.json()) as T, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  },
};

// Backward compat alias
export const db = supabase;

export type { QueryResult };
