'use client';

import { useEffect, useState } from 'react';
import type { Source } from '@/lib/types';
import DashboardLayout from '@/components/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { SkeletonPage } from '@/components/ui/Skeleton';

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

  return (
    <DashboardLayout>
      {loading ? (
        <SkeletonPage />
      ) : (
        <div className="px-4 sm:px-6 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">
                Manage Sources
              </h1>
              <p className="text-text-muted text-sm mt-1">
                Configure your content sources for the daily briefing
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium"
            >
              {showAddForm ? 'Cancel' : '+ Add Source'}
            </button>
          </div>

          {/* Add Source Form */}
          {showAddForm && (
            <Card className="p-6 mb-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                Add New Source
              </h2>
              <form onSubmit={handleAddSource} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Source Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., TechCrunch"
                    required
                    className="w-full px-4 py-2 bg-bg-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-text-primary placeholder-text-muted"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Feed URL or Website URL
                  </label>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    placeholder="https://techcrunch.com/feed/ or https://techcrunch.com"
                    required
                    className="w-full px-4 py-2 bg-bg-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-text-primary placeholder-text-muted"
                  />
                  <p className="text-xs text-text-muted mt-1">
                    System will auto-detect if it's RSS/Atom feed or HTML webpage
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Authority (0-100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.authority}
                    onChange={(e) => setFormData({ ...formData, authority: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-bg-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-text-primary"
                  />
                  <p className="text-xs text-text-muted mt-1">
                    Higher authority sources are selected as cluster representatives
                  </p>
                </div>

                <button
                  type="submit"
                  className="px-6 py-2 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover transition-colors font-medium"
                >
                  Add Source
                </button>
              </form>
            </Card>
          )}

          {/* Sources List */}
          <div className="space-y-3">
            {sources.length === 0 ? (
              <Card className="text-center py-12">
                <div className="text-6xl mb-4">📡</div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  No Sources Configured
                </h3>
                <p className="text-text-secondary mb-4">
                  Add your first content source to get started
                </p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-6 py-3 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover transition-colors font-medium"
                >
                  Add First Source
                </button>
              </Card>
            ) : (
              sources.map((source) => (
                <Card key={source.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-base font-semibold text-text-primary">
                          {source.name}
                        </h3>
                        <Badge variant={source.isActive ? 'success' : 'default'}>
                          {source.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="accent">
                          {source.type.toUpperCase()}
                        </Badge>
                      </div>

                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:text-accent-hover transition-colors break-all"
                      >
                        {source.url}
                      </a>

                      <div className="mt-2 flex items-center gap-4 text-sm text-text-muted">
                        <span>Authority: <span className="font-mono">{source.authority}</span></span>
                        {source.lastFetchedAt && (
                          <>
                            <span>·</span>
                            <span>
                              Last fetched: {new Date(source.lastFetchedAt).toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleToggleActive(source)}
                        className="px-3 py-1.5 bg-bg-elevated text-text-secondary rounded hover:bg-bg-overlay hover:text-text-primary transition-colors text-sm font-medium"
                      >
                        {source.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteSource(source.id)}
                        className="px-3 py-1.5 bg-status-breaking/15 text-status-breaking rounded hover:bg-status-breaking/25 transition-colors text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Help Section */}
          <Card className="mt-8 p-6 border-accent-muted">
            <h3 className="text-base font-semibold text-text-primary mb-3">
              How to Add Sources
            </h3>
            <div className="space-y-2 text-sm text-text-secondary">
              <p>
                <strong className="text-text-primary">RSS/Atom Feeds:</strong> Use the direct feed URL (e.g.,
                https://techcrunch.com/feed/)
              </p>
              <p>
                <strong className="text-text-primary">Websites:</strong> You can also use regular website URLs (e.g.,
                https://techcrunch.com) and the system will try to extract content
              </p>
              <p>
                <strong className="text-text-primary">Authority:</strong> Set 0-100 based on source credibility. Higher
                authority sources are preferred as cluster representatives
              </p>
              <p>
                <strong className="text-text-primary">Auto-detection:</strong> The system automatically detects feed type
                (RSS/Atom/HTML) when you add a source
              </p>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
