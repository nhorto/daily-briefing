import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <main className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl font-bold">Daily Briefing</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Your personalized content aggregator that saves you hours every day
        </p>

        <div className="flex gap-4 justify-center pt-4">
          <Link
            href="/briefing"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            View Today's Briefing
          </Link>
          <Link
            href="/sources"
            className="px-6 py-3 bg-gray-200 dark:bg-gray-800 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors font-medium"
          >
            Manage Sources
          </Link>
        </div>

        <div className="pt-8 text-sm text-gray-500">
          <p>Configure your sources, sit back, and let AI aggregate, deduplicate, and summarize your daily content.</p>
        </div>
      </main>
    </div>
  );
}
