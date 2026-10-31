import React from 'react';
import { Calendar, Plus, Filter, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';

export const SchedulePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Workforce Shift Schedules
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Multi-constraint automated shift generation and allocation grid.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Shift Pattern
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Schedule Engine Stage</CardTitle>
              <CardDescription>
                Ready for constraint rules, working hour limits, and rest period enforcement.
              </CardDescription>
            </div>
            <Badge variant="default">Module Scaffolded</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600 mb-3">
            <Calendar className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">
            Scheduling Engine Interface
          </h3>
          <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
            This module will interface with the backend constraint solver at{' '}
            <code className="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-700">
              backend/src/scheduling
            </code>
            .
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-4 w-4" />
              Configure Constraints
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SchedulePage;
