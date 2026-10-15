/** A chat read belongs to the latest filter/refresh/page request, and never to an unmounted project. */
export function createNoteReadSequence() {
  let sequence = 0;
  let disposed = false;
  return {
    begin() {
      const request = ++sequence;
      return () => !disposed && request === sequence;
    },
    dispose() { disposed = true; sequence++; },
    resume() { disposed = false; sequence++; },
  };
}
