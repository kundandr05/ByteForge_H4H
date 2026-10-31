import React from 'react';
import { ShieldAlert, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';

export const RecoveryPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Disruption Recovery Engine
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Intelligent autonomous reassignment and cascading impact mitigation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
            Simulate Disruption
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Autonomous Dispatcher</CardTitle>
              <Badge variant="info">AI Recovery</Badge>
            </div>
            <CardDescription>
              Heuristic and constraint-based replanning during unplanned absences.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 mb-3">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h4 className="text-base font-semibold text-slate-800">
              Recovery Solver Pipeline Ready
            </h4>
            <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
              Scaffolded and ready to connect with the backend scheduling services.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recovery Rules & Safeguards</CardTitle>
              <Badge variant="success">Standard Rules</Badge>
            </div>
            <CardDescription>Guaranteed constraint limits during rapid rescheduling.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Maximum consecutive working hours limit</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Minimum 11-hour mandatory rest intervals</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Skill certification match verification</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Overtime budget and equity balancing</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RecoveryPage;
