import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="container max-w-2xl mx-auto">
        <div className="card p-8 text-center">
          <h1 className="text-3xl font-semibold mb-3">DevOps Tools Platform</h1>
          <p className="text-muted mb-8">A minimalist platform for development tools and generators</p>

          <div className="flex gap-4 items-center flex-col sm:flex-row justify-center">
            <a
              className="btn-primary flex items-center justify-center gap-2 min-w-[160px]"
              href="/generate"
            >
              Start Generating
            </a>
            <a
              className="px-4 py-2 rounded border border-border hover:border-accent/20 transition-colors text-sm min-w-[160px] text-center hover:text-accent"
              href="https://github.com/irfanrp/devtools"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
