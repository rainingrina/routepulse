import { Card, EmptyState } from '../components/display/basics';
import { Construction } from '../components/icons';

/**
 * Honest placeholder for a route whose screen is not built yet. Shows no data and no controls.
 * Listed as "Not Started" in PROGRESS.md — never reported as done.
 */
export function PlannedScreen({ title, task }: { title: string; task: string }) {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-h1 text-text">{title}</h1>
      <Card>
        <EmptyState
          icon={Construction}
          title="Not built yet"
          help={`This screen is planned (PROGRESS task ${task}). It will show live data once it is implemented.`}
        />
      </Card>
    </div>
  );
}
