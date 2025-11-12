// app/page.tsx
export default function HomePage() {
  return (
    <main className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Welcome</h1>
        <p className="mt-2 text-gray-600">Click below to go to your dashboard.</p>
        <a
          href="/dashboard"
          className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
        >
          Go to Dashboard
        </a>
      </div>
    </main>
    
  )
}