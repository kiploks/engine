# Example: `mapPayloadToUnified` and CSV-first workflows

## Warning: normalization is not analysis

[`mapPayloadToUnified`](../packages/core/src/mapPayloadToUnified.ts) **only** normalizes known subtrees of a raw integration object (for example `backtestResult`, `walkForwardAnalysis` periods). It applies **decimal conversion** and **key alignment** where implemented.

It does **not**:

- run `analyze()`, `analyzeFromTrades()`, or `analyzeFromWindows()`,
- compute rankings, p-values, or summaries,
- invent missing trades or curves.

If you need numbers, call an **analysis entrypoint** after you have valid inputs. See **[`ENTRYPOINTS.md`](../ENTRYPOINTS.md)**.

---

## When to use `mapPayloadToUnified`

- Raw JSON from an integration uses **legacy or mixed** keys (`optimization_return` vs `optimizationReturn`, `walkForwardAnalysis` vs `wfaData`, etc.).
- You want a **single normalization pass** before your own code calls window-based analysis or other builders.

Authoritative types: [`UnifiedIntegrationPayload`](../packages/contracts/src/unifiedPayload.ts).

---

## When not to use it

- You already have a **`Trade[]`** or a small JSON list of trades - use **`analyze()`** or **`analyzeFromTrades()`** directly.
- You only have **CSV** - use adapters (below) first, then analysis entrypoints.

---

## CSV to trades (only external format in this guide)

From `@kiploks/engine-adapters`:

- **`csvToTrades(csvString, mapping)`** - whole file as a string in memory.
- **`csvToTradesFromStream(stream, mapping, options)`** - Node `Readable` stream; supports a **`maxTrades`** cap for large files (see [`packages/adapters/README.md`](../packages/adapters/README.md) and [`csvToTrades.ts`](../packages/adapters/src/csvToTrades.ts)).

**Performance tip:** For large CSVs, prefer **`csvToTradesFromStream`**; respect the row cap behavior documented in the adapter.

Then:

1. `analyze({ trades }, config)` for basic summary, or  
2. build [`TradeBasedWFAInput`](../packages/contracts/src/wfaAnalysisContract.ts) and call **`analyzeFromTrades()`** for public WFA.

---

## TypeScript sketch: `mapPayloadToUnified`

```typescript
import { mapPayloadToUnified } from "@kiploks/engine-core";

const raw = {
  walkForwardAnalysis: {
    periods: [
      {
        optimization_return: 0.12,
        validation_return: 0.09,
      },
    ],
  },
} as Record<string, unknown>;

const unified = mapPayloadToUnified(raw);
// Normalized periods include optimizationReturn / validationReturn as decimals per implementation.
```

Exact field aliases are defined in [`mapPayloadToUnified.ts`](../packages/core/src/mapPayloadToUnified.ts). Do not rely on undocumented keys.

---

## See also

- **[`ENTRYPOINTS.md`](../ENTRYPOINTS.md)** - full entrypoint map.  
- **[`examples/04-csv-to-trades.md`](examples/04-csv-to-trades.md)** - CSV column mapping examples.  
- **[`OPEN_CORE_INTEGRATION_PRINCIPLES.md`](../OPEN_CORE_INTEGRATION_PRINCIPLES.md)** - why there is no `runEverything()`.
