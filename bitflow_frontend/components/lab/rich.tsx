/** components/lab/rich.tsx — lesson text: `backticks` become code. Server and client. */
export function rich(text: string) {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") && part.endsWith("`")
      ? <code key={i} className="px-1 py-px rounded bg-pit border border-rim/60 text-phosphor/90 font-mono text-[0.92em]">{part.slice(1, -1)}</code>
      : part);
}
