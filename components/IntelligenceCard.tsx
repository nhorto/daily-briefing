import Card from '@/components/ui/Card';

interface IntelligenceCardProps {
  name: string;
  icon: string;
  summary: string;
  articleCount: number;
}

export default function IntelligenceCard({ name, icon, summary, articleCount }: IntelligenceCardProps) {
  return (
    <Card hover className="p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-text-primary">{name}</h3>
            <span className="text-xs text-text-muted font-mono">{articleCount}</span>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">{summary}</p>
        </div>
      </div>
    </Card>
  );
}
