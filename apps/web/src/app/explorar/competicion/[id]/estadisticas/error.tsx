'use client';

export default function ErrorEstadisticas({ error }: { error: Error & { digest?: string } }) {
  return <pre data-error-debug>{`${error.message}\n\n${error.stack ?? ''}\n\ndigest: ${error.digest ?? ''}`}</pre>;
}
