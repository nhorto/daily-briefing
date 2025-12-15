'use client';

import { useEffect, useState } from 'react';
import type { Source } from '@/lib/types';
import Link from 'next/link';

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    authority: 50,
  });

  useEffect(() => {
    fetchSources();
  }, []);

  async function fetchSources() {
    try {
      const response = await fetch('/api/sources');
      const data = await response.json();

      if (data.success) {
        setSources(data.sources);
      }
    } catch (error) {
      console.error('Failed to fetch sources:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();

    try {
      const response = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        await fetchSources();
        setFormData({ name: '', url: '', authority: 50 });
        setShowAddForm(false);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Failed to add source');
      console.error(error);
    }
  }

  async function handleDeleteSource(id: string) {
    if (!confirm('Are you sure you want to delete this source?')) return;

    try {
      const response = await fetch(`/api/sources?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        await fetchSources();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Failed to delete source');
      console.error(error);
    }
  }

  async function handleToggleActive(source: Source) {
    try {
      const response = await fetch('/api/sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: source.id,
          isActive: !source.isActive,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await fetchSources();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Failed to toggle source');
      console.error(error);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Manage Sources
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Configure your content sources for the daily briefing
              </p>
            </div>
            <Link
              href="/briefing"
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
            >
              Back to Briefing
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Add Source Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {showAddForm ? 'Cancel' : '+ Add Source'}
          </button>
        </div>

        {/* Add Source Form */}
        {showAddForm && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Add New Source
            </h2>
            <form onSubmit={handleAddSource} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Source Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., TechCrunch"
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Feed URL or Website URL
                </label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://techcrunch.com/feed/ or https://techcrunch.com"
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  System will auto-detect if it's RSS/Atom feed or HTML webpage
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Authority (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.authority}
                  onChange={(e) => setFormData({ ...formData, authority: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Higher authority sources are selected as cluster representatives
                </p>
              </div>

              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Add Source
              </button>
            </form>
          </div>
        )}

        {/* Sources List */}
        <div className="space-y-4">
          {sources.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-6xl mb-4">📡</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No Sources Configured
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Add your first content source to get started
              </p>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Add First Source
              </button>
            </div>
          ) : (
            sources.map((source) => (
              <div
                key={source.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {source.name}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          source.isActive
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {source.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {source.type.toUpperCase()}
                      </span>
                    </div>

                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                    >
                      {source.url}
                    </a>

                    <div className="mt-3 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <span>Authority: {source.authority}</span>
                      {source.lastFetchedAt && (
                        <>
                          <span>•</span>
                          <span>
                            Last fetched:{' '}
                            {new Date(source.lastFetchedAt).toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleActive(source)}
                      className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                    >
                      {source.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDeleteSource(source.id)}
                      className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
            💡 How to Add Sources
          </h3>
          <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <p>
              <strong>RSS/Atom Feeds:</strong> Use the direct feed URL (e.g.,
              https://techcrunch.com/feed/)
            </p>
            <p>
              <strong>Websites:</strong> You can also use regular website URLs (e.g.,
              https://techcrunch.com) and the system will try to extract content
            </p>
            <p>
              <strong>Authority:</strong> Set 0-100 based on source credibility. Higher
              authority sources are preferred as cluster representatives
            </p>
            <p>
              <strong>Auto-detection:</strong> The system automatically detects feed type
              (RSS/Atom/HTML) when you add a source
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
