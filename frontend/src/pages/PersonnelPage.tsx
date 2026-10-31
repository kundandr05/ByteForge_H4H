import React from 'react';
import { Users2, UserPlus, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/common/Card';
import { Button } from '../components/common/Button';

export const PersonnelPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Personnel & Skill Matrices
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Workforce roster, certifications, availability patterns, and contract types.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Add Worker
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Worker Directory</CardTitle>
              <CardDescription>
                Full list of active workers, assigned roles, and current availability status.
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search worker by name or skill..."
                className="h-9 w-full sm:w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600 mb-3">
            <Users2 className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">
            Personnel Management Scaffolded
          </h3>
          <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
            Ready to be wired to the Prisma SQLite database schema in the next phase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PersonnelPage;
