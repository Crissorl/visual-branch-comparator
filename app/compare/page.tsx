import IframePanel from '@/components/IframePanel';
import DiffOverlay from '@/components/DiffOverlay';
import ChangePanel from '@/components/ChangePanel';

export default function ComparePage() {
  return (
    <main>
      <h1>Compare</h1>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <IframePanel />
        <IframePanel />
      </div>
      <DiffOverlay />
      <ChangePanel />
    </main>
  );
}
