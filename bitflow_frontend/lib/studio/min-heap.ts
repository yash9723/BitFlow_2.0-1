/** lib/studio/min-heap.ts — a binary min-heap of [key, tie-break, value], for the wire router and the delay simulator. */
export class MinHeap<T> {
  private a: { k: number; s: number; v: T }[] = [];
  get size() { return this.a.length; }
  /** Lowest key first; equal keys come out in the order of `tie`. */
  push(key: number, tie: number, value: T) {
    const a = this.a;
    let i = a.length;
    a.push({ k: key, s: tie, v: value });
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): { key: number; value: T } | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return { key: top.k, value: top.v };
  }
  private less(i: number, j: number) {
    const x = this.a[i], y = this.a[j];
    return x.k < y.k || (x.k === y.k && x.s < y.s);
  }
}
