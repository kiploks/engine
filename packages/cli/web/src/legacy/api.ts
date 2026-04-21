/** Same contract as the original inline UI: always parses JSON body, does not throw on HTTP errors. */
export const api = {
  get: (path: string): Promise<unknown> => fetch(path).then((r) => r.json() as Promise<unknown>),
  post: (path: string, body: unknown): Promise<unknown> =>
    fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(
      (r) => r.json() as Promise<unknown>,
    ),
  del: (path: string): Promise<unknown> => fetch(path, { method: "DELETE" }).then((r) => r.json() as Promise<unknown>),
};
