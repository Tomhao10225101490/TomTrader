'use client';
import { Suspense } from 'react';
import { SearchServerPage } from './SearchPanel';

export default function SearchRoute() {
  return (
    <Suspense fallback={null}>
      <SearchServerPage />
    </Suspense>
  );
}
