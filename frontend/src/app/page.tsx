import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="container max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-semibold mb-3">DevOps Tools Platform</h1>
          <p className="text-muted">A minimalist platform for development tools and generators</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <a href="/generate" className="card p-6 hover:shadow-lg transition-all group">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-accent/10 text-accent">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold mb-2 group-hover:text-accent transition-colors">Terraform Snippet Generator</h2>
                <p className="text-muted text-sm">Generate infrastructure code snippets for AWS, Azure, and GCP resources</p>
              </div>
            </div>
          </a>

          <a href="/validate" className="card p-6 hover:shadow-lg transition-all group">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-accent/10 text-accent">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold mb-2 group-hover:text-accent transition-colors">YAML/JSON Validator</h2>
                <p className="text-muted text-sm">Validate and fix YAML/JSON with schema support for Kubernetes and Helm</p>
              </div>
            </div>
          </a>
        </div>

        <div className="flex justify-center">
          <a
            className="px-4 py-2 rounded border border-border hover:border-accent/20 transition-colors text-sm text-center hover:text-accent"
            href="https://github.com/irfanrp/devtools"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
