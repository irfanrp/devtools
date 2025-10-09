import Image from "next/image";

export default function Home() {
  return (
    <div className="font-sans min-h-screen p-8 sm:p-20 flex items-center justify-center">
      <main className="w-full max-w-2xl">
        <div className="card p-6 text-center mx-auto">
          <h1 className="text-2xl font-semibold mb-4">DevTools Platform</h1>
          <p className="muted mb-6">A minimalist platform for development tools and generators</p>

          <div className="flex gap-4 items-center flex-col sm:flex-row justify-center">
            <a
              className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
              href="/generate"
            >
              Start Generating
            </a>
            <a
              className="px-4 py-2 rounded border border-transparent hover:border-gray-200 transition-colors text-sm w-full sm:w-auto text-center"
              href="https://github.com/irfanrp/devtools"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
