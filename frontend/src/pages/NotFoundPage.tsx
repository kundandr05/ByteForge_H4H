import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '../components/common/Button';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="rounded-full bg-slate-100 p-4 text-slate-500 mb-4">
        <AlertCircle className="h-10 w-10 text-brand-600" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">404 - Page Not Found</h1>
      <p className="mt-2 text-sm text-slate-500 max-w-sm">
        The requested operations view or dispatch panel could not be found.
      </p>
      <div className="mt-6">
        <Link to="/">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Command Center
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
