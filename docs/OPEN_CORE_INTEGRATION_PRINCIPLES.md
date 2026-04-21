# Open Core integration principles

This document explains **design choices** for `@kiploks/engine-core` public APIs. It is **not** a tutorial; for “what do I call?” see **[`ENTRYPOINTS.md`](ENTRYPOINTS.md)**.

## Why there is no single `runEverything()` function

A single catch-all entry point was **rejected** because:

1. **Dishonest behavior** - Missing inputs would force silent zeros, fake defaults, or a single object where every field is optional and nobody knows what triggers which block.

2. **Unstable contracts** - One mega-input type couples trades, WFA windows, equity curves, benchmark series, and adapter-specific blobs. Any change to one block would churn the whole type and every consumer.

3. **Explicit composition** - The engine exposes **named entrypoints** (`analyze`, `analyzeFromTrades`, `analyzeFromWindows`) and helpers (`mapPayloadToUnified`, benchmark helpers, etc.). Callers **compose** what they need and pass **only** the data each part requires.

4. **Honest optional blocks** - Optional sections use **`BlockResult`** with `available: false` and a **machine-readable `reason`** (`KiploksUnavailableReason` in [`packages/contracts/src/errors.ts`](../packages/contracts/src/errors.ts)) instead of pretending a block was computed.

**Contributors:** Do not add a mega-entrypoint without an ADR and a contract review. If you add a new block, extend the **appropriate** input contract and document why.

## Related

- **[`ENTRYPOINTS.md`](ENTRYPOINTS.md)** - entrypoint map and `mapPayloadToUnified` warning.  
- **[`OPEN_CORE_METHODOLOGY.md`](OPEN_CORE_METHODOLOGY.md)** - methodology scope and validation model.
