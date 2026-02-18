interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 text-slate-600">{description}</p> : null}
    </div>
  );
}
