import { useEffect, useState } from 'react';
import AppShell from './layouts/AppShell';
import DemoEntryPage from '../modules/demo/DemoEntryPage';
import { browserDemoExists } from '../modules/demo/browserDemoSeed';

/** The /demo/ URL is both the intro and the sample workspace.
 * Never redirect the visitor into the live customer app at /.
 */
export default function BrowserDemoRoot() {
  const [hasSample, setHasSample] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void browserDemoExists().then(exists => { if (active) setHasSample(exists); })
      .catch(() => { if (active) setHasSample(false); });
    return () => { active = false; };
  }, []);
  if (hasSample === null) return <main role="status" className="loading-state">Opening the sample business…</main>;
  return hasSample ? <AppShell /> : <DemoEntryPage />;
}
