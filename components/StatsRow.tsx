import StatCard from '@/components/ui/StatCard';

interface StatsRowProps {
  totalArticles: number;
  totalSources: number;
  totalClusters: number;
  generatedAt: string;
}

export default function StatsRow({ totalArticles, totalSources, totalClusters, generatedAt }: StatsRowProps) {
  const generatedTime = new Date(generatedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard value={totalArticles} label="Articles" />
      <StatCard value={totalSources} label="Sources" />
      <StatCard value={totalClusters} label="Clusters" />
      <StatCard value={generatedTime} label="Generated" />
    </div>
  );
}
