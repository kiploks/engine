type Props = {
  title: string;
  message: string;
  detail?: string;
};

export function ApiErrorBanner({ title, message, detail }: Props) {
  return (
    <div
      className="rounded-panel border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
      role="alert"
    >
      <div className="font-semibold text-rose-100">{title}</div>
      <p className="mt-1 text-rose-200/90">{message}</p>
      {detail ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-rose-300/90">Details</summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-border bg-muted/20 p-2 text-xs text-rose-100">{detail}</pre>
        </details>
      ) : null}
    </div>
  );
}
