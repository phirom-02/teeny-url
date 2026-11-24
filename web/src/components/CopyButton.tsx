import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  async function handleCopy() {
    clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    timerRef.current = setTimeout(() => setStatus('idle'), 2000);
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" className="min-w-26" onClick={handleCopy}>
        {status === 'copied' ? (
          <>
            <Check aria-hidden="true" />
            Copied
          </>
        ) : status === 'failed' ? (
          'Copy failed'
        ) : (
          <>
            <Copy aria-hidden="true" />
            Copy
          </>
        )}
      </Button>
      <span className="sr-only" aria-live="polite">
        {status === 'copied'
          ? 'Short link copied to the clipboard.'
          : status === 'failed'
            ? "Couldn't copy. Select the link and copy it yourself."
            : ''}
      </span>
    </>
  );
}
