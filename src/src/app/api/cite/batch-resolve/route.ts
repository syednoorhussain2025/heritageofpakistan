import { NextResponse } from "next/server";

/**
 * Thin batch wrapper around your existing /api/cite/resolve route.
 * Accepts { inputs: string[] } and returns best+candidates per input.
 * No database writes; purely resolution.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const inputs: string[] = Array.isArray(body?.inputs) ? body.inputs : [];
    if (!inputs.length) {
      return NextResponse.json(
        { ok: false, error: "Missing 'inputs' (array of strings)." },
        { status: 400 }
      );
    }

    const base = new URL(req.url);
    const resolveURL = new URL("/api/cite/resolve", base).toString();

    // simple concurrency cap
    const MAX_CONC = 5;
    const results: any[] = [];
    let idx = 0;

    async function worker() {
      while (idx < inputs.length) {
        const i = idx++;
        const input = inputs[i];
        try {
          const r = await fetch(resolveURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input }),
          });
          if (!r.ok) {
            results[i] = {
              input,
              ok: false,
              error: `resolve failed (${r.status})`,
            };
            continue;
          }
          const data = await r.json();
          results[i] = { input, ok: true, ...data };
        } catch (e: any) {
          results[i] = {
            input,
            ok: false,
            error: e?.message || "resolve error",
          };
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(MAX_CONC, inputs.length) },
      worker
    );
    await Promise.all(workers);

    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Batch resolve failed." },
      { status: 500 }
    );
  }
}
