/**
 * Browse gate: private hosts refuse, extraction grids honestly.
 *
 * Run: deno test supabase/functions/_shared/browse.test.ts
 */

import { checkHost, extractPage } from "./browse.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

Deno.test("private and local hosts refuse with reasons", () => {
  for (const h of [
    "localhost", "127.0.0.1", "10.0.0.5", "172.16.4.2", "172.31.255.1",
    "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "x.local",
    "y.internal", "metadata.google.internal",
  ]) {
    check(checkHost(h) !== null, `refused: ${h}`);
  }
  check(checkHost("example.com") === null, "public host allowed");
  check(checkHost("192.0.2.44") === null, "documentation range passes pattern gate");
});

Deno.test("extraction grids links absolute, skips traps, flags passwords", () => {
  const html = `<html><head><title>Shop Supplies</title></head><body>
    <h1>Catalog</h1>
    <a href="/items/1">Blue pens</a>
    <a href="https://pay.example.com/checkout">Pay now</a>
    <a href="javascript:steal()">x</a>
    <a href="#top">top</a>
    <a href="mailto:a@b.c">mail</a>
    <form action="/login" method="post">
      <input name="user"><input type="password" name="pw">
    </form>
    <script>var evil = 1;</script>
  </body></html>`;
  const page = extractPage(html, "https://shop.example.com/cat");
  check(page.title === "Shop Supplies", "title read");
  check(page.text.includes("Catalog") && page.text.includes("Blue pens"), "text kept");
  check(!page.text.includes("evil"), "scripts stripped");
  check(page.links.length === 2, "only real links kept");
  check(page.links[0].url === "https://shop.example.com/items/1", "relative resolved absolute");
  check(page.links[0].n === 1 && page.links[1].n === 2, "links numbered");
  check(page.forms.length === 1 && page.forms[0].method === "post", "form read, not submitted");
  check(page.forms[0].inputs.some((i) => i.includes("never filled")), "password flagged");
});
