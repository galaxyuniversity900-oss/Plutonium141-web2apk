const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/function openDB\(\)\{[\s\S]*?\nfunction all\(/);
assert.ok(match, "openDB implementation must exist");
const openDBSource = match[0].replace(/\nfunction all\($/, "");
const stores = ["buildings", "apartments", "residents", "residenceHistory", "inventory", "stockMoves", "maintenance", "utilities", "transactions", "reminders", "meta"];

function fakeDb(existing = ["buildings"]) {
  const names = new Set(existing);
  return {
    closed: false,
    objectStoreNames: { contains: name => names.has(name) },
    createObjectStore(name) { names.add(name); },
    close() { this.closed = true; },
    names
  };
}

async function run(mode) {
  const messages = [];
  const db = fakeDb();
  const context = {
    DB_NAME: "omran-property-manager",
    DB_VERSION: 3,
    stores,
    toast: (message, type) => messages.push({ message, type }),
    indexedDB: {
      open() {
        const req = { result: db, error: new Error("simulated IndexedDB failure") };
        queueMicrotask(() => {
          if (mode === "blocked-timeout") {
            req.onblocked?.();
            return;
          }
          req.onupgradeneeded?.();
          if (mode === "blocked-success") req.onblocked?.();
          req.onsuccess?.();
        });
        return req;
      }
    },
    setTimeout,
    clearTimeout,
    Error
  };
  vm.createContext(context);
  vm.runInContext(openDBSource, context);
  try {
    const opened = await vm.runInContext("openDB()", context);
    return { opened, db, messages };
  } catch (error) {
    return { error, db, messages };
  }
}

(async () => {
  const normal = await run("success");
  assert.equal(normal.opened, normal.db, "successful open returns the DB connection");
  assert.ok(stores.every(name => normal.db.names.has(name)), "upgrade creates missing stores");
  assert.ok(normal.db.names.has("buildings"), "existing store remains present");

  const blocked = await run("blocked-success");
  assert.equal(blocked.opened, blocked.db, "a temporarily blocked request can later succeed");
  assert.ok(blocked.messages.some(x => x.message.includes("لن تُحذف بياناتك")), "blocked state explains data is preserved");

  const timeoutSource = openDBSource.replace("},20000);", "},20);");
  const timeoutContext = {
    DB_NAME: "omran-property-manager", DB_VERSION: 3, stores,
    toast: (message, type) => messages.push({ message, type }),
    indexedDB: { open() { const req = { result: db, error: new Error("simulated") }; queueMicrotask(() => req.onblocked?.()); return req; } },
    setTimeout, clearTimeout, Error
  };
  const messages = [];
  const db = fakeDb();
  timeoutContext.toast = (message, type) => messages.push({ message, type });
  vm.createContext(timeoutContext);
  vm.runInContext(timeoutSource, timeoutContext);
  let timeoutError;
  try { await vm.runInContext("openDB()", timeoutContext); } catch (e) { timeoutError = e; }
  assert.ok(timeoutError, "a request that remains blocked must reject after timeout");
  assert.ok(String(timeoutError.message).includes("لم يتم حذف البيانات"), "timeout explicitly protects existing data");

  const versionChange = await run("success");
  versionChange.opened.onversionchange();
  assert.equal(versionChange.db.closed, true, "versionchange closes the stale connection");
  assert.ok(versionChange.messages.some(x => x.message.includes("أعد تحميل")), "versionchange asks the user to reload");

  console.log("PASS: schema upgrade creates missing stores and preserves existing stores");
  console.log("PASS: blocked database request can recover when the other tab closes");
  console.log("PASS: blocked database request times out with a data-preservation message");
  console.log("PASS: version-change event closes stale connection and requests reload");
})().catch(error => { console.error(error); process.exitCode = 1; });
