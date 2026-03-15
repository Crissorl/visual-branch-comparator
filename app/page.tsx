import SourceSelector from '@/components/SourceSelector';
import StatusBar from '@/components/StatusBar';

export default function Dashboard() {
  return (
    <main>
      <h1>Visual Branch Comparator</h1>
      <StatusBar />
      <SourceSelector />
    </main>
  );
}
