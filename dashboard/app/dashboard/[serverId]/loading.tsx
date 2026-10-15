// Shown the moment a sidebar link or a search result is chosen, while the
// next settings page renders on the server — without it, a click looked
// like nothing happened for a second or two. The shape of a settings page:
// a title, a line of description, a few plates.
export default function Loading(): JSX.Element {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-8 w-56 rounded-lg bg-bg-card" />
      <div className="mt-3 h-4 w-96 max-w-full rounded bg-bg-card" />
      <div className="mt-8 space-y-4">
        <div className="h-40 rounded-2xl bg-bg-card" />
        <div className="h-56 rounded-2xl bg-bg-card" />
        <div className="h-32 rounded-2xl bg-bg-card" />
      </div>
    </div>
  );
}
