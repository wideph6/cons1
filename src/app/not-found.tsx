export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md">
        <p className="font-mono text-sm text-text-muted">404</p>
        <h1 className="text-xl font-semibold mt-1">This page does not exist</h1>
        <p className="text-text-muted mt-2">Check the address, or go back to where you came from.</p>
      </div>
    </main>
  );
}
